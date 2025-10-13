# Anonymous Authentication Implementation

## Overview

Added support for anonymous authentication using Supabase's built-in anonymous auth. Users can now "Continue without email" and start creating clips immediately. They can optionally add an email later to save their clips and get a coffee ticket.

## Changes Made

### 1. Login Component (`src/components/Login.tsx`)

**New Features:**
- ✅ "Continue without email" button (primary CTA)
- ✅ Detects if user is already anonymous
- ✅ Shows "Add your email" flow for anonymous users
- ✅ Seamlessly links email to anonymous account
- ✅ Keeps test account for local development

**Flow:**
- **First visit**: Shows "Continue without email" button + email signin option
- **Anonymous user returns**: Shows "Add your email" to upgrade account
- **Authenticated user**: Auto-redirects to /capture

### 2. Database Migration (`supabase/migrations/20251009140000_support_anonymous_users.sql`)

**Schema Changes:**
- ✅ Made `email` column nullable (for anonymous users)
- ✅ Added unique constraint on email only when not null
- ✅ Updated users table to use auth ID as primary key
- ✅ Added helpful comments

**Result:** Users can be stored with `email=NULL` (anonymous) or `email=<address>` (authenticated)

### 3. Landing Page (`src/components/Landing.tsx`)

**Updates:**
- ✅ Checks if user is logged in (anonymous or authenticated)
- ✅ Auto-redirects to /capture if already logged in
- ✅ Shows login if not logged in
- ✅ Changed CTA from Link to Button for dynamic routing

### 4. Capture Page (`src/pages/Capture.tsx`)

**Updates:**
- ✅ Handles anonymous users when creating sessions
- ✅ Looks up users by ID (for anonymous) or email (for authenticated)
- ✅ Everything else works the same

### 5. Seed File (`supabase/seed.sql`)

**Updates:**
- ✅ Removed test user pre-seeding (created on-demand now)
- ✅ Updated comments to reflect anonymous auth support

## User Flows

### Flow 1: Anonymous User (Quick Start)
```
1. Visit / (Gallery)
2. Click FAB "+" button → /start
3. Auto-redirect to /login (not logged in)
4. Click "Continue without email"
5. → Create clips, sessions, tickets
6. (Optional) Return to /login to add email
```

### Flow 2: Email Authentication
```
1. Visit /login
2. Enter email → Get OTP
3. Enter OTP → Authenticated
4. → Create clips with email saved
```

### Flow 3: Anonymous → Add Email
```
1. Already anonymous (creating clips)
2. Visit /start or /capture → /login
3. UI shows "Add your email" (different icon/text)
4. Enter email → Get OTP
5. Enter OTP → Email linked to same user!
6. → All previous clips/sessions still belong to them
```

### Flow 4: Authenticated User Returns
```
1. Visit any page
2. Session detected → Auto-redirect to /capture
3. Skip login entirely
```

## Technical Details

### Supabase Anonymous Auth

Uses `supabase.auth.signInAnonymously()` which:
- Creates a real user in `auth.users` table
- Sets `is_anonymous = true`
- Session persists in browser (localStorage)
- Can be "upgraded" to authenticated by adding email

### Email Linking

When anonymous user adds email:
```typescript
await supabase.auth.updateUser({ email });
// Then send OTP to verify
await supabase.auth.signInWithOtp({ email });
```

Supabase links the email to the same `user.id`, preserving all data!

**IMPORTANT**: The user record in the `users` table is only created AFTER successful OTP verification, not when the OTP is sent. This prevents conflict errors with the unique email constraint.

### Database Queries

**Anonymous users:**
```sql
SELECT * FROM users WHERE id = 'user-uuid';  -- No email
```

**Authenticated users:**
```sql
SELECT * FROM users WHERE email = 'user@example.com';
```

## Testing

### Quick Start

**Anonymous Flow:**
1. `npm run dev`
2. Go to http://localhost:8080/login
3. Click "Continue without email"
4. Should redirect to /capture immediately
5. Start creating clips!

**Email Linking:**
1. Login anonymously first
2. Create a clip
3. Go back to /start → redirects to /login
4. See "Add your email" UI (different icon/text)
5. Enter email, verify OTP
6. Check database - same user ID, now with email!

**Email OTP Flow:**
1. Go to /login
2. Enter email
3. Check inbox for OTP code
4. Enter code → authenticated
5. Redirect to /capture

## Benefits

✅ **Faster onboarding** - No email required to start
✅ **Lower friction** - Event attendees can jump right in
✅ **Data persistence** - Anonymous sessions stored in browser
✅ **Easy upgrade** - Add email anytime to save permanently
✅ **Seamless transition** - Same user ID before/after email
✅ **Keeps test account** - Dev workflow unchanged

## Security Notes

- Anonymous users can create clips but can't get coffee tickets (need email)
- Sessions expire according to Supabase auth settings
- Anonymous users stored in database (email=NULL)
- No special privileges for anonymous vs authenticated
- RLS policies apply to all users equally

## Email Configuration

For OTP emails to be sent, you need to configure the Supabase Auth Email Hook:

### 1. Set Environment Variables in Supabase

In your Supabase project dashboard, go to Settings → Edge Functions and set:
```bash
RESEND_API_KEY=re_your_resend_api_key
SEND_EMAIL_HOOK_SECRET=your_webhook_secret
SUPABASE_URL=https://your-project.supabase.co
```

### 2. Configure Auth Email Hook

In Supabase Dashboard → Authentication → Email Templates:
1. Enable "Custom SMTP" or configure webhook
2. Set webhook URL to: `https://your-project.supabase.co/functions/v1/send-auth-email`
3. Set webhook secret to match `SEND_EMAIL_HOOK_SECRET`
4. Enable "Send OTP emails via hook"

### 3. Verify Configuration

Test by:
1. Going to /login
2. Entering an email
3. Checking logs in Supabase Functions dashboard
4. Checking Resend dashboard for sent emails

## Recent Fixes (2025-10-13)

### Fixed: Conflict Error on Email Registration

**Problem**: When adding an email, users were getting "A user with this email address has already been registered" error, even for new users.

**Root Cause**: The `handleSendOtp` function was trying to create a user record in the `users` table BEFORE sending the OTP, which caused a conflict if:
- The user already existed but wasn't verified
- The user was attempting to re-verify

**Solution**: 
1. Removed the premature `upsert` to the `users` table from `handleSendOtp`
2. User record is now only created in `handleVerifyOtp` AFTER successful verification
3. Added logic to check if user exists and show appropriate messaging
4. Supabase Auth automatically handles resending OTPs for unverified users

**Code Location**: `src/components/Login.tsx` lines 76-130

## Future Enhancements

- Show "You're browsing anonymously" badge in UI
- Add "Save my clips" prompt after creating clips
- Email reminder before session expires
- "Logout" button to clear anonymous session

---

**Implementation Date:** 2025-10-09  
**Last Updated:** 2025-10-13 (Fixed email conflict error)  
**Supabase Version:** Uses built-in anonymous auth  
**Compatible with:** All existing features (clips, sessions, tickets, gallery)
