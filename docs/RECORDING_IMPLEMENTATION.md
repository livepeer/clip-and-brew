# Press-and-Hold Recording Implementation

This document describes the implementation of press-and-hold recording with Livepeer Studio Asset upload and database persistence.

## Overview

The recording feature allows users to capture the Daydream output stream by pressing and holding a button. When released, the captured video is:
1. Uploaded to Livepeer Studio as an Asset
2. Processed and made ready for playback
3. Saved to the database for gallery display

## Architecture

### Client-Side Components

#### 1. **Livepeer Player SDK Integration** (`src/pages/Capture.tsx`)
- Replaced iframe with Livepeer Player SDK to enable `captureStream()` API
- Uses `@livepeer/react/player` for low-latency WebRTC playback
- Player renders in same-origin context, allowing MediaRecorder access

```tsx
<Player.Root src={getSrc(playbackId)} autoPlay muted>
  <Player.Container>
    <Player.Video className="w-full h-full object-cover" />
  </Player.Container>
</Player.Root>
```

#### 2. **Recording Utility** (`src/lib/recording.ts`)
- **VideoRecorder class**: Manages MediaRecorder lifecycle
  - Captures stream from video element using `captureStream()`
  - Supports WebM/VP9/Opus with fallback to VP8
  - Buffers chunks in memory with 100ms timeslice
  - Returns blob with duration on stop

- **uploadToLivepeer function**: Handles upload workflow
  1. Requests upload URL from server
  2. PUTs blob to Livepeer Studio
  3. Polls asset status until ready
  4. Returns playback metadata

- **saveClipToDatabase function**: Persists clip metadata
  - Auto-generates clip name with timestamp
  - Stores prompt, texture, and stream params
  - Links to session for gallery display

#### 3. **Press-and-Hold UI**
- Uses `onPointerDown`/`onPointerUp` for cross-device support
- Shows recording timer while held
- Handles `onPointerLeave` to stop if user drags off button
- Displays warning if `captureStream` not supported
- Button text: "Hold to Brew"

### Server-Side Components (Supabase Edge Functions)

#### 1. **studio-request-upload** (`supabase/functions/studio-request-upload/index.ts`)
- **Purpose**: Request upload URL from Livepeer Studio
- **Auth**: Uses `LIVEPEER_STUDIO_API_KEY` env var (server-side only)
- **Returns**: `{ uploadUrl, assetId, tus? }`
- **API**: `POST https://livepeer.studio/api/asset/request-upload`

```typescript
// Client usage
const { data } = await supabase.functions.invoke('studio-request-upload');
// Returns: { uploadUrl, assetId }
```

#### 2. **studio-asset-status** (`supabase/functions/studio-asset-status/index.ts`)
- **Purpose**: Check asset processing status
- **Input**: `{ assetId }`
- **Returns**: `{ status, playbackId, downloadUrl, ... }`
- **Polling**: Client polls every 2s until status is "ready"

```typescript
// Client usage
const { data } = await supabase.functions.invoke('studio-asset-status', {
  body: { assetId }
});
// Returns: { status: 'ready', playbackId, downloadUrl }
```

#### 3. **save-clip** (`supabase/functions/save-clip/index.ts`)
- **Purpose**: Save clip metadata to database
- **Auth**: Uses Supabase auth from request headers
- **Input**: `{ assetId, playbackId, downloadUrl, durationMs, session_id, prompt, texture_id, texture_weight, t_index_list }`
- **Returns**: Saved clip record

```typescript
// Client usage
const { data: clip } = await supabase.functions.invoke('save-clip', {
  body: {
    assetId,
    playbackId,
    downloadUrl,
    durationMs,
    session_id,
    prompt,
    texture_id,
    texture_weight,
    t_index_list
  }
});
```

## Recording Flow

### 1. User Presses Button
```
onPointerDown → startRecording()
  ↓
Get video element from playerContainerRef
  ↓
Check if captureStream() supported
  ↓
Create VideoRecorder instance
  ↓
Start MediaRecorder with WebM/Opus
  ↓
Set recording state & start timer
```

### 2. User Releases Button
```
onPointerUp → stopRecording()
  ↓
Stop MediaRecorder & get blob
  ↓
Request upload URL (studio-request-upload)
  ↓
PUT blob to Livepeer Studio
  ↓
Poll asset status until ready
  ↓
Save clip metadata to database
  ↓
Navigate to clip view page
```

### 3. Error Handling
- **No captureStream support**: Shows warning, disables button
- **Upload fails**: Shows error toast, keeps user on page
- **Asset timeout**: Fails after 60 attempts (2 minutes)
- **Database error**: Shows error, allows retry

## Environment Setup

### Required Secrets (Supabase Edge Functions)
```bash
# Set using Supabase CLI
supabase secrets set LIVEPEER_STUDIO_API_KEY=your_api_key_here

# Or via Supabase Dashboard → Edge Functions → Secrets
```

### Client Environment
No client-side API keys needed. All Livepeer API calls are proxied through Edge Functions.

## Browser Compatibility

### Supported
- ✅ Chrome/Edge (desktop & mobile)
- ✅ Firefox (desktop & mobile)
- ✅ Safari 14.1+ (desktop & iOS)

### Canvas-Based Recording
**Consistent Implementation**: VideoRecorder always uses canvas-based recording for consistency across all browsers:
1. Creates an offscreen canvas matching the video dimensions (512×512)
2. Copies video frames to canvas using `requestAnimationFrame` at 30fps
3. Captures the canvas stream using `canvas.captureStream(30)`
4. Extracts and includes audio tracks from the video's MediaStream

**Why canvas instead of direct video captureStream?**
- Works reliably across ALL browsers including Safari/iOS
- Provides consistent behavior (no browser-specific code paths)
- Simpler, more maintainable code
- Negligible performance overhead at 512×512 resolution

### Known Limitations
- ❌ Older iOS versions (<14.1): `captureStream()` not supported even on canvas
- ⚠️ Cross-origin iframes: Cannot capture, must use Player SDK

## Security

### API Key Protection
- ✅ `LIVEPEER_STUDIO_API_KEY` stored in Supabase Edge Function secrets
- ✅ Never exposed to client
- ✅ All Livepeer API calls server-side

### Upload Security
- ✅ Upload URLs are signed and time-limited by Livepeer
- ✅ Client only receives pre-signed PUT URL
- ✅ No direct API access from browser

## Database Schema

### clips table
```sql
- id: uuid (primary key)
- session_id: uuid (foreign key → sessions)
- asset_playback_id: text (Livepeer playback ID)
- asset_url: text (download URL, nullable)
- prompt: text
- duration_ms: integer
- texture_id: text (nullable)
- texture_weight: numeric (nullable)
- t_index_list: integer[] (nullable)
- created_at: timestamp
```

## Testing

### Manual Testing Checklist
1. ✅ Start capture stream
2. ✅ Press and hold "Hold to Brew" button
3. ✅ See recording timer increment
4. ✅ Release button
5. ✅ See "Processing..." toast
6. ✅ Wait for upload (few seconds)
7. ✅ Navigate to clip view
8. ✅ Verify clip plays in gallery

### Error Cases to Test
- Press/release very quickly (< 1s)
- Hold for very long time (> 60s)
- Network interruption during upload
- Missing environment variable
- Browser without captureStream support

## Future Enhancements

### Potential Improvements
1. **TUS Upload**: Implement resumable uploads for large files
2. **Progress Indicator**: Show upload progress percentage
3. **Clip Trimming**: Allow start/end point selection
4. **Max Duration**: Enforce clip length limits
5. **Compression**: Client-side video compression before upload
6. **Thumbnails**: Extract thumbnail from clip for gallery
7. **Server-side Recording**: Fallback for browsers without captureStream

## Troubleshooting

### "Recording not supported" error
- Ensure using Livepeer Player SDK, not iframe
- Check browser version (Safari 14.1+, Chrome 51+)
- Verify HTTPS (required for captureStream)

### Upload fails
- Check `LIVEPEER_STUDIO_API_KEY` is set in Supabase secrets
- Verify Livepeer Studio account has upload quota
- Check network connectivity

### Asset stuck in processing
- Typical processing: 5-30 seconds
- Check Livepeer Studio dashboard for asset status
- Verify asset ID in Edge Function logs

### Clip not in gallery
- Check `save-clip` function succeeded
- Verify session_id exists in database
- Check user permissions for clips table

## Dependencies

### NPM Packages
```json
{
  "@livepeer/react": "^4.x" // Livepeer Player SDK
}
```

### Supabase Edge Function Dependencies
```typescript
import { createClient } from '@supabase/supabase-js@2'
```

## References

- [Livepeer Studio API Docs](https://docs.livepeer.org/api-reference/asset/upload)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [HTMLMediaElement.captureStream()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/captureStream)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
