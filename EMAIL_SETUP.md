# Email Setup Guide for Brewdream

## Overview

Brewdream uses Supabase Auth for email OTP (One-Time Password) authentication. Emails are sent via Resend using a custom webhook handler.

## Prerequisites

1. A Supabase project (already configured)
2. A Resend account with API key
3. Access to Supabase Dashboard

## Configuration Steps

### 1. Set Up Resend

1. Go to [Resend Dashboard](https://resend.com/dashboard)
2. Create an account or sign in
3. Navigate to API Keys
4. Create a new API key
5. Copy the key (it starts with `re_`)

### 2. Configure Supabase Edge Function Secrets

In your Supabase project:

1. Go to **Settings** → **Edge Functions** → **Secrets**
2. Add these environment variables:

```bash
RESEND_API_KEY=re_your_resend_api_key_here
SEND_EMAIL_HOOK_SECRET=your_custom_secret_here
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Note**: For `SEND_EMAIL_HOOK_SECRET`, generate a random secure string (e.g., using `openssl rand -hex 32`)

### 3. Configure Supabase Auth Email Hook

1. Go to **Authentication** → **Providers** → **Email**
2. Scroll down to **Email Templates** or **Auth Hooks**
3. Find the **Send Email** hook configuration
4. Set the webhook URL to:
   ```
   https://your-project-id.supabase.co/functions/v1/send-auth-email
   ```
5. Set the webhook secret to match the `SEND_EMAIL_HOOK_SECRET` you created above
6. Enable the hook

### 4. Verify Email Template Settings

In **Authentication** → **Email Templates**:

1. Ensure "Enable Email Confirmations" is turned ON
2. Verify the redirect URL is set correctly (should be `{{ .SiteURL }}/capture`)

### 5. Deploy the Edge Function

If you haven't already deployed the `send-auth-email` function:

```bash
supabase functions deploy send-auth-email
```

## Testing

### Test the Email Flow

1. Go to your app's `/login` page
2. Enter a test email address
3. Click "Send login code"
4. Check the following:

**In Supabase Dashboard:**
- Go to **Edge Functions** → **send-auth-email** → **Logs**
- You should see a log entry for the email being sent

**In Resend Dashboard:**
- Go to **Logs**
- You should see the email sent successfully

**In Your Email Inbox:**
- Check for an email from "Brewdream <onboarding@resend.dev>"
- It should contain a 6-digit OTP code

### Common Issues

#### No Email Received

1. **Check Supabase Edge Function Logs**
   - Go to Edge Functions → send-auth-email → Logs
   - Look for errors

2. **Check Resend Logs**
   - Go to Resend Dashboard → Logs
   - Verify the email was sent

3. **Check Spam Folder**
   - Emails from onboarding@resend.dev might be flagged

4. **Verify Environment Variables**
   - Ensure all secrets are set correctly in Supabase

#### "A user with this email address has already been registered"

This error should now be fixed! The issue was that the app was trying to create a user record before verification.

**What was changed:**
- User records are now only created AFTER successful OTP verification
- If a user exists but is unverified, Supabase automatically resends the OTP
- The app shows an appropriate message indicating the code was resent

## Email Template Customization

To customize the email template:

1. Edit `supabase/functions/send-auth-email/_templates/otp-email.tsx`
2. Modify the React component as needed
3. Redeploy the function:
   ```bash
   supabase functions deploy send-auth-email
   ```

## Production Setup

### Use a Custom Domain in Resend

For production, you should:

1. Verify a custom domain in Resend (e.g., `your-domain.com`)
2. Update the "from" address in `supabase/functions/send-auth-email/index.ts`:
   ```typescript
   from: 'Brewdream <noreply@your-domain.com>',
   ```
3. Redeploy the function

This improves deliverability and looks more professional.

## Monitoring

### Check Email Delivery Rates

In Resend Dashboard:
- Monitor delivery rates
- Check for bounces
- Review spam reports

### Check Authentication Metrics

In Supabase Dashboard:
- Go to **Authentication** → **Users**
- Monitor user sign-ups
- Check for failed authentication attempts

## Support

If you continue to have issues:

1. Check the Supabase Edge Function logs
2. Check the Resend delivery logs
3. Verify all environment variables are set correctly
4. Test with a different email address
5. Check if email confirmations are enabled in Supabase Auth settings

---

**Last Updated:** 2025-10-13  
**Status:** Email system configured and tested  
**Known Issues:** None (conflict error fixed)
