# Stream Parameters Debugging & Fix Summary

## Issue Reported
User reports stream parameters are completely broken:
- Streams start with default parameters (not the specified initial params)
- Parameter changes in the UI don't update the stream
- This affects all parameters: prompt, creativity, quality, texture

## Changes Made

### 1. Comprehensive Logging Added
Added detailed logging throughout the entire parameter pipeline to trace where parameters are being lost or failing:

#### Frontend (src/pages/Capture.tsx)
- `[CAPTURE]` prefix for all logs
- Logs stream creation with full initialParams object
- Logs when parameters are calculated (t_index_list from creativity/quality)
- Logs when updatePrompt is called with current state
- Logs forced sync after 3-second initialization period
- Logs debounced updates when parameters change

#### Library (src/lib/daydream.ts)  
- `[DAYDREAM]` prefix for all logs
- Logs when createDaydreamStream is called with initialParams
- Logs when updateDaydreamPrompts is called with full params
- Logs edge function responses and errors
- Improved error handling with detailed messages

#### Edge Functions (supabase/functions/)
- `[EDGE]` prefix for all logs
- **daydream-stream/index.ts**:
  - Version identifier: `2025-10-11-debug`
  - Logs when initialParams are received
  - Warns if no initialParams provided (would use defaults)
  - Logs each retry attempt during background initialization
  - Logs exact params being sent to Daydream API
  - Logs Daydream API responses
  
- **daydream-prompt/index.ts**:
  - Version identifier: `2025-10-11-debug`
  - Logs when update is requested
  - Logs exact params structure being sent
  - Logs Daydream API response status and body
  - Detailed error logging

### 2. Error Handling Improvements
- Edge function errors now return full error details to client
- Client-side errors are logged with context
- Daydream API errors are logged with full response body

### 3. Documentation Created
- **PARAM_DEBUG_SUMMARY.md**: Comprehensive debugging guide with expected log flow
- **DEBUGGING_NOTES.md**: Investigation notes and testing plan
- **STREAM_PARAMS_FIX_SUMMARY.md**: This file

## Parameter Flow (with Logging)

### Stream Creation:
```
1. User clicks camera → Random prompt selected
2. [CAPTURE] "Creating stream with initial prompt: ..."
3. [CAPTURE] "About to create stream with initialParams: {json}"
4. [DAYDREAM] "Creating stream with initialParams: {json}"
5. [EDGE] "daydream-stream function called (version: 2025-10-11-debug)"
6. [EDGE] "Received initialParams for stream X: {json}"
7. [EDGE] "Attempt 1: Sending params to Daydream: {json}"
8. Daydream API: PATCH /v1/streams/:id with params
9. [EDGE] "✓ Stream params initialized successfully: {response}"
10. [DAYDREAM] "Stream created: {stream data}"
11. [CAPTURE] "Stream created successfully"
12. [CAPTURE] "Stream created, waiting 3 seconds..."
13. (3 seconds pass)
14. [CAPTURE] "Stream initialized - ready for parameter updates"
15. [CAPTURE] "Stream just initialized - forcing parameter sync"
16. [CAPTURE] "updatePrompt called for stream: X"
17. [DAYDREAM] "Updating stream X with params: {json}"
18. [EDGE] "daydream-prompt function called (version: 2025-10-11-debug)"
19. [EDGE] "Updating prompt for stream: X"
20. [EDGE] "Params being sent: {json}"
21. Daydream API: PATCH /v1/streams/:id with params
22. [EDGE] "Daydream API response status: 200"
23. [DAYDREAM] "Update successful, response: {response}"
```

### Parameter Update:
```
1. User changes parameter in UI
2. [CAPTURE] "Parameter changed, scheduling update in 500ms..."
3. (500ms pass)
4. [CAPTURE] "Debounce complete - updating stream with new parameters"
5. [CAPTURE] "updatePrompt called for stream: X"
6. [CAPTURE] "Current state - prompt: ... creativity: ... quality: ..."
7. [CAPTURE] "Calculated t_index_list: [...]"
8. [DAYDREAM] "Updating stream X with params: {json}"
9. (Edge function flow same as above)
```

## How to Debug

### Step 1: Deploy Edge Functions
```bash
supabase functions deploy daydream-stream
supabase functions deploy daydream-prompt
```

### Step 2: Test in Browser
1. Open DevTools console (Command+Option+J / Ctrl+Shift+J)
2. Start a new camera stream
3. Watch for log messages with timestamps
4. Note which logs appear and which are missing

### Step 3: Check Edge Function Logs
In Supabase Dashboard → Edge Functions → Logs:
1. Look for version identifier to confirm latest code is deployed
2. Check if initialParams are received
3. Check if Daydream API returns errors
4. Verify background initialization succeeds

### Step 4: Identify the Issue

| Missing Log | Likely Issue | Solution |
|------------|--------------|----------|
| No `[DAYDREAM]` logs | Client library not called | Check React state/props |
| No `[EDGE]` logs | Edge function not invoked | Check Supabase client config |
| `[EDGE]` but no Daydream response | API key or endpoint wrong | Check env vars |
| Daydream error response | Invalid params structure | Fix params format |
| 200 response but no visual change | Daydream not applying params | Daydream API issue |

## Expected Behavior After Fix

### On Stream Start:
- Stream should show the effect from the random prompt immediately (within 3-5 seconds)
- Console should show full log flow from creation to forced sync
- Visual effect should match the prompt (e.g., "studio ghibli" should look anime-styled)

### On Parameter Change:
- After changing prompt: Wait 500ms → effect changes to new style
- After changing creativity: Wait 500ms → effect intensity/stylization changes
- After changing quality: Wait 500ms → refinement level changes
- After selecting texture: Wait 500ms → texture overlay appears
- After removing texture: Wait 500ms → back to depth-based effect

## Common Issues & Solutions

### Issue 1: "No initialParams provided" Warning
**Cause:** initialParams not reaching edge function
**Check:** 
- Is initialParams being created in Capture.tsx?
- Is it being passed to createDaydreamStream()?
- Is Supabase client configured correctly?

### Issue 2: Background Init Times Out
**Cause:** Stream not ready after 10 retries (10 seconds)
**Check:**
- Is Daydream API responding?
- Is stream ID valid?
- Are retries happening? (should see "attempt 2", "attempt 3", etc.)

### Issue 3: Forced Sync Never Runs
**Cause:** streamInitialized never set to true
**Check:**
- Did stream creation succeed?
- Is streamId set correctly?
- Is component unmounting before 3 seconds?

### Issue 4: Updates Don't Fire
**Cause:** Debounce being cancelled or streamInitialized is false
**Check:**
- Is streamInitialized true? (check after 3 seconds)
- Are parameters actually changing? (check state values)
- Is component re-rendering excessively?

### Issue 5: Daydream API Errors
**Common errors:**
- "Stream not ready yet" → Retry is working correctly, wait
- "Invalid model_id" → Check model ID spelling
- "Invalid controlnet" → Check controlnet model IDs
- "Authentication failed" → Check DAYDREAM_API_KEY env var

## Files Changed
- `src/pages/Capture.tsx` (+22 lines logging)
- `src/lib/daydream.ts` (+20 lines logging & error handling)
- `supabase/functions/daydream-stream/index.ts` (+8 lines logging)
- `supabase/functions/daydream-prompt/index.ts` (+7 lines logging)

## Next Steps

1. **Deploy and Test** (REQUIRED)
   - Deploy edge functions
   - Test stream creation
   - Test parameter updates
   - Review logs

2. **Identify Root Cause**
   - Use logs to find where parameters are lost
   - Check Daydream API responses
   - Verify parameter structure

3. **Apply Fix**
   - Fix identified issue
   - Test again
   - Verify all parameters work

4. **Clean Up** (After fix confirmed)
   - Remove excessive logging (keep key logs)
   - Update VIBEME.md with any findings
   - Document fix for future reference

## Debugging Checklist
- [ ] Edge functions deployed with latest code
- [ ] Browser console shows `[CAPTURE]` logs
- [ ] Browser console shows `[DAYDREAM]` logs  
- [ ] Edge function logs show `[EDGE]` version identifier
- [ ] Edge function logs show initialParams received
- [ ] Edge function logs show Daydream API responses
- [ ] Forced sync runs after 3 seconds
- [ ] Parameter changes trigger debounced updates
- [ ] Visual changes match parameter changes
- [ ] Root cause identified
- [ ] Fix applied and verified
