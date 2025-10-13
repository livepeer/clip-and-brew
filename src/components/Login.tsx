import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export function Login() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
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

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Check if user exists in our users table (indicates they've verified before)
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, email')
        .eq('email', email)
        .single();

      // If user is anonymous, we need to link their account
      if (isAnonymous) {
        // Update the anonymous user's email
        const { error: updateError } = await supabase.auth.updateUser({ email });
        if (updateError) throw updateError;
      }

      // Send magic link (OTP via email)
      // Supabase automatically handles resending for unverified users
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/capture`,
        },
      });

      if (error) throw error;

      setOtpSent(true);
      
      // Show different message if user exists (indicates resend scenario)
      if (existingUser) {
        toast({
          title: 'Check your email',
          description: 'We sent you a login code',
        });
      } else {
        // New user or unverified user from a previous attempt
        toast({
          title: 'Check your email',
          description: 'We sent you a verification code. If you already have an account, we resent your code.',
        });
      }
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

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      });

      if (error) throw error;

      // Update users table with email
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('users')
          .upsert({
            id: user.id,
            email: user.email
          }, { onConflict: 'id' });
      }

      toast({
        title: 'Success!',
        description: isAnonymous ? 'Email added to your account' : 'Logged in successfully',
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
              {otpSent ? 'Enter code' : isAnonymous ? 'Add your email' : 'Sign in'}
            </h1>
            <p className="text-muted-foreground">
              {otpSent
                ? 'Check your email for the login code'
                : isAnonymous
                ? 'Save your clips and get a coffee ticket'
                : 'Create AI video clips in seconds'}
            </p>


          {!otpSent ? (
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

              <form onSubmit={handleSendOtp} className="space-y-4">
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
                    : 'Send login code'}
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
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <Input
                type="text"
                placeholder="Enter 6-digit code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
                maxLength={6}
                className="h-12 bg-card border-border text-center text-2xl tracking-widest mt-8"
              />
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-neutral-100 text-foreground hover:bg-neutral-200 border border-border"
              >
                {loading ? 'Verifying...' : 'Verify code'}
              </Button>
              <button
                type="button"
                onClick={() => setOtpSent(false)}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition"
              >
                Use a different email
              </button>
            </form>
          )}
          </div>
        </div>
      </div>
    );
}
