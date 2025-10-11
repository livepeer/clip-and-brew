# Stream Parameters Debugging Notes

## Problem Statement
User reports: "The stream params are completely broken. They start on default and never change anymore on any change."

This indicates two issues:
1. Initial parameters are not being applied when stream is created
2. Subsequent parameter updates don't affect the stream

## Investigation Approach

### 1. Added Comprehensive Logging
Added logging at every step of the parameter pipeline to trace where parameters are being lost:

- **Frontend (Capture.tsx)**: `[CAPTURE]` prefix
- **Library (daydream.ts)**: `[DAYDREAM]` prefix  
- **Edge Functions**: `[EDGE]` prefix

### 2. Code Review Findings
Reviewed the parameter flow and found the structure appears correct:

**Stream Creation Flow:**
1. User selects camera → random prompt chosen
2. `initializeStream()` creates `initialParams` object with:
   - model_id: 'stabilityai/sdxl-turbo'
   - prompt: selected random prompt
   - t_index_list: calculated from creativity/quality
   - controlnets: all 3 SDXL controlnets with proper scales
   - ip_adapter: disabled by default
3. `createDaydreamStream(initialParams)` called
4. Edge function receives params and starts background initialization
5. Edge function retries up to 10 times if stream not ready
6. Frontend waits 3 seconds then forces a parameter sync

**Update Flow:**
1. User changes parameter in UI
2. After 500ms debounce, `updatePrompt()` is called
3. Builds fresh params object with current state
4. Calls `updateDaydreamPrompts(streamId, params)`
5. Edge function forwards to Daydream API PATCH endpoint
6. Daydream API should apply the parameters

### 3. Potential Root Causes

#### Hypothesis 1: Background Initialization Failing
The background initialization in the edge function runs "fire and forget" and could be failing silently. The logging will show:
- Whether initialParams reach the edge function
- How many retry attempts occur
- What error (if any) Daydream returns

#### Hypothesis 2: Daydream API Rejecting Parameters
The Daydream API might be rejecting parameters due to:
- Invalid controlnet model IDs
- Wrong parameter structure
- Missing required fields
- API key permissions

Logging will show the exact error from Daydream.

#### Hypothesis 3: Forced Sync Not Running
The forced sync after 3 seconds might not be running due to:
- Component unmounting before timer fires
- streamInitialized never being set
- React state issues

Logging will show if the forced sync executes.

#### Hypothesis 4: Updates Not Reaching Edge Function
Parameter updates might not be reaching the edge function due to:
- Supabase client configuration issues
- Network errors
- Edge function not deployed

Logging will show if updates reach the edge function.

#### Hypothesis 5: Silent Daydream API Issues
Daydream API might be returning 200 OK but not actually applying parameters due to:
- Stream in error state
- Caching issues
- API bug

Logging will show API responses but this would be hard to detect.

## Testing Plan

### Step 1: Check Browser Console
Look for the complete log flow documented in PARAM_DEBUG_SUMMARY.md.
Key indicators:
- `[CAPTURE] About to create stream with initialParams:` shows params being created
- `[DAYDREAM] Creating stream with initialParams:` shows params reaching library
- `[CAPTURE] Stream initialized` shows 3-second delay completing
- `[CAPTURE] Parameter changed` shows UI changes triggering updates

### Step 2: Check Edge Function Logs
Look for:
- Version identifier: `daydream-stream function called (version: 2025-10-11-debug)`
- `[EDGE] Received initialParams` confirms params reach edge function
- `✓ Stream params initialized successfully` confirms background init works
- `[EDGE] Daydream API response status: 200` confirms API accepts requests
- Any error messages from Daydream API

### Step 3: Verify Parameter Application
Visual verification:
- Does the video stream show the expected style from the random prompt?
- When you change the prompt, does the stream style change after 500ms?
- When you change creativity/quality, does the effect intensity change?
- When you select a texture, does it appear in the stream?

## Files Modified

1. `src/pages/Capture.tsx`
   - Added logging to stream initialization
   - Added logging to parameter updates
   - Added logging to forced sync
   - Added logging to debounced updates

2. `src/lib/daydream.ts`
   - Added logging to createDaydreamStream
   - Added logging to updateDaydreamPrompts
   - Improved error handling and logging

3. `supabase/functions/daydream-stream/index.ts`
   - Added version identifier
   - Added logging to param reception
   - Added logging to each retry attempt
   - Added detailed logging of Daydream API responses

4. `supabase/functions/daydream-prompt/index.ts`
   - Added version identifier
   - Added detailed parameter logging
   - Added Daydream API response logging

5. `PARAM_DEBUG_SUMMARY.md` - Complete debugging guide
6. `DEBUGGING_NOTES.md` - This file

## Next Actions

1. **Deploy Edge Functions**
   ```bash
   supabase functions deploy daydream-stream
   supabase functions deploy daydream-prompt
   ```

2. **Test Stream Creation**
   - Open browser with DevTools console
   - Start a new camera stream
   - Watch for all log messages
   - Verify initial prompt is visible in stream

3. **Test Parameter Updates**
   - Change prompt text
   - Wait 500ms and watch logs
   - Verify stream changes visually
   - Repeat for creativity, quality, texture

4. **Identify Issue from Logs**
   - If params don't reach edge function → client-side issue
   - If edge function fails → check env vars and Daydream API
   - If Daydream returns error → fix parameter structure
   - If Daydream returns 200 but no change → Daydream API issue

5. **Fix and Verify**
   - Apply fix based on findings
   - Test again with logging
   - Remove excessive logging once confirmed working

## Code Structure Notes

### Parameter Flow Diagram
```
User Input (UI)
  ↓
Capture.tsx: updatePrompt() builds params
  ↓
daydream.ts: updateDaydreamPrompts() wraps params
  ↓
Supabase Functions Invoke
  ↓
daydream-prompt edge function
  ↓
Daydream API: PATCH /v1/streams/:id
  ↓
Stream applies parameters (hopefully!)
```

### Critical Parameters
All updates must include:
- `model_id`: 'stabilityai/sdxl-turbo' (prevents model reload)
- `prompt`: The style description
- `t_index_list`: Calculated from creativity/quality
- `controlnets`: Array of 3 SDXL controlnets
- `ip_adapter`: Always present (enabled only with texture)

### Timing Considerations
- Background init: Up to 10 seconds (10 retries × 1s delay)
- Forced sync: 3 seconds after stream creation
- Debounced updates: 500ms after last parameter change
