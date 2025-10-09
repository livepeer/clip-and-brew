import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { ArrowLeft, Camera, ImageOff, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import * as Player from '@livepeer/react/player';
import { createDaydreamStream, startWhipPublish, updateDaydreamPrompts } from '@/lib/daydream';
import type { StreamDiffusionParams } from '@/lib/daydream';
import { VideoRecorder, uploadToLivepeer, saveClipToDatabase } from '@/lib/recording';

const FRONT_PROMPTS = [
  "studio ghibli portrait, soft rim light",
  "cyberpunk neon portrait 90s anime",
  "watercolor ink portrait, loose brush"
];

const BACK_PROMPTS = [
  "vaporwave cityscape",
  "film noir scene, grainy",
  "isometric tech poster, bold shapes"
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
  const [recordStartTime, setRecordStartTime] = useState<number | null>(null);
  const [captureSupported, setCaptureSupported] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const recorderRef = useRef<VideoRecorder | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // useEffect(() => {
  //   checkAuth();
  // }, []);

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
  }, [autoStartChecked, cameraType, loading]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/login');
    }
  };

  const selectCamera = async (type: 'front' | 'back') => {
    setCameraType(type);
    const randomPrompt = type === 'front'
      ? FRONT_PROMPTS[Math.floor(Math.random() * FRONT_PROMPTS.length)]
      : BACK_PROMPTS[Math.floor(Math.random() * BACK_PROMPTS.length)];
    setPrompt(randomPrompt);

    await initializeStream(type);
  };

  const initializeStream = async (type: 'front' | 'back') => {
    setLoading(true);
    try {
      // Create Daydream stream using the helper
      const streamData = await createDaydreamStream();

      console.log('Stream created:', streamData);
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

      toast({
        title: 'Stream ready!',
        description: 'You can now start recording',
      });
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
  };

  const startWebRTCPublish = async (whipUrl: string, type: 'front' | 'back') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: type === 'front' ? 'user' : 'environment',
          width: 512,
          height: 512,
        },
        audio: true,
      });

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

  const updatePrompt = async () => {
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
  };

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
      setRecording(true);
      setRecordStartTime(Date.now());
      
      console.log('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start recording',
        variant: 'destructive',
      });
    }
  };

  const stopRecording = async () => {
    if (!recorderRef.current || !recordStartTime || !streamId) return;

    setRecording(false);
    setLoading(true);

    try {
      // Stop the recorder and get the blob
      const { blob, durationMs } = await recorderRef.current.stop();
      recorderRef.current = null;

      console.log('Recording stopped, uploading to Livepeer...');
      
      toast({
        title: 'Processing...',
        description: 'Uploading your clip to Livepeer Studio',
      });

      // Upload to Livepeer Studio
      const filename = `daydream-clip-${Date.now()}.webm`;
      const { assetId, playbackId: assetPlaybackId, downloadUrl } = await uploadToLivepeer(blob, filename);

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
      setLoading(false);
    }
  };

  useEffect(() => {
    if (prompt && streamId) {
      const debounce = setTimeout(() => {
        updatePrompt();
      }, 500);
      return () => clearTimeout(debounce);
    }
  }, [prompt, selectedTexture, textureWeight, creativity, quality]);

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
        <div className="relative aspect-square bg-neutral-950 rounded-3xl overflow-hidden border border-neutral-900 shadow-lg">
          {playbackId ? (
            <div ref={playerContainerRef} className="w-full h-full">
              <Player.Root
                playbackId={playbackId}
                autoPlay
                muted
                lowLatency="force"
              >
                <Player.Container>
                  <Player.Video className="w-full h-full object-cover" />
                </Player.Container>
              </Player.Root>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="w-12 h-12 animate-spin text-neutral-400" />
            </div>
          )}

          {/* PiP Source Preview */}
          <div className="absolute bottom-4 right-4 w-24 h-24 rounded-2xl overflow-hidden border-2 border-white shadow-lg">
            <video
              ref={sourceVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
        </div>

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

        {/* Record Button */}
        {!captureSupported && (
          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3 text-sm text-yellow-200">
            ⚠️ Video capture not supported on this browser. Recording is disabled.
          </div>
        )}
        <Button
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          disabled={loading || !playbackId || !captureSupported}
          className="w-full h-16 bg-gradient-to-r from-neutral-200 to-neutral-500 text-neutral-900 font-semibold rounded-2xl hover:from-neutral-300 hover:to-neutral-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {recording ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              Recording... (
              {recordStartTime ? ((Date.now() - recordStartTime) / 1000).toFixed(1) : 0}
              s)
            </span>
          ) : loading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-neutral-900" />
              Hold to Brew
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
