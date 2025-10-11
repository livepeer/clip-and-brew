import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { ArrowLeft, Camera, ImageOff, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import * as Player from '@livepeer/react/player';
import { getSrc } from '@livepeer/react/external';
import { createDaydreamStream, startWhipPublish, updateDaydreamPrompts } from '@/lib/daydream';
import type { StreamDiffusionParams } from '@/lib/daydream';
import { VideoRecorder, uploadToLivepeer, saveClipToDatabase } from '@/lib/recording';
import { captureVideoFrameDataUrl, generateTransformation } from '@/lib/transforms';

const FRONT_PROMPTS = [
  "studio ghibli portrait, soft rim light",
  "cyberpunk neon portrait 90s anime",
  "watercolor ink portrait, loose brush",
  "melting holographic portrait, liquid chrome",
  "psychedelic kaleidoscope face, fractal patterns",
  "glitch art portrait, RGB split, datamosh",
  "cosmic deity portrait, galaxy skin, star eyes",
  "retro VHS portrait, scan lines, 80s aesthetic",
  "paper cutout collage portrait, layered colors",
  "stained glass portrait, vivid shards",
  "oil painting portrait, thick impasto brushstrokes",
  "pixel art portrait, 8-bit retro gaming",
  "neon wireframe portrait, tron grid",
  "ukiyo-e woodblock print portrait, bold lines"
];

const BACK_PROMPTS = [
  "vaporwave cityscape",
  "film noir scene, grainy",
  "isometric tech poster, bold shapes",
  "surreal dreamscape, melting clocks, floating objects",
  "synthwave sunset, retrowave grid, palm trees",
  "abstract expressionism, bold paint splatters",
  "underwater coral reef, bioluminescent creatures",
  "cyberpunk rain-soaked alley, neon signs",
  "mandala pattern landscape, sacred geometry",
  "vintage comic book scene, ben-day dots, pop art",
  "low poly geometric world, faceted 3D",
  "infrared photography, false color landscape",
  "street art graffiti wall, bold tags, spray paint",
  "M.C. Escher impossible architecture, tessellations",
  "aurora borealis sky, swirling northern lights"
];

const TEXTURES = [
  {
    id: 'lava',
    url: 'https://t4.ftcdn.net/jpg/01/83/14/47/360_F_183144766_dbGaN37u6a4VCliXQ6wcarerpYmuLAto.jpg',
    name: 'Lava'
  },
  {
    id: 'galaxy_orion',
    url: 'https://science.nasa.gov/wp-content/uploads/2023/04/orion-nebula-xlarge_web-jpg.webp',
    name: 'Galaxy'
  },
  {
    id: 'dragon_scales',
    url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/roof_tiles/roof_tiles_diff_1k.jpg',
    name: 'Dragon Scales (Roof Tiles, PH 1K)'
  },
  {
    id: 'water_ripples',
    url: 'https://media.gettyimages.com/id/585332126/photo/rock-face.jpg?s=612x612&w=gi&k=20&c=bX6I0qs7hVDXs0ZUaqPUb1uLkLaZm-ASZxVd5TDXW-A=',
    name: 'Water Ripples (TextureLabs)'
  },
  {
    id: 'lightning',
    url: 'https://opengameart.org/sites/default/files/l1.png',
    name: 'Lightning Bolt (OGA PNG)'
  },
  {
    id: 'sand_dunes',
    url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_sand/aerial_sand_diff_1k.jpg',
    name: 'Sand Dunes (PH 1K)'
  },
  {
    id: 'sand_dunes_2',
    url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_beach_01/aerial_beach_01_diff_1k.jpg',
    name: 'Beach Ripples (PH 1K)'
  },
  {
    id: 'foam_ocean',
    url: 'https://t3.ftcdn.net/jpg/02/03/50/32/360_F_203503200_3M3ZmpW9nhU6faaF3fewlkIMtRWxlHye.jpg',
    name: 'Ocean Foam (ambientCG 1K)'
  }
];

// Detect if device likely has front/back cameras (mobile/tablet)
const hasMultipleCameras = (): boolean => {
  // Check for touch capability (mobile/tablet indicator)
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Check for mobile user agent patterns
  const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Assume device has multiple cameras if it's touch-enabled or mobile UA
  return hasTouch || mobileUserAgent;
};

export default function Capture() {
  const [cameraType, setCameraType] = useState<'front' | 'back' | null>(null);
  const [loading, setLoading] = useState(false);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [playbackId, setPlaybackId] = useState<string | null>(null);
  const [whipUrl, setWhipUrl] = useState<string | null>(null);
  const [autoStartChecked, setAutoStartChecked] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [selectedTexture, setSelectedTexture] = useState<string | null>(null);
  const [textureWeight, setTextureWeight] = useState([0.5]);
  const [creativity, setCreativity] = useState([5]);
  const [quality, setQuality] = useState([0.4]);

  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [captureSupported, setCaptureSupported] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSlowLoadingMessage, setShowSlowLoadingMessage] = useState(false);
  const [uploadingClip, setUploadingClip] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [transforming, setTransforming] = useState(false);
  const [transformedImageUrl, setTransformedImageUrl] = useState<string | null>(null);
  const [transformedPrompt, setTransformedPrompt] = useState<string | null>(null);
  const [originalSnapshotUrl, setOriginalSnapshotUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const recorderRef = useRef<VideoRecorder | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordStartTimeRef = useRef<number | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // useEffect(() => {
  //   checkAuth();
  // }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/login');
    }
  };

  const initializeStream = useCallback(async (type: 'front' | 'back') => {
    setLoading(true);
    try {
      // Create Daydream stream
      const streamData = await createDaydreamStream();

      setStreamId(streamData.id);
      setPlaybackId(streamData.output_playback_id);
      setWhipUrl(streamData.whip_url);

      // Start WebRTC publishing
      await startWebRTCPublish(streamData.whip_url, type);

      // Save session to database
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // For anonymous users, look up by ID instead of email
        const query = user.is_anonymous
          ? supabase.from('users').select('id').eq('id', user.id)
          : supabase.from('users').select('id').eq('email', user.email);

        const { data: userData } = await query.single();

        if (userData) {
          await supabase.from('sessions').insert({
            user_id: userData.id,
            stream_id: streamData.id,
            playback_id: streamData.output_playback_id,
            camera_type: type,
          });
        }
      }
    } catch (error: unknown) {
      console.error('Error initializing stream:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // startWebRTCPublish is stable (doesn't depend on props/state)

  const selectCamera = useCallback(async (type: 'front' | 'back') => {
    setCameraType(type);
    const randomPrompt = type === 'front'
      ? FRONT_PROMPTS[Math.floor(Math.random() * FRONT_PROMPTS.length)]
      : BACK_PROMPTS[Math.floor(Math.random() * BACK_PROMPTS.length)];
    setPrompt(randomPrompt);

    await initializeStream(type);
  }, [initializeStream]);

  // Auto-start camera on desktop (non-mobile devices)
  useEffect(() => {
    if (!autoStartChecked && cameraType === null && !loading) {
      const shouldAutoStart = !hasMultipleCameras();
      if (shouldAutoStart) {
        setAutoStartChecked(true);
        // Desktop device - auto-start with default camera
        selectCamera('front');
      } else {
        setAutoStartChecked(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartChecked, cameraType, loading]);

  /**
   * Mirror a video stream by rendering it through a canvas
   * This ensures the mirrored stream goes to Daydream, so the output is naturally mirrored
   */
  const mirrorStream = (originalStream: MediaStream): MediaStream => {
    // Create a hidden video element to play the original stream
    const video = document.createElement('video');
    video.srcObject = originalStream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.position = 'fixed';
    video.style.top = '-9999px';
    document.body.appendChild(video);

    // Explicitly play the video
    video.play().catch(err => console.error('Error playing video for mirroring:', err));

    // Create a canvas to mirror the video
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { alpha: false })!;

    // Start continuous mirroring loop
    const mirror = () => {
      if (video.readyState >= video.HAVE_CURRENT_DATA) {
        // Clear and redraw with horizontal flip
        ctx.setTransform(-1, 0, 0, 1, canvas.width, 0); // Flip horizontally
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      requestAnimationFrame(mirror);
    };

    // Start drawing immediately
    mirror();

    // Capture the mirrored stream from canvas (24 fps to match typical camera)
    const mirroredVideoStream = canvas.captureStream(24);

    // Add the original audio tracks to the mirrored stream
    originalStream.getAudioTracks().forEach(track => {
      mirroredVideoStream.addTrack(track);
    });

    return mirroredVideoStream;
  };

  const startWebRTCPublish = async (whipUrl: string, type: 'front' | 'back') => {
    try {
      const originalStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: type === 'front' ? 'user' : 'environment',
          width: 512,
          height: 512,
        },
        audio: true,
      });

      // Mirror the stream if using front camera
      const stream = type === 'front' ? mirrorStream(originalStream) : originalStream;

      if (sourceVideoRef.current) {
        sourceVideoRef.current.srcObject = stream;
      }

      // Use the WHIP helper from daydream.ts
      const pc = await startWhipPublish(whipUrl, stream);
      pcRef.current = pc;

      console.log('WebRTC publishing started');
    } catch (error) {
      console.error('Error starting WebRTC publish:', error);
      throw error;
    }
  };

  const refreshStyle = useCallback(async () => {
    try {
      if (!playerContainerRef.current) return;
      const playerVideo = playerContainerRef.current.querySelector('video') as HTMLVideoElement | null;
      if (!playerVideo) {
        toast({ title: 'Video not ready', description: 'Please wait for the stream to start', variant: 'destructive' });
        return;
      }
      setTransforming(true);
      // Capture a square frame from the current output
      const frameDataUrl = captureVideoFrameDataUrl(playerVideo, 768);
      // Optional: pass current typed prompt as a soft style hint
      const { prompt: aiPrompt, imageUrl } = await generateTransformation({
        imageBase64: frameDataUrl,
        styleHint: undefined,
        provider: 'openai',
      });
      setOriginalSnapshotUrl(frameDataUrl);
      setTransformedPrompt(aiPrompt);
      setTransformedImageUrl(imageUrl);
    } catch (error) {
      console.error('Refresh style failed', error);
      toast({ title: 'Transform failed', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally {
      setTransforming(false);
    }
  }, [playerContainerRef, toast]);

  const updatePrompt = useCallback(async () => {
    if (!streamId) return;

    try {
      // Calculate t_index_list based on creativity and quality
      const tIndexList = calculateTIndexList(creativity[0], quality[0]);

      // Determine IP-Adapter settings when a texture is selected
      const selectedTextureObj = selectedTexture
        ? TEXTURES.find((t) => t.id === selectedTexture)
        : null;

      // Build params for StreamDiffusion
      const params: StreamDiffusionParams = {
        model_id: 'stabilityai/sdxl-turbo',
        prompt,
        negative_prompt: 'blurry, low quality, flat, 2d, distorted',
        t_index_list: tIndexList,
        seed: 42,
        num_inference_steps: 50,
      };

      // Include IP-Adapter only if a texture is selected
      if (selectedTextureObj) {
        params.ip_adapter = {
          enabled: true,
          type: 'regular',
          scale: textureWeight[0],
          weight_type: 'linear',
          insightface_model_name: 'buffalo_l',
        };
        params.ip_adapter_style_image_url = selectedTextureObj.url;

        // Use SDXL default controlnets but set conditioning_scale to 0 (disabled via scale)
        params.controlnets = [
          {
            enabled: true,
            model_id: 'xinsir/controlnet-depth-sdxl-1.0',
            preprocessor: 'depth_tensorrt',
            preprocessor_params: {},
            conditioning_scale: 0,
          },
          {
            enabled: true,
            model_id: 'xinsir/controlnet-canny-sdxl-1.0',
            preprocessor: 'canny',
            preprocessor_params: {},
            conditioning_scale: 0,
          },
          {
            enabled: true,
            model_id: 'xinsir/controlnet-tile-sdxl-1.0',
            preprocessor: 'feedback',
            preprocessor_params: {},
            conditioning_scale: 0,
          },
        ];
      }

      // Use the StreamDiffusion prompt helper with proper params
      await updateDaydreamPrompts(streamId, params);

    } catch (error: unknown) {
      console.error('Error updating prompt:', error);
    }
  }, [streamId, prompt, creativity, quality, selectedTexture, textureWeight]);

  const calculateTIndexList = (creativityVal: number, qualityVal: number): number[] => {
    let baseIndices: number[];

    if (qualityVal < 0.25) {
      baseIndices = [6];
    } else if (qualityVal < 0.50) {
      baseIndices = [6, 12];
    } else if (qualityVal < 0.75) {
      baseIndices = [6, 12, 18];
    } else {
      baseIndices = [6, 12, 18, 24];
    }

    const scale = 2.62 - 0.132 * creativityVal;
    return baseIndices.map(idx => Math.max(0, Math.min(50, Math.round(idx * scale))));
  };

  const startRecording = async () => {
    // Desktop mode: if already recording, ignore (stop will be called separately)
    if (!isMobile && recording) {
      return;
    }

    // Get the video element from the Livepeer Player
    const playerVideo = playerContainerRef.current?.querySelector('video') as HTMLVideoElement;

    if (!playerVideo) {
      toast({
        title: 'Error',
        description: 'Video player not ready',
        variant: 'destructive',
      });
      return;
    }

    // Check if captureStream is supported
    if (!VideoRecorder.isSupported(playerVideo)) {
      setCaptureSupported(false);
      toast({
        title: 'Recording not supported',
        description: 'Your browser does not support video capture',
        variant: 'destructive',
      });
      return;
    }

    try {
      const recorder = new VideoRecorder(playerVideo);
      await recorder.start();

      recorderRef.current = recorder;
      recordStartTimeRef.current = Date.now();
      setRecording(true);

      // Auto-stop at 10 seconds
      autoStopTimerRef.current = setTimeout(() => {
        stopRecording().catch(err => {
          console.error('Error in auto-stop:', err);
        });
      }, 10000);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start recording',
        variant: 'destructive',
      });
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const stopRecording = async () => {
    if (!recorderRef.current || !recordStartTimeRef.current || !streamId) {
      return;
    }

    // Clear auto-stop timer
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }

    const recordingDuration = Date.now() - recordStartTimeRef.current;

    // Check minimum duration (3 seconds)
    if (recordingDuration < 3000) {
      setRecording(false);
      recordStartTimeRef.current = null;

      // Stop and discard the recording
      try {
        await recorderRef.current.stop();
      } catch (error) {
        console.error('Error stopping recorder:', error);
      }
      recorderRef.current = null;

      toast({
        title: 'Recording too short',
        description: 'Hold for at least 3 seconds to create a clip',
        variant: 'destructive',
      });
      return;
    }

    setRecording(false);
    recordStartTimeRef.current = null;
    setUploadingClip(true);

    try {
      // Stop the recorder and get the blob
      const { blob, durationMs } = await recorderRef.current.stop();
      recorderRef.current = null;

      console.log('Recording stopped, uploading to Livepeer...');

      toast({
        title: 'Processing...',
        description: 'Uploading your clip to Livepeer Studio',
      });

      // Upload to Livepeer Studio with progress tracking
      const filename = `daydream-clip-${Date.now()}.webm`;
      const { assetId, playbackId: assetPlaybackId, downloadUrl } = await uploadToLivepeer(
        blob, 
        filename,
        (progress) => {
          setUploadProgress(progress.step || progress.phase);
        }
      );

      console.log('Upload complete, saving to database...');

      // Get session ID
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('id')
        .eq('stream_id', streamId)
        .single();

      if (!sessionData) {
        throw new Error('Session not found');
      }

      // Save to database
      const clip = await saveClipToDatabase({
        assetId,
        playbackId: assetPlaybackId,
        downloadUrl,
        durationMs,
        sessionId: sessionData.id,
        prompt,
        textureId: selectedTexture,
        textureWeight: selectedTexture ? textureWeight[0] : null,
        tIndexList: calculateTIndexList(creativity[0], quality[0]),
      });

      toast({
        title: 'Clip created!',
        description: 'Redirecting to your clip...',
      });

      navigate(`/clip/${clip.id}`);
    } catch (error: unknown) {
      console.error('Error creating clip:', error);
      toast({
        title: 'Error creating clip',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setUploadingClip(false);
      setUploadProgress('');
    }
  };

  const src = useMemo(() => {
    if (!playbackId) {
      return null;
    }

    // Try getSrc first (works for standard Livepeer playback IDs)
    const result = getSrc(playbackId);

    if (result && Array.isArray(result) && result.length > 0) {
      return result;
    }

    // For Daydream streams, construct WebRTC source manually
    // Daydream uses Livepeer infrastructure but may have different endpoints
    const manualSrc = [
      {
        src: `https://livepeer.studio/webrtc/${playbackId}`,
        mime: 'video/h264' as const,
        type: 'webrtc' as const,
      },
      {
        src: `https://livepeer.studio/hls/${playbackId}/index.m3u8`,
        mime: 'application/vnd.apple.mpegurl' as const,
        type: 'hls' as const,
      },
    ] as const;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return manualSrc as any;
  }, [playbackId]);

  useEffect(() => {
    if (prompt && streamId) {
      const debounce = setTimeout(() => {
        updatePrompt();
      }, 500);
      return () => clearTimeout(debounce);
    }
  }, [prompt, selectedTexture, textureWeight, creativity, quality, streamId, updatePrompt]);

  // Update recording timer display
  useEffect(() => {
    if (recording && recordStartTimeRef.current) {
      const interval = setInterval(() => {
        setRecordingTime(Date.now() - recordStartTimeRef.current!);
      }, 100); // Update every 100ms for smooth counter

      return () => clearInterval(interval);
    } else {
      setRecordingTime(0);
    }
  }, [recording]);

  // Listen for video playback to enable recording
  useEffect(() => {
    if (playerContainerRef.current) {
      const video = playerContainerRef.current.querySelector('video');
      if (video) {
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleWaiting = () => setIsPlaying(false);

        video.addEventListener('playing', handlePlay);
        video.addEventListener('pause', handlePause);
        video.addEventListener('waiting', handleWaiting);

        // Check initial state
        if (!video.paused && video.readyState >= 3) {
          setIsPlaying(true);
        }

        return () => {
          video.removeEventListener('playing', handlePlay);
          video.removeEventListener('pause', handlePause);
          video.removeEventListener('waiting', handleWaiting);
        };
      }
    }
  }, [playbackId, src]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
    };
  }, []);

  // Show reassuring message if stream takes longer than 10s to load
  useEffect(() => {
    if (playbackId && !isPlaying) {
      const timer = setTimeout(() => {
        setShowSlowLoadingMessage(true);
      }, 15000);

      return () => {
        clearTimeout(timer);
        setShowSlowLoadingMessage(false);
      };
    } else {
      setShowSlowLoadingMessage(false);
    }
  }, [playbackId, isPlaying]);

  if (!cameraType) {
    // Show loading state while auto-starting on desktop
    if (loading) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
          <div className="max-w-md w-full text-center space-y-8">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Starting camera...</p>
          </div>
        </div>
      );
    }

    // Camera selection screen (only shown on mobile/tablet devices)
    const showMultipleCameras = hasMultipleCameras();

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-neutral-950 text-neutral-200">
        <div className="max-w-md w-full text-center space-y-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-neutral-100 to-neutral-400 bg-clip-text text-transparent mb-2">
              {showMultipleCameras ? 'Choose Camera' : 'Start Camera'}
            </h1>
            <p className="text-neutral-400">
              {showMultipleCameras ? 'Select which camera to use' : 'Start your webcam to begin'}
            </p>
          </div>

          <div className="space-y-4">
            {showMultipleCameras ? (
              <>
                <Button
                  onClick={() => selectCamera('front')}
                  className="w-full h-20 bg-neutral-900 border border-neutral-800 hover:border-neutral-600 hover:bg-neutral-850 transition-all duration-200"
                  variant="outline"
                >
                  <div className="flex items-center gap-4">
                    <Camera className="w-8 h-8 text-neutral-300" />
                    <div className="text-left">
                      <div className="font-semibold text-neutral-100">Front Camera</div>
                      <div className="text-sm text-neutral-400">Selfie mode</div>
                    </div>
                  </div>
                </Button>

                <Button
                  onClick={() => selectCamera('back')}
                  className="w-full h-20 bg-neutral-900 border border-neutral-800 hover:border-neutral-600 hover:bg-neutral-850 transition-all duration-200"
                  variant="outline"
                >
                  <div className="flex items-center gap-4">
                    <Camera className="w-8 h-8 text-neutral-300" />
                    <div className="text-left">
                      <div className="font-semibold text-neutral-100">Back Camera</div>
                      <div className="text-sm text-neutral-400">Environment mode</div>
                    </div>
                  </div>
                </Button>
              </>
            ) : (
              <Button
                onClick={() => selectCamera('front')}
                className="w-full h-20 bg-gradient-to-r from-primary to-accent text-white transition-all duration-200"
              >
                <div className="flex items-center gap-4">
                  <Camera className="w-8 h-8" />
                  <div className="text-left">
                    <div className="font-semibold text-lg">Start Webcam</div>
                    <div className="text-sm opacity-90">Begin recording</div>
                  </div>
                </div>
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Main Video Output */}

        <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="relative">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative aspect-square bg-neutral-950 rounded-3xl overflow-hidden border border-neutral-900 shadow-lg">
              {playbackId && src ? (
                <div
                  ref={playerContainerRef}
                  className="player-container w-full h-full [&_[data-radix-aspect-ratio-wrapper]]:!h-full [&_[data-radix-aspect-ratio-wrapper]]:!pb-0"
                  style={{ width: '100%', height: '100%', position: 'relative' }}
                >
                  <Player.Root src={src} autoPlay lowLatency="force">
                    <Player.Container
                      className="w-full h-full"
                      style={{ width: '100%', height: '100%', position: 'relative' }}
                    >
                      <Player.Video
                        className="w-full h-full"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <Player.LoadingIndicator>
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950/50 gap-4">
                          <Loader2 className="w-12 h-12 animate-spin text-primary" />
                          <p className="text-sm text-neutral-300 text-center px-4 min-h-[20px]">
                            {showSlowLoadingMessage && "Hang tight! Stream loading can take up to 30 seconds..."}
                          </p>
                        </div>
                      </Player.LoadingIndicator>
                    </Player.Container>
                  </Player.Root>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                  <Loader2 className="w-12 h-12 animate-spin text-neutral-400" />
                  {playbackId && !src && (
                    <>
                      <p className="text-xs text-neutral-500">Loading stream...</p>
                      <p className="text-sm text-neutral-300 text-center px-4 min-h-[20px]">
                        {showSlowLoadingMessage && "Hang tight! Stream loading can take up to 30 seconds..."}
                      </p>
                    </>
                  )}
                </div>
              )}
              {/* PiP Source Preview */}
              <div className="absolute bottom-4 right-4 w-24 h-24 rounded-2xl overflow-hidden border-2 border-white shadow-lg">
                <video ref={sourceVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              </div>
            </div>

            <div className="relative aspect-square bg-neutral-950 rounded-3xl overflow-hidden border border-neutral-900 shadow-lg flex items-center justify-center">
              {transforming ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <span className="text-sm text-neutral-400">Dreamifying your frame...</span>
                </div>
              ) : transformedImageUrl ? (
                <img src={transformedImageUrl} alt="Transformed" className="w-full h-full object-cover" />
              ) : (
                <div className="text-neutral-500 text-sm px-6 text-center">Tap Refresh Style to generate a surreal transformation</div>
              )}

              {originalSnapshotUrl && (
                <div className="absolute top-3 left-3 bg-neutral-900/70 text-neutral-200 text-[10px] px-2 py-1 rounded">
                  Original captured
                </div>
              )}

              {transformedPrompt && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-xs text-neutral-200">
                  {transformedPrompt}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end mt-3">
            <Button onClick={refreshStyle} disabled={!isPlaying || transforming} variant="outline" className="gap-2 border-neutral-800 hover:border-neutral-600">
              <RefreshCw className={`w-4 h-4 ${transforming ? 'animate-spin' : ''}`} />
              {transforming ? 'Dreamifying...' : 'Refresh Style'}
            </Button>
          </div>
        </div>

        {/* Record Button */}
        {!captureSupported && (
          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3 text-sm text-yellow-200">
            ⚠️ Video capture not supported on this browser. Recording is disabled.
          </div>
        )}
        <Button
          onClick={isMobile ? undefined : toggleRecording}
          onPointerDown={isMobile ? startRecording : undefined}
          onPointerUp={isMobile ? stopRecording : undefined}
          onPointerLeave={isMobile ? stopRecording : undefined}
          disabled={loading || uploadingClip || !playbackId || !captureSupported || !isPlaying}
          className="w-full h-16 bg-gradient-to-r from-neutral-200 to-neutral-500 text-neutral-900 font-semibold rounded-2xl hover:from-neutral-300 hover:to-neutral-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {recording ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              Recording... ({(recordingTime / 1000).toFixed(1)}s)
            </span>
          ) : uploadingClip ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              {uploadProgress || 'Uploading clip...'}
            </span>
          ) : loading || !isPlaying ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Starting stream...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-neutral-900" />
              {isMobile ? 'Hold to Brew' : 'Click to Start Brewing'}
            </span>
          )}
        </Button>

        {/* Controls */}
        <div className="bg-neutral-950 rounded-3xl p-6 border border-neutral-800 space-y-4 shadow-inner">
          <div>
            <label className="text-sm font-medium mb-2 block text-neutral-300">Prompt</label>
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your AI effect..."
              className="bg-neutral-950 border-neutral-800 focus:border-neutral-600 focus:ring-0 text-neutral-100 placeholder:text-neutral-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block text-neutral-300">
              Texture
            </label>

            <div className="flex items-center gap-4">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 bg-neutral-950 border-neutral-800 hover:border-neutral-600 hover:bg-neutral-850 !w-16 !h-16 rounded-full overflow-hidden px-0 py-0 w-full sm:w-auto"
                  >
                    {selectedTexture ? (
                      <>
                        <img
                          src={TEXTURES.find((t) => t.id === selectedTexture)?.url}
                          alt="Selected texture"
                          className="w-8 h-8 object-cover rounded"
                        />

                      </>
                      ) : (
                        <ImageOff className="w-5 h-5 text-neutral-400" />
                      )}
                  </Button>
                </PopoverTrigger>

                <PopoverContent
                  align="start"
                  sideOffset={8}
                  className="w-[90vw] sm:w-80 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl p-4"
                >
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    <Button
                      onClick={() => setSelectedTexture(null)}
                      variant={selectedTexture === null ? "default" : "outline"}
                      className={`aspect-square ${
                        selectedTexture === null
                          ? "bg-neutral-800 text-neutral-100"
                          : "bg-neutral-950 border-neutral-800 hover:border-neutral-600"
                      }`}
                    >
                      <ImageOff className="w-5 h-5 text-neutral-400" />
                    </Button>
                    {TEXTURES.map((texture) => (
                      <Button
                        key={texture.id}
                        onClick={() => setSelectedTexture(texture.id)}
                        variant={selectedTexture === texture.id ? "default" : "outline"}
                        className={`aspect-square p-0 overflow-hidden ${
                          selectedTexture === texture.id
                            ? "ring-2 ring-neutral-400"
                            : "border border-neutral-800 hover:border-neutral-600 hover:bg-neutral-850"
                        }`}
                      >
                        <img
                          src={texture.url}
                          alt={texture.name}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {selectedTexture && (
                <div className="flex-1">
                  <label className="text-sm font-medium block mb-1 text-neutral-300">
                    Strength: {textureWeight[0].toFixed(2)}
                  </label>
                  <Slider
                    value={textureWeight}
                    onValueChange={setTextureWeight}
                    min={0}
                    max={1}
                    step={0.01}
                    className="w-full accent-neutral-400"
                  />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block text-neutral-300">
              Creativity: {creativity[0].toFixed(1)}
            </label>
            <Slider
              value={creativity}
              onValueChange={setCreativity}
              min={1}
              max={10}
              step={0.1}
              className="w-full accent-neutral-400"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block text-neutral-300">
              Quality: {quality[0].toFixed(2)}
            </label>
            <Slider
              value={quality}
              onValueChange={setQuality}
              min={0}
              max={1}
              step={0.01}
              className="w-full accent-neutral-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
