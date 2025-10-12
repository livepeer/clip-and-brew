# Brewdream (Realtime AI Video Summit)

Mobile-first microsite for the **Realtime AI Video Summit (Open Source AI Week)** by Livepeer/Daydream. Attendees scan a QR, create a short stylized clip via Daydream, share it, and get a coffee ticket. Home shows a square gallery of all clips. Branding from the Luma event page.

## Hard constraints

- **No client-side API keys.** All Daydream + Livepeer Studio calls go through **Supabase Edge Functions**. Secrets via `Deno.env.get`. CORS locked to our origin.
- **WebRTC only** for live playback (`lowLatency="force"`). **No HLS fallback** (HLS only as fallback for player, not for user selection).
- **In-browser WHIP publish** to Daydream's `whip_url` (mobile, with mic audio).
- **Clips must become Livepeer Studio Assets** (for gallery). Record browser video using `captureStream()` + `MediaRecorder`, then upload to Livepeer Studio.
- **Browser recording requirements**: Modern browsers with `HTMLMediaElement.captureStream()` and `MediaRecorder` support (Chrome/Edge/Firefox/Safari recent versions).

---

## User flow (mobile-first)

1. **Landing (branding)** → CTA “Create your Daydream clip”.
2. **Identity gate**
    - **Email** (OTP code), or **X/Twitter OAuth** (optional if trivial; otherwise require email). Persist login.
3. **Camera choice** (front/back) → only then request camera/mic permissions (privacy).
4. **Live screen (512×512 square)**
    - Main: **output** player (low-latency WebRTC). Bottom-right PiP: small **source preview** (square).
    - **Controls (v1 minimal):**
        - **Prompt** (placeholder shows default chosen randomly for front/back based on a list you create for this context; user can overwrite).
        - **Texture** (IP-Adapter single-select, 8 options + “No texture” which is default), **Weight** slider when enabled [0..1]. Clean UI ideally same line
        - **Creativity** [0..1] and **Quality** [0..1] → drives `t_index_list` (see mapping).
5. **Capture**
    - **Hold-to-record** from **3–10s**. On release, create a **Livepeer clip** (server-side) for that duration ending “now”. Show progress → success.
6. **Share**
    - Primary: **Share to X** (Twitter intent URL) with **link to clip page** in our gallery + default copy/hashtags.
7. **Coffee ticket**
    - After success → “Get coffee QR”. Show QR in-app and **email it** if we have user email.
8. **Gallery**
    - **Home = gallery** (square grid, latest first). Clip card opens its page (shareable URL).
    - Clips should have a dedicated page as well where they are played. Gallery shows thumbnails only like Instagram.
    - Gallery accessible without login

---

## Screens & components

- **/ (Gallery)**: Masonry or 3-col grid, square thumbnails, latest first.
- **/start**: branding (from Luma), CTA.
- **/login**: email OTP or X OAuth (optional).
- **/capture**: camera selector → live output + side source; controls; press-and-hold capture.
- **/clip/:id**: clip playback + Share. The QR code is only shown when the clip was just created/for the clip owner. Shows that the ticket was spent if such and doesn't show code or button
- **/ticket/:code**: ticket QR (also linked from email).

---

## Daydream / playback / clipping (tech choices)

- **Create stream** → get `{ id, output_playback_id, whip_url }` via **Edge Function** proxy call.
- **Publish** with **browser WHIP** to `whip_url`: `RTCPeerConnection`, add camera + mic tracks, **non-trickle** ICE (wait for ICE complete), then POST offer SDP (`content-type: application/sdp`), set remote answer. (If Daydream’s WHIP doesn’t require redirect, skip Livepeer “SDP host” preflight.)
- **Play output** with **Livepeer Player SDK v4** (`@livepeer/react/player`) set to **1:1 aspect** & `lowLatency=force`. **Must use Player component** (not iframe) because we need to capture the video element for recording.
- **Create clip** (browser + server): **Browser-side recording** using `HTMLMediaElement.captureStream()` + `MediaRecorder` API to record the rendered video output. Upload recorded blob to **Livepeer Studio** via:
    1. Request pre-signed upload URL via edge function
    2. PUT blob directly to upload URL
    3. Poll asset status until `ready` via edge function
    4. Store `asset.playbackId` and `asset.downloadUrl` in database
    **Note:** We record what's displayed on-screen (the AI output), not the original camera feed. This approach works for all browser/network conditions and captures the exact rendered frames.

---

## Controls → parameter mapping

- Should use an SDXL pipeline only, based on the default one
- **Prompt** → `params.prompt` (string).
- **Texture** → IP-Adapter (single):
    - Always have Ipadapters enabled in the params. You will only change the scale which should be 0 when disabled.
    - If a texture is selected, there also a 0-1 scale slider
- **Creativity / Quality → `t_index_list` (SDXL heuristic)**
    - `quality ∈ [0..1]` → **count** and **max index**:
        - low (<.25) → base `[6]`; mid (<.50) → `[6,12]`; high `(.75)`→ `[6,12,18]` ; super high →`[6,12,18,24]`
        - In between each range, increasing quality should scale the base proportionality until each index becomes the next multiple of 6. [E.g](http://E.gm). .5 should actually use [12,18] base (only >.5 becomes 3 indexes). It scales linearly from the [6,12] at ~.25
        - Defaults to 0.4
    - `creativity ∈ [1..10]` scales indices: `scale = 2.62 - 0.132*creativity` (higher creativity → lower indices). Defaults to 5
    - Final `t_index_list = round(base_i * scale)`, clamped `[0..50]`.
    - Rationale: higher/later indices bias refinement; earlier indices increase stylization. If any value invalid, fall back to `[4,12,20]`.
- **Other**: keep ControlNets enabled with **conditioning_scale** (use 0 to “disable”), never flip `enabled` (avoids reload). (Matches template guidance.). Keep default set to start with, hard coded, but should be easy to change.
- The created clips should also register the exact params that were used during the recording (both high-level app inputs and generated stream params from them)

---

## Defaults (front/back)

- **Front camera defaults (random one per session as placeholder):**
    - “studio ghibli portrait, soft rim light”, “cyberpunk neon portrait 90s anime”, “watercolor ink portrait, loose brush”.
- **Back camera defaults:**
    - “vaporwave cityscape”, “film noir scene, grainy”, “isometric tech poster, bold shapes”.
- Placeholder textures (8): `texture_{1..8}.jpg` (stub URLs); show thumb; apply preview only when selected; slider sets weight.

---

## Data model (Supabase Postgres)

- `users(id uuid pk, email text unique, twitter_handle text, created_at)`
- `sessions(id uuid pk, user_id fk, stream_id text, playback_id text, camera_type text, created_at)`
- `clips(id uuid pk, session_id fk, asset_playback_id text, asset_url text, prompt text, texture_id text, texture_weight float, t_index_list int[], duration_ms int, created_at)`
- `tickets(id uuid pk, session_id fk, code text unique, redeemed boolean default false, created_at)`

---

## Edge Functions (Supabase) — **no raw keys in client**

Secrets:

- `DAYDREAM_API_KEY`, `LIVEPEER_STUDIO_API_KEY`, (optional `RESEND_API_KEY` for email). Read via `Deno.env.get`.

Routes (prefix `/functions/v1`):

1. `POST /daydream-stream` → proxy → `https://api.daydream.live/v1/streams` (body: `{pipeline_id}`) → returns `{id, output_playback_id, whip_url}`.
2. `POST /daydream-prompt` → proxy → `POST /beta/streams/:id/prompts` (body: `{pipeline, model_id, params: {...}}`) - using deprecated but stable API.
3. `POST /studio-request-upload` → calls Livepeer **Request Upload** API → returns `{uploadUrl, assetId, tus}` (pre-signed upload URL).
4. `POST /studio-asset-status` → body `{ assetId }` → GET Livepeer asset status → returns `{status, playbackId, downloadUrl}`.
5. `POST /save-clip` → body `{ assetId, playbackId, downloadUrl, durationMs, session_id, prompt, texture_id, texture_weight, t_index_list }` → inserts into `clips` table → returns clip record.
6. `POST /generate-ticket` → create DB row + generate short code (e.g., base36 of uuid) → returns `{code, qrPngDataUrl}` (client renders QR).
7. `POST /send-auth-email` → send OTP via Resend; or rely on Supabase Auth magic links.*All functions set `verify_jwt: false` for public access with CORS.*

---

## Client implementation notes

- **Stack**: React + Vite. Mobile-first CSS.
- **Identity first** (overlay after stream kicked off is OK, but begin stream asap after camera pick to parallelize login).
- **Publish**: `getUserMedia({video:true,audio:true})` → WHIP negotiate to `whip_url`. If failed, show retry.
- **Playback**: Must use **Livepeer Player SDK v4** (`@livepeer/react/player`) with `lowLatency="force"`. Daydream playback IDs require manual src construction:
    ```typescript
    const src = [
      { src: `https://livepeer.studio/webrtc/${playbackId}`, mime: 'video/h264', type: 'webrtc' },
      { src: `https://livepeer.studio/hls/${playbackId}/index.m3u8`, mime: 'application/vnd.apple.mpegurl', type: 'hls' }
    ];
    ```
    **Note:** Cannot use iframe because we need DOM access to the `<video>` element for recording.
- **Capture UX**:
    - **Desktop**: Click to start, click to stop (toggle mode)
    - **Mobile**: Press and hold to record, release to stop
    - Button only enabled when video is actively playing (listen to `playing`/`pause`/`waiting` events)
    - Show real-time counter updating every 100ms during recording
    - Auto-stop at 10s, cancel if released before 3s
- **Recording**: `videoElement.captureStream()` → `MediaRecorder` with 100ms timeslice → collect chunks → create blob → upload to Livepeer Studio
- **Camera mirroring**: Mirror the MediaStream **at the source** (before Daydream) for front camera:
  - Original stream → Canvas with `scaleX(-1)` → `captureStream(30)` → Mirrored MediaStream
  - Send mirrored stream to Daydream via WHIP
  - Daydream output is naturally mirrored (no CSS transforms needed)
  - Keeps UI elements (loading spinners, text) readable
- **Share**: `https://twitter.com/intent/tweet?text=Made%20this%20at%20%23RealtimeAIVideo%20Summit%20by%20%40livepeer%20%40DaydreamLiveAI&url={clipPageUrl}`.
- **Ticket**: after clip save, call `/app/ticket` → show **QR** (code text as payload). Also email ticket link if email is known.
- **Home**: query latest `clips` with their `asset_playback_id` and show square thumbnails (use poster from Playback Info or `poster` param).
- **NSFW/safety**: keep Daydream moderation defaults on (do not disable).

---

## Acceptance criteria

- ✅ **Login** via email OTP; (X OAuth only if trivial; otherwise skip).
- ✅ **Camera selector** precedes permission prompt; both **camera + mic** used.
- ✅ **Live output** is visible in a **1:1** square with source mini-preview.
    - ✅ **Prompt**, **Texture + Weight**, **Creativity**, **Quality** controls work; params POST to Daydream promptly and don’t reload pipeline (use `conditioning_scale`=0 to “disable”).
- ✅ **Hold-to-record** (3–10s) creates a **Livepeer asset**; clip appears in gallery within ~seconds after ready.
- ✅ **Share to X** opens with default copy + link to the clip page.
- ✅ **Coffee QR** displays and can be scanned; code stored in DB.
- ✅ **Gallery** (home) shows latest clips grid; each clip opens with player.

---

## Red-team notes (bake in)

- WebRTC **force** can fail on hostile networks; keep a **clear retry** path (don’t fall back to HLS per spec).
- **Create Clip** timestamps: API examples assume HLS playhead; with WebRTC we approximate with `Date.now()`. If API rejects, fallback to fixed last-10s with a small negative offset; surface a toast if clipping not available.
- **WHIP**: wait for **ICE complete** before POST (non-trickle). If TURN is needed, expect higher latency; still OK.
- **Keys**: verify secrets are set in Supabase before first run; 500 with “Missing DAYDREAM_API_KEY/LIVEPEER_STUDIO_API_KEY” otherwise.

---

## Stubs the agent can fill

- **Textures**: put 8 placeholder images under `/public/textures/…`.
- **Default prompts lists** (front/back) as arrays in code; random pick on stream start; show as input placeholder.

---

## Edge Function Implementation Notes

All edge functions implemented in `supabase/functions/`. Key patterns:
- CORS headers for all functions
- `verify_jwt: false` in config for public access
- Bearer token auth for external APIs
- Error handling with descriptive messages
- See actual implementations in codebase for complete examples

---

## Dev notes

- Player square: `aspectRatio="1to1"` + `objectFit="cover"` (if using React Player).
- Force WebRTC: `lowLatency="force"` (or `&lowLatency=force` for lvpr.tv).
- In-browser broadcast (WHIP flow): follow Livepeer WHIP steps (non-trickle ICE, POST SDP, set remote).
- Secrets: set with `supabase secrets set`.

---
