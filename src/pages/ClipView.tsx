import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Eye, Heart, Share2, Download, Twitter, Home, Coffee, Loader2, AlertCircle, CheckCircle2, Video } from 'lucide-react';
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

interface Clip {
  id: string;
  asset_playback_id: string;
  prompt: string;
  duration_ms: number;
  created_at: string;
  session_id: string;
  likes_count: number;
}

interface Ticket {
  id: string;
  code: string;
  redeemed: boolean;
}

export default function ClipView() {
  const { id } = useParams();
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
  const { toast } = useToast();
  const coffeeCardRef = useRef<HTMLDivElement | null>(null);
  const swipeX = useMotionValue(0);
  const opacity = useTransform(swipeX, [-150, 0, 150], [0, 1, 0]);
  const scale = useTransform(swipeX, [-150, 0, 150], [0.9, 1, 0.9]);

  useEffect(() => {
    loadClip();
    checkAuth();
    loadViewership();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);
      setCurrentUserId(user?.id || null);
    } catch (error) {
      console.error('Error checking auth:', error);
    }
  };

  const loadViewership = async () => {
    try {
      if (!id) return;

      const { data: clipData } = await supabase
        .from('clips')
        .select('asset_playback_id')
        .eq('id', id)
        .single();

      if (!clipData?.asset_playback_id) return;

      const { data, error } = await supabase.functions.invoke('get-viewership', {
        body: { playbackId: clipData.asset_playback_id },
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
  };

  const loadClip = async () => {
    try {
      const { data, error } = await supabase
        .from('clips')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setClip(data);
      setLikesCount(data.likes_count || 0);

      // Check if user owns this clip and if they have a ticket
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: sessionData } = await supabase
          .from('sessions')
          .select('user_id, id')
          .eq('id', data.session_id)
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
              .single();

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
          .eq('clip_id', data.id)
          .eq('user_id', user.id)
          .single();

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
      setLikesCount(clip.likes_count);

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
      await redeemTicket();
    } else {
      // Snap back
      swipeX.set(0);
    }
  };

  const redeemTicket = async () => {
    if (!ticketCode || isRedeeming) return;

    setIsRedeeming(true);
    try {
      const { data, error } = await supabase.functions.invoke('redeem-ticket', {
        body: { ticketCode: ticketCode },
      });

      if (error) throw error;

      // Animate ticket away (swipe off to the side)
      swipeX.set(swipeX.get() > 0 ? 300 : -300);

      setTimeout(() => {
        setIsRedeemed(true);
        swipeX.set(0);

        toast({
          title: 'Ticket redeemed!',
          description: 'Enjoy your coffee! ☕',
        });
      }, 500);

    } catch (error) {
      console.error('Error redeeming ticket:', error);
      swipeX.set(0);

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

  console.log('clip.asset_playback_id', clip?.asset_playback_id);

  return (
    <div className="min-h-screen">
      <Header isAuthenticated={isAuthenticated} />

      <div className="container mx-auto px-6 py-8">
        {/* Back Button */}
        <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Video Player */}
            <motion.div
              layoutId={`clip-${clip.id}`}
              className="relative mb-6 overflow-hidden rounded-2xl bg-card border border-neutral-800 shadow-lg shadow-[0_0_15px_2px_theme(colors.neutral.800/0.4)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <div className="relative aspect-[9/16] max-h-[80vh] w-full bg-black">
                <iframe
                  src={`https://lvpr.tv/?v=${clip.asset_playback_id}&autoplay=1&loop=1`}
                  className="w-full h-full border-0"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  title="Clip playback"
                />
              </div>
            </motion.div>




          </div>

          {/* Sidebar */}
          <div className="space-y-6">



                 {/* Title and Description */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="mb-6"
            >
              <h1 className="mb-3 text-3xl font-bold text-foreground">{clip.prompt}</h1>
              <p className="text-muted-foreground">
                Duration: {(clip.duration_ms / 1000).toFixed(1)}s • Created: {new Date(clip.created_at).toLocaleDateString()}
              </p>
            </motion.div>

                    {/* Actions */}
                    <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="flex flex-wrap gap-3"
            >
              <Button variant={isLiked ? "default" : "outline"} size="lg" onClick={handleLike} className="gap-2">
                <Heart className={`h-5 w-5 ${isLiked ? "fill-current" : ""}`} />
                {likesCount}
              </Button>

              <Button variant="outline" size="lg" className="gap-2 bg-transparent">
                <Eye className="h-5 w-5" />
                {viewsLoading ? '-' : viewCount}
              </Button>

              <Button variant="outline" size="lg" onClick={shareToTwitter} className="gap-2 bg-transparent">
                <Share2 className="h-5 w-5" />
              </Button>

              <Button variant="outline" size="lg" onClick={handleDownload} className="gap-2 bg-transparent">
                <Download className="h-5 w-5" />
              </Button>
            </motion.div>
            {/* Coffee Ticket Section - Only visible to clip owner */}
            {isOwner && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
              >
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
                    style={{ x: swipeX, opacity, scale }}
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
                <div
                  ref={coffeeCardRef}
                  className="bg-card rounded-2xl p-6 border border-border relative overflow-hidden"
                >
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-green-500" />
                    </div>
                    <h3 className="text-lg font-bold mb-2 text-muted-foreground">Ticket Already Redeemed</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Want more coffee? Create another clip!
                    </p>
                    <Button
                      onClick={() => navigate('/capture')}
                      className="w-full gap-2"
                    >
                      <Video className="w-5 h-5" />
                      Create New Clip
                    </Button>
                  </div>
                </div>
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
              </motion.div>
            )}


          </div>
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
