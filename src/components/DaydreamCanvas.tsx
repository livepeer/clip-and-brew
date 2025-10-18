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
} from '@/lib/daydream';
import type { StreamDiffusionParams } from '@/lib/daydream';
import prompts from '@/components/prompts';

// Default stream diffusion parameters
const DEFAULT_STREAM_DIFFUSION_PARAMS = {
  model_id: 'stabilityai/sdxl-turbo',
  prompt: prompts.default[0],
  negative_prompt: 'blurry, low quality, flat, 2d, distorted',
  num_inference_steps: 50,
  seed: 42,
  t_index_list: [6, 12, 18],
  controlnets: [
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
  ip_adapter: {
    enabled: false,
    type: 'regular' as const,
    scale: 0,
    weight_type: 'linear' as const,
    insightface_model_name: 'buffalo_l' as const,
  },
};

/**
 * Start WHIP publish from a MediaStream to Daydream
 * Returns the RTCPeerConnection for later cleanup
 */
async function startWhipPublish(
  whipUrl: string,
  stream: MediaStream
): Promise<{ pc: RTCPeerConnection; playbackUrl: string | null }> {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 3,
  });

  // Add all tracks from the stream
  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  // Create offer
  const offer = await pc.createOffer({
    offerToReceiveAudio: false,
    offerToReceiveVideo: false,
  });
  await pc.setLocalDescription(offer);

  // Wait for ICE gathering to complete (non-trickle ICE) with timeout
  const ICE_TIMEOUT = 2000; // 2 second timeout - aggressive for fast UX

  await Promise.race([
    new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
      } else {
        const checkState = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }
        };
        pc.addEventListener('icegatheringstatechange', checkState);
      }
    }),
    new Promise<void>((resolve) => setTimeout(resolve, ICE_TIMEOUT))
  ]);

  // Send offer to WHIP endpoint
  const offerSdp = pc.localDescription!.sdp!;
  const response = await fetch(whipUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sdp',
    },
    body: offerSdp,
  });

  if (!response.ok) {
    throw new Error(`WHIP publish failed: ${response.status} ${response.statusText}`);
  }

  // Capture low-latency WebRTC playback URL from response headers
  const playbackUrl = response.headers.get('livepeer-playback-url') || null;

  // Get answer SDP and set it
  const answerSdp = await response.text();
  await pc.setRemoteDescription({
    type: 'answer',
    sdp: answerSdp,
  });

  return { pc, playbackUrl };
}

export interface DaydreamCanvasProps {
  className?: string;
  style?: React.CSSProperties;
  canvasRef?: React.Ref<HTMLCanvasElement>; // optional ref to the canvas element

  // Stream diffusion params, defaults to an SDXL turbo model with a depth, canny, and tile controlnet
  params?: StreamDiffusionParams;
  // Video frame source, defaults to blank if not provided
  videoSource?:
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
      }
    | {
        type: 'blank';
      };
  // Audio source, defaults to silent if not provided
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
  videoSource = { type: 'blank' },
  audioSource = { type: 'silent' },
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
    const sourceAudioStream = audioSource.type === 'stream' ? audioSource.stream : null;
    const microphoneConstraints = useMemo(() => {
      return audioSource.type === 'microphone' ? audioSource.constraints : null;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(audioSource)]);

    // Derive FPS from video source (try to match source, default to 24)
    const fps = useMemo(() => {
      if (videoSource.type === 'stream' && sourceVideoStream) {
        const videoTrack = sourceVideoStream.getVideoTracks()[0];
        const settings = videoTrack?.getSettings();
        return settings?.frameRate || 24;
      }
      return 24; // Default for camera, canvas sources, and blank frames
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

    // Optionally obtain camera stream internally
    useEffect(() => {
      // Clean up previous camera stream before starting new one
      // This is crucial when switching between front/back cameras
      setOwnedCameraStream(currStream => {
        if (currStream) {
          currStream.getTracks().forEach(t => t.stop());
        }
        return null;
      });

      if (videoSource.type !== 'camera' || !isStarted) {
        return;
      }

      let cancelled = false;
      let localStream: MediaStream | null = null;

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
          if (prev && prev !== localStream) {
            prev.getTracks().forEach(t => t.stop());
          }
          return null;
        });
      };
    }, [videoSource.type, cameraFacingMode, onError, size, isStarted]);

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
      // canvas and blank types don't need to use the hidden video element

      if (!effectiveStream) {
        video.srcObject = null;
        return;
      }

      video.srcObject = effectiveStream;
      video.play().catch((e) => {
        // Silent fail - autoplay handles this
        console.error('Error playing video source', e);
      });
    }, [videoSource.type, sourceVideoStream, ownedCameraStream]);

    // Function to draw the video source to the canvas

    const draw = useCallback(() => {
      // Draw one frame from the active source, if available
      if (!canvasRef.current) {
        return;
      }
      const ctx = canvasRef.current.getContext('2d', { alpha: false });
      if (!ctx) {
        return;
      }
      const sizePx = enforceSquare ? size : Math.min(size, Math.max(canvasRef.current.width, canvasRef.current.height));

      // Draw black frame (type: 'blank')
      if (videoSource.type === 'blank') {
        // Clear canvas and fill with black
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      // Draw from source canvas (type: 'canvas')
      else if (videoSource.type === 'canvas' && sourceCanvas) {
        const srcW = sourceCanvas.width;
        const srcH = sourceCanvas.height;
        if (srcW <= 0 || srcH <= 0) {
          return;
        }
        // Clear before drawing
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        if (cover) {
          const { dx, dy, drawWidth, drawHeight } = computeCoverDrawRect(srcW, srcH, sizePx);
          ctx.drawImage(sourceCanvas, dx, dy, drawWidth, drawHeight);
        } else {
          ctx.drawImage(sourceCanvas, 0, 0, sizePx, sizePx);
        }
      }
      // Draw from hidden video element (types: 'stream' or 'camera')
      else if (videoSource.type === 'stream' || videoSource.type === 'camera') {
        if (!hiddenVideoRef.current || hiddenVideoRef.current.readyState < hiddenVideoRef.current.HAVE_CURRENT_DATA) {
          // Video element exists but not ready - skip draw
          return;
        }

        const v = hiddenVideoRef.current;
        const srcW = v.videoWidth;
        const srcH = v.videoHeight;
        if (srcW <= 0 || srcH <= 0) {
          return;
        }

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
      } else {
        onError?.(new Error(`Unknown video source type: ${videoSource.type}`));
        return;
      }
    }, [cameraFacingMode, cover, enforceSquare, mirrorFront, size, videoSource.type, sourceCanvas, onError]);

    // Effect for render-copy loop based on sources
    const rafIdRef = useRef<number | null>(null);
    const lastTickRef = useRef<number>(0);
    useEffect(() => {
      if (!isStarted) return;

      let cancelled = false;
      const intervalMs = 1000 / Math.max(1, fps);
      lastTickRef.current = performance.now();

      const tick = () => {
        if (cancelled) return;

        try {
          const now = performance.now();
          const elapsed = now - lastTickRef.current;

          if (elapsed < intervalMs) {
            return;
          }
          lastTickRef.current = now - (elapsed % intervalMs);
          draw();
        } finally {
          rafIdRef.current = requestAnimationFrame(tick);
        }
      };
      rafIdRef.current = requestAnimationFrame(tick);

      return () => {
        cancelled = true;
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
      };
    }, [isStarted, fps, draw]);

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
        if (audioSource.type === 'stream') {
          // External audio stream - extract track but don't own it
          if (sourceAudioStream instanceof MediaStream) {
            const track = sourceAudioStream.getAudioTracks()[0] || null;
            if (!cancelled) setOwnedAudioTrack(track);
          } else if ('kind' in sourceAudioStream && sourceAudioStream.kind === 'audio') {
            if (!cancelled) setOwnedAudioTrack(sourceAudioStream);
          }
        } else if (audioSource.type === 'microphone') {
          // Request microphone - we own this track
          try {
            const constraints: MediaStreamConstraints = {
              audio: microphoneConstraints || { echoCancellation: true, noiseSuppression: true },
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
        } else if (audioSource.type === 'silent') {
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
    }, [audioSource.type, sourceAudioStream, microphoneConstraints, createSilentAudioTrack, onError, isStarted]);

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

      const body = {
        streamId,
        params: {
          ...DEFAULT_STREAM_DIFFUSION_PARAMS,
          ...latest,
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
          ...DEFAULT_STREAM_DIFFUSION_PARAMS,
          ...(params || {}),
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
    }, [buildPublishStream, enqueueParamsUpdate, onError, onReady, params]);

    // Stop publishing and cleanup
    const stop = useCallback(async () => {
      setIsStarted(false);
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
    }, []);

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
