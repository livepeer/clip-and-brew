import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { Camera, ImageOff, Loader2, Sparkles, RefreshCw, Mic, MicOff } from 'lucide-react';
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
  const [cameraType, setCameraType] = useState<'front' | 'back' | null>(null);
  const [loading, setLoading] = useState(false);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [playbackId, setPlaybackId] = useState<string | null>(null);
  const [whipUrl, setWhipUrl] = useState<string | null>(null);
  const [autoStartChecked, setAutoStartChecked] = useState(false);
  const [streamInitialized, setStreamInitialized] = useState(false);

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
  const [micEnabled, setMicEnabled] = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const recorderRef = useRef<VideoRecorder | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordStartTimeRef = useRef<number | null>(null);
  const originalStreamRef = useRef<MediaStream | null>(null);
  const silentAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const realAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const tabHiddenTimeRef = useRef<number | null>(null);
  const wasStreamActiveRef = useRef<boolean>(false);

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

  /**
   * Stop all media streams and clean up resources
   */
  const stopAllMediaStreams = useCallback(() => {
    console.log('Stopping all media streams...');

    // Stop all tracks in the original stream
    if (originalStreamRef.current) {
      originalStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped track:', track.kind, track.id);
      });
      originalStreamRef.current = null;
    }

    // Stop audio tracks
    if (realAudioTrackRef.current) {
      realAudioTrackRef.current.stop();
      realAudioTrackRef.current = null;
    }
    if (silentAudioTrackRef.current) {
      silentAudioTrackRef.current.stop();
      silentAudioTrackRef.current = null;
    }

    // Close WebRTC peer connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Stop the PiP video
    if (sourceVideoRef.current && sourceVideoRef.current.srcObject) {
      const stream = sourceVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      sourceVideoRef.current.srcObject = null;
    }

    console.log('All media streams stopped');
  }, []);

  const initializeStream = useCallback(async (type: 'front' | 'back', initialPrompt: string) => {
    setLoading(true);
    try {
      // Calculate initial t_index_list based on default creativity and quality
      const initialTIndexList = calculateTIndexList(creativity[0], quality[0]);

      // Create Daydream stream with initial params to avoid default psychedelic
      console.log('[CAPTURE] Creating stream with initial prompt:', initialPrompt);
      console.log('[CAPTURE] Initial t_index_list:', initialTIndexList);

      const initialParams: StreamDiffusionParams = {
        model_id: 'stabilityai/sdxl-turbo',
        prompt: initialPrompt,
        negative_prompt: 'blurry, low quality, flat, 2d, distorted',
        t_index_list: initialTIndexList,
        seed: 42,
        num_inference_steps: 50,
        width: 512, // Match video input dimensions
        height: 512, // Match video input dimensions
        // Specify controlnets with disabled state
        controlnets: [
          {
            enabled: true,
            model_id: 'xinsir/controlnet-depth-sdxl-1.0',
            preprocessor: 'depth_tensorrt',
            preprocessor_params: {},
            conditioning_scale: 0.3,
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
        ],
        // IP-Adapter disabled by default
        ip_adapter: {
          enabled: false,
          type: 'regular',
          scale: 0,
          weight_type: 'linear',
          insightface_model_name: 'buffalo_l',
        },
      };

      console.log('[CAPTURE] About to create stream with initialParams:', JSON.stringify(initialParams, null, 2));
      const streamData = await createDaydreamStream(initialParams);
      console.log('[CAPTURE] Stream created successfully:', streamData);

      setStreamId(streamData.id);
      setPlaybackId(streamData.output_playback_id);
      setWhipUrl(streamData.whip_url);
      setStreamInitialized(false); // Mark as not yet initialized (will be set to true after a delay)

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
  }, [toast, creativity, quality]); // creativity and quality used in calculateTIndexList for initial params

  const selectCamera = useCallback(async (type: 'front' | 'back') => {
    setCameraType(type);
    const randomPrompt = type === 'front'
      ? FRONT_PROMPTS[Math.floor(Math.random() * FRONT_PROMPTS.length)]
      : BACK_PROMPTS[Math.floor(Math.random() * BACK_PROMPTS.length)];
    setPrompt(randomPrompt);

    // Pass the initial prompt to initializeStream
    await initializeStream(type, randomPrompt);
  }, [initializeStream, creativity, quality]);

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
   * Create a silent audio track for streaming when microphone is disabled
   */
  const createSilentAudioTrack = (): MediaStreamTrack => {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    // Set volume to 0 (silent)
    gainNode.gain.value = 0;

    oscillator.connect(gainNode);
    const destination = audioContext.createMediaStreamDestination();
    gainNode.connect(destination);
    oscillator.start();

    return destination.stream.getAudioTracks()[0];
  };

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

    // Note: Audio tracks are handled separately in startWebRTCPublish
    // We don't add them here to maintain control over mic on/off state

    return mirroredVideoStream;
  };

  const startWebRTCPublish = async (whipUrl: string, type: 'front' | 'back') => {
    try {
      // Request both camera and microphone permissions upfront
      let originalStream: MediaStream;
      let hasAudioPermission = false;

      try {
        originalStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: type === 'front' ? 'user' : 'environment',
            width: 512,
            height: 512,
          },
          audio: true,
        });
        hasAudioPermission = true;
        setMicPermissionGranted(true);
        setMicPermissionDenied(false);
      } catch (audioError) {
        console.warn('Microphone permission denied or unavailable:', audioError);
        // Try again with video only
        originalStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: type === 'front' ? 'user' : 'environment',
            width: 512,
            height: 512,
          },
        });
        setMicPermissionDenied(true);
        setMicPermissionGranted(false);
      }

      // Store the original stream
      originalStreamRef.current = originalStream;

      // Mirror the stream if using front camera
      const videoStream = type === 'front' ? mirrorStream(originalStream) : originalStream;

      // Handle audio track setup
      const audioTracks = originalStream.getAudioTracks();
      if (audioTracks.length > 0 && hasAudioPermission) {
        // We have mic permission - use the real audio track but start disabled
        realAudioTrackRef.current = audioTracks[0];
        realAudioTrackRef.current.enabled = false; // Mic off by default

        // Make sure the audio track is in the video stream
        if (!videoStream.getAudioTracks().find(t => t.id === realAudioTrackRef.current!.id)) {
          videoStream.addTrack(realAudioTrackRef.current);
        }
      } else {
        // No mic permission - use silent audio track
        const silentTrack = createSilentAudioTrack();
        silentAudioTrackRef.current = silentTrack;

        // Remove any existing audio tracks and add silent one
        videoStream.getAudioTracks().forEach(track => {
          videoStream.removeTrack(track);
        });
        videoStream.addTrack(silentTrack);
      }

      if (sourceVideoRef.current) {
        sourceVideoRef.current.srcObject = videoStream;
      }

      // Use the WHIP helper from daydream.ts
      const pc = await startWhipPublish(whipUrl, videoStream);
      pcRef.current = pc;

      console.log('WebRTC publishing started with silent audio');
    } catch (error) {
      console.error('Error starting WebRTC publish:', error);
      throw error;
    }
  };

  const toggleMicrophone = async () => {
    // If permission was denied or never granted, try to request it
    if (micPermissionDenied || !realAudioTrackRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioTrack = stream.getAudioTracks()[0];

        if (audioTrack && pcRef.current) {
          // Replace the silent track with the real one (only time we replace)
          const senders = pcRef.current.getSenders();
          const audioSender = senders.find(sender => sender.track?.kind === 'audio');

          if (audioSender && silentAudioTrackRef.current) {
            await audioSender.replaceTrack(audioTrack);
            realAudioTrackRef.current = audioTrack;
            realAudioTrackRef.current.enabled = true;

            // Stop the old silent track
            silentAudioTrackRef.current.stop();
            silentAudioTrackRef.current = null;

            setMicPermissionGranted(true);
            setMicPermissionDenied(false);
            setMicEnabled(true);

            toast({
              title: 'Microphone enabled',
              description: 'Now streaming live audio',
            });
          }
        }
      } catch (error) {
        console.error('Error requesting microphone permission:', error);
        setMicPermissionDenied(true);
        toast({
          title: 'Microphone access denied',
          description: 'Please allow microphone access in your browser settings',
          variant: 'destructive',
        });
      }
      return;
    }

    // We have the real audio track - just toggle the enabled property
    if (realAudioTrackRef.current) {
      const newEnabledState = !micEnabled;
      realAudioTrackRef.current.enabled = newEnabledState;
      setMicEnabled(newEnabledState);

      toast({
        title: newEnabledState ? 'Microphone enabled' : 'Microphone disabled',
        description: newEnabledState ? 'Now streaming live audio' : 'Microphone muted',
      });
    }
  };

  const updatePrompt = useCallback(async () => {
    if (!streamId) {
      console.log('[CAPTURE] updatePrompt called but no streamId - skipping');
      return;
    }

    console.log('[CAPTURE] updatePrompt called for stream:', streamId);
    console.log('[CAPTURE] Current state - prompt:', prompt, 'creativity:', creativity[0], 'quality:', quality[0], 'texture:', selectedTexture);

    try {
      // Calculate t_index_list based on creativity and quality
      const tIndexList = calculateTIndexList(creativity[0], quality[0]);
      console.log('[CAPTURE] Calculated t_index_list:', tIndexList);

      // Determine IP-Adapter settings when a texture is selected
      const selectedTextureObj = selectedTexture
        ? TEXTURES.find((t) => t.id === selectedTexture)
        : null;

      // Build params for StreamDiffusion
      // CRITICAL: Always include model_id to prevent loading default
      const params: StreamDiffusionParams = {
        model_id: 'stabilityai/sdxl-turbo', // ALWAYS include to prevent model reload
        prompt,
        negative_prompt: 'blurry, low quality, flat, 2d, distorted',
        t_index_list: tIndexList,
        seed: 42,
        num_inference_steps: 50,
      };

      // CRITICAL: Always include controlnets - depth with proper conditioning scale
      // This is required for consistent stream behavior
      params.controlnets = [
        {
          enabled: true,
          model_id: 'xinsir/controlnet-depth-sdxl-1.0',
          preprocessor: 'depth_tensorrt',
          preprocessor_params: {},
          conditioning_scale: selectedTextureObj ? 0 : 0.3, // Disable depth when using texture
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

      // Include IP-Adapter when a texture is selected, otherwise disable it
      if (selectedTextureObj) {
        params.ip_adapter = {
          enabled: true,
          type: 'regular',
          scale: textureWeight[0],
          weight_type: 'linear',
          insightface_model_name: 'buffalo_l',
        };
        params.ip_adapter_style_image_url = selectedTextureObj.url;
      } else {
        // Explicitly disable IP-Adapter when no texture selected
        params.ip_adapter = {
          enabled: false,
          type: 'regular',
          scale: 0,
          weight_type: 'linear',
          insightface_model_name: 'buffalo_l',
        };
      }

      // Use the StreamDiffusion prompt helper with proper params
      console.log('[CAPTURE] About to call updateDaydreamPrompts with params:', params);
      await updateDaydreamPrompts(streamId, params);
      console.log('[CAPTURE] updateDaydreamPrompts completed successfully');

    } catch (error: unknown) {
      console.error('[CAPTURE] Error updating prompt:', error);
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

  // Mark stream as initialized after the background initialization has had time to complete
  useEffect(() => {
    if (streamId && !streamInitialized) {
      console.log('[CAPTURE] Stream created, waiting 3 seconds before marking initialized...');
      // Wait 3 seconds for the background initialization to complete before allowing updates
      const timer = setTimeout(() => {
        console.log('[CAPTURE] Stream initialized - ready for parameter updates');
        setStreamInitialized(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [streamId, streamInitialized]);

  // When stream becomes initialized, immediately sync current UI state to stream
  useEffect(() => {
    if (streamId && streamInitialized && prompt) {
      console.log('[CAPTURE] Stream just initialized - forcing parameter sync with current UI state');
      console.log('[CAPTURE] Syncing: prompt=', prompt, 'creativity=', creativity[0], 'quality=', quality[0]);
      updatePrompt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamInitialized]); // Only trigger when streamInitialized changes

  useEffect(() => {
    // Only update if stream is initialized (skip the initial update when stream is first created)
    if (prompt && streamId && streamInitialized) {
      console.log('[CAPTURE] Parameter changed, scheduling update in 500ms...');
      const debounce = setTimeout(() => {
        console.log('[CAPTURE] Debounce complete - updating stream with new parameters');
        updatePrompt();
      }, 500);
      return () => clearTimeout(debounce);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, selectedTexture, textureWeight, creativity, quality, streamId, streamInitialized]);

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

  // Cleanup audio tracks on unmount
  useEffect(() => {
    return () => {
      stopAllMediaStreams();
    };
  }, [stopAllMediaStreams]);

  // Handle tab visibility changes - stop streams when user leaves tab (mobile only)
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Only stop streams on mobile where tabs actually go to background
      // On desktop, let the stream continue running even if tab is in background
      if (!isMobile) {
        return;
      }

      if (document.hidden) {
        // User left the tab - record the time and stop streams immediately
        console.log('Tab hidden (mobile) - stopping media streams for privacy');
        tabHiddenTimeRef.current = Date.now();
        wasStreamActiveRef.current = !!playbackId; // Remember if we had an active stream

        // Stop all media streams immediately for privacy/safety
        stopAllMediaStreams();

        // Clear the playback and stream state to show loading when they return
        setPlaybackId(null);
        setStreamId(null);
        setWhipUrl(null);
        setIsPlaying(false);
        setStreamInitialized(false);
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
  }, [isMobile, cameraType, playbackId, prompt, stopAllMediaStreams, initializeStream, toast]);

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
    <div className="fixed inset-0 flex flex-col bg-neutral-950 text-neutral-200">
      {/* Fixed Video Section - Square but smaller, starts from top */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 bg-neutral-950">
        <div className="relative w-full max-w-md mx-auto aspect-square bg-neutral-950 rounded-3xl overflow-hidden border border-neutral-900 shadow-lg">
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

          {/* PiP Source Preview */}
          <div className="absolute bottom-3 right-3 w-20 h-20 rounded-2xl overflow-hidden border-2 border-white shadow-lg">
            <video
              ref={sourceVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
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
              <div className="flex items-center gap-2">
                <Input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your AI effect..."
                  className="bg-neutral-950 border-neutral-800 focus:border-neutral-600 focus:ring-0 text-neutral-100 placeholder:text-neutral-500"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const prompts = cameraType === 'front' ? FRONT_PROMPTS : BACK_PROMPTS;
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
    </div>
  );
}
