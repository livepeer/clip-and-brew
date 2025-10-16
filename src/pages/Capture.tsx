import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { Camera, ImageOff, Loader2, Sparkles, RefreshCw, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import * as Player from '@livepeer/react/player';
import { getSrc } from '@livepeer/react/external';
import type { StreamDiffusionParams } from '@/lib/daydream';
import { DaydreamCanvas } from '@/components/DaydreamCanvas';
import { StudioRecorder, type StudioRecorderHandle } from '@/components/StudioRecorder';
import { saveClipToDatabase } from '@/lib/recording';

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
  "ukiyo-e woodblock print portrait, bold lines",
  "art nouveau portrait, flowing organic lines, ornate border",
  "charcoal sketch portrait, dramatic shadows, textured paper",
  "pop art portrait, bold colors, ben-day dots, warhol style",
  "renaissance oil painting portrait, chiaroscuro lighting",
  "surrealist portrait, melting features, dali inspired",
  "impressionist portrait, visible brushstrokes, monet style",
  "geometric cubist portrait, fragmented planes, picasso style",
  "art deco portrait, golden ratios, elegant symmetry",
  "abstract expressionist portrait, bold gestural marks",
  "gothic portrait, dark romanticism, dramatic lighting",
  "minimalist line art portrait, continuous line drawing",
  "baroque portrait, ornate details, dramatic composition",
  "futuristic android portrait, chrome finish, LED accents",
  "vintage tin type portrait, sepia tones, daguerreotype",
  "fantasy crystal portrait, gemstone skin, ethereal glow",
  "steampunk portrait, brass gears, victorian aesthetic",
  "tribal mask portrait, bold patterns, ceremonial paint",
  "graffiti street art portrait, spray paint drips, urban",
  "cel-shaded anime portrait, bold outlines, flat colors",
  "ethereal ghost portrait, translucent, wispy trails"
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
  "aurora borealis sky, swirling northern lights",
  "ancient temple ruins, overgrown jungle, mystical atmosphere",
  "nebula space scene, swirling cosmic dust, stars",
  "dystopian wasteland, post-apocalyptic, rusted metal",
  "enchanted forest, glowing mushrooms, fairy lights",
  "steampunk clockwork city, brass mechanisms, steam",
  "crystal cave, glowing minerals, underground wonder",
  "floating islands, waterfalls into clouds, fantasy realm",
  "neon tokyo street, rain reflections, busy night",
  "desert mirage, heat waves, surreal oasis",
  "arctic ice palace, frozen architecture, blue tones",
  "volcanic landscape, lava flows, dramatic fire glow",
  "alien planet surface, strange flora, dual suns",
  "medieval castle, fog, dramatic moonlight",
  "carnival carousel, vintage lights, whimsical",
  "zen garden, raked sand patterns, minimalist peace",
  "art gallery, abstract paintings, modern interior",
  "futuristic laboratory, holographic displays, sci-fi tech",
  "enchanted library, floating books, magical atmosphere",
  "cherry blossom garden, pink petals falling, serene",
  "gothic cathedral interior, stained glass, divine rays"
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
  const [cameraType, setCameraType] = useState<'user' | 'environment' | null>(null);
  const [loading, setLoading] = useState(false);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [playbackId, setPlaybackId] = useState<string | null>(null);
  const [autoStartChecked, setAutoStartChecked] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [selectedTexture, setSelectedTexture] = useState<string | null>(null);
  const [textureWeight, setTextureWeight] = useState([0.5]);
  const [intensity, setIntensity] = useState([5]);
  const [quality, setQuality] = useState([0.4]);
  const [texturePopoverOpen, setTexturePopoverOpen] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [captureSupported, setCaptureSupported] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSlowLoadingMessage, setShowSlowLoadingMessage] = useState(false);
  const [uploadingClip, setUploadingClip] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [lastDisplayedProgress, setLastDisplayedProgress] = useState<number>(0);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);

  const studioRecorderRef = useRef<StudioRecorderHandle | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordStartTimeRef = useRef<number | null>(null);
  const tabHiddenTimeRef = useRef<number | null>(null);
  const wasStreamActiveRef = useRef<boolean>(false);

  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const checkAuth = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/login');
    }
  }, [navigate]);
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const initializeStream = useCallback(async (_type: 'user' | 'environment', _initialPrompt: string) => {
    // Simplified: streaming is handled by DaydreamCanvas; just show loading until onReady
    setLoading(true);
  }, []);

  const selectCamera = useCallback(async (type: 'user' | 'environment') => {
    setCameraType(type);
    const randomPrompt = type === 'user'
      ? FRONT_PROMPTS[Math.floor(Math.random() * FRONT_PROMPTS.length)]
      : BACK_PROMPTS[Math.floor(Math.random() * BACK_PROMPTS.length)];
    setPrompt(randomPrompt);

    // Pass the initial prompt to initializeStream
    await initializeStream(type, randomPrompt);
  }, [initializeStream]);

  // Auto-start camera on desktop (non-mobile devices)
  useEffect(() => {
    if (!autoStartChecked && cameraType === null && !loading) {
      const shouldAutoStart = !hasMultipleCameras();
      if (shouldAutoStart) {
        setAutoStartChecked(true);
        // Desktop device - auto-start with default camera
        selectCamera('user');
      } else {
        setAutoStartChecked(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartChecked, cameraType, loading]);

  // DaydreamCanvas abstracts streaming; no local WHIP logic here

  const toggleMicrophone = () => {
    setMicEnabled(!micEnabled);
    toast({
      title: !micEnabled ? 'Microphone enabled' : 'Microphone muted',
      description: !micEnabled ? 'Now streaming live audio' : 'Audio is now muted',
    });
  };

  // Params are passed directly to DaydreamCanvas (serial updates handled internally)

  const calculateTIndexList = (intensityVal: number, qualityVal: number): number[] => {
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

    const scale = 2.62 - 0.132 * intensityVal;
    return baseIndices.map(idx => Math.max(0, Math.min(50, Math.round(idx * scale))));
  };

  const startRecording = async () => {
    // Desktop mode: if already recording, ignore (stop will be called separately)
    if (!isMobile && recording) {
      return;
    }

    try {
      // Start recording via StudioRecorder
      await studioRecorderRef.current?.startRecording();

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
    if (!recordStartTimeRef.current || !streamId) {
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
        await studioRecorderRef.current?.stopRecording();
      } catch (error) {
        console.error('Error stopping recorder:', error);
      }

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
    setLastDisplayedProgress(0); // Reset progress tracking

    console.log('Recording stopped, processing via StudioRecorder...');

    toast({
      title: 'Processing...',
      description: 'Uploading your clip to Livepeer Studio',
    });

    // Stop recording - StudioRecorder will handle upload and call our callbacks
    await studioRecorderRef.current?.stopRecording();
  };

  // StudioRecorder callback: Handle upload progress
  const handleRecordingProgress = useCallback((progress: { phase: string; step?: string; progress?: number }) => {
    if (progress.phase === 'uploading' && progress.progress !== undefined) {
      // Show upload progress with percentage (TUS only)
      const uploadPercent = Math.round(progress.progress * 100);
      setUploadProgress(`Uploading: ${uploadPercent}%`);
    } if (progress.phase === 'processing' && progress.progress !== undefined) {
      // Smooth progression: use API value if greater, otherwise increment by 1%
      setLastDisplayedProgress(prev => {
        let newProgress = Math.round(progress.progress * 100);
        newProgress = newProgress > prev ? newProgress : prev + 1;
        newProgress = Math.min(99, newProgress); // Cap at 99% while processing
        setUploadProgress(`Processing: ${newProgress}%`);
        return newProgress;
      });
    } else {
      setUploadProgress(progress.step || progress.phase);
    }
  }, [setUploadProgress, setLastDisplayedProgress]);

  // StudioRecorder callback: Handle recording completion
  const handleRecordingComplete = useCallback(async (result: { assetId: string; playbackId: string; downloadUrl?: string; durationMs: number }) => {
    try {
      console.log('Recording complete, saving to database...', result);

      // Get session ID
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('id')
        .eq('stream_id', streamId)
        .single();

      if (sessionError) {
        console.error('Session query error:', sessionError, { streamId });
        throw new Error(`Session not found: ${sessionError.message}`);
      }

      if (!sessionData) {
        throw new Error('Session not found');
      }

      // Save to database (clamp duration to valid range: 3-10s)
      const clampedDuration = Math.min(Math.max(result.durationMs, 3000), 10000);
      if (clampedDuration !== result.durationMs) {
        console.log(`Duration clamped: ${result.durationMs}ms -> ${clampedDuration}ms`);
      }

      const clip = await saveClipToDatabase({
        assetId: result.assetId,
        playbackId: result.playbackId,
        downloadUrl: result.downloadUrl,
        durationMs: clampedDuration,
        sessionId: sessionData.id,
        prompt,
        textureId: selectedTexture,
        textureWeight: selectedTexture ? textureWeight[0] : null,
        tIndexList: calculateTIndexList(intensity[0], quality[0]),
      });

      toast({
        title: 'Clip created!',
        description: 'Redirecting to your clip...',
      });

      navigate(`/clip/${clip.id}`);
    } catch (error: unknown) {
      console.error('Error saving clip to database:', error);
      toast({
        title: 'Error creating clip',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setUploadingClip(false);
      setUploadProgress('');
      setLastDisplayedProgress(0);
    }
  }, [streamId, prompt, selectedTexture, textureWeight, intensity, quality, navigate, toast]);

  // StudioRecorder callback: Handle recording errors
  const handleRecordingError = useCallback((error: Error) => {
    console.error('Recording error:', error);

    // Check if it's a browser support error
    if (error.message.includes('not supported')) {
      setCaptureSupported(false);
    }

    setRecording(false);
    setUploadingClip(false);
    setUploadProgress('');
    setLastDisplayedProgress(0);
    recordStartTimeRef.current = null;

    toast({
      title: 'Recording error',
      description: error.message,
      variant: 'destructive',
    });
  }, [setCaptureSupported, setRecording, setUploadingClip, setUploadProgress, setLastDisplayedProgress, recordStartTimeRef, toast]);

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

  // DaydreamCanvas manages init/updates; no debounce here

  // Keep DaydreamCanvas params in sync with UI state by changing props
  const canvasParams: StreamDiffusionParams = useMemo(() => {
    const tIndex = calculateTIndexList(intensity[0], quality[0]);

    const base: StreamDiffusionParams = {
      model_id: 'stabilityai/sdxl-turbo',
      prompt,
      negative_prompt: 'blurry, low quality, flat, 2d, distorted',
      t_index_list: tIndex,
      seed: 42,
      num_inference_steps: 50,
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
    };

    // IP adapter is conditional based on texture selection
    if (selectedTexture) {
      const textureUrl = TEXTURES.find((t) => t.id === selectedTexture)?.url;
      return {
        ...base,
        ip_adapter: {
          enabled: true,
          type: 'regular',
          scale: textureWeight[0],
          weight_type: 'linear',
          insightface_model_name: 'buffalo_l',
        },
        ip_adapter_style_image_url: textureUrl,
      };
    }

    return {
      ...base,
      ip_adapter: {
        enabled: false,
        type: 'regular',
        scale: 0,
        weight_type: 'linear',
        insightface_model_name: 'buffalo_l',
      },
    };
  }, [intensity, quality, prompt, selectedTexture, textureWeight]);

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

  // Handle tab visibility changes - stop streams when user leaves tab (mobile only)
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Detect actual mobile/tablet devices (not just screen size)
      // Check for touch capability and mobile user agent patterns
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isActualMobileDevice = hasTouch || mobileUserAgent;

      // Only stop streams on actual mobile devices where tabs go to background
      // On desktop, let the stream continue running even if tab is in background
      if (!isActualMobileDevice) {
        return;
      }

      if (document.hidden) {
        // User left the tab - record the time and stop streams immediately
        console.log('Tab hidden (mobile) - stopping media streams for privacy');
        tabHiddenTimeRef.current = Date.now();
        wasStreamActiveRef.current = !!playbackId; // Remember if we had an active stream

        // Clear the playback and stream state to show loading when they return
        setPlaybackId(null);
        setStreamId(null);
        setIsPlaying(false);
      } else {
        // User returned to the tab
        if (tabHiddenTimeRef.current && wasStreamActiveRef.current) {
          const timeAway = Date.now() - tabHiddenTimeRef.current;
          console.log(`Tab visible again after ${timeAway}ms away`);

          // If user was gone for more than 5 seconds, restart the stream
          if (timeAway > 5000 && cameraType) {
            console.log('User was away >5s, restarting stream...');
            toast({
              title: 'Restarting stream',
              description: 'Reconnecting your camera...',
            });
            // Restart the stream with the same camera type and current prompt
            initializeStream(cameraType, prompt);
          }

          // Reset the tracking variables
          tabHiddenTimeRef.current = null;
          wasStreamActiveRef.current = false;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cameraType, playbackId, prompt, initializeStream, toast]);

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


  const onDaydreamReady = useCallback(async ({ streamId: sid, playbackId: pid }) => {
    setStreamId(sid);
    setPlaybackId(pid);
    setLoading(false);
    // Ensure session exists
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: userData } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single();
    if (userData) {
      // Map UI cameraType ('user'|'environment') to DB enum ('front'|'back')
      const cameraDbType = cameraType === 'user' ? 'front' : 'back';
      const { error: insertError } = await supabase.from('sessions').insert({
        user_id: userData.id,
        stream_id: sid,
        playback_id: pid,
        camera_type: cameraDbType,
      });
      if (insertError) {
        console.error('Failed to insert session:', insertError, {
          userId: userData.id,
          streamId: sid,
          playbackId: pid,
          cameraType,
          cameraDbType,
        });
      }
    }
  }, [cameraType]);
  // Rely on onReady + player events; no onStatus needed
  const onDaydreamError = useCallback((e) => {
    console.error('DaydreamCanvas error', e);
    setLoading(false);
  }, [setLoading]);

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
                  onClick={() => selectCamera('user')}
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
                  onClick={() => selectCamera('environment')}
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
                onClick={() => selectCamera('user')}
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
    <div className="fixed inset-0 flex flex-col bg-neutral-950 text-neutral-200">
      {/* Fixed Video Section - Square but smaller, starts from top */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 bg-neutral-950">
        <div className="relative w-full max-w-md mx-auto aspect-square bg-neutral-950 rounded-3xl overflow-hidden border border-neutral-900 shadow-lg">
          <StudioRecorder
            ref={studioRecorderRef}
            onProgress={handleRecordingProgress}
            onComplete={handleRecordingComplete}
            onError={handleRecordingError}
          >
            {playbackId && src ? (
              <div
                ref={playerContainerRef}
                className="player-container w-full h-full [&_[data-radix-aspect-ratio-wrapper]]:!h-full [&_[data-radix-aspect-ratio-wrapper]]:!pb-0"
                style={{ width: '100%', height: '100%', position: 'relative' }}
              >
                <Player.Root
                  src={src}
                  autoPlay
                  lowLatency="force"
                >
                  <Player.Container
                    className="w-full h-full"
                    style={{ width: '100%', height: '100%', position: 'relative' }}
                  >
                    <Player.Video
                      className="w-full h-full"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
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
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="w-12 h-12 animate-spin text-neutral-400" />
              </div>
            )}
          </StudioRecorder>

          {/* DaydreamCanvas: camera input preview (PiP in bottom-right) */}
          <div className="absolute bottom-3 right-3 w-20 h-20 rounded-2xl overflow-hidden border-2 border-white shadow-lg">
            <DaydreamCanvas
              size={512}
              className="w-full h-full object-cover"
              videoSource={{
                type: 'camera',
                facingMode: cameraType === 'user' ? 'user' : 'environment',
                mirrorFront: true,
              }}
              audioSource={
                micEnabled
                  ? { type: 'microphone' }
                  : { type: 'silent' }
              }
              params={canvasParams}
              onReady={onDaydreamReady}
              onError={onDaydreamError}
            />
          </div>

          {/* Microphone Toggle Button */}
          <div className="absolute bottom-3 left-3">
            <Button
              onClick={toggleMicrophone}
              disabled={loading || !playbackId}
              size="icon"
              variant={micEnabled ? "default" : "secondary"}
              className={`w-12 h-12 rounded-full shadow-lg transition-all duration-200 ${
                micEnabled
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : micPermissionDenied
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
              }`}
              title={micEnabled ? 'Disable microphone' : micPermissionDenied ? 'Microphone access denied' : 'Enable microphone'}
            >
              {micEnabled ? (
                <Mic className="w-5 h-5" />
              ) : (
                <MicOff className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable Controls Section */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
        <div className="max-w-md mx-auto space-y-3">
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
            onContextMenu={(e) => e.preventDefault()}
            disabled={loading || uploadingClip || !playbackId || !captureSupported || !isPlaying}
            className="w-full h-14 bg-gradient-to-r from-neutral-200 to-neutral-500 text-neutral-900 font-semibold rounded-2xl hover:from-neutral-300 hover:to-neutral-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation"
            style={{
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none',
              userSelect: 'none',
              touchAction: 'manipulation'
            }}
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
                <Sparkles className="w-5 h-5 text-neutral-900" />
                {isMobile ? 'Hold to Brew' : 'Click to Start Brewing'}
              </span>
            )}
          </Button>

          {/* Controls */}
          <div className="bg-neutral-950 rounded-3xl p-5 border border-neutral-800 space-y-4 shadow-inner">
            <div>
              <label className="text-sm font-medium mb-2 block text-neutral-300">Prompt</label>
              <div className="flex items-start gap-2">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your AI effect..."
                  className="bg-neutral-950 border-neutral-800 focus:border-neutral-600 focus:ring-0 text-neutral-100 placeholder:text-neutral-500 min-h-[60px] resize-none"
                  rows={2}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const prompts = cameraType === 'user' ? FRONT_PROMPTS : BACK_PROMPTS;
                    const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
                    setPrompt(randomPrompt);
                  }}
                  className="bg-neutral-950 border-neutral-800 hover:border-neutral-600 hover:bg-neutral-850 shrink-0"
                  title="Random prompt"
                >
                  <RefreshCw className="h-4 w-4 text-neutral-300" />
                </Button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block text-neutral-300">
                Texture
              </label>

              <div className="flex items-center gap-4">
                <Popover open={texturePopoverOpen} onOpenChange={setTexturePopoverOpen}>
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
                        onClick={() => {
                          setSelectedTexture(null);
                          setTexturePopoverOpen(false);
                        }}
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
                          onClick={() => {
                            setSelectedTexture(texture.id);
                            setTexturePopoverOpen(false);
                          }}
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
                Intensity: {intensity[0].toFixed(1)}
              </label>
              <Slider
                value={intensity}
                onValueChange={setIntensity}
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
    </div>
  );
}
