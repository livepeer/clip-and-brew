import React, {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useState,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  createDaydreamStream,
  startWhipPublish,
} from '@/lib/daydream';
import type { StreamDiffusionParams } from '@/lib/daydream';

export interface DaydreamCanvasProps {
  className?: string;
  style?: React.CSSProperties;
  canvasRef?: React.Ref<HTMLCanvasElement>; // optional ref to the canvas element

  params: StreamDiffusionParams;
  // Video frame source
  videoSource:
    | {
        type: 'stream';
        stream: MediaStream;
      }
    | {
        type: 'canvas';
        canvas: HTMLCanvasElement;
      }
    | {
        type: 'camera';
        facingMode: 'user' | 'environment';
        mirrorFront?: boolean; // mirror draw for front camera (user mode), default true
      };
  // Audio source (defaults to silent if not provided)
  audioSource?:
    | {
        type: 'stream';
        stream: MediaStream | MediaStreamTrack;
      }
    | {
        type: 'microphone';
        constraints?: MediaTrackConstraints;
      }
    | {
        type: 'silent';
      };
  // Canvas/display
  size?: number; // square target, default 512
  cover?: boolean; // crop-to-fill when copying from non-square source (default true)
  enforceSquare?: boolean; // set canvas to size x size (default true)
  // Lifecycle & behavior
  alwaysOn?: boolean; // keep alive in background on mobile (default false)
  // Events
  onReady?: (info: { streamId: string; playbackId: string; playbackUrl: string | null }) => void;
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

export const DaydreamCanvas: React.FC<DaydreamCanvasProps> = ({
  params,
  videoSource,
  audioSource,
  size = 512,
  cover = true,
  enforceSquare = true,
  className,
  style,
  canvasRef: externalCanvasRef,
  alwaysOn = false,
  onReady,
  onError,
}) => {
    // Derive video source settings for stable dependencies
    const sourceVideoStream = videoSource.type === 'stream' ? videoSource.stream : null;
    const sourceCanvas = videoSource.type === 'canvas' ? videoSource.canvas : null;
    const cameraFacingMode = videoSource.type === 'camera' ? videoSource.facingMode : 'user';
    const mirrorFront = videoSource.type === 'camera' ? (videoSource.mirrorFront ?? true) : true;

    // Derive audio source settings for stable dependencies
    const sourceAudioStream = audioSource?.type === 'stream' ? audioSource.stream : null;
    const microphoneConstraints = audioSource?.type === 'microphone' ? audioSource.constraints : undefined;

    // Derive FPS from video source (try to match source, default to 24)
    const fps = useMemo(() => {
      if (videoSource.type === 'stream' && sourceVideoStream) {
        const videoTrack = sourceVideoStream.getVideoTracks()[0];
        const settings = videoTrack?.getSettings();
        return settings?.frameRate || 24;
      }
      return 24; // Default for camera and canvas sources
    }, [videoSource.type, sourceVideoStream]);

    // Canvas and optional hidden video element for MediaStream sources
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
    const [ownedCameraStream, setOwnedCameraStream] = useState<MediaStream | null>(null);
    const [ownedAudioTrack, setOwnedAudioTrack] = useState<MediaStreamTrack | null>(null);
    const [isStarted, setIsStarted] = useState(false);

    // Publishing state
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const publishStreamRef = useRef<MediaStream | null>(null);
    const currentAudioTrackRef = useRef<MediaStreamTrack | null>(null);
    const builtInMicTrackRef = useRef<MediaStreamTrack | null>(null);
    const silentAudioTrackRef = useRef<MediaStreamTrack | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    const streamIdRef = useRef<string | null>(null);
    const playbackIdRef = useRef<string | null>(null);
    const playbackUrlRef = useRef<string | null>(null);
    const readyForParamUpdatesRef = useRef<boolean>(false);

    // Internal status tracking (no external API)

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

    // Create video element once on mount (hidden in DOM for drawImage to work)
    useEffect(() => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;

      // Must be in DOM for drawImage to work reliably
      video.style.position = 'fixed';
      video.style.top = '-9999px';
      video.style.left = '-9999px';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.opacity = '0';
      video.style.pointerEvents = 'none';
      document.body.appendChild(video);

      hiddenVideoRef.current = video;

      return () => {
        if (hiddenVideoRef.current) {
          hiddenVideoRef.current.srcObject = null;
          if (hiddenVideoRef.current.parentNode) {
            hiddenVideoRef.current.parentNode.removeChild(hiddenVideoRef.current);
          }
          hiddenVideoRef.current = null;
        }
      };
    }, []);

    // Update video source when stream changes
    useEffect(() => {
      const video = hiddenVideoRef.current;
      if (!video) return;

      // Determine the effective video stream
      let effectiveStream: MediaStream | null = null;
      if (videoSource.type === 'stream') {
        effectiveStream = sourceVideoStream;
      } else if (videoSource.type === 'camera') {
        effectiveStream = ownedCameraStream;
      }
      // canvas type doesn't use the hidden video element

      if (!effectiveStream) {
        video.srcObject = null;
        return;
      }

      video.srcObject = effectiveStream;
      video.play().catch(() => {
        // Silent fail - autoplay handles this
      });
    }, [videoSource.type, sourceVideoStream, ownedCameraStream]);

    // Optionally obtain camera stream internally
    useEffect(() => {
      if (videoSource.type !== 'camera' || !isStarted) {
        // Clean up owned camera stream when switching away from camera or when stopped
        if (ownedCameraStream) {
          ownedCameraStream.getTracks().forEach(t => t.stop());
          setOwnedCameraStream(null);
        }
        return;
      }

      let cancelled = false;
      let localStream: MediaStream | null = null;

      // Clean up previous camera stream before starting new one
      // This is crucial when switching between front/back cameras
      if (ownedCameraStream) {
        ownedCameraStream.getTracks().forEach(t => t.stop());
        setOwnedCameraStream(null);
      }

      (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: cameraFacingMode ?? 'user', width: size, height: size },
            audio: false,
          });
          if (cancelled) {
            stream.getTracks().forEach(t => t.stop());
            return;
          }
          localStream = stream;
          setOwnedCameraStream(stream);
        } catch (e) {
          console.error('[DaydreamCanvas] Failed to get camera:', e);
          onError?.(e);
        }
      })();

      return () => {
        cancelled = true;
        // Clean up in the effect cleanup function
        if (localStream) {
          localStream.getTracks().forEach(t => t.stop());
        }
        // Also clean up the owned stream state
        setOwnedCameraStream(prev => {
          if (prev) {
            prev.getTracks().forEach(t => t.stop());
          }
          return null;
        });
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoSource.type, cameraFacingMode, onError, size, isStarted]);

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

              // Draw from source canvas (type: 'canvas')
              if (videoSource.type === 'canvas' && sourceCanvas) {
                const srcW = sourceCanvas.width;
                const srcH = sourceCanvas.height;
                if (srcW > 0 && srcH > 0) {
                  // Clear before drawing
                  ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

                  if (cover) {
                    const { dx, dy, drawWidth, drawHeight } = computeCoverDrawRect(srcW, srcH, sizePx);
                    ctx.drawImage(sourceCanvas, dx, dy, drawWidth, drawHeight);
                  } else {
                    ctx.drawImage(sourceCanvas, 0, 0, sizePx, sizePx);
                  }
                }
              }
              // Draw from hidden video element (types: 'stream' or 'camera')
              else if (hiddenVideoRef.current) {
                if (hiddenVideoRef.current.readyState >= hiddenVideoRef.current.HAVE_CURRENT_DATA) {
                const v = hiddenVideoRef.current;
                const srcW = v.videoWidth;
                const srcH = v.videoHeight;
                if (srcW > 0 && srcH > 0) {
                  // Clear before drawing
                  ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

                  // Mirror for front camera (user-facing)
                  const needMirror = mirrorFront && cameraFacingMode === 'user' && videoSource.type === 'camera';
                  if (needMirror) {
                    ctx.setTransform(-1, 0, 0, 1, sizePx, 0);
                  }

                  if (cover) {
                    const { dx, dy, drawWidth, drawHeight } = computeCoverDrawRect(srcW, srcH, sizePx);
                    ctx.drawImage(v, dx, dy, drawWidth, drawHeight);
                  } else {
                    // Scale to fit (no distortion)
                    ctx.drawImage(v, 0, 0, sizePx, sizePx);
                  }

                  if (needMirror) {
                    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
                  }
                }
                } else {
                  // Video element exists but not ready - skip draw
                }
              }
              // No video source available - skip draw
            }
          }
        }
        rafIdRef.current = requestAnimationFrame(tick);
      };
      rafIdRef.current = requestAnimationFrame(tick);
    }, [cameraFacingMode, cover, enforceSquare, fps, mirrorFront, size, videoSource.type, sourceCanvas]);

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
        const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
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

    // Acquire audio track based on audioSource type (setup/teardown)
    useEffect(() => {
      if (!isStarted) {
        // Clean up when stopped
        setOwnedAudioTrack(null);
        return;
      }

      let cancelled = false;
      let ownedTrack: MediaStreamTrack | null = null;

      (async () => {
        if (audioSource?.type === 'stream') {
          // External audio stream - extract track but don't own it
          if (audioSource.stream instanceof MediaStream) {
            const track = audioSource.stream.getAudioTracks()[0] || null;
            if (!cancelled) setOwnedAudioTrack(track);
          } else if ('kind' in audioSource.stream && audioSource.stream.kind === 'audio') {
            if (!cancelled) setOwnedAudioTrack(audioSource.stream);
          }
        } else if (audioSource?.type === 'microphone') {
          // Request microphone - we own this track
          try {
            const constraints: MediaStreamConstraints = {
              audio: audioSource.constraints || { echoCancellation: true, noiseSuppression: true },
              video: false,
            };
            const micStream = await navigator.mediaDevices.getUserMedia(constraints);
            const micTrack = micStream.getAudioTracks()[0];
            if (micTrack && !cancelled) {
              ownedTrack = micTrack;
              builtInMicTrackRef.current = micTrack;
              setOwnedAudioTrack(micTrack);
            }
          } catch (e) {
            onError?.(e);
            if (!cancelled) setOwnedAudioTrack(null);
          }
        } else {
          // Silent audio - we own this track
          const silent = createSilentAudioTrack();
          if (silent && !cancelled) {
            ownedTrack = silent;
            silentAudioTrackRef.current = silent;
            setOwnedAudioTrack(silent);
          } else if (!cancelled) {
            setOwnedAudioTrack(null);
          }
        }
      })();

      return () => {
        cancelled = true;
        // Only stop tracks we own (microphone and silent)
        if (ownedTrack) {
          try {
            ownedTrack.stop();
          } catch (e) {
            /* Track may already be stopped */
          }
        }
        setOwnedAudioTrack(null);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioSource?.type, audioSource?.type === 'stream' ? audioSource.stream : null, audioSource?.type === 'microphone' ? JSON.stringify(audioSource.constraints) : null, createSilentAudioTrack, onError, isStarted]);

    // Replace audio track when ownedAudioTrack changes
    useEffect(() => {
      // Only react if streaming has started
      if (!pcRef.current || !publishStreamRef.current || !ownedAudioTrack) return;

      (async () => {
        const publishStream = publishStreamRef.current;
        const pc = pcRef.current;
        if (!publishStream || !pc) return;

        // Remove old audio tracks
        publishStream.getAudioTracks().forEach((t) => publishStream.removeTrack(t));
        // Add new audio track
        publishStream.addTrack(ownedAudioTrack);

        // Replace on RTCPeerConnection
        const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
        if (sender) {
          await sender.replaceTrack(ownedAudioTrack);
        }

        currentAudioTrackRef.current = ownedAudioTrack;
      })().catch((e) => {
        console.error('[DaydreamCanvas] Error replacing audio track:', e);
        onError?.(e);
      });
    }, [ownedAudioTrack, onError]);

    // Request built-in microphone on demand
    const requestMicrophone = useCallback(async (): Promise<boolean> => {
      try {
        if (audioSource?.type !== 'microphone') return false;
        const constraints: MediaStreamConstraints = {
          audio: microphoneConstraints || { echoCancellation: true, noiseSuppression: true },
          video: false,
        };
        const micStream = await navigator.mediaDevices.getUserMedia(constraints);
        const micTrack = micStream.getAudioTracks()[0];
        if (!micTrack) return false;
        builtInMicTrackRef.current = micTrack;
        if (publishStreamRef.current) {
          publishStreamRef.current.getAudioTracks().forEach((t) => publishStreamRef.current!.removeTrack(t));
          publishStreamRef.current.addTrack(micTrack);
        }
        if (pcRef.current) {
          const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'audio');
          if (sender) await sender.replaceTrack(micTrack);
        }
        if (silentAudioTrackRef.current) {
          try { silentAudioTrackRef.current.stop(); } catch (e) { /* Track may already be stopped */ }
          silentAudioTrackRef.current = null;
        }
        currentAudioTrackRef.current = micTrack;
        return true;
      } catch (e) {
        onError?.(e);
        return false;
      }
    }, [microphoneConstraints, onError, audioSource?.type]);

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

      // Check for external audio stream
      if (sourceAudioStream) {
        if (sourceAudioStream instanceof MediaStream) {
          audioTrack = sourceAudioStream.getAudioTracks()[0] || null;
        } else if ('kind' in sourceAudioStream) {
          audioTrack = sourceAudioStream.kind === 'audio' ? sourceAudioStream : null;
        }
      }

      // Fall back to built-in microphone
      if (!audioTrack && builtInMicTrackRef.current) {
        audioTrack = builtInMicTrackRef.current;
      }

      // Fall back to silent audio track
      if (!audioTrack) {
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
    }, [sourceAudioStream, createSilentAudioTrack, enforceSquare, fps, size]);

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
          } catch (e) {
            /* Track may already be stopped */
          }
          silentAudioTrackRef.current = null;
        }
        currentAudioTrackRef.current = newTrack;
      },
      [createSilentAudioTrack]
    );

    // Serial params update queue
    const sendParamsUpdate = useCallback(async () => {
      if (paramsInFlightRef.current) return;
      if (!readyForParamUpdatesRef.current) return; // gate until init window passes
      const streamId = streamIdRef.current;
      if (!streamId) return;

      const next = pendingParamsRef.current;
      if (!next) return;

      // Clear pending immediately to detect new updates during send
      pendingParamsRef.current = null;
      paramsInFlightRef.current = true;
      // Snapshot latest for eventual consistency; always include required defaults
      const latest = latestParamsRef.current || next;
      // Ensure controlnets are always sent (use provided or defaults)
      const defaultControlnets = [
        {
          enabled: true,
          model_id: 'xinsir/controlnet-depth-sdxl-1.0',
          preprocessor: 'depth_tensorrt',
          preprocessor_params: {},
          conditioning_scale: 0.6,
        },
        {
          enabled: true,
          model_id: 'xinsir/controlnet-canny-sdxl-1.0',
          preprocessor: 'canny',
          preprocessor_params: {},
          conditioning_scale: 0.3,
        },
        {
          enabled: true,
          model_id: 'xinsir/controlnet-tile-sdxl-1.0',
          preprocessor: 'feedback',
          preprocessor_params: {},
          conditioning_scale: 0.2,
        },
      ];
      const mergedControlnets = (latest.controlnets && latest.controlnets.length ? latest.controlnets : defaultControlnets)
        .map((cn) => ({ enabled: true, preprocessor_params: {}, ...cn }));

      const body = {
        streamId,
        params: {
          model_id: latest.model_id || 'stabilityai/sdxl-turbo',
          prompt: latest.prompt,
          negative_prompt: latest.negative_prompt ?? 'blurry, low quality, flat, 2d, distorted',
          num_inference_steps: latest.num_inference_steps ?? 50,
          seed: latest.seed ?? 42,
          t_index_list: latest.t_index_list ?? [6, 12, 18],
          controlnets: mergedControlnets,
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
        console.error('[DaydreamCanvas] Params update failed:', e);
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
        setIsStarted(true);
        // creating_stream

        // Create stream with initial params FIRST
        const initialParams: StreamDiffusionParams = {
          model_id: params.model_id || 'stabilityai/sdxl-turbo',
          prompt: params.prompt,
          negative_prompt: params.negative_prompt ?? 'blurry, low quality, flat, 2d, distorted',
          num_inference_steps: params.num_inference_steps ?? 50,
          seed: params.seed ?? 42,
          t_index_list: params.t_index_list ?? [6, 12, 18],
          controlnets:
            params.controlnets && params.controlnets.length
              ? params.controlnets.map((cn) => ({ enabled: true, preprocessor_params: {}, ...cn }))
              : [
                  {
                    enabled: true,
                    model_id: 'xinsir/controlnet-depth-sdxl-1.0',
                    preprocessor: 'depth_tensorrt',
                    preprocessor_params: {},
                    conditioning_scale: 0.6,
                  },
                  {
                    enabled: true,
                    model_id: 'xinsir/controlnet-canny-sdxl-1.0',
                    preprocessor: 'canny',
                    preprocessor_params: {},
                    conditioning_scale: 0.3,
                  },
                  {
                    enabled: true,
                    model_id: 'xinsir/controlnet-tile-sdxl-1.0',
                    preprocessor: 'feedback',
                    preprocessor_params: {},
                    conditioning_scale: 0.2,
                  },
                ],
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

        // Immediately start WHIP publish (and capture playback URL from headers)
        const publishStream = await buildPublishStream();
        const { pc, playbackUrl } = await startWhipPublish(streamData.whip_url, publishStream);
        pcRef.current = pc;
        playbackUrlRef.current = playbackUrl;

        // Notify caller once we have both IDs and playback URL
        onReady?.({ streamId: streamData.id, playbackId: streamData.output_playback_id, playbackUrl: playbackUrlRef.current });
        // ready

        // NOW start the copy loop to populate the canvas with actual content
        startCopyLoop();

        // Open the init window for params updates (3s gate)
        readyForParamUpdatesRef.current = false;
        window.setTimeout(() => {
          readyForParamUpdatesRef.current = true;
          // Kick an update with the latest params on gate open
          enqueueParamsUpdate();
        }, 3000);
      } catch (e) {
        // error
        onError?.(e);
        throw e;
      }
    }, [buildPublishStream, enqueueParamsUpdate, onError, onReady, params, startCopyLoop, videoSource.type]);

    // Stop publishing and cleanup
    const stop = useCallback(async () => {
      setIsStarted(false);
      stopCopyLoop();
      readyForParamUpdatesRef.current = false;

      // Close RTCPeerConnection
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch (e) {
          // RTCPeerConnection already closed or error
        }
        pcRef.current = null;
      }

      // Stop publish stream tracks
      if (publishStreamRef.current) {
        publishStreamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch (e) {
            // Track already stopped or error
          }
        });
        publishStreamRef.current = null;
      }

      // Stop internal silent audio
      if (silentAudioTrackRef.current) {
        try {
          silentAudioTrackRef.current.stop();
        } catch (e) {
          // Silent audio track already stopped or error
        }
        silentAudioTrackRef.current = null;
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {
          // Audio context already closed or error
        }
        audioContextRef.current = null;
      }

      // Do not stop external audio tracks; they are owned by the caller
      currentAudioTrackRef.current = null;

      // Clear stream identifiers
      streamIdRef.current = null;
      playbackIdRef.current = null;
      playbackUrlRef.current = null;
    }, [stopCopyLoop]);

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
          if (wasRunningRef.current) {
            wasRunningRef.current = false;
            void start();
          }
        }
      };

      document.addEventListener('visibilitychange', handleVisibility);
      return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [alwaysOn, start, stop]);

    // Auto-start on mount
    // TODO: Allow explicitly starting/stopping if needed.
    useEffect(() => {
      void start();
      return () => {
        void stop();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Merge internal and external refs
    const setCanvasRef = useCallback((element: HTMLCanvasElement | null) => {
      canvasRef.current = element;
      if (externalCanvasRef) {
        if (typeof externalCanvasRef === 'function') {
          externalCanvasRef(element);
        } else {
          (externalCanvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = element;
        }
      }
    }, [externalCanvasRef]);

  return (
    <canvas
      ref={setCanvasRef}
      className={className}
      style={style}
      width={enforceSquare ? size : undefined}
      height={enforceSquare ? size : undefined}
    />
  );
};

DaydreamCanvas.displayName = 'DaydreamCanvas';
