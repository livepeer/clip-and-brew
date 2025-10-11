# Stream Parameters Debugging Summary

## Issue
Stream parameters are completely broken:
- Streams start with default parameters instead of the specified initial parameters
- Parameter changes in the UI don't update the stream
- This affects prompt, creativity, quality, texture, and all other stream parameters

## Debugging Changes Made

### 1. Frontend Logging (src/pages/Capture.tsx)
Added comprehensive console logging to track parameter flow:
- `[CAPTURE]` prefix for all frontend logs
- Logs when stream is created with initial parameters
- Logs when parameters are calculated (t_index_list)
- Logs when updatePrompt is called with current state
- Logs when stream is initialized (3-second delay)
- Logs when forced sync occurs
- Logs when debounced updates are scheduled

### 2. Library Logging (src/lib/daydream.ts)
Added logging to Daydream API wrapper functions:
- `[DAYDREAM]` prefix for all library logs
- Logs when createDaydreamStream is called with initialParams
- Logs when updateDaydreamPrompts is called with full params object
- Logs edge function responses and errors
- Better error handling with detailed error messages

### 3. Edge Function Logging (supabase/functions/)

#### daydream-stream/index.ts
- `[EDGE]` prefix for all edge function logs
- Logs when initialParams are received
- Warns if no initialParams provided
- Logs each retry attempt during background initialization
- Logs the exact params being sent to Daydream API
- Logs Daydream API responses with full detail

#### daydream-prompt/index.ts
- `[EDGE]` prefix for all edge function logs
- Logs when update is requested for a stream
- Logs the exact params structure being sent
- Logs Daydream API response status and body
- Detailed error logging for failed requests

## How to Debug

### Step 1: Monitor Browser Console
Open browser DevTools console and look for:
1. `[CAPTURE] About to create stream with initialParams:` - Check if initialParams are being created correctly
2. `[DAYDREAM] Creating stream with initialParams:` - Check if params are reaching the library
3. `[CAPTURE] Stream created, waiting 3 seconds...` - Verify stream creation succeeds
4. `[CAPTURE] Stream initialized - ready for parameter updates` - Verify initialization completes
5. `[CAPTURE] Stream just initialized - forcing parameter sync` - Check if forced sync runs
6. `[CAPTURE] Parameter changed, scheduling update...` - Verify UI changes trigger updates
7. `[DAYDREAM] Updating stream X with params:` - See exact params being sent for updates

### Step 2: Monitor Edge Function Logs
Check Supabase Edge Function logs for:
1. `[EDGE] Received initialParams for stream X` - Verify edge function receives params
2. `[EDGE] Attempt N: Sending params to Daydream` - Check retry attempts
3. `✓ Stream params initialized successfully` - Verify background init succeeds
4. `[EDGE] Updating prompt for stream: X` - Verify update requests reach edge function
5. `[EDGE] Daydream API response status: 200` - Check if Daydream accepts requests
6. Any error messages from Daydream API

### Step 3: Check for Common Issues

#### Issue: initialParams is undefined or empty
**Symptoms:** Warning `[EDGE] No initialParams provided - stream will start with defaults`
**Fix:** Check that initialParams object is being created correctly in Capture.tsx

#### Issue: Background initialization fails all retries
**Symptoms:** No success message after stream creation
**Fix:** 
- Check if DAYDREAM_API_KEY is set correctly
- Verify Daydream API is responding
- Check if stream ID is valid

#### Issue: Forced sync never runs
**Symptoms:** No `[CAPTURE] Stream just initialized` log after 3 seconds
**Fix:** 
- Check if streamId is set correctly
- Verify streamInitialized state change is not being blocked
- Check React component lifecycle (unmount/remount issues)

#### Issue: Debounced updates don't trigger
**Symptoms:** No `[CAPTURE] Parameter changed` logs when changing UI values
**Fix:**
- Verify streamInitialized is true
- Check useEffect dependency array
- Look for React state update issues

#### Issue: Daydream API rejects params
**Symptoms:** `[EDGE] Daydream API error` with error details
**Common causes:**
- Invalid model_id or controlnet model_ids
- Out-of-range parameter values
- Missing required fields
- Wrong parameter structure

#### Issue: Params sent but not applied
**Symptoms:** All logs show success but stream doesn't change
**Possible causes:**
- Daydream API accepts params but doesn't apply them
- Stream is using a cached version
- Wrong stream ID being updated
- Daydream stream is in an error state

## Expected Log Flow

### On Stream Creation:
```
[CAPTURE] Creating stream with initial prompt: "studio ghibli portrait, soft rim light"
[CAPTURE] Initial t_index_list: [8, 15, 23, 31]
[CAPTURE] About to create stream with initialParams: { full params object }
[DAYDREAM] Creating stream with initialParams: { full params object }
[EDGE] Received initialParams for stream abc123: { full params object }
[EDGE] Attempt 1: Sending params to Daydream: { full params object }
✓ Stream params initialized successfully: { response }
[DAYDREAM] Stream created: { id, output_playback_id, whip_url }
[CAPTURE] Stream created successfully: { stream data }
[CAPTURE] Stream created, waiting 3 seconds before marking initialized...
... (3 seconds pass) ...
[CAPTURE] Stream initialized - ready for parameter updates
[CAPTURE] Stream just initialized - forcing parameter sync with current UI state
[CAPTURE] Syncing: prompt= "..." creativity= 5 quality= 0.4
[CAPTURE] updatePrompt called for stream: abc123
[CAPTURE] Current state - prompt: "..." creativity: 5 quality: 0.4 texture: null
[CAPTURE] Calculated t_index_list: [8, 15, 23, 31]
[CAPTURE] About to call updateDaydreamPrompts with params: { params object }
[DAYDREAM] Updating stream abc123 with params: { full params object }
[EDGE] Updating prompt for stream: abc123
[EDGE] Params being sent: { params structure }
[EDGE] Daydream API response status: 200
[EDGE] Daydream API response: { response }
[DAYDREAM] Update successful, response: { response }
[CAPTURE] updateDaydreamPrompts completed successfully
```

### On Parameter Change:
```
[CAPTURE] Parameter changed, scheduling update in 500ms...
... (500ms pass) ...
[CAPTURE] Debounce complete - updating stream with new parameters
[CAPTURE] updatePrompt called for stream: abc123
[CAPTURE] Current state - prompt: "new prompt" creativity: 7 quality: 0.6 texture: "lava"
[CAPTURE] Calculated t_index_list: [6, 12, 18, 24]
[CAPTURE] About to call updateDaydreamPrompts with params: { updated params }
[DAYDREAM] Updating stream abc123 with params: { updated params }
... (same edge function flow as above) ...
```

## Testing Checklist

- [ ] Start a new stream and check if initial prompt is applied
- [ ] Wait 3 seconds and verify forced sync runs
- [ ] Change prompt in UI and verify update is sent after 500ms
- [ ] Change creativity slider and verify update is sent
- [ ] Change quality slider and verify update is sent
- [ ] Select a texture and verify IP-adapter is enabled
- [ ] Remove texture and verify IP-adapter is disabled
- [ ] Check edge function logs match expected flow
- [ ] Verify Daydream API returns 200 for all requests
- [ ] Confirm visual changes in stream output match parameter changes

## Files Modified

- `src/pages/Capture.tsx` - Added frontend logging
- `src/lib/daydream.ts` - Added library logging and error handling
- `supabase/functions/daydream-stream/index.ts` - Added edge function logging
- `supabase/functions/daydream-prompt/index.ts` - Added edge function logging

## Next Steps

1. Deploy edge functions with updated logging
2. Test stream creation and parameter updates
3. Review logs to identify where parameters are being lost
4. Fix the identified issue
5. Verify fix works across all parameter types
6. Remove excessive logging once issue is resolved (keep key logs)
