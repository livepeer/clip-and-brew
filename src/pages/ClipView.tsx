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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSwipeLocked, setIsSwipeLocked] = useState(true);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const { toast } = useToast();
  const coffeeCardRef = useRef<HTMLDivElement | null>(null);
  const swipeY = useMotionValue(0);
  const opacity = useTransform(swipeY, [0, 150], [1, 0]);
  const scale = useTransform(swipeY, [0, 150], [1, 0.9]);

  useEffect(() => {
    loadClip();
    checkAuth();
  }, [id]);

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);
    } catch (error) {
      console.error('Error checking auth:', error);
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

      // Check if user owns this clip and if they have a ticket
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: sessionData } = await supabase
          .from('sessions')
          .select('user_id, id')
          .eq('id', data.session_id)
          .single();

        if (sessionData) {
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
    } catch (error: any) {
      console.error('Error loading clip:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    setIsLiked(!isLiked);
    // TODO: Implement like functionality with API route
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
        body: { sessionId: clip.session_id },
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

    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setGeneratingTicket(false);
    }
  };

  const handleDragEnd = async (_event: any, info: PanInfo) => {
    const dragThreshold = 100; // pixels

    if (isSwipeLocked || isRedeemed || isRedeeming) {
      swipeY.set(0);
      return;
    }

    if (info.offset.y > dragThreshold) {
      // Swipe successful - redeem ticket
      await redeemTicket();
    } else {
      // Snap back
      swipeY.set(0);
    }
  };

  const redeemTicket = async () => {
    if (!ticketCode || isRedeeming) return;

    setIsRedeeming(true);
    try {
      const { data, error } = await supabase.functions.invoke('redeem-ticket', {
        body: { code: ticketCode },
      });

      if (error) throw error;

      // Animate ticket away
      swipeY.set(200);

      setTimeout(() => {
        setIsRedeemed(true);
        swipeY.set(0);

        toast({
          title: 'Ticket redeemed!',
          description: 'Enjoy your coffee! ☕',
        });
      }, 500);

    } catch (error: any) {
      console.error('Error redeeming ticket:', error);
      swipeY.set(0);

      toast({
        title: 'Error',
        description: error.error || error.message || 'Failed to redeem ticket',
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
    <div className="min-h-screen">
      <Header isAuthenticated={isAuthenticated} />

      <div className="container mx-auto px-6 py-8">
        {/* Back Button */}
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-6">
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
                <video
                  src={`https://lvpr.tv/?v=${clip.asset_playback_id}`}
                  poster={`https://lvpr.tv/?v=${clip.asset_playback_id}`}
                  controls
                  className="h-full w-full object-contain"
                  autoPlay
                  loop
                >
                  Your browser does not support the video tag.
                </video>
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
                0
              </Button>

              <Button variant="outline" size="lg" className="gap-2 bg-transparent">
                <Eye className="h-5 w-5" />
                0
              </Button>

              <Button variant="outline" size="lg" onClick={shareToTwitter} className="gap-2 bg-transparent">
                <Share2 className="h-5 w-5" />
              </Button>

              <Button variant="outline" size="lg" className="gap-2 bg-transparent">
                <Download className="h-5 w-5" />
              </Button>
            </motion.div>
            {/* Coffee Ticket Section */}
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
                    drag="y"
                    dragConstraints={{ top: 0, bottom: 0 }}
                    dragElastic={0.2}
                    onDragEnd={handleDragEnd}
                    style={{ y: swipeY, opacity, scale }}
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
                        {isSwipeLocked ? 'Getting ready...' : 'Swipe down to redeem'}
                      </p>

                      {/* Visual indicator for swipe */}
                      {!isSwipeLocked && (
                        <div className="flex justify-center animate-bounce">
                          <div className="w-8 h-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" />
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
                <p>The bartender will swipe down on your phone to validate your ticket</p>
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
