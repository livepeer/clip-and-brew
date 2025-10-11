# Daydream Realtime Streaming Integration

This document describes the Daydream realtime streaming integration in clip-and-brew.

## Overview

The app integrates Daydream's realtime video-to-video AI streaming using:
- **Stream Creation**: Server-side stream creation with the StreamDiffusion pipeline
- **WHIP Publishing**: In-browser WebRTC publishing from camera/microphone
- **WebRTC Playback**: Low-latency playback using Livepeer Player (WebRTC-only, no HLS fallback)
- **Prompt Updates**: Real-time AI effect control via StreamDiffusion prompts

## Security Model

🔒 **API keys are NEVER exposed to the client**

- `DAYDREAM_API_KEY` is stored in Supabase Edge Function secrets
- All Daydream API calls are proxied through server-side edge functions
- Client only receives stream metadata (id, playback_id, whip_url)

### Setting the API Key

```bash
# Set the secret in Supabase
supabase secrets set DAYDREAM_API_KEY=your-api-key-here

# Verify it's set (in Supabase dashboard or CLI)
supabase secrets list
```

## Architecture

### Server-Side (Supabase Edge Functions)

#### 1. `/functions/daydream-stream/index.ts`
Creates a new Daydream stream with the StreamDiffusion pipeline.

**Endpoint**: Called via `supabase.functions.invoke('daydream-stream', { body })`

**Request Body**:
```json
{
  "pipeline_id": "pip_qpUgXycjWF6YMeSL"  // Optional, defaults to StreamDiffusion
}
```

**Response**:
```json
{
  "id": "stream_abc123",
  "output_playback_id": "playback_xyz789",
  "whip_url": "https://api.daydream.live/whip/..."
}
```

#### 2. `/functions/daydream-prompt/index.ts`
Updates stream parameters for real-time AI effects using Daydream's PATCH endpoint.

**Endpoint**: Called via `supabase.functions.invoke('daydream-prompt', { body })`

**Request Body**:
```json
{
  "streamId": "stream_abc123",
  "params": {
    "model_id": "stabilityai/sdxl-turbo",
    "prompt": "cyberpunk portrait, neon lights",
    "negative_prompt": "blurry, low quality",
    "t_index_list": [6, 12, 18],
    "seed": 42,
    "num_inference_steps": 50,
    "controlnets": [
      {
        "model_id": "xinsir/controlnet-canny-sdxl-1.0",
        "preprocessor": "canny",
        "preprocessor_params": {},
        "conditioning_scale": 0.3
      }
      // ... more controlnets
    ]
  }
}
```

**Note**: The API expects `{params: {...}}` structure. Hot-swappable params (no reload): `prompt`, `num_inference_steps`, `t_index_list`, `seed`, `controlnets[*].conditioning_scale`.

### Client-Side

#### Core Helper: `/src/lib/daydream.ts`

Provides three main functions:

1. **`createDaydreamStream()`**
   - Creates a new stream via edge function
   - Returns `{ id, output_playback_id, whip_url }`

2. **`startWhipPublish(whipUrl, mediaStream)`**
   - Establishes WebRTC connection via WHIP protocol
   - Uses non-trickle ICE for compatibility
   - Returns RTCPeerConnection for cleanup

3. **`updateDaydreamPrompts(streamId, params)`**
   - Updates AI effects in real-time
   - Sends full StreamDiffusion params including controlnets
   - Uses `conditioning_scale: 0` to disable (not `enabled: false`)

#### UI Component: `/src/pages/Capture.tsx`

The main capture page implements:

1. **Camera Selection**: Front/back camera on mobile, auto-start on desktop
2. **Stream Initialization**: Creates stream and starts WHIP publishing
3. **WebRTC Playback**: Uses `@livepeer/react` Player with `lowLatency="force"`
4. **Real-time Controls**:
   - Prompt text input
   - Texture overlays with weight control
   - Creativity slider (affects t_index_list scaling)
   - Quality slider (controls number of inference steps)
5. **Recording**: Hold-to-record (3-10s) → Creates clip via Livepeer

## Key Implementation Details

### WHIP Publishing Flow

```typescript
// 1. Get user media
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'user', width: 512, height: 512 },
  audio: true
});

// 2. Create peer connection and add tracks
const pc = new RTCPeerConnection();
stream.getTracks().forEach(track => pc.addTrack(track, stream));

// 3. Create offer
await pc.setLocalDescription(await pc.createOffer());

// 4. Wait for ICE gathering to complete (non-trickle)
await new Promise(resolve => {
  pc.addEventListener('icegatheringstatechange', () => {
    if (pc.iceGatheringState === 'complete') resolve();
  });
});

// 5. POST offer SDP to WHIP endpoint
const response = await fetch(whipUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/sdp' },
  body: pc.localDescription.sdp
});

// 6. Set answer SDP
const answerSdp = await response.text();
await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
```

### WebRTC-Only Playback

Using iframe with Livepeer's `lvpr.tv` player and forced low-latency mode:

```tsx
<iframe
  src={`https://lvpr.tv/?v=${playbackId}&lowLatency=force`}
  className="w-full h-full border-0"
  allow="autoplay; encrypted-media; picture-in-picture"
  allowFullScreen
  title="Daydream Output"
/>
```

### StreamDiffusion Parameters

- **`t_index_list`**: Controls which diffusion steps to apply
  - Quality slider determines count: `[6]`, `[6,12]`, `[6,12,18]`, `[6,12,18,24]`
  - Creativity slider scales indices: `idx * (2.62 - 0.132 * creativity)`
  
- **`controlnets`**: Always included with `conditioning_scale: 0` when disabled
  - Prevents pipeline reloads when toggling effects
  - Supported: pose, soft_edge, canny, depth, color

- **`seed`**: Fixed at 42 for consistency (can be randomized per-session)

## Testing

### Manual Test Flow

1. **Start a stream**:
   ```
   Navigate to /capture
   → Camera permission granted
   → Stream created
   → Source video shows in PiP
   → AI output plays in main window
   ```

2. **Verify WebRTC playback**:
   ```
   Open browser DevTools → Network tab
   → Should see WebRTC connection (no HLS .m3u8 requests)
   → Player should show low latency (~500ms)
   ```

3. **Update prompts**:
   ```
   Change prompt text
   → Wait 500ms debounce
   → AI effect updates in output
   → Toast notification confirms
   ```

4. **Record a clip**:
   ```
   Hold record button
   → Red indicator shows duration
   → Release after 3-10s
   → Clip created and saved
   → Redirects to /clip/:id
   ```

### Troubleshooting

**Stream creation fails**:
- Verify `DAYDREAM_API_KEY` is set in Supabase secrets
- Check edge function logs: `supabase functions logs daydream-stream`

**WHIP publish fails**:
- Ensure camera permissions are granted
- Check browser WebRTC support
- Verify WHIP URL is valid

**Playback not working**:
- Verify iframe src URL is correct (`https://lvpr.tv/?v=${playbackId}&lowLatency=force`)
- Check browser console for CORS or iframe errors
- Ensure `allowFullScreen` and `allow` attributes are set on iframe
- Verify `playbackId` is correctly passed from stream creation

**Prompt updates not visible**:
- Check network tab for 200 response from edge function
- Verify `t_index_list` is calculated correctly
- Ensure `conditioning_scale` is set (not `enabled`)

## Environment Variables

**Client (.env.local)**:
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

**Server (Supabase Secrets)**:
```bash
DAYDREAM_API_KEY=your-daydream-api-key
LIVEPEER_API_KEY=your-livepeer-api-key  # For clipping
```

## Future Enhancements

- [ ] Canvas source support (vs camera-only)
- [ ] Service worker to extract `livepeer-playback-url` header
- [ ] Advanced controlnet toggles with conditioning_scale UI
- [ ] Weighted prompt blending (multiple prompts with weights)
- [ ] Pipeline parameter updates (width/height/acceleration)
- [ ] Session persistence and stream reconnection
- [ ] Multi-user rooms with SSE coordination

## References

- [Daydream API Docs](https://docs.daydream.live)
- [Livepeer Player Docs](https://docs.livepeer.org/sdks/react/Player)
- [WHIP Specification](https://www.ietf.org/archive/id/draft-ietf-wish-whip-01.html)
- [StreamDiffusion Paper](https://arxiv.org/abs/2312.12491)
