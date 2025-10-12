# VIBEME.md - Brewdream Project Context

> **Purpose**: High-level context for AI agents. Read this first to understand the project's architecture, patterns, and conventions before making changes.
>
> **Related Documents**:
> - [`PRD.md`](./PRD.md) - Product vision, requirements, and acceptance criteria (the "what" and "why")
> - **VIBEME.md** (this file) - Current implementation state, patterns, and conventions (the "how")
> - [`docs/`](./docs/) - Detailed implementation guides and API references

## 🚀 TL;DR - Start Here

**What is this?** Mobile event app for AI-stylized video clips at Livepeer × Daydream Summit

**Tech Stack**: React + TypeScript + Supabase + Daydream AI + Livepeer

**Core Flow**: Camera → Daydream AI (real-time effects) → Livepeer (streaming/clipping) → Share on X → Coffee ticket

**Key Files to Know**:
- `src/lib/daydream.ts` - Stream creation & AI effects
- `src/lib/recording.ts` - Video capture & upload
- `src/pages/Capture.tsx` - Main UI orchestration
- `supabase/functions/` - API proxies (no client-side keys!)

**Need Details?** Check the Quick Navigation Guide below or `docs/` folder

---

## 📖 How to Use This Document

**VIBEME Philosophy**:
- **Stay Concise**: Focus on high-level overview, not implementation details
- **Preserve Intent**: Document historical decisions and quirks so they're not forgotten
- **Point to Details**: Reference specific docs in `docs/` folder for deep-dives
- **Map the Territory**: Clearly outline project structure so agents know where to look

**When making changes**:
1. Read this file first for overall context
2. Check `docs/` folder for detailed guides on specific features
3. Update VIBEME only for architectural changes, not implementation details
4. Add new detailed docs to `docs/` folder, not here

### Quick Navigation Guide

| **Looking for...** | **Go to...** |
|-------------------|-------------|
| Overall architecture | This file (VIBEME.md) |
| Product requirements | `PRD.md` |
| Daydream API details | `docs/DAYDREAM_API_GUIDE.md` |
| WHIP/WebRTC setup | `docs/DAYDREAM_INTEGRATION.md` |
| Recording/upload flow | `docs/RECORDING_IMPLEMENTATION.md` |
| Auth implementation | `docs/ANONYMOUS_AUTH.md` |
| Core stream logic | `src/lib/daydream.ts` |
| Core recording logic | `src/lib/recording.ts` |
| Main capture UI | `src/pages/Capture.tsx` |
| Edge functions | `supabase/functions/` |
| Database schema | `supabase/migrations/` |

## 🎯 Project Mission

**Brewdream** (aka "Realtime AI Video Summit") is a mobile-first microsite for the Livepeer × Daydream Summit during Open Source AI Week. Attendees scan a QR code, create AI-stylized video clips (3-10s) using real-time AI effects, share them on X (Twitter), and receive coffee tickets as rewards.

## 🏗️ Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui component library
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Video**: WebRTC (camera) → Daydream AI (effects) → Livepeer (streaming/clipping)
- **Auth**: Supabase Auth with email OTP (magic links)

## 📐 Architecture Overview

```
User Flow:
1. Landing → Login (email OTP) → Capture → ClipView
2. Gallery (home) shows all created clips

Video Pipeline:
Camera → WebRTC → Daydream Stream (AI effects) → Livepeer (HLS playback)
                                                 ↓
                                            Clip creation (3-10s)
                                                 ↓
                                            Share + Coffee Ticket
```

## 🗂️ Project Structure

**Frontend (`src/`)**:
- `pages/` - Route components (Capture, ClipView, Index, NotFound)
- `components/` - Reusable UI (Gallery, Landing, Login) + shadcn/ui library
- `lib/` - **Core utilities** (where the magic happens):
  - `daydream.ts` - Stream creation, WHIP publishing, prompt updates
  - `recording.ts` - Video capture, upload, database save
- `integrations/supabase/` - Database client & generated types
- `hooks/` - React hooks (use-mobile, use-toast)

**Backend (`supabase/`)**:
- `functions/` - **Edge Functions** (API proxy - no client-side keys):
  - `daydream-stream/` - Create AI stream (proxies Daydream API)
  - `daydream-prompt/` - Update effects (proxies Daydream API)
  - `studio-request-upload/` - Get upload URL (proxies Livepeer API)
  - `studio-asset-status/` - Poll asset status (proxies Livepeer API)
  - `save-clip/` - Save clip to database
  - `generate-ticket/`, `redeem-ticket/` - Coffee ticket system
  - `send-auth-email/` - Custom OTP emails
- `migrations/` - Database schema (users, sessions, clips, tickets)

**Documentation (`docs/`)**:
- `DAYDREAM_API_GUIDE.md` - Comprehensive Daydream API reference
- `DAYDREAM_INTEGRATION.md` - Integration overview
- `RECORDING_IMPLEMENTATION.md` - Video capture/upload details
- `ANONYMOUS_AUTH.md` - Auth flow documentation

## 🎨 Design System

**Theme**: Dark mode with vibrant gradients
- **Primary**: Purple (`hsl(280 100% 70%)`) - main brand color
- **Accent**: Cyan (`hsl(180 100% 50%)`) - secondary highlights
- **Accent Pink**: (`hsl(330 100% 70%)`) - tertiary accents
- **Background**: Near-black (`hsl(240 10% 3.9%)`)

**Visual Language**:
- Rounded corners (`--radius: 1rem`)
- Glow effects on primary elements (`--shadow-glow`)
- Gradient text for headings (`.gradient-text`)
- Smooth transitions (`--transition-smooth`)
- Square aspect ratios for video (512x512)

**Custom Classes** (defined in `src/index.css`):
- `.gradient-text` - Primary gradient text
- `.glow-primary` - Primary glow effect
- `.glow-strong` - Stronger glow
- `.transition-smooth` - Smooth cubic-bezier transitions

## 🔑 Key Concepts

### Hard Constraints (from PRD)
These are **non-negotiable** technical requirements:
- ✅ **No client-side API keys** - All Daydream/Livepeer calls via Supabase Edge Functions
- ✅ **WebRTC only** - Force low-latency mode (`lowLatency=force`), no HLS fallback
- ✅ **Browser WHIP publish** - Direct WebRTC to Daydream's `whip_url` (camera + mic)
- ✅ **Clips must be Livepeer Assets** - Use Create Clip API from playbackId
- ✅ **Mobile-first** - Primary target is event attendees on phones
- ✅ **Square aspect ratio** - 512×512 for all video (Daydream pipeline requirement)

### Database Schema
**4 main tables** (see `supabase/migrations/*.sql`, matches PRD data model exactly):
1. **users**: Email, twitter_handle (OTP auth)
2. **sessions**: Links user to stream (stream_id, playback_id, camera_type)
3. **clips**: Video clips with AI metadata (prompt, texture_id, texture_weight, t_index_list, duration_ms)
4. **tickets**: Coffee QR codes (code, redeemed flag)

**RLS Policies**: Public read for clips/sessions, authenticated write, users own their tickets

### Video Processing Flow

**High-Level Pipeline**:
1. **Stream Creation** → Edge function creates Daydream stream (`pip_SDXL-turbo`)
2. **WHIP Publishing** → Browser sends camera/mic to Daydream via WebRTC
3. **AI Processing** → Daydream applies effects in real-time
4. **Playback** → Livepeer Player shows output (WebRTC-only, low-latency)
5. **Recording** → Capture rendered video, upload to Livepeer, save to DB

**Key Implementation Files**:
- `src/lib/daydream.ts` - Stream creation, WHIP, prompt updates
- `src/pages/Capture.tsx` - UI orchestration
- `supabase/functions/daydream-*` - API proxies

**AI Controls**:
- **Prompt**: Text style description
- **Texture**: Optional overlay (8 presets)
- **Creativity** (1-10): Controls diffusion strength via `t_index_list` scaling
- **Quality** (0-1): Number of inference steps (0.25=1, 1.0=4)

**Critical Quirks**:
- Daydream playback IDs need manual src construction (not `getSrc()`)
- Front camera mirroring at source (canvas `scaleX(-1)`) before WHIP
- WebRTC-only playback (`lowLatency=force`)

**Detailed Guides**:
- [`docs/DAYDREAM_INTEGRATION.md`](./docs/DAYDREAM_INTEGRATION.md) - WHIP, WebRTC, playback setup
- [`docs/DAYDREAM_API_GUIDE.md`](./docs/DAYDREAM_API_GUIDE.md) - Full API reference

**Recording → Share Flow** (see [`docs/RECORDING_IMPLEMENTATION.md`](./docs/RECORDING_IMPLEMENTATION.md) for details):
- Capture video → Upload to Livepeer → Save metadata → Navigate to clip page
- Share to X/Twitter → Generate coffee ticket → Interactive swipe-to-redeem

### Authentication Flow

Two modes: **Anonymous** (instant access) + **Email OTP** (for coffee tickets)

**Quick Summary**:
- Anonymous: One-click → instant access → optional email later
- Email OTP: Magic link with 6-digit code verification
- Sessions persist in localStorage

**Details**: See [`docs/ANONYMOUS_AUTH.md`](./docs/ANONYMOUS_AUTH.md) for flows, migration details, and implementation

### Routing

```typescript
/ (root)         → Gallery (all clips)
/start          → Landing (marketing page)
/login          → Login (email OTP)
/capture        → Capture (camera + AI controls)
/clip/:id       → ClipView (playback + share + ticket)
```

## 🛠️ Development Patterns

### Component Patterns
- **Functional components** with hooks (no class components)
- **shadcn/ui** for all UI primitives (button, input, dialog, etc.)
- **Controlled components** for forms (useState + onChange)
- **useEffect** for side effects (auth check, data loading, debouncing)

### State Management
- **Local state**: `useState` for component state
- **Server state**: Direct Supabase queries (no React Query usage despite being installed)
- **Refs**: For video elements and WebRTC connections

### Naming Conventions
- Components: `PascalCase` (e.g., `Gallery.tsx`)
- Files: `PascalCase` for components, `kebab-case` for utilities
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE` (e.g., `FRONT_PROMPTS`)
- CSS classes: `kebab-case` with Tailwind

### Error Handling
- Try/catch with toast notifications
- Console logging for debugging
- Graceful degradation (loading states, empty states)

### TypeScript Usage
- **Relaxed config** (`strict: false`, `noImplicitAny: false`)
- Types for props, state, and Supabase data
- `any` allowed for quick iteration
- Generated types from Supabase schema (`types.ts`)

## 🔌 External APIs

**Daydream API** (AI streaming):
- Base: `https://api.daydream.live`
- Endpoints: `POST /v1/streams`, `PATCH /v1/streams/:id`
- All calls proxied through edge functions (key never exposed)

**Livepeer Studio API** (clip upload):
- Base: `https://livepeer.studio/api`
- Endpoints: Upload, asset status, playback
- All calls proxied through edge functions

**Supabase Edge Functions**:
- All have `verify_jwt: false` (public access for event simplicity)
- CORS enabled
- Service role key for DB operations

**API Details**: See [`docs/DAYDREAM_API_GUIDE.md`](./docs/DAYDREAM_API_GUIDE.md) for comprehensive API reference

## 🎮 User Interactions

### Camera Selection (Capture.tsx)
- **Front camera**: Selfie mode, 14 portrait prompts including:
  - Classic styles (Ghibli, anime, watercolor, oil painting, ukiyo-e)
  - Digital effects (holographic, glitch art, VHS, neon wireframe, pixel art)
  - Psychedelic/trippy (kaleidoscope, cosmic deity, stained glass)
- **Back camera**: Environment mode, 15 scene prompts including:
  - Retro aesthetics (vaporwave, synthwave, vintage comic, film noir)
  - Surreal/artistic (dreamscape, abstract expressionism, M.C. Escher)
  - Nature/tech fusion (underwater bioluminescent, cyberpunk, aurora borealis)
  - Geometry (isometric, low poly, mandala, sacred geometry)
- Randomly assigns prompt based on camera type on stream start

### Recording Mechanics
- **Platform-specific UX**: Desktop (click toggle) vs Mobile (press & hold)
- **Duration enforcement**: 3-10s (auto-stop at 10s, cancel if <3s)
- **Real-time feedback**: Counter updates every 100ms, button states reflect stream status
- **What gets recorded**: AI-processed output from Livepeer Player (not original camera feed)
- **How**: `videoElement.captureStream()` → `MediaRecorder` → WebM blob

**Full Details**: See [`docs/RECORDING_IMPLEMENTATION.md`](./docs/RECORDING_IMPLEMENTATION.md)

### Prompt Customization
- **Debounced updates**: 500ms delay on input change
- **Auto-apply**: Changes trigger immediate stream update
- **Texture overlay**: Optional, 8 presets, weight slider (0-1)
- **Creativity/Quality**: Abstract sliders that map to diffusion parameters

### Ticket Redemption (ClipView.tsx)
- **Interactive validation**: Bartender swipes down on user's phone to redeem
- **UX Flow**:
  - First-time modal explains process (localStorage: `brewdream_ticket_instructions_seen`)
  - Always-visible instruction: "Show this ticket to the bartender"
  - 5-second lock on initial display (prevents accidental swipes)
  - Swipeable card with drag threshold (100px)
  - Visual feedback: Opacity/scale transforms, bouncing indicator
  - Redemption: Animates away, calls edge function, shows success toast
- **States**:
  - **Active**: Ticket code displayed with gradient text, swipe enabled after lock
  - **Locked**: First 5 seconds, shows spinner, swipe disabled
  - **Redeemed**: Checkmark icon, grayed out, "Create New Clip" button
- **Tech**: Framer Motion drag API, useMotionValue/useTransform for animations

## 🎨 Styling Philosophy

### Tailwind First
- Utility classes in JSX (no separate CSS files except index.css)
- `cn()` helper for conditional classes (clsx + tailwind-merge)
- Responsive design with `md:` breakpoints

### Component Styling
- **Cards**: Rounded-3xl borders with subtle glows
- **Buttons**: Rounded-full for CTAs, rounded-md for utilities
- **Inputs**: Rounded-md, border-border, bg-card/background
- **Videos**: Square aspect ratio, rounded-3xl overflow-hidden

### Animations
- `transition-smooth` class for interactions
- Pulse animations for recording state
- Spin for loading states (Loader2 component)
- Scale on hover (1.05) for CTAs

## 📦 Dependencies Philosophy

### Installed vs Used
- **React Query**: Installed but not used (direct Supabase calls preferred)
- **shadcn/ui**: ~50 components installed, only ~10 actively used
- **Keep installed**: Allows quick iteration without npm install

### Version Strategy
- Latest stable versions (^X.Y.Z)
- React 18 ecosystem
- TypeScript 5.8+
- Vite 5.4+

## 🔐 Environment Variables

Required in `.env.local` (Vite):
```
VITE_SUPABASE_URL=https://....supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
```

Required in Supabase (Edge Functions):
```
DAYDREAM_API_KEY=dd_...
LIVEPEER_STUDIO_API_KEY=...
RESEND_API_KEY=re_...
SEND_EMAIL_HOOK_SECRET=...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
```

## 🚀 Deployment Context

- **Platform**: Lovable.dev (main deployment)
- **Build**: `npm run build` → `dist/`
- **Dev**: `npm run dev` → localhost:8080
- **Preview**: `npm run preview`

## 🧩 Code Patterns to Follow

### Adding a New Page
1. Create component in `src/pages/NewPage.tsx`
2. Add route in `src/App.tsx`
3. Use existing UI components from `@/components/ui`
4. Follow dark theme color scheme

### Adding a New API Call
1. Create edge function in `supabase/functions/name/`
2. Add to `supabase/config.toml` with `verify_jwt: false`
3. Call via `supabase.functions.invoke('name', { body: {...} })`
4. Add CORS headers to function

### Updating Database Schema
1. Create migration in `supabase/migrations/`
2. Run `supabase db push` (or apply via Supabase dashboard)
3. Regenerate types: `supabase gen types typescript`
4. Update `src/integrations/supabase/types.ts`

### Adding UI Components
- Use shadcn/ui CLI: `npx shadcn@latest add [component]`
- Components go to `src/components/ui/`
- Import and use with custom classes

### Recording Implementation Pattern

**Core Flow**: `VideoRecorder` class → Livepeer upload → Database save

```typescript
// Quick example (see docs/RECORDING_IMPLEMENTATION.md for full details)
const recorder = new VideoRecorder(videoElement);
await recorder.start();
const { blob, durationMs } = await recorder.stop();
const { assetId, playbackId } = await uploadToLivepeer(blob);
await saveClipToDatabase({ assetId, playbackId, ... });
```

**Key Quirks**:
- Uses `captureStream()` on `<video>` element (not iframe - Livepeer Player renders to video)
- Front camera mirroring at source (canvas-based) before Daydream, not CSS
- Records AI output, not camera feed
- Desktop: click-toggle, Mobile: press-hold (UX choice)

**Full Documentation**: See [`docs/RECORDING_IMPLEMENTATION.md`](./docs/RECORDING_IMPLEMENTATION.md)

## 🎯 Key Business Logic

### T-Index Calculation (Creativity/Quality)
**Matches PRD § "Controls → parameter mapping"**

```typescript
// Quality [0..1] determines number of diffusion steps (defaults to 0.4)
quality < 0.25 → [6]              (1 step, fastest)
quality < 0.50 → [6, 12]          (2 steps)
quality < 0.75 → [6, 12, 18]      (3 steps)
quality ≥ 0.75 → [6, 12, 18, 24]  (4 steps, best quality)

// Creativity [1..10] scales the indices (defaults to 5)
// Higher creativity → lower indices → more stylization
scale = 2.62 - 0.132 * creativity
t_index = base_index * scale (clamped 0-50, rounded)

// Rationale (from PRD):
// - Higher/later indices bias refinement
// - Earlier indices increase stylization
// - Fallback: [4, 12, 20] if any value invalid
```

### Clip Duration Enforcement
- UI: 3-10s range enforced by hold button
- Database: CHECK constraint (3000-10000 ms)
- Backend: Clamping in `stopRecording()`

### Ticket Generation & Redemption
- **Format**: Random base36 string (8 chars, uppercase)
- **QR Data**: `DD-COFFEE-{code}`
- **Generation**: One ticket per session (linked to session_id)
- **Redemption Flow**:
  1. User generates ticket → confetti + first-time instructions modal (if needed)
  2. 5-second lock activates (shows "Please wait..." indicator)
  3. Lock expires → "Swipe down to redeem" with animated indicator
  4. Bartender swipes down 100px+ on user's phone
  5. Calls `redeem-ticket` edge function → updates `redeemed` field
  6. Shows "Already Redeemed" state with CTA to create new clip
- **Safety**: 5-second lock prevents accidental swipes; bartender validates visually

## 🔄 State Flow Examples

### Capture Flow State
```
Initial: cameraType=null (camera selection screen)
  ↓ selectCamera('front'|'back')
Loading: initializing stream
  ↓ startWebRTCPublish()
Ready: playbackId set, showing AI output
  ↓ startRecording() (hold button)
Recording: recordStartTime set, counter running
  ↓ stopRecording() (release button)
Processing: creating clip via Livepeer
  ↓ navigate to /clip/:id
```

### Prompt Update Flow
```
User types → 500ms debounce → Edge function → Daydream API → Video effect changes
```

**Key Timing**:
- 3-second initialization window blocks updates (prevents race with background init)
- After 3s: forced sync ensures UI state matches stream state
- Debounced updates prevent API spam

**Details**: See [`docs/DAYDREAM_INTEGRATION.md`](./docs/DAYDREAM_INTEGRATION.md) for timing diagrams

## 🎨 UI/UX Patterns

### Loading States
- **Spinner**: `<Loader2 className="animate-spin" />` for async operations
- **Skeleton**: Pulse animation for loading content
- **Disabled buttons**: During loading with loader icon

### Empty States
- Gallery: "No clips yet" with CTA button
- Clear messaging with next action

### Error Handling
- Toast notifications (bottom-right)
- Destructive variant for errors
- Console logging for debugging

### Responsive Design
- Mobile-first approach
- `md:` breakpoints for desktop enhancements
- Touch-friendly targets (min 44px)

## 🔧 Common Operations

### Reading Supabase Data
```typescript
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('id', id)
  .single();
```

### Calling Edge Functions
```typescript
const { data, error } = await supabase.functions.invoke('function-name', {
  body: { key: 'value' }
});
```

### Toast Notifications
```typescript
toast({
  title: 'Success!',
  description: 'Operation completed',
  variant: 'destructive' // optional, for errors
});
```

### Navigation
```typescript
// Declarative
<Link to="/path">Link</Link>

// Programmatic
navigate('/path');
```

## 🚨 Critical Constraints

1. **Video Resolution**: 512x512 (square) - hardcoded for Daydream pipeline
2. **Clip Duration**: 3-10 seconds (UI + DB constraints)
3. **Camera Types**: Only 'front' | 'back' (no custom options)
4. **Public Access**: All RLS policies allow public reads for clips/sessions
5. **No Auth Required**: Edge functions have `verify_jwt: false` for simplicity
6. **Single Stream**: User can only have one active stream at a time
7. **Browser Recording**: Requires `captureStream()` support (Chrome/Edge/Firefox/Safari modern versions)
8. **Video Element Access**: Must use Livepeer Player component (not iframe) for recording

## 🐛 Known Issues & Workarounds

> **Note**: This section preserves historical context about quirks and decisions. For current implementation details, see `docs/` folder.

### Stream Not Ready on Initialization (✅ RESOLVED)
**The Problem**: Stream creation → immediate param update = "Stream not ready yet" error → black screen

**Why It Happened**: Daydream API's `POST /v1/streams` only accepts `pipeline_id`. Params must come via separate `PATCH` after initialization window.

**The Fix**: Edge function handles retry logic server-side (10 retries @ 1s intervals) + non-blocking background param update

**Current Behavior**: Camera shows immediately (~2-3s), params apply in background. No user-facing errors.

**Details**: See `supabase/functions/daydream-stream/index.ts` and [`docs/DAYDREAM_INTEGRATION.md`](./docs/DAYDREAM_INTEGRATION.md)

### Camera Mirroring (✅ RESOLVED)
**Why**: Front camera should show "mirror" view (natural selfie mode)

**The Fix**: Mirror at source, not CSS - Canvas `scaleX(-1)` → `captureStream()` → send mirrored stream to Daydream

**Why Not CSS**: Keeps loading spinners/text readable, recording captures correctly, consistent across browsers

### ICE Gathering Delay (✅ RESOLVED)
**The Problem**: WHIP took 40+ seconds to start (single STUN server timeout)

**The Fix**: Multiple STUN servers + 2-second timeout + `iceCandidatePoolSize: 3`

**Current Behavior**: WHIP starts in ~2-3 seconds

**Details**: See `src/lib/daydream.ts`

### Daydream Playback IDs Not Recognized
**The Problem**: Livepeer's `getSrc()` helper doesn't recognize Daydream playback IDs

**The Workaround**: Manually construct src array (see `src/pages/Capture.tsx`)

**Why**: Daydream uses custom playback ID format not in Livepeer's registry

### Missing Edge Function Configs (✅ RESOLVED)
**The Problem**: Edge functions returned 404s

**The Fix**: Added missing functions to `supabase/config.toml` with `verify_jwt = false`

### Video `object-fit: cover` Issues (✅ RESOLVED)
**The Problem**: Video wouldn't fill square container properly

**The Fix**: CSS targeting Livepeer Player internal elements (resolved by peer)

### Params Updating Logic Bugs (✅ RESOLVED)
**The Problems**:
1. Stream started with wrong prompt (default psychedelic, not camera selection)
2. Random loading states (Daydream model reloads)
3. Wrong pipeline nodes (non-SDXL)

**Root Causes**:
- `POST /v1/streams` only accepts `pipeline_id` (no params)
- Wrong pipeline_id used
- `model_id` must ALWAYS be in param updates (else Daydream reloads default)
- `ip_adapter` must ALWAYS be specified (even if disabled)

**The Fix**:
- Use correct pipeline: `pip_SDXL-turbo`
- Use correct endpoint: `PATCH /v1/streams/:id` with `{params: {...}}`
- Always include `model_id` and `ip_adapter` in updates
- Initialize params immediately after stream creation

**Current Behavior**: Stream starts with correct prompt, no spurious reloads

**Critical Pattern**: See code comments in `src/lib/daydream.ts` - always include `model_id` in updates!

## 📝 Coding Conventions

### TypeScript
- Types are **guides, not gates** (strict mode disabled)
- Use `any` for quick iteration, refine later if needed
- Interface for component props, type for data models
- Generated types from Supabase are source of truth

### React Patterns
- Functional components only (no classes)
- Hooks for state and effects
- Avoid premature optimization
- Keep components flat (minimal nesting)

### File Organization
- One component per file
- Co-locate related utilities
- Index exports for public APIs
- Keep shadcn/ui components unmodified

### CSS
- Tailwind utilities inline
- CSS variables for design tokens
- Avoid custom CSS files
- Use `cn()` for conditional classes

## 🔄 Update Triggers

**Update VIBEME.md when**:
- [ ] New major features (e.g., add recording playback)
- [ ] Architecture changes (e.g., add state management library)
- [ ] New API integrations (e.g., add payment system)
- [ ] Database schema changes (new tables/fields)
- [ ] Design system updates (new colors, patterns)
- [ ] Workflow changes (new user flows)
- [ ] Project structure changes (new folders/modules)

**Create a doc in `docs/` when**:
- [ ] Implementing complex feature (step-by-step guide)
- [ ] Integration requires detailed API documentation
- [ ] Debugging complex issues (preserve learnings)
- [ ] Low-level implementation details agents need

**Do NOT update VIBEME for**:
- Minor bug fixes (unless they reveal architectural quirks)
- Copy/text changes
- Individual component updates
- CSS tweaks
- Dependency version bumps

## 🎯 Agent Guidance

### When receiving high-level prompts:

1. **Read VIBEME.md first** - Get overall context and architecture
2. **Check `docs/` folder** - Find detailed guides for specific features
3. **Check existing patterns** - Don't reinvent, follow established conventions
4. **Reuse UI components** - shadcn/ui library has what you need
5. **Follow constraints** - See "Hard Constraints" section
6. **Update appropriately**:
   - VIBEME.md → Architectural changes only
   - `docs/` → Detailed implementation guides

### Finding What You Need

**"How does [feature] work?"**:
- Check VIBEME.md for high-level overview
- Look in `docs/` for detailed implementation guide
- Read the actual code in `src/lib/` or relevant component

**"Where is [functionality]?"**:
- Check "Project Structure" section for file locations
- `src/lib/` for core utilities (daydream, recording)
- `src/pages/` for main UI components
- `supabase/functions/` for API proxies

**"Why is [thing] done this way?"**:
- Check "Known Issues & Workarounds" for historical context
- Check git history for the relevant file
- Look for comments in code explaining quirks

### Common Agent Tasks:

**"Add a new field to clips"**:
→ Update migration → Regenerate types → Update ClipView/Capture → Update VIBEME (schema section)

**"Change the UI of X"**:
→ Check design system → Use shadcn components → Follow responsive patterns

**"Fix Daydream integration issue"**:
→ Read `docs/DAYDREAM_API_GUIDE.md` → Check `src/lib/daydream.ts` → Verify edge function logs

**"Understand recording flow"**:
→ Read `docs/RECORDING_IMPLEMENTATION.md` → Check `src/lib/recording.ts`

## 🌟 Project Vibe

This is a **fast-moving event app** - prioritize:
- ✅ **Working over perfect**: Ship features quickly
- ✅ **Visual polish**: Users see gradients and glows everywhere
- ✅ **Clear feedback**: Loading states, toasts, error messages
- ✅ **Mobile-first**: Summit attendees use phones
- ✅ **Fun UX**: Playful interactions, smooth animations

Avoid:
- ❌ Over-engineering (no complex state management)
- ❌ Premature optimization (readability > performance)
- ❌ Extensive validation (trust the user, handle errors gracefully)
- ❌ Long forms (keep interactions quick and simple)

## 📚 Reference Quick Links

**Internal Documentation**:
- [`docs/DAYDREAM_API_GUIDE.md`](./docs/DAYDREAM_API_GUIDE.md) - Complete API reference
- [`docs/DAYDREAM_INTEGRATION.md`](./docs/DAYDREAM_INTEGRATION.md) - Integration guide
- [`docs/RECORDING_IMPLEMENTATION.md`](./docs/RECORDING_IMPLEMENTATION.md) - Video capture guide
- [`docs/ANONYMOUS_AUTH.md`](./docs/ANONYMOUS_AUTH.md) - Auth flow details

**External Documentation**:
- [Daydream API](https://docs.daydream.live) - Official Daydream docs
- [Livepeer Studio](https://docs.livepeer.org) - Clip API, playback
- [Supabase](https://supabase.com/docs) - Auth, edge functions, RLS
- [shadcn/ui](https://ui.shadcn.com) - Component library

## 🔗 VIBEME ↔ PRD Cross-Reference

**How to use these documents together:**
- **PRD.md** = Product vision, requirements, acceptance criteria → Read for "what to build"
- **VIBEME.md** = Current state, patterns, conventions → Read for "how it's built"

**Section mapping:**

| VIBEME Section | PRD Section | Notes |
|----------------|-------------|-------|
| Hard Constraints | "Hard constraints" | Technical non-negotiables |
| Database Schema | "Data model (Supabase Postgres)" | Exact table structure match |
| T-Index Calculation | "Controls → parameter mapping" | Algorithm implementation |
| Video Processing Flow | "Daydream / playback / clipping" | WHIP, WebRTC, clip creation |
| Routing | "Screens & components" | Page structure |
| Camera Selection | "Defaults (front/back)" | Prompt selection logic |
| External APIs | "Edge Functions (Supabase)" | API proxy patterns |
| Acceptance Criteria | "Acceptance criteria" | Feature checklist |
| Red-team notes | "Red-team notes" | Known edge cases |

**When PRD and VIBEME diverge:**
1. PRD describes the **intended design** (source of truth for features)
2. VIBEME describes **current implementation** (source of truth for code patterns)
3. If implemented differently than PRD, note it in VIBEME with rationale
4. Update both docs when making architectural changes

## 📋 Implementation Status vs PRD

**Fully implemented (✅):**
- Email OTP auth (no X OAuth as per PRD optional clause)
- Camera selector (front/back) with permission prompts
- Live output (1:1 square) with PiP source preview via Livepeer Player SDK v4
- Manual src construction for Daydream playback IDs
- Prompt, Texture+Weight, Creativity, Quality controls with debounced updates
- Recording with `captureStream()` + `MediaRecorder` (3-10s duration enforcement)
- Desktop (click toggle) vs Mobile (press & hold) recording mechanics
- Real-time recording counter (100ms updates)
- Auto-stop at 10s, cancel if <3s
- Front camera mirroring at source (canvas-based stream manipulation before Daydream)
- Recording button enabled only when video is playing
- Three-step upload to Livepeer Studio (request URL → PUT blob → poll status)
- Clip metadata saved to database with all AI parameters
- Share to X with default copy
- Coffee QR display and DB storage
- Gallery home with square grid

**Partially implemented (⚠️):**
- Texture system: 8 slots defined, but actual texture images are placeholders
- Ticket email: Function exists but may not be fully wired up
- Clip page: Shows video but QR visibility logic may need refinement

**Not yet implemented (❌):**
- `/ticket/:code` dedicated route (ticket only shows on clip page)
- Actual QR code rendering (shows code text, not QR image)
- Email delivery of ticket (function exists but integration TBD)

**Deviations from PRD (📝):**
- **Recording method**: Browser-side `captureStream()` + `MediaRecorder` instead of Livepeer Create Clip API
  - **Rationale**: More reliable across network conditions, captures exact rendered frames, works with WebRTC-only playback
  - **Trade-off**: Requires browser support for captureStream (widely supported in modern browsers)
- **Playback src**: Manual src construction instead of using `getSrc()` helper
  - **Rationale**: Daydream playback IDs not recognized by Livepeer's `getSrc()` utility
- **Recording mechanics**: Different behavior for desktop vs mobile
  - **Rationale**: Better UX - desktop users can multitask, mobile users get familiar "hold to record" pattern
- **Camera mirroring**: Canvas-based stream manipulation before Daydream instead of CSS transforms
  - **Rationale**: Ensures Daydream processes mirrored input, output is naturally mirrored, UI elements remain readable
  - **Benefit**: More robust, no CSS transform issues, consistent across browsers
- **Gallery**: Shows video player instead of thumbnails (simpler, works for POC)
- **No X OAuth**: Per PRD optional clause ("optional if trivial; otherwise require email")
- **Ticket route**: Simplified (QR shown on clip page only)

---

**Last Updated**: 2025-10-12

**Recent Changes**:
- **Documentation restructure**: Moved detailed implementation docs to `docs/` folder
- **VIBEME refactor**: Now focuses on high-level architecture and quirks, points to `docs/` for details
- All critical fixes documented in "Known Issues & Workarounds" section
- Added Quick Navigation Guide for agents

**Historical Fixes** (see "Known Issues & Workarounds" for details):
- Stream initialization race condition → Edge function retry logic
- Camera mirroring → Canvas-based source transformation
- ICE gathering delay → Multiple STUN servers + timeout
- Params updating bugs → Correct pipeline, always include `model_id`
- Privacy → Auto-stop streams when tab hidden

---

**Project Status**: Active development for Livepeer × Daydream Summit (Brewdream)

**Maintainer Guidelines**:
- **VIBEME.md** → High-level architecture, historical quirks, navigation map
- **`docs/` folder** → Detailed implementation guides, API references, troubleshooting
- **PRD.md** → Product requirements and acceptance criteria (don't modify without product approval)
- Every section should answer: "What do I need to know?" and "Where do I find details?"

