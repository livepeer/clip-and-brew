import React, {
  useRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useCallback,
  useState,
  forwardRef,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  createDaydreamStream,
  startWhipPublish,
} from '@/lib/daydream';
import type { StreamDiffusionParams } from '@/lib/daydream';

export type PublisherStatus =
  | 'idle'
  | 'creating_stream'
  | 'publishing'
  | 'ready'
  | 'stopped'
  | 'error';

export interface DaydreamCanvasHandle {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  pushFrame: (source: CanvasImageSource) => void;
  replaceAudioSource: (audio: MediaStream | MediaStreamTrack | null) => Promise<void>;
  getStreamInfo: () => { streamId: string | null; playbackId: string | null };
}

export interface DaydreamCanvasProps {
  params: StreamDiffusionParams;
  // Video frame sources (optional). If provided, the component will copy at the configured FPS.
  videoSource?: MediaStream; // e.g., camera MediaStream
  sourceCanvas?: HTMLCanvasElement; // e.g., an existing render target
  // Audio source (optional). If omitted, a silent track will be attempted.
  audioSource?: MediaStream | MediaStreamTrack | null;
  // Canvas/display
  size?: number; // square target, default 512
  cover?: boolean; // crop-to-fill when copying from non-square source (default true)
  enforceSquare?: boolean; // set canvas to size x size (default true)
  className?: string;
  style?: React.CSSProperties;
  // Lifecycle & behavior
  autoStart?: boolean; // start on mount (default true)
  alwaysOn?: boolean; // keep alive in background (default false)
  fps?: number; // capture and render FPS (default 24)
  // Events
  onReady?: (info: { streamId: string; playbackId: string }) => void;
  onStatus?: (status: PublisherStatus) => void;
  onError?: (error: unknown) => void;
}

// Utility: detect mobile-ish environments (for background auto-stop defaults)
const isLikelyMobile = (): boolean => {
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
  return hasTouch || mobileUA;
};

// Compute draw rect for cover/crop
function computeCoverDrawRect(
  srcWidth: number,
  srcHeight: number,
  destSize: number
) {
  const srcAspect = srcWidth / srcHeight;
  const destAspect = 1; // square
  let drawWidth: number;
  let drawHeight: number;
  if (srcAspect > destAspect) {
    // source wider than square -> height matches, crop width
    drawHeight = destSize;
    drawWidth = (srcWidth / srcHeight) * destSize;
  } else {
    // source taller or equal -> width matches, crop height
    drawWidth = destSize;
    drawHeight = (srcHeight / srcWidth) * destSize;
  }
  const dx = (destSize - drawWidth) / 2;
  const dy = (destSize - drawHeight) / 2;
  return { dx, dy, drawWidth, drawHeight };
}

export const DaydreamCanvas = forwardRef<DaydreamCanvasHandle, DaydreamCanvasProps>(
  (
    {
      params,
      videoSource,
      sourceCanvas,
      audioSource = null,
      size = 512,
      cover = true,
      enforceSquare = true,
      className,
      style,
      autoStart = true,
      alwaysOn = false,
      fps = 24,
      onReady,
      onStatus,
      onError,
    },
    ref
  ) => {
    // Canvas and optional hidden video element for MediaStream sources
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);

    // Publishing state
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const publishStreamRef = useRef<MediaStream | null>(null);
    const currentAudioTrackRef = useRef<MediaStreamTrack | null>(null);
    const silentAudioTrackRef = useRef<MediaStreamTrack | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    const streamIdRef = useRef<string | null>(null);
    const playbackIdRef = useRef<string | null>(null);
    const readyForParamUpdatesRef = useRef<boolean>(false);

    const statusRef = useRef<PublisherStatus>('idle');
    const setStatus = useCallback(
      (s: PublisherStatus) => {
        statusRef.current = s;
        onStatus?.(s);
      },
      [onStatus]
    );

    // Render loop control (for copying from video/canvas sources)
    const rafIdRef = useRef<number | null>(null);
    const lastTickRef = useRef<number>(0);
    const runningCopyLoopRef = useRef<boolean>(false);

    // Flags for background auto-restart
    const wasRunningRef = useRef<boolean>(false);

    // Params update queue (serial, eventually consistent)
    const latestParamsRef = useRef<StreamDiffusionParams>(params);
    const pendingParamsRef = useRef<StreamDiffusionParams | null>(null);
    const paramsInFlightRef = useRef<boolean>(false);

    // Keep refs in sync with props
    useEffect(() => {
      latestParamsRef.current = params;
      // Enqueue an update attempt (serial; respects init gate and in-flight)
      enqueueParamsUpdate();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params]);

    // Ensure canvas size
    useEffect(() => {
      if (canvasRef.current && enforceSquare) {
        if (canvasRef.current.width !== size) canvasRef.current.width = size;
        if (canvasRef.current.height !== size) canvasRef.current.height = size;
      }
    }, [size, enforceSquare]);

    // Create/destroy hidden video for MediaStream sources
    useEffect(() => {
      if (!videoSource) {
        // Cleanup any existing hidden video
        if (hiddenVideoRef.current) {
          hiddenVideoRef.current.srcObject = null;
          hiddenVideoRef.current.remove();
          hiddenVideoRef.current = null;
        }
        return;
      }
      let video = hiddenVideoRef.current;
      if (!video) {
        video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.style.position = 'fixed';
        video.style.top = '-99999px';
        video.style.left = '-99999px';
        document.body.appendChild(video);
        hiddenVideoRef.current = video;
      }
      video.srcObject = videoSource;
      // Play if possible
      video
        .play()
        .catch(() => {
          // ignore autoplay restrictions here; we'll draw when frames arrive
        });

      return () => {
        if (hiddenVideoRef.current) {
          hiddenVideoRef.current.srcObject = null;
          hiddenVideoRef.current.remove();
          hiddenVideoRef.current = null;
        }
      };
    }, [videoSource]);

    // Start/stop render-copy loop based on sources
    const startCopyLoop = useCallback(() => {
      if (runningCopyLoopRef.current) return;
      runningCopyLoopRef.current = true;
      const intervalMs = 1000 / Math.max(1, fps);
      lastTickRef.current = performance.now();

      const tick = () => {
        if (!runningCopyLoopRef.current) return;
        const now = performance.now();
        const elapsed = now - lastTickRef.current;
        if (elapsed >= intervalMs) {
          lastTickRef.current = now - (elapsed % intervalMs);
          // Draw one frame from the active source, if available
          if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d', { alpha: false });
            if (ctx) {
              const sizePx = enforceSquare ? size : Math.min(size, Math.max(canvasRef.current.width, canvasRef.current.height));
              ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
              let drew = false;
              if (sourceCanvas) {
                const srcW = sourceCanvas.width;
                const srcH = sourceCanvas.height;
                if (srcW > 0 && srcH > 0) {
                  if (cover) {
                    const { dx, dy, drawWidth, drawHeight } = computeCoverDrawRect(srcW, srcH, sizePx);
                    ctx.drawImage(sourceCanvas, dx, dy, drawWidth, drawHeight);
                  } else {
                    // contain
                    const scale = Math.min(sizePx / srcW, sizePx / srcH);
                    const dw = srcW * scale;
                    const dh = srcH * scale;
                    const dx = (sizePx - dw) / 2;
                    const dy = (sizePx - dh) / 2;
                    ctx.drawImage(sourceCanvas, dx, dy, dw, dh);
                  }
                  drew = true;
                }
              } else if (hiddenVideoRef.current && hiddenVideoRef.current.readyState >= 2) {
                const v = hiddenVideoRef.current;
                const srcW = v.videoWidth;
                const srcH = v.videoHeight;
                if (srcW > 0 && srcH > 0) {
                  if (cover) {
                    const { dx, dy, drawWidth, drawHeight } = computeCoverDrawRect(srcW, srcH, sizePx);
                    ctx.drawImage(v, dx, dy, drawWidth, drawHeight);
                  } else {
                    const scale = Math.min(sizePx / srcW, sizePx / srcH);
                    const dw = srcW * scale;
                    const dh = srcH * scale;
                    const dx = (sizePx - dw) / 2;
                    const dy = (sizePx - dh) / 2;
                    ctx.drawImage(v, dx, dy, dw, dh);
                  }
                  drew = true;
                }
              }
              if (!drew) {
                // no-op when no valid frame yet
              }
            }
          }
        }
        rafIdRef.current = requestAnimationFrame(tick);
      };
      rafIdRef.current = requestAnimationFrame(tick);
    }, [cover, enforceSquare, fps, size, sourceCanvas]);

    const stopCopyLoop = useCallback(() => {
      runningCopyLoopRef.current = false;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    }, []);

    // Attempt to create a silent audio track
    const createSilentAudioTrack = useCallback((): MediaStreamTrack | null => {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        gain.gain.value = 0; // silent
        oscillator.connect(gain);
        const dest = audioContext.createMediaStreamDestination();
        gain.connect(dest);
        oscillator.start();
        const track = dest.stream.getAudioTracks()[0] || null;
        return track;
      } catch (e) {
        // Likely blocked by autoplay policy; continue without audio
        return null;
      }
    }, []);

    // Build the publishing MediaStream (canvas video + audio)
    const buildPublishStream = useCallback(async (): Promise<MediaStream> => {
      if (!canvasRef.current) throw new Error('Canvas not ready');
      // Ensure canvas dimensions
      if (enforceSquare) {
        if (canvasRef.current.width !== size) canvasRef.current.width = size;
        if (canvasRef.current.height !== size) canvasRef.current.height = size;
      }
      const canvasStream = canvasRef.current.captureStream(Math.max(1, fps));

      // Handle audio
      let audioTrack: MediaStreamTrack | null = null;
      if (audioSource instanceof MediaStream) {
        audioTrack = audioSource.getAudioTracks()[0] || null;
      } else if (audioSource && 'kind' in audioSource) {
        audioTrack = audioSource.kind === 'audio' ? audioSource : null;
      }

      if (!audioTrack) {
        // Add a silent audio track if possible
        const silent = createSilentAudioTrack();
        if (silent) {
          silentAudioTrackRef.current = silent;
          audioTrack = silent;
        }
      }

      // Combine into a single stream
      const publishStream = new MediaStream();
      canvasStream.getVideoTracks().forEach((t) => publishStream.addTrack(t));
      if (audioTrack) publishStream.addTrack(audioTrack);

      publishStreamRef.current = publishStream;
      currentAudioTrackRef.current = audioTrack;
      return publishStream;
    }, [audioSource, createSilentAudioTrack, enforceSquare, fps, size]);

    // Replace audio track live
    const replaceAudioSource = useCallback(
      async (audio: MediaStream | MediaStreamTrack | null) => {
        const pc = pcRef.current;
        const publishStream = publishStreamRef.current;
        if (!pc || !publishStream) return;

        // Determine new track
        let newTrack: MediaStreamTrack | null = null;
        if (audio instanceof MediaStream) {
          newTrack = audio.getAudioTracks()[0] || null;
        } else if (audio && 'kind' in audio) {
          newTrack = audio.kind === 'audio' ? audio : null;
        }

        // Fallback to silent if none provided
        if (!newTrack) {
          const silent = createSilentAudioTrack();
          if (silent) {
            silentAudioTrackRef.current = silent;
            newTrack = silent;
          }
        }

        // Update stream tracks
        publishStream.getAudioTracks().forEach((t) => publishStream.removeTrack(t));
        if (newTrack) publishStream.addTrack(newTrack);

        // Replace on RTCPeerConnection
        const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
        if (sender) {
          await sender.replaceTrack(newTrack);
        }

        // Stop previous silent track if any
        if (silentAudioTrackRef.current && silentAudioTrackRef.current !== newTrack) {
          try {
            silentAudioTrackRef.current.stop();
          } catch {}
          silentAudioTrackRef.current = null;
        }
        currentAudioTrackRef.current = newTrack;
      },
      []
    );

    // Serial params update queue
    const sendParamsUpdate = useCallback(async () => {
      if (paramsInFlightRef.current) return;
      if (!readyForParamUpdatesRef.current) return; // gate until init window passes
      const streamId = streamIdRef.current;
      if (!streamId) return;

      const next = pendingParamsRef.current;
      if (!next) return;

      paramsInFlightRef.current = true;
      // Snapshot latest for eventual consistency; always include required defaults
      const latest = latestParamsRef.current || next;
      const body = {
        streamId,
        params: {
          model_id: latest.model_id || 'stabilityai/sdxl-turbo',
          prompt: latest.prompt,
          negative_prompt: latest.negative_prompt ?? 'blurry, low quality, flat, 2d, distorted',
          num_inference_steps: latest.num_inference_steps ?? 50,
          seed: latest.seed ?? 42,
          t_index_list: latest.t_index_list ?? [6, 12, 18],
          // Default to empty controlnets list (user can supply)
          controlnets: latest.controlnets ?? [],
          // Always include ip_adapter (disabled by default)
          ip_adapter: latest.ip_adapter ?? {
            enabled: false,
            type: 'regular',
            scale: 0,
            weight_type: 'linear',
            insightface_model_name: 'buffalo_l',
          },
          ...(latest.ip_adapter_style_image_url
            ? { ip_adapter_style_image_url: latest.ip_adapter_style_image_url }
            : {}),
        },
      };

      try {
        // Call edge function directly to avoid library-level defaults
        const { error } = await supabase.functions.invoke('daydream-prompt', {
          body,
        });
        if (error) throw error;
      } catch (e) {
        onError?.(e);
      } finally {
        paramsInFlightRef.current = false;
        // If new params arrived while in flight, send again
        if (pendingParamsRef.current) {
          // Collapse to latest snapshot for eventual consistency
          pendingParamsRef.current = latestParamsRef.current;
          // Schedule microtask to avoid deep recursion
          queueMicrotask(() => {
            sendParamsUpdate();
          });
        }
      }
    }, [onError]);

    const enqueueParamsUpdate = useCallback(() => {
      pendingParamsRef.current = latestParamsRef.current;
      // Try to send if conditions allow
      queueMicrotask(() => sendParamsUpdate());
    }, [sendParamsUpdate]);

    // Start publishing
    const start = useCallback(async () => {
      if (pcRef.current) return; // already running
      try {
        setStatus('creating_stream');

        // Optional: kick off copy loop if we have a source; users can also pushFrame manually
        if (videoSource || sourceCanvas) startCopyLoop();

        // Create stream with initial params
        const initialParams: StreamDiffusionParams = {
          model_id: params.model_id || 'stabilityai/sdxl-turbo',
          prompt: params.prompt,
          negative_prompt: params.negative_prompt ?? 'blurry, low quality, flat, 2d, distorted',
          num_inference_steps: params.num_inference_steps ?? 50,
          seed: params.seed ?? 42,
          t_index_list: params.t_index_list ?? [6, 12, 18],
          controlnets: params.controlnets ?? [],
          ip_adapter: params.ip_adapter ?? {
            enabled: false,
            type: 'regular',
            scale: 0,
            weight_type: 'linear',
            insightface_model_name: 'buffalo_l',
          },
          ...(params.ip_adapter_style_image_url
            ? { ip_adapter_style_image_url: params.ip_adapter_style_image_url }
            : {}),
        };

        const streamData = await createDaydreamStream(initialParams);
        streamIdRef.current = streamData.id;
        playbackIdRef.current = streamData.output_playback_id;
        onReady?.({ streamId: streamData.id, playbackId: streamData.output_playback_id });

        // Immediately start WHIP publish
        setStatus('publishing');
        const publishStream = await buildPublishStream();
        const pc = await startWhipPublish(streamData.whip_url, publishStream);
        pcRef.current = pc;
        setStatus('ready');

        // Open the init window for params updates (3s gate)
        readyForParamUpdatesRef.current = false;
        window.setTimeout(() => {
          readyForParamUpdatesRef.current = true;
          // Kick an update with the latest params on gate open
          enqueueParamsUpdate();
        }, 3000);
      } catch (e) {
        setStatus('error');
        onError?.(e);
        throw e;
      }
    }, [buildPublishStream, enqueueParamsUpdate, onError, onReady, params, setStatus, sourceCanvas, startCopyLoop, videoSource]);

    // Stop publishing and cleanup
    const stop = useCallback(async () => {
      stopCopyLoop();
      readyForParamUpdatesRef.current = false;

      // Close RTCPeerConnection
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {}
        pcRef.current = null;
      }

      // Stop publish stream tracks
      if (publishStreamRef.current) {
        publishStreamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
        publishStreamRef.current = null;
      }

      // Stop internal silent audio
      if (silentAudioTrackRef.current) {
        try {
          silentAudioTrackRef.current.stop();
        } catch {}
        silentAudioTrackRef.current = null;
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch {}
        audioContextRef.current = null;
      }

      // Do not stop external audio tracks; they are owned by the caller
      currentAudioTrackRef.current = null;

      // Clear stream identifiers
      streamIdRef.current = null;
      playbackIdRef.current = null;

      setStatus('stopped');
    }, [setStatus, stopCopyLoop]);

    // Expose imperative API
    useImperativeHandle(
      ref,
      (): DaydreamCanvasHandle => ({
        start,
        stop,
        pushFrame: (source: CanvasImageSource) => {
          const c = canvasRef.current;
          if (!c) return;
          const ctx = c.getContext('2d', { alpha: false });
          if (!ctx) return;
          const sizePx = enforceSquare ? size : Math.min(size, Math.max(c.width, c.height));
          // Attempt to determine source dimensions
          let srcW = 0;
          let srcH = 0;
          // Narrow common cases
          if ('videoWidth' in source && 'videoHeight' in source) {
            // HTMLVideoElement
            const v = source as HTMLVideoElement;
            srcW = v.videoWidth;
            srcH = v.videoHeight;
          } else if ('width' in source && 'height' in source) {
            // HTMLCanvasElement, ImageBitmap, OffscreenCanvas
            // @ts-expect-error dynamic lookup for union
            srcW = source.width || 0;
            // @ts-expect-error dynamic lookup for union
            srcH = source.height || 0;
          }
          if (srcW > 0 && srcH > 0) {
            if (cover) {
              const { dx, dy, drawWidth, drawHeight } = computeCoverDrawRect(srcW, srcH, sizePx);
              ctx.drawImage(source as CanvasImageSource, dx, dy, drawWidth, drawHeight);
            } else {
              const scale = Math.min(sizePx / srcW, sizePx / srcH);
              const dw = srcW * scale;
              const dh = srcH * scale;
              const dx = (sizePx - dw) / 2;
              const dy = (sizePx - dh) / 2;
              ctx.drawImage(source as CanvasImageSource, dx, dy, dw, dh);
            }
          }
        },
        replaceAudioSource,
        getStreamInfo: () => ({
          streamId: streamIdRef.current,
          playbackId: playbackIdRef.current,
        }),
      }),
      [cover, enforceSquare, replaceAudioSource, size, start, stop]
    );

    // Background auto-stop/start (mobile default)
    useEffect(() => {
      if (alwaysOn) return; // caller opted out
      const mobile = isLikelyMobile();
      if (!mobile) return;

      const handleVisibility = () => {
        if (document.hidden) {
          if (pcRef.current) {
            wasRunningRef.current = true;
            void stop();
          } else {
            wasRunningRef.current = false;
          }
        } else {
          if (wasRunningRef.current && autoStart) {
            wasRunningRef.current = false;
            void start();
          }
        }
      };

      document.addEventListener('visibilitychange', handleVisibility);
      return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [alwaysOn, autoStart, start, stop]);

    // Auto-start on mount
    useEffect(() => {
      if (autoStart) {
        void start();
        return () => {
          void stop();
        };
      }
      return;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <canvas
        ref={canvasRef}
        className={className}
        style={{ width: size, height: size, ...style }}
        width={enforceSquare ? size : undefined}
        height={enforceSquare ? size : undefined}
      />
    );
  }
);

DaydreamCanvas.displayName = 'DaydreamCanvas';
