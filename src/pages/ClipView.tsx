import { useEffect, useState, useRef, useMemo, RefObject, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useTransform, PanInfo, animate } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Eye, Heart, Share2, Download, Twitter, Home, Coffee, Loader2, AlertCircle, CheckCircle2, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/Header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import confetti from 'canvas-confetti';
import { PlayerWithControls } from '@/components/PlayerWithControls';
import { useCinematicVideoGradient } from '@/hooks/useCinematicVideoGradient';

interface Clip {
  id: string;
  asset_playback_id: string;
  asset_id?: string; // Backward compatibility as old clips don't have this
  prompt: string;
  duration_ms: number;
  created_at: string;
  session_id: string;
  raw_uploaded_file_url?: string | null;
  asset_ready: boolean;
  likes_count?: {
    count: number;
  }[];
}

export function VideoGlow({
  targetRef,
  strength = 1,
  expand = 24,
  opacity = 0.65,
  blend = "screen",
}: {
  targetRef: RefObject<HTMLElement>;
  strength?: number;
  expand?: number;
  opacity?: number;
  blend?: "screen" | "normal" | "plus-lighter";
}) {
  const bgStyle = useCinematicVideoGradient(targetRef);
  const hasGradient = bgStyle?.background !== undefined && typeof bgStyle.background === 'string' && !bgStyle.background.includes("#111");

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-0 rounded-[inherit]"
      style={{
        inset: `-${expand}px`,
        filter: `blur(${40 * strength}px)`,
        transform: "scale(1.06)",
        mixBlendMode: blend,
      }}
    >
      {/* Fallback neutral glow */}
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: hasGradient ? 0 : opacity }}
        transition={{ duration: 1.5, ease: "easeInOut" }}
        style={{
          background: "linear-gradient(135deg, #111 0%, #333 100%)",
          inset: 0,
          position: "absolute",
          borderRadius: "inherit",
        }}
      />

      {/* Cinematic gradient glow */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: hasGradient ? opacity : 0 }}
        transition={{ duration: 1.5, ease: "easeInOut" }}
        style={{
          background: bgStyle.background,
          inset: 0,
          position: "absolute",
          borderRadius: "inherit",
        }}
      />
    </div>
  );
}

export default function ClipView() {
  const { id } = useParams();
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const bgStyle = useCinematicVideoGradient(videoContainerRef);
  const navigate = useNavigate();
  const [clip, setClip] = useState<Clip | null>(null);
  const [loading, setLoading] = useState(true);
  const [ticketCode, setTicketCode] = useState<string | null>(null);
  const [isRedeemed, setIsRedeemed] = useState(false);
  const [generatingTicket, setGeneratingTicket] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isSwipeLocked, setIsSwipeLocked] = useState(true);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [viewsLoading, setViewsLoading] = useState(true);
  const [assetStatus, setAssetStatus] = useState<'processing' | 'ready' | 'error'>('processing');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [assetError, setAssetError] = useState<string | null>(null);
  const { toast } = useToast();
  const coffeeCardRef = useRef<HTMLDivElement | null>(null);
  const swipeX = useMotionValue(0);
  const opacity = useTransform(swipeX, [-150, 0, 150], [0, 1, 0]);
  const scale = useTransform(swipeX, [-150, 0, 150], [0.9, 1, 0.9]);
  const rotate = useTransform(swipeX, [-150, 0, 150], [-12, 0, 12]);  // rotate left/right
  const y = useTransform(swipeX, [-150, 0, 150], [20, 0, -20]);       // subtle lift or drop
  const shadow = useTransform(swipeX, [-150, 0, 150],
    ["0px 20px 40px rgba(0,0,0,0.3)", "0px 10px 20px rgba(0,0,0,0.2)", "0px 20px 40px rgba(0,0,0,0.3)"]
  );

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setIsAuthenticated(!!user);
        setCurrentUserId(user?.id || null);
      } catch (error) {
        console.error('Error checking auth:', error);
      }
    };
    checkAuth();
  }, []);

  const creationDateStr = useMemo(() => {
    if (!clip?.created_at) return '';
    const createdAt = new Date(clip.created_at);
    const now = new Date();
    const isSameDay =
      createdAt.getFullYear() === now.getFullYear() &&
      createdAt.getMonth() === now.getMonth() &&
      createdAt.getDate() === now.getDate();
    return isSameDay
      ? createdAt.toLocaleTimeString()
      : createdAt.toLocaleDateString();
  }, [clip?.created_at]);

  useEffect(() => {
    if (!clip || assetStatus !== 'ready') return;

    if (!clip.asset_playback_id) {
      setViewCount(null);
      return;
    }

    const loadViewership = async () => {
      try {
        setViewsLoading(true);

        const { data, error } = await supabase.functions.invoke('get-viewership', {
          body: { playbackId: clip.asset_playback_id },
        });

        if (error) {
          console.error('Error loading viewership:', error);
          setViewCount(0);
        } else {
          setViewCount(data.viewCount || 0);
        }
      } catch (error) {
        console.error('Error loading viewership:', error);
        setViewCount(0);
      } finally {
        setViewsLoading(false);
      }
    }
    loadViewership();
  }, [clip, assetStatus]);

  const fetchClip = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from('clips')
      .select(`
        *,
        likes_count:clip_likes(count)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    setClip(data);

    // Extract likes count from the aggregated result
    const count = data.likes_count?.[0]?.count || 0;
    setLikesCount(count);

    return data;
  }, []);

  useEffect(() => {
    const loadClip = async () => {
      try {
        setLoading(true);

        const clip = await fetchClip(id);

        // Check if user owns this clip and if they have a ticket
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: sessionData } = await supabase
            .from('sessions')
            .select('user_id, id')
            .eq('id', clip.session_id)
            .single();

          if (sessionData) {
            // Check ownership
            const ownsClip = sessionData.user_id === user.id;
            setIsOwner(ownsClip);

            // Only load ticket data if user owns the clip
            if (ownsClip) {
              const { data: ticketData } = await supabase
                .from('tickets')
                .select('code, redeemed')
                .eq('session_id', sessionData.id)
                .maybeSingle();

              if (ticketData) {
                setTicketCode(ticketData.code);
                setIsRedeemed(ticketData.redeemed);

                // Start 5-second lock timer only if ticket exists and not redeemed
                if (!ticketData.redeemed) {
                  setIsSwipeLocked(true);
                  setTimeout(() => {
                    setIsSwipeLocked(false);
                  }, 5000);
                }
              }
            }
          }

          // Check if user has liked this clip
          const { data: likeData } = await supabase
            .from('clip_likes')
            .select('id')
            .eq('clip_id', clip.id)
            .eq('user_id', user.id)
            .maybeSingle();

          setIsLiked(!!likeData);
        }
      } catch (error) {
        console.error('Error loading clip:', error);
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to load clip',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    loadClip();
  }, [id, toast, fetchClip]);

  // Poll asset status when processing
  useEffect(() => {
    if (!clip) return;

    // Backward-compat: no raw_uploaded_file_url means clip was created with full asset
    if (clip.asset_ready || !clip.raw_uploaded_file_url) {
      setProcessingProgress(100);
      setAssetStatus('ready');
      return;
    }
    setAssetStatus('processing');

    console.log('Starting asset status polling for clip:', clip.id);

    const pollAssetStatus = async () => {
      try {
        // Use asset_id if available, otherwise fall back to playback_id for backward compatibility
        const assetId = clip.asset_id || clip.asset_playback_id;
        const { data, error } = await supabase.functions.invoke('studio-asset-status', {
          body: { assetId },
        });

        if (error) {
          console.error('Error checking asset status:', error);
          toast({
            title: "Failed to check video status",
            description: "Could not verify if your video is ready",
            variant: "destructive"
          });
          return;
        }

        const status = data?.status;
        if (status === 'processing') {
          // Update progress (match api progress; increment 1% per check; cap at 95%)
          const apiProgress = 100 * (data?.progress || 0);
          setProcessingProgress(curr => {
            return Math.min(95, Math.max(curr + 1, apiProgress));
          });
        } else if (status === 'ready') {
          const { error: updateError } = await supabase.functions.invoke(
            'update-clip-asset-status',
            {
              body: {
                clipId: clip.id,
                assetReady: true,
                assetUrl: data.downloadUrl,
              },
            }
          );

          if (updateError) {
            console.error('Error updating asset_ready flag:', updateError);
            toast({
              title: "Failed to update video status",
              description: "Video is ready but couldn't save status",
              variant: "destructive"
            });
            return;
          }
          console.log('Successfully updated asset_ready flag');

          await fetchClip(clip.id);

          setProcessingProgress(100);
          setAssetStatus('ready');

          toast({
            title: 'Video ready!',
            description: 'Your clip has finished processing',
          });
        } else if (status === 'failed' || status === 'deleted') {
          console.error('Asset processing failed:', status, data);
          setAssetStatus('error');
          setAssetError(data?.error?.message || 'Asset processing failed');
          setViewCount(null);

          toast({
            title: 'Processing failed',
            description: data?.error?.message || 'Your clip could not be processed',
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('Error polling asset status:', error);
      }
    };

    // Poll immediately and then every second
    pollAssetStatus();
    const interval = setInterval(pollAssetStatus, 1000);

    return () => {
      console.log('Stopping asset status polling');
      clearInterval(interval);
    };
  }, [clip, toast, fetchClip]);

  const handleLike = async () => {
    if (!isAuthenticated || !currentUserId) {
      toast({
        title: 'Login required',
        description: 'Please log in to like clips',
        variant: 'destructive',
      });
      return;
    }

    if (!clip) return;

    try {
      if (isLiked) {
        // Unlike - optimistic update
        setIsLiked(false);
        setLikesCount(prev => Math.max(0, prev - 1));

        const { error } = await supabase
          .from('clip_likes')
          .delete()
          .eq('clip_id', clip.id)
          .eq('user_id', currentUserId);

        if (error) throw error;
      } else {
        // Like - optimistic update
        setIsLiked(true);
        setLikesCount(prev => prev + 1);

        const { error } = await supabase
          .from('clip_likes')
          .insert({
            clip_id: clip.id,
            user_id: currentUserId,
          });

        if (error) throw error;
      }
    } catch (error) {
      // Revert optimistic update on error
      setIsLiked(!isLiked);
      setLikesCount(clip.likes_count?.[0]?.count || 0);

      console.error('Error toggling like:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to toggle like',
        variant: 'destructive',
      });
    }
  };

  const handleDownload = () => {
    if (!clip) return;

    const filename = `brewdream-${clip.id.substring(0, 8)}.mkv`;
    const downloadUrl = `https://vod-cdn.lp-playback.studio/raw/jxf4iblf6wlsyor6526t4tcmtmqa/catalyst-vod-com/hls/${clip.asset_playback_id}/video/${filename}`;

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const shareToTwitter = () => {
    const url = window.location.href;
    const text = `Made this at #RealtimeAIVideo Summit by @livepeer @DaydreamLiveAI`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, '_blank');
  };

  const generateTicket = async () => {
    if (!clip) return;

    setGeneratingTicket(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-ticket', {
        body: { clipId: clip.id },
      });

      if (error) throw error;

      setTicketCode(data.code);
      setIsRedeemed(false);

      toast({
        title: 'Coffee ticket generated!',
        description: 'Show this ticket to the bartender',
      });

      // Check if user has seen instructions before
      const hasSeenInstructions = localStorage.getItem('brewdream_ticket_instructions_seen');
      if (!hasSeenInstructions) {
        setShowInstructionsModal(true);
        localStorage.setItem('brewdream_ticket_instructions_seen', 'true');
      }

      // Start 5-second lock timer
      setIsSwipeLocked(true);
      setTimeout(() => {
        setIsSwipeLocked(false);
      }, 5000);

      // 🎉 Trigger confetti from card position
      if (coffeeCardRef.current) {
        const rect = coffeeCardRef.current.getBoundingClientRect();

        // Compute approximate center of the card in viewport coordinates
        const x = (rect.left + rect.width / 2) / window.innerWidth;
        const y = (rect.top + rect.height / 2) / window.innerHeight;

        // Burst upward like it's coming from behind the card
        confetti({
          particleCount: 80,
          startVelocity: 35,
          spread: 75,
          origin: { x, y },
          ticks: 180,
          scalar: 1.2,
          colors: ['#b87333', '#d1a35d', '#fff7e6'], // coffee + cream tones
        });

        // Add a softer follow-up burst for realism
        setTimeout(() => {
          confetti({
            particleCount: 40,
            startVelocity: 20,
            spread: 60,
            origin: { x, y: y - 0.1 },
            scalar: 0.9,
            colors: ['#c0a080', '#ffffff'],
          });
        }, 300);
      }

    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate ticket',
        variant: 'destructive',
      });
    } finally {
      setGeneratingTicket(false);
    }
  };

  const handleDragEnd = async (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const dragThreshold = 100; // pixels

    if (isSwipeLocked || isRedeemed || isRedeeming) {
      swipeX.set(0);
      return;
    }

    // Check if swiped left or right past threshold
    if (Math.abs(info.offset.x) > dragThreshold) {
      // Swipe successful - redeem ticket
      await redeemTicket(info.offset.x);
    } else {
      // Snap back with spring animation
      animate(swipeX, 0, { type: "spring", stiffness: 200, damping: 15 });
    }
  };

  const redeemTicket = async (swipeDirection: number) => {
    if (!ticketCode || isRedeeming) return;

    setIsRedeeming(true);

    const finalPosition = swipeDirection > 0 ? 400 : -400;

    // Animate out with rotation and ease
    await animate(swipeX, finalPosition, { type: "spring", stiffness: 300, damping: 20 });
    await new Promise(resolve => setTimeout(resolve, 250));

    // Optimistically show redeemed state
    setIsRedeemed(true);

    // Animate it snapping back (for consistency)
    await animate(swipeX, 0, { type: "spring", stiffness: 250, damping: 18 });

    try {
      const { data, error } = await supabase.functions.invoke('redeem-ticket', {
        body: { ticketCode: ticketCode },
      });

      if (error) throw error;

      // Success - show success toast
      toast({
        title: 'Ticket redeemed!',
        description: 'Enjoy your coffee! ☕',
      });

    } catch (error) {
      console.error('Error redeeming ticket:', error);

      // Revert optimistic update
      setIsRedeemed(false);

      const errorMessage = error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'error' in error
        ? String((error as { error: unknown }).error)
        : 'Failed to redeem ticket';

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!clip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <h1 className="text-2xl font-bold mb-4">Clip not found</h1>
        <Link to="/">
          <Button>
            <Home className="w-4 h-4 mr-2" />
            Back to Gallery
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen h-full">
      <Header
        isAuthenticated={isAuthenticated}
        showBackButton={true}
        onBackClick={() => navigate('/')}
      />

      <div className="mx-auto overflow-hidden">
        <div className="grid lg:grid-cols-3 lg:min-h-[calc(100dvh-64px)]">
          {/* LEFT: center the player */}
          <div className="lg:col-span-2 relative isolate px-4 py-8 lg:pt-0 lg:flex lg:items-center lg:justify-center">
            <VideoGlow targetRef={videoContainerRef} strength={1} expand={28} opacity={0.7} />

            <motion.div
              layoutId={`clip-${clip.id}`}
              ref={videoContainerRef}
              // remove bottom margins so true centering works
              className="relative overflow-hidden rounded-2xl border border-neutral-800 shadow-lg aspect-square w-full max-w-[500px] lg:max-h-[500px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              {assetStatus === 'processing' && clip.raw_uploaded_file_url ? (
                // Raw video element for processing state
                <div className="w-full h-full flex items-center justify-center bg-neutral-900 rounded-lg">
                  <video
                    src={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-raw-video/${clip.id}`}
                    controls
                    autoPlay
                    loop
                    className="w-full h-full object-cover"
                    preload="metadata"
                    onError={(e) => {
                      console.error('Video playback error:', e);
                      // Show fallback message for Safari WebM issues
                      const video = e.target as HTMLVideoElement;
                      const parent = video.parentElement;
                      if (parent) {
                        parent.innerHTML = `
                          <div class="flex flex-col items-center justify-center h-full text-center p-4">
                            <div class="text-4xl mb-4">🎬</div>
                            <h3 class="text-lg font-semibold mb-2">Video Processing</h3>
                            <p class="text-sm text-muted-foreground mb-4">
                              Your video is being processed and will be ready shortly.
                            </p>
                            <div class="flex items-center gap-2 text-xs text-muted-foreground">
                              <div class="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                              Processing...
                            </div>
                          </div>
                        `;
                      }
                    }}
                  />
                </div>
              ) : (
                // Existing PlayerWithControls for ready state
                <PlayerWithControls
                  src={[{
                    src: `https://vod-cdn.lp-playback.studio/raw/jxf4iblf6wlsyor6526t4tcmtmqa/catalyst-vod-com/hls/${clip.asset_playback_id}/static512p0.mp4`,
                    type: "video",
                    mime: "video/mp4",
                    width: 500,
                    height: 500,
                  }]}
                />
              )}
            </motion.div>
          </div>

          {/* RIGHT: full-height sidebar (sticky under header) */}
          <aside
            className="
              relative z-20
              space-y-6 bg-neutral-950 p-8
              lg:sticky lg:top-16
              lg:h-[calc(100dvh-64px)]
              lg:overflow-y-auto
              rounded-t-3xl md:rounded-t-none
            "
          >
            {/* Title and Description */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="mb-6"
            >
              <h1 className="mb-3 text-3xl font-bold text-foreground">{clip.prompt}</h1>
              <p className="text-muted-foreground">
                Duration: {(clip.duration_ms / 1000).toFixed(1)}s • Created: {creationDateStr}
              </p>
              {assetStatus === 'error' && (
                <p className="text-red-500 text-sm flex items-center gap-2 mt-2">
                  <AlertCircle className="w-4 h-4" />
                  Warning: Asset could not be created on Studio
                </p>
              )}
            </motion.div>

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="flex flex-wrap gap-3"
            >
              <Button variant={isLiked ? "default" : "outline"} onClick={handleLike} className="gap-2">
                <Heart className={`h-5 w-5 ${isLiked ? "fill-current" : ""}`} />
                {likesCount}
              </Button>

              {assetStatus === 'ready' && (
                <Button variant="outline" className="gap-2 bg-transparent">
                  <Eye className="h-5 w-5" />
                  {viewsLoading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : viewCount}
                </Button>
              )}

              <Button variant="outline" onClick={shareToTwitter} className="gap-2 bg-transparent">
                <Share2 className="h-5 w-5" />
              </Button>

              {assetStatus === 'ready' && (
                <Button variant="outline" onClick={handleDownload} className="gap-2 bg-transparent">
                  <Download className="h-5 w-5" />
                </Button>
              )}

              {assetStatus === 'processing' && (
                <Button variant="outline" className="gap-2 bg-transparent" disabled>
                <Loader2 className="h-5 w-5 animate-spin" />
                  {processingProgress}%
                </Button>
              )}
            </motion.div>
            {/* Coffee Ticket Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.4 }}
            >
              {isOwner ? (
                // Owner's ticket states
                <>
                  {ticketCode && !isRedeemed ? (
                    <>
                      {/* Always-visible instructions */}
                      <div className="mb-3 text-center">
                        <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          Show this ticket to the bartender to claim your coffee
                        </p>
                      </div>

                      {/* Swipeable Ticket Card */}
                      <motion.div
                        ref={coffeeCardRef}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.2}
                        onDragEnd={handleDragEnd}
                        style={{
                          x: swipeX,
                          opacity,
                          scale,
                          rotate,
                          y,
                          boxShadow: shadow,
                          transformStyle: "preserve-3d",
                          perspective: 800,
                        }}
                        className="bg-card rounded-2xl p-6 border border-border relative overflow-hidden cursor-grab active:cursor-grabbing"
                      >
                        {/* Lock indicator */}
                        {isSwipeLocked && (
                          <div className="absolute top-2 right-2 text-xs text-muted-foreground flex items-center gap-1 bg-background/80 px-2 py-1 rounded-full">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Please wait...
                          </div>
                        )}

                        <div className="text-center">
                          <Coffee className="w-12 h-12 mx-auto mb-4 text-primary" />
                          <h3 className="text-lg font-bold mb-2">Your Coffee Ticket</h3>
                          <div className="text-4xl font-mono font-bold tracking-wider bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 bg-clip-text text-transparent mb-2">
                            {ticketCode}
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            {isSwipeLocked ? 'Getting ready...' : 'Swipe left or right to redeem'}
                          </p>

                          {/* Visual indicator for swipe */}
                          {!isSwipeLocked && (
                            <div className="flex justify-center gap-1 items-center">
                              <div className="w-8 h-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full animate-pulse" />
                              <span className="text-xs text-muted-foreground">←  →</span>
                            </div>
                          )}
                        </div>

                        {/* Coffee cup icon below for visual feedback */}
                        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-20">
                          <Coffee className="w-16 h-16 text-primary" />
                        </div>
                      </motion.div>
                    </>
                  ) : isRedeemed ? (
                    /* Redeemed State */
                    <motion.div
                      ref={coffeeCardRef}
                      key="redeemed-card"
                      initial={{ y: 200, opacity: 0, scale: 0.9 }}
                      animate={{
                        y: 0,
                        opacity: 1,
                        scale: 1,
                        transition: { type: "spring", stiffness: 80, damping: 12 },
                      }}
                      exit={{ y: 200, opacity: 0, scale: 0.95 }}
                      className="bg-card rounded-2xl p-6 border border-border relative overflow-hidden shadow-xl"
                      style={{ zIndex: 10, position: "relative" }}
                      onAnimationStart={() => {
                        // 🎉 Confetti burst behind the card
                        if (coffeeCardRef.current) {
                          const rect = coffeeCardRef.current.getBoundingClientRect();
                          const x = (rect.left + rect.width / 2) / window.innerWidth;
                          const y = (rect.top + rect.height / 2) / window.innerHeight;

                          // Main burst
                          confetti({
                            particleCount: 120,
                            startVelocity: 40,
                            spread: 90,
                            origin: { x, y },
                            ticks: 200,
                            scalar: 1.3,
                            colors: ['#b87333', '#d1a35d', '#fff7e6'],
                          });

                          // Secondary slower burst for layering
                          setTimeout(() => {
                            confetti({
                              particleCount: 60,
                              startVelocity: 25,
                              spread: 80,
                              origin: { x, y: y - 0.1 },
                              ticks: 180,
                              scalar: 1.1,
                              colors: ['#c0a080', '#ffffff'],
                            });
                          }, 200);
                        }
                      }}
                    >
                      <div className="text-center relative z-10">
                        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                          <CheckCircle2 className="w-8 h-8 text-green-500" />
                        </div>
                        <h3 className="text-lg font-bold mb-2 text-green-400">Enjoy your coffee! ☕</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Want another one? Brew another clip!
                        </p>
                        <Button
                          onClick={() => navigate('/capture')}
                          className="w-full gap-2 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 text-white hover:scale-105 transition-transform"
                        >
                          <Video className="w-5 h-5" />
                          Brew Another Clip
                        </Button>
                      </div>


                    </motion.div>
                  ) : (
                    /* Generate Ticket Button */
                    <div
                      ref={coffeeCardRef}
                      className="bg-card rounded-2xl p-6 border border-border relative overflow-hidden"
                    >
                      <div className="text-center">
                        <Coffee className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-bold mb-4">Get Your Free Coffee</h3>
                        <Button
                          onClick={generateTicket}
                          disabled={generatingTicket}
                          className="w-full gap-2 bg-neutral-100 text-neutral-900 hover:bg-neutral-200"
                        >
                          {generatingTicket ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <Coffee className="w-5 h-5" />
                          )}
                          Generate Ticket
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                // Non-owner CTA
                <div className="bg-card rounded-2xl p-6 border border-border relative overflow-hidden">
                  <div className="text-center">
                    <Coffee className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-bold mb-2">Want Some Coffee?</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      This clip isn't yours, but you can brew your own to get a free coffee ticket!
                    </p>
                    <Button
                      onClick={() => navigate('/capture')}
                      className="w-full gap-2 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 text-white hover:scale-105"
                    >
                      <Video className="w-5 h-5" />
                      Brew Your Clip
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </aside>
        </div>
      </div>

      {/* First-time Instructions Modal */}
      <AlertDialog open={showInstructionsModal} onOpenChange={setShowInstructionsModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Coffee className="w-6 h-6 text-primary" />
              How to Claim Your Coffee
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-left">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm font-bold text-primary">1</span>
                </div>
                <p>Show this ticket to the bartender</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm font-bold text-primary">2</span>
                </div>
                <p>The bartender will swipe left or right on your phone to validate your ticket</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm font-bold text-primary">3</span>
                </div>
                <p>Enjoy your free coffee! ☕</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Got it!</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
