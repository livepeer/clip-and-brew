-- Add email_verified column to users table
-- This allows us to create user records immediately when they enter email,
-- but only mark them as verified after they click the magic link

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- Update existing users with non-null emails to be verified
-- (they must have verified to get into the system in the first place)
UPDATE public.users
SET email_verified = true
WHERE email IS NOT NULL;

-- Add index for querying verified users
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON public.users(email_verified);

-- Add helpful comment
COMMENT ON COLUMN public.users.email_verified IS
  'Whether the user has verified their email address. False for unverified users, true for verified users. Anonymous users (email=NULL) have this as false.';
