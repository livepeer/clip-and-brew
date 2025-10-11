# Next Steps to Fix Stream Parameters

## What Was Done

I've added comprehensive diagnostic logging throughout the entire parameter pipeline to identify exactly where parameters are being lost or rejected. **No logic was changed** - only logging was added to trace the flow.

### Files Modified
1. **src/pages/Capture.tsx** - Frontend logging  
2. **src/lib/daydream.ts** - Library function logging
3. **supabase/functions/daydream-stream/index.ts** - Edge function logging + version ID
4. **supabase/functions/daydream-prompt/index.ts** - Edge function logging + version ID

### Documentation Created
1. **PARAM_DEBUG_SUMMARY.md** - Complete debugging guide with expected log flow
2. **DEBUGGING_NOTES.md** - Root cause hypotheses and investigation notes
3. **STREAM_PARAMS_FIX_SUMMARY.md** - Comprehensive summary and checklist
4. **FIX_APPROACH.md** - Methodology and rationale for this approach
5. **NEXT_STEPS.md** - This file (what to do next)

## What You Need to Do Now

### Step 1: Deploy Edge Functions (REQUIRED)
The edge functions must be deployed for the logging to work:

```bash
cd /workspace

# Deploy both edge functions
supabase functions deploy daydream-stream
supabase functions deploy daydream-prompt

# Verify deployment succeeded
supabase functions list
```

### Step 2: Test Stream Creation
1. Open your app in a browser
2. Open DevTools Console (F12 or Cmd+Opt+J)
3. Click to start a new camera stream
4. **Watch the console carefully** for log messages

You should see logs in this order:
```
[CAPTURE] Creating stream with initial prompt: "..."
[CAPTURE] About to create stream with initialParams: {json}
[DAYDREAM] Creating stream with initialParams: {json}
[DAYDREAM] Stream created: {data}
[CAPTURE] Stream created successfully
[CAPTURE] Stream created, waiting 3 seconds...
... (3 seconds pass) ...
[CAPTURE] Stream initialized - ready for parameter updates
[CAPTURE] Stream just initialized - forcing parameter sync
[CAPTURE] updatePrompt called for stream: abc123
[DAYDREAM] Updating stream abc123 with params: {json}
[DAYDREAM] Update successful
```

### Step 3: Check Edge Function Logs
1. Go to Supabase Dashboard → Edge Functions → Logs
2. Look for:
   - `[EDGE] daydream-stream function called (version: 2025-10-11-debug)`
   - `[EDGE] Received initialParams for stream ...`
   - `[EDGE] Attempt 1: Sending params to Daydream: ...`
   - `✓ Stream params initialized successfully`
   - `[EDGE] Daydream API response status: 200`

### Step 4: Test Parameter Updates
1. Wait for stream to be fully initialized (3+ seconds)
2. Change the **prompt text** in the UI
3. Wait 500ms
4. Check console for:
   ```
   [CAPTURE] Parameter changed, scheduling update in 500ms...
   [CAPTURE] Debounce complete - updating stream
   [CAPTURE] updatePrompt called for stream: ...
   [DAYDREAM] Updating stream ... with params: ...
   ```
5. **Verify the stream visual changes** to match the new prompt

### Step 5: Analyze the Results

Based on what you see (or don't see) in the logs, here's how to identify the issue:

#### Scenario A: No `[DAYDREAM]` Logs in Browser Console
**Problem:** Parameters aren't leaving the Capture component  
**Check:**
- Are `[CAPTURE]` logs appearing?
- Is the `createDaydreamStream()` function being called?
- Look for any errors in browser console

**Likely Cause:** State management issue or broken function call

#### Scenario B: No `[EDGE]` Logs in Supabase
**Problem:** Edge functions aren't being invoked  
**Check:**
- Did edge function deployment succeed?
- Is Supabase client configured correctly?
- Are there CORS or network errors?

**Likely Cause:** Supabase configuration or network issue

#### Scenario C: `[EDGE]` Logs But No Success Message
**Problem:** Daydream API is rejecting params or timing out  
**Check:**
- What error does Daydream return?
- Are all retry attempts failing?
- Is DAYDREAM_API_KEY set correctly?

**Likely Cause:** Invalid params structure or API authentication

#### Scenario D: 200 Response But No Visual Change
**Problem:** Daydream accepts params but doesn't apply them  
**Check:**
- Are the params in the logs what you expect?
- Is the stream ID correct?
- Try creating a new stream - same issue?

**Likely Cause:** Daydream API bug or stream in error state

#### Scenario E: Forced Sync Never Runs
**Problem:** Stream initialization flag not being set  
**Check:**
- Do you see "Stream created, waiting 3 seconds"?
- Do you see "Stream initialized - ready for parameter updates"?
- Is the component unmounting before 3 seconds?

**Likely Cause:** Component lifecycle or state management issue

### Step 6: Share Your Findings

After testing, provide these details:

1. **Browser Console Logs**
   - Copy all `[CAPTURE]` and `[DAYDREAM]` logs
   - Note which expected logs are missing
   - Copy any error messages

2. **Edge Function Logs**
   - Copy all `[EDGE]` logs from Supabase Dashboard
   - Include any Daydream API error responses
   - Note the version identifier you see

3. **Visual Behavior**
   - Does the initial prompt appear in the stream?
   - Do parameter changes affect the stream visual?
   - How long does it take for changes to appear?

4. **Which Scenario Above Matches**
   - Which of A, B, C, D, or E describes what you're seeing?

## Quick Reference: What to Look For

### ✅ Good Signs
- All `[CAPTURE]` logs appear in sequence
- `[EDGE]` version identifier shows `2025-10-11-debug`
- Daydream API returns status 200
- "Stream params initialized successfully" appears
- Forced sync runs after 3 seconds
- Parameter changes trigger updates after 500ms
- Stream visual matches the UI settings

### 🚨 Bad Signs  
- Missing `[CAPTURE]` or `[DAYDREAM]` logs
- No `[EDGE]` version identifier (old code deployed)
- Daydream API errors in edge function logs
- "Stream params initialization timed out" warning
- No forced sync after 3 seconds
- Parameter changes don't trigger logs
- Stream visual doesn't match UI settings

## After Identifying the Issue

Once you know which scenario you're in, I can provide a targeted fix. The logging will show exactly what needs to be fixed:

- **Scenario A** → Fix frontend state/API call
- **Scenario B** → Fix Supabase configuration
- **Scenario C** → Fix parameter structure or API auth
- **Scenario D** → May need Daydream support
- **Scenario E** → Fix component lifecycle

## Important Notes

1. **Edge functions MUST be deployed** - The new logging code won't run until deployed
2. **Check Supabase logs** - Browser console only shows half the story
3. **Wait full 3 seconds** - Don't test parameter updates before stream initializes
4. **Test systematically** - Test each parameter type separately
5. **Visual verification** - Logs alone aren't enough, check the stream visual changes

## Questions to Answer

After testing, you should be able to answer:

- [ ] Do initialParams reach the edge function?
- [ ] Does background initialization succeed?
- [ ] Does the forced sync run after 3 seconds?
- [ ] Do parameter changes trigger debounced updates?
- [ ] Does Daydream API accept the requests?
- [ ] Do the visuals match the parameter settings?
- [ ] Which scenario (A-E) best describes the issue?

## Summary

The logging is now in place to diagnose the issue. Deploy the edge functions, test the flow, review the logs, and share which scenario matches what you're seeing. The logs will reveal the exact point of failure, allowing for a precise fix.

**Remember:** The issue affects BOTH initial params AND updates, so test both scenarios and compare the logs.
