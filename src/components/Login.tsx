import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';

export function Login() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Check if user is already logged in (anonymous or authenticated)
  useEffect(() => {
    const checkExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // User is already logged in
        const isAnon = session.user.is_anonymous || false;
        setIsAnonymous(isAnon);

        // If they're authenticated (not anonymous), redirect to capture
        if (!isAnon) {
          navigate('/capture');
        }
      }
    };

    checkExistingSession();
  }, [navigate]);

  const handleAnonymousLogin = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInAnonymously();

      if (error) throw error;

      // Store anonymous user in users table (no email)
      if (data.user) {
        const { error: insertError } = await supabase
          .from('users')
          .upsert({
            id: data.user.id,
            email: null
          }, { onConflict: 'id' });

        if (insertError) {
          console.error('Failed to create user record:', insertError);
          throw new Error(`Failed to create user record: ${insertError.message}`);
        }
      }

      toast({
        title: 'Welcome!',
        description: 'You can start creating clips right away',
      });

      navigate('/capture');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Get current session to check if user is anonymous
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id;

      // Create user record immediately with email_verified=false
      // This allows us to track signup attempts and prevents conflicts
      const { error: insertError } = await supabase
        .from('users')
        .upsert({
          id: currentUserId || undefined, // Use current user ID if anonymous, otherwise let DB generate
          email: email,
          email_verified: false
        }, { 
          onConflict: 'email',
          ignoreDuplicates: false 
        });

      // If there's an error and it's not a duplicate, throw it
      if (insertError && !insertError.message.includes('duplicate')) {
        console.error('Failed to create user record:', insertError);
      }

      // If user is anonymous, link their account
      if (isAnonymous && currentUserId) {
        const { error: updateError } = await supabase.auth.updateUser({ email });
        if (updateError) throw updateError;
      }

      // Send magic link via email
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/capture`,
        },
      });

      if (error) throw error;

      setEmailSent(true);
      toast({
        title: 'Check your email',
        description: 'Click the link in your email to sign in',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle auth state changes (when user clicks magic link)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // User successfully authenticated via magic link
        // Update their user record to mark email as verified
        await supabase
          .from('users')
          .upsert({
            id: session.user.id,
            email: session.user.email,
            email_verified: true
          }, { onConflict: 'id' });

        toast({
          title: 'Success!',
          description: isAnonymous ? 'Email added to your account' : 'Logged in successfully',
        });

        navigate('/capture');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, toast, isAnonymous]);

  return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
        <div className="w-full max-w-md space-y-8">
          <Link
            to="/"
            className="flex items-center gap-3 mb-8 justify-center hover:opacity-90 transition"
          >
            <img src="/daydream-logo.svg" alt="Daydream" className="h-8 w-auto" />
            <h2 className="text-xl font-bold text-foreground">Brewdream</h2>
          </Link>

          <div className="text-center bg-neutral-950 shadow-lg shadow-[0_0_15px_2px_theme(colors.neutral.800/0.4)] border border-neutral-800 rounded-3xl p-6">


            <h1 className="text-3xl font-bold mb-2">
              {emailSent ? 'Check your email' : isAnonymous ? 'Add your email' : 'Sign in'}
            </h1>
            <p className="text-muted-foreground">
              {emailSent
                ? 'Click the link in your email to sign in'
                : isAnonymous
                ? 'Save your clips and get a coffee ticket'
                : 'Create AI video clips in seconds'}
            </p>


          {!emailSent ? (
            <div className="space-y-4">
              {!isAnonymous && (
                <>
                  <Button
                    onClick={handleAnonymousLogin}
                    disabled={loading}
                    className="w-full h-14 bg-neutral-100 text-neutral-900 mt-8 hover:bg-neutral-200 border border-border transition-colors"
                  >
                    {loading ? 'Loading...' : 'Continue without email'}
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">or sign in with email</span>
                    </div>
                  </div>
                </>
              )}

              <form onSubmit={handleSendMagicLink} className="space-y-4">
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 bg-card border-border text-foreground"
                />
                <Button
                  type="submit"
                  disabled={loading}
                  className={`w-full h-12 ${
                    isAnonymous
                      ? 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200 border border-border'
                      : 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200 border border-border'
                  }`}
                >
                  {loading
                    ? 'Sending...'
                    : isAnonymous
                    ? 'Add email & get coffee ticket'
                    : 'Send login link'}
                </Button>
              </form>

              {isAnonymous && (
                <Button
                  onClick={() => navigate('/capture')}
                  disabled={loading}
                  variant="outline"
                  className="w-full h-12 border-border text-muted-foreground hover:text-foreground transition-colors"
                >
                  Stay Anonymous
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-6 py-8">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <Mail className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    We sent an email to
                  </p>
                  <p className="font-semibold text-foreground">{email}</p>
                  <p className="text-sm text-muted-foreground mt-4">
                    Click the link in the email to sign in. The link will expire in 1 hour.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setEmailSent(false)}
                variant="outline"
                className="w-full h-12 border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Use a different email
              </Button>
            </div>
          )}
          </div>
        </div>
      </div>
    );
}
