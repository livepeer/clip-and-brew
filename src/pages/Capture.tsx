import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Camera,
  Loader2,
  Sparkles,
  Mic,
  MicOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import * as Player from "@livepeer/react/player";
import type { StreamDiffusionParams } from "@/lib/daydream";
import { DaydreamCanvas } from "@/components/DaydreamCanvas";
import {
  StudioRecorder,
  type StudioRecorderHandle,
} from "@/components/StudioRecorder";
import { saveClipToDatabase } from "@/lib/recording";
import {
  DiffusionParams,
  type BrewParams,
} from "@/components/DiffusionParams";

// Detect if device likely has front/back cameras (mobile/tablet)
const hasMultipleCameras = (): boolean => {
  // Check for touch capability (mobile/tablet indicator)
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  // Check for mobile user agent patterns
  const mobileUserAgent =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

  // Assume device has multiple cameras if it's touch-enabled or mobile UA
  return hasTouch || mobileUserAgent;
};

export default function Capture() {
  const [cameraType, setCameraType] = useState<"user" | "environment" | null>(
    null
  );
  const [setupComplete, setSetupComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [playbackId, setPlaybackId] = useState<string | null>(null);
  const [autoStartChecked, setAutoStartChecked] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);

  // Diffusion parameters state
  const [brewParams, setBrewParams] = useState<BrewParams>({
    prompt: "",
    texture: null,
    textureWeight: 0.5,
    intensity: 5,
    quality: 0.4,
  });
  const [canvasParams, setCanvasParams] = useState<StreamDiffusionParams | null>(null);

  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [captureSupported, setCaptureSupported] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSlowLoadingMessage, setShowSlowLoadingMessage] = useState(false);
  const [uploadingClip, setUploadingClip] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [lastDisplayedProgress, setLastDisplayedProgress] = useState<number>(0);
  const [micEnabled, setMicEnabled] = useState(false);
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

  const onParamsError = useCallback((err: Error) => {
    toast({title: "Error", description: err.message, variant: "destructive"});
  }, [toast]);

  const checkAuth = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      navigate("/login");
    }
  }, [navigate]);
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const initializeStream = useCallback(
    async (_type: "user" | "environment", _initialPrompt: string) => {
      // Simplified: streaming is handled by DaydreamCanvas; just show loading until onReady
      setLoading(true);
    },
    []
  );

  // We use a separate state to track if we should show camera selection
  // Only show camera selection screen if there are actually multiple cameras
  const [showCameraSelection, setShowCameraSelection] = useState(
    hasMultipleCameras()
  );

  const selectCamera = useCallback(async (type: "user" | "environment") => {
    setCameraType(type);
    setShowCameraSelection(false); // Hide camera selection screen
    // Reset prompt for new camera
    setBrewParams((prev) => ({ ...prev, prompt: "" }));
    // Don't start stream yet - wait for user to configure params and hit "Start"
  }, []);

  const startStream = useCallback(async () => {
    if (!cameraType) {
      toast({
        title: "Error",
        description: "Please select a camera",
        variant: "destructive",
      });
      return;
    } else if (!brewParams.prompt.trim()) {
      toast({
        title: "Error",
        description: "Please enter a prompt",
        variant: "destructive",
      });
      return;
    }

    setLoading(false); // Ensure loading is false BEFORE setting setupComplete
    setSetupComplete(true);
  }, [cameraType, brewParams.prompt, toast]);

  // Auto-start camera on desktop (non-mobile devices)
  useEffect(() => {
    if (!autoStartChecked && !loading) {
      const shouldAutoStart = !hasMultipleCameras();
      if (shouldAutoStart) {
        setAutoStartChecked(true);
        // Desktop device - auto-start with default camera
        selectCamera("user");
      } else {
        setAutoStartChecked(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartChecked, loading]);

  // DaydreamCanvas abstracts streaming; no local WHIP logic here

  const toggleMicrophone = () => {
    setMicEnabled(!micEnabled);
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
        stopRecording().catch((err) => {
          console.error("Error in auto-stop:", err);
        });
      }, 10000);
    } catch (error) {
      console.error("Error starting recording:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to start recording",
        variant: "destructive",
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
        console.error("Error stopping recorder:", error);
      }

      toast({
        title: "Recording too short",
        description: "Hold for at least 3 seconds to create a clip",
        variant: "destructive",
      });
      return;
    }

    setRecording(false);
    recordStartTimeRef.current = null;
    setUploadingClip(true);
    setLastDisplayedProgress(0); // Reset progress tracking

    console.log("Recording stopped, processing via StudioRecorder...");

    toast({
      title: "Processing...",
      description: "Uploading your clip to Livepeer Studio",
    });

    // Stop recording - StudioRecorder will handle upload and call our callbacks
    await studioRecorderRef.current?.stopRecording();
  };

  // StudioRecorder callback: Handle upload progress
  const handleRecordingProgress = useCallback(
    (progress: { phase: string; step?: string; progress?: number }) => {
      if (progress.phase === "uploading" && progress.progress !== undefined) {
        // Show upload progress with percentage (TUS only)
        const uploadPercent = Math.round(progress.progress * 100);
        setUploadProgress(`Uploading: ${uploadPercent}%`);
      } else if (
        progress.phase === "processing" &&
        progress.progress !== undefined
      ) {
        // Smooth progression: use API value if greater, otherwise increment by 1%
        setLastDisplayedProgress((prev) => {
          let newProgress = Math.round(progress.progress * 100);
          newProgress = newProgress > prev ? newProgress : prev + 1;
          newProgress = Math.min(99, newProgress); // Cap at 99% while processing
          setUploadProgress(`Processing: ${newProgress}%`);
          return newProgress;
        });
      } else {
        setUploadProgress(progress.step || progress.phase);
      }
    },
    [setUploadProgress, setLastDisplayedProgress]
  );

  // StudioRecorder callback: Handle recording completion
  const handleRecordingComplete = useCallback(
    async (result: {
      assetId: string;
      playbackId: string;
      downloadUrl?: string;
      durationMs: number;
    }) => {
      try {
        console.log("Recording complete, saving to database...", result);

        // Get session ID
        const { data: sessionData, error: sessionError } = await supabase
          .from("sessions")
          .select("id")
          .eq("stream_id", streamId)
          .single();

        if (sessionError) {
          console.error("Session query error:", sessionError, { streamId });
          throw new Error(`Session not found: ${sessionError.message}`);
        }

        if (!sessionData) {
          throw new Error("Session not found");
        }

        // Save to database (clamp duration to valid range: 3-10s)
        const clampedDuration = Math.min(
          Math.max(result.durationMs, 3000),
          10000
        );
        if (clampedDuration !== result.durationMs) {
          console.log(
            `Duration clamped: ${result.durationMs}ms -> ${clampedDuration}ms`
          );
        }

        const clip = await saveClipToDatabase({
          assetId: result.assetId,
          playbackId: result.playbackId,
          downloadUrl: result.downloadUrl,
          durationMs: clampedDuration,
          sessionId: sessionData.id,
          prompt: brewParams.prompt,
          textureId: brewParams.texture,
          textureWeight: brewParams.texture ? brewParams.textureWeight : null,
          tIndexList: canvasParams?.t_index_list || [],
        });

        toast({
          title: "Clip created!",
          description: "Redirecting to your clip...",
        });

        navigate(`/clip/${clip.id}`);
      } catch (error: unknown) {
        console.error("Error saving clip to database:", error);
        toast({
          title: "Error creating clip",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      } finally {
        setUploadingClip(false);
        setUploadProgress("");
        setLastDisplayedProgress(0);
      }
    },
    [streamId, brewParams, canvasParams, navigate, toast]
  );

  // StudioRecorder callback: Handle recording errors
  const handleRecordingError = useCallback(
    (error: Error) => {
      console.error("Recording error:", error);

      // Check if it's a browser support error
      if (error.message.includes("not supported")) {
        setCaptureSupported(false);
      }

      setRecording(false);
      setUploadingClip(false);
      setUploadProgress("");
      setLastDisplayedProgress(0);
      recordStartTimeRef.current = null;

      toast({
        title: "Recording error",
        description: error.message,
        variant: "destructive",
      });
    },
    [
      setCaptureSupported,
      setRecording,
      setUploadingClip,
      setUploadProgress,
      setLastDisplayedProgress,
      recordStartTimeRef,
      toast,
    ]
  );

  const src = useMemo(() => {
    if (!playbackUrl) return null;
    return [
      {
        type: "webrtc" as const,
        src: playbackUrl,
        mime: "video/h264" as const,
        width: 512,
        height: 512,
      },
    ];
  }, [playbackUrl]);

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
      const video = playerContainerRef.current.querySelector("video");
      if (video) {
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleWaiting = () => setIsPlaying(false);

        video.addEventListener("playing", handlePlay);
        video.addEventListener("pause", handlePause);
        video.addEventListener("waiting", handleWaiting);

        // Check initial state
        if (!video.paused && video.readyState >= 3) {
          setIsPlaying(true);
        }

        return () => {
          video.removeEventListener("playing", handlePlay);
          video.removeEventListener("pause", handlePause);
          video.removeEventListener("waiting", handleWaiting);
        };
      }
    }
  }, [playbackUrl, src]);

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
      const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const mobileUserAgent =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        );
      const isActualMobileDevice = hasTouch || mobileUserAgent;

      // Only stop streams on actual mobile devices where tabs go to background
      // On desktop, let the stream continue running even if tab is in background
      if (!isActualMobileDevice) {
        return;
      }

      if (document.hidden) {
        // User left the tab - record the time and stop streams immediately
        console.log("Tab hidden (mobile) - stopping media streams for privacy");
        tabHiddenTimeRef.current = Date.now();
        wasStreamActiveRef.current = !!playbackUrl; // Remember if we had an active stream

        // Clear the playback and stream state to show loading when they return
        setPlaybackId(null);
        setPlaybackUrl(null);
        setStreamId(null);
        setIsPlaying(false);
      } else {
        // User returned to the tab
        if (tabHiddenTimeRef.current && wasStreamActiveRef.current) {
          const timeAway = Date.now() - tabHiddenTimeRef.current;
          console.log(`Tab visible again after ${timeAway}ms away`);

          // If user was gone for more than 5 seconds, restart the stream
          if (timeAway > 5000 && cameraType) {
            console.log("User was away >5s, restarting stream...");
            toast({
              title: "Restarting stream",
              description: "Reconnecting your camera...",
            });
            // Restart the stream with the same camera type and current prompt
            initializeStream(cameraType, brewParams.prompt);
          }

          // Reset the tracking variables
          tabHiddenTimeRef.current = null;
          wasStreamActiveRef.current = false;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [cameraType, playbackUrl, brewParams.prompt, initializeStream, toast]);

  // Show reassuring message if stream takes longer than 10s to load
  useEffect(() => {
    if (playbackUrl && !isPlaying) {
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
  }, [playbackUrl, isPlaying]);

  const onDaydreamReady = useCallback(
    async ({ streamId: sid, playbackId: pid, playbackUrl: purl }) => {
      setStreamId(sid);
      setPlaybackId(pid);
      setPlaybackUrl(purl || null);
      setLoading(false);
      // Ensure session exists
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: userData } = await supabase
        .from("users")
        .select("id")
        .eq("id", user.id)
        .single();
      if (userData) {
        // Map UI cameraType ('user'|'environment') to DB enum ('front'|'back')
        const cameraDbType = cameraType === "user" ? "front" : "back";
        const { error: insertError } = await supabase.from("sessions").insert({
          user_id: userData.id,
          stream_id: sid,
          playback_id: pid,
          camera_type: cameraDbType,
        });
        if (insertError) {
          console.error("Failed to insert session:", insertError, {
            userId: userData.id,
            streamId: sid,
            playbackId: pid,
            cameraType,
            cameraDbType,
          });
        }
      }
    },
    [cameraType]
  );
  // Rely on onReady + player events; no onStatus needed
  const onDaydreamError = useCallback(
    (e) => {
      console.error("DaydreamCanvas error", e);
      setLoading(false);
    },
    [setLoading]
  );

  // Determine video source based on setup state
  const videoSource = useMemo(() => {
    if (!cameraType) {
      // Pre-warming with blank video during camera selection and param setup
      return { type: "blank" as const };
    }
    // Switch to camera after "Start" is clicked
    return {
      type: "camera" as const,
      facingMode: cameraType,
      mirrorFront: true,
    };
  }, [cameraType]);

  // Render content based on current state
  let content;

  // Camera selection screen - shown on mobile devices
  if (showCameraSelection) {
    const showMultipleCameras = hasMultipleCameras();

    content = (
      <div className="fixed inset-0 flex items-center justify-center p-6 bg-neutral-950 text-neutral-200">
        <div className="max-w-md w-full text-center space-y-6">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-neutral-100 to-neutral-400 bg-clip-text text-transparent mb-2">
              {showMultipleCameras ? "Choose Camera" : "Start Camera"}
            </h1>
            <p className="text-neutral-400">
              {showMultipleCameras
                ? "Select which camera to use"
                : "Start your webcam to begin"}
            </p>
          </div>

          <div className="space-y-4">
            {showMultipleCameras ? (
              <>
                <Button
                  onClick={() => selectCamera("user")}
                  className="w-full h-20 bg-neutral-900 border border-neutral-800 hover:border-neutral-600 hover:bg-neutral-850 transition-all duration-200"
                  variant="outline"
                >
                  <div className="flex items-center gap-4">
                    <Camera className="w-8 h-8 text-neutral-300" />
                    <div className="text-left">
                      <div className="font-semibold text-neutral-100">
                        Front Camera
                      </div>
                      <div className="text-sm text-neutral-400">
                        Selfie mode
                      </div>
                    </div>
                  </div>
                </Button>

                <Button
                  onClick={() => selectCamera("environment")}
                  className="w-full h-20 bg-neutral-900 border border-neutral-800 hover:border-neutral-600 hover:bg-neutral-850 transition-all duration-200"
                  variant="outline"
                >
                  <div className="flex items-center gap-4">
                    <Camera className="w-8 h-8 text-neutral-300" />
                    <div className="text-left">
                      <div className="font-semibold text-neutral-100">
                        Back Camera
                      </div>
                      <div className="text-sm text-neutral-400">
                        Environment mode
                      </div>
                    </div>
                  </div>
                </Button>
              </>
            ) : (
              <Button
                onClick={() => selectCamera("user")}
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
  // Parameter setup screen - shown after camera selection but before stream starts
  else if (!setupComplete) {
    content = (
      <div className="fixed inset-0 flex flex-col bg-neutral-950 text-neutral-200">
        {/* Header Section */}
        <div className="flex-shrink-0 px-6 pt-6 pb-4 text-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-neutral-100 to-neutral-400 bg-clip-text text-transparent">
            Design Your Brew
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Choose your ingredients and start brewing
          </p>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 min-h-0">
          <div className="max-w-md mx-auto">
            <DiffusionParams
              cameraType={cameraType}
              brewParams={brewParams}
              onBrewParamsChange={setBrewParams}
              handleStreamDiffusionParams={setCanvasParams}
              onError={onParamsError}
            />
          </div>
        </div>

        {/* Fixed Start Button at Bottom */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-neutral-800 bg-neutral-950">
          <div className="max-w-md mx-auto">
            <Button
              onClick={startStream}
              disabled={brewParams.prompt.length < 3}
              className="w-full h-16 bg-gradient-to-r from-neutral-200 to-neutral-500 text-neutral-900 font-semibold text-lg rounded-2xl hover:from-neutral-300 hover:to-neutral-600 transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <span className="flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-neutral-900" />
                Start
              </span>
            </Button>
          </div>
        </div>
      </div>
    );
  } else {
    // Main streaming view is now handled by the secret container below
    content = null;
  }

  // Render content with secret pre-warmed streaming view
  return (
    <>
      {/* Secret streaming container - hidden during setup, visible after */}
      <div
        className={
          setupComplete
            ? "fixed inset-0 flex flex-col bg-neutral-950 text-neutral-200"
            : "fixed top-0 left-0 w-1 h-1 opacity-0 pointer-events-none overflow-hidden"
        }
      >
        {/* Video Section with Output Player */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 bg-neutral-950">
          <div className="relative w-full max-w-md mx-auto aspect-square bg-neutral-950 rounded-3xl overflow-hidden border border-neutral-900 shadow-lg">
            <StudioRecorder
              ref={studioRecorderRef}
              onProgress={handleRecordingProgress}
              onComplete={handleRecordingComplete}
              onError={handleRecordingError}
            >
              {playbackUrl && src ? (
                <div
                  ref={playerContainerRef}
                  className="player-container w-full h-full [&_[data-radix-aspect-ratio-wrapper]]:!h-full [&_[data-radix-aspect-ratio-wrapper]]:!pb-0"
                  style={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                  }}
                >
                  <Player.Root src={src} autoPlay lowLatency="force">
                    <Player.Container
                      className="w-full h-full"
                      style={{
                        width: "100%",
                        height: "100%",
                        position: "relative",
                      }}
                    >
                      <Player.Video
                        className="w-full h-full"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                      <Player.LoadingIndicator>
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950/50 gap-4">
                          <Loader2 className="w-12 h-12 animate-spin text-primary" />
                          <p className="text-sm text-neutral-300 text-center px-4 min-h-[20px]">
                            {showSlowLoadingMessage &&
                              "Hang tight! Stream loading can take up to 30 seconds..."}
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
                videoSource={videoSource}
                audioSource={
                  micEnabled ? { type: "microphone" } : { type: "silent" }
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
                disabled={!playbackId}
                size="icon"
                variant={micEnabled ? "default" : "secondary"}
                className={`w-12 h-12 rounded-full shadow-lg transition-all duration-200 ${
                  micEnabled
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : micPermissionDenied
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
                }`}
                title={
                  micEnabled
                    ? "Disable microphone"
                    : micPermissionDenied
                    ? "Microphone access denied"
                    : "Enable microphone"
                }
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
          <div className="max-w-md mx-auto space-y-4">
            {/* Record Button */}
            {!captureSupported && (
              <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3 text-sm text-yellow-200">
                ⚠️ Video capture not supported on this browser. Recording is
                disabled.
              </div>
            )}
            <Button
              onClick={isMobile ? undefined : toggleRecording}
              onPointerDown={isMobile ? startRecording : undefined}
              onPointerUp={isMobile ? stopRecording : undefined}
              onPointerLeave={isMobile ? stopRecording : undefined}
              onContextMenu={(e) => e.preventDefault()}
              disabled={
                uploadingClip || !playbackId || !captureSupported || !isPlaying
              }
              className="w-full h-14 bg-gradient-to-r from-neutral-200 to-neutral-500 text-neutral-900 font-semibold rounded-2xl hover:from-neutral-300 hover:to-neutral-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation"
              style={{
                WebkitUserSelect: "none",
                WebkitTouchCallout: "none",
                userSelect: "none",
                touchAction: "manipulation",
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
                  {uploadProgress || "Uploading clip..."}
                </span>
              ) : !isPlaying ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Starting stream...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-neutral-900" />
                  {isMobile ? "Hold to Brew" : "Click to Start Brewing"}
                </span>
              )}
            </Button>

            {/* Controls */}
            <DiffusionParams
              cameraType={cameraType}
              brewParams={brewParams}
              onBrewParamsChange={setBrewParams}
              handleStreamDiffusionParams={setCanvasParams}
              onError={onParamsError}
            />
          </div>
        </div>
      </div>

      {/* Main content (camera selection / setup screens) */}
      {content}
    </>
  );
}
