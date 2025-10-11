import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Basic CORS for browser calls via Supabase Functions invoke
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type GenerateBody = {
  imageBase64?: string; // data URL or raw base64 without prefix
  imageUrl?: string;    // remote URL to fetch
  styleHint?: string;   // optional user-provided style hint
  seed?: number;        // optional seed for provider (best-effort)
  provider?: 'openai' | 'stability';
};

interface GenerateResult {
  prompt: string;
  imageUrl: string; // CDN or data URL fallback
  seed: number;
  assetId?: string;
  playbackId?: string; // if Livepeer provides one for images in future
}

const DEFAULT_IMAGE_SIZE = '768x768';

// Utility: decode base64 (with or without data URL prefix) to Uint8Array
function base64ToUint8Array(base64OrDataUrl: string): Uint8Array {
  let base64 = base64OrDataUrl.trim();
  const commaIndex = base64.indexOf(',');
  if (base64.startsWith('data:') && commaIndex !== -1) {
    base64 = base64.slice(commaIndex + 1);
  }
  // atob is available in Deno runtime
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Utility: sleep
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// LLM: Generate a transformation prompt using OpenAI
async function generatePromptWithOpenAI(styleHint?: string): Promise<string> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  const OPENAI_LLM_MODEL = Deno.env.get('OPENAI_LLM_MODEL') || 'gpt-4o-mini';
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

  // Random style seeds for replayability
  const STYLE_BUCKETS = [
    'psychedelic neon forest',
    'dreamy underwater café',
    'banana-dimension self-portrait',
    'vaporwave reinterpretation with pastel gradients',
    'holographic chrome cityscape',
    'glitchy VHS cosmos, RGB split',
    'stained glass cathedral light',
    'fractal kaleidoscope garden',
    'surreal oil painting with impasto',
    'noir rain-soaked alley with neon',
  ];
  const randomSeed = Math.floor(Math.random() * STYLE_BUCKETS.length);
  const randomStyle = STYLE_BUCKETS[randomSeed];
  const hint = styleHint && styleHint.trim().length > 0 ? styleHint.trim() : randomStyle;

  const system = `You are a visual imagination engine. Given a photo of a real person,
generate one short descriptive transformation prompt that keeps them recognizable but
makes the background and style surreal, artistic, or trippy. Output only the prompt,
10 words or fewer. Avoid changing clothing or pose; focus on scene, lighting, palette.`;

  const user = `Style inspiration: ${hint}\nReturn a single short prompt.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_LLM_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.9,
      max_tokens: 32,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI LLM error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content: string = data?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('LLM returned empty content');
  // sanitize to single line
  return content.replace(/\n+/g, ' ').slice(0, 120);
}

// Image to Image via OpenAI Images API (best-effort using edits without mask)
async function imageToImageWithOpenAI(imageBytes: Uint8Array, prompt: string, seed?: number): Promise<string> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  const OPENAI_IMAGE_MODEL = Deno.env.get('OPENAI_IMAGE_MODEL') || 'gpt-image-1';
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

  // Use the Images edits endpoint with no mask to nudge style
  const form = new FormData();
  form.append('model', OPENAI_IMAGE_MODEL);
  form.append('prompt', prompt);
  form.append('size', DEFAULT_IMAGE_SIZE);
  form.append('response_format', 'b64_json');
  // OpenAI may not support seed for all models; ignore if not supported
  if (typeof seed === 'number') form.append('seed', String(seed));

  const blob = new Blob([imageBytes], { type: 'image/png' });
  form.append('image', blob, 'source.png');

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI image error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI image response missing b64_json');
  return `data:image/png;base64,${b64}`;
}

// Upload image to Livepeer Studio as an asset and return its CDN URL
async function uploadImageToLivepeer(imageBytes: Uint8Array): Promise<{ assetId: string; downloadUrl: string; playbackId?: string }>
{
  const LIVEPEER_API_KEY = Deno.env.get('LIVEPEER_STUDIO_API_KEY');
  if (!LIVEPEER_API_KEY) throw new Error('LIVEPEER_STUDIO_API_KEY is not configured');

  // 1) Request upload URL
  const name = `Brewdream Transform ${new Date().toISOString()}.png`;
  const req = await fetch('https://livepeer.studio/api/asset/request-upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LIVEPEER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });

  if (!req.ok) {
    const t = await req.text();
    throw new Error(`Livepeer request-upload error: ${req.status} ${t}`);
  }
  const reqData = await req.json();
  const uploadUrl: string = reqData?.url || reqData?.asset?.url;
  const assetId: string = reqData?.asset?.id || reqData?.assetId || reqData?.id;
  if (!uploadUrl || !assetId) throw new Error('Invalid Livepeer upload response');

  // 2) PUT image
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: imageBytes,
  });
  if (!put.ok) {
    const t = await put.text().catch(() => '');
    throw new Error(`Livepeer upload failed: ${put.status} ${t}`);
  }

  // 3) Poll for readiness and download URL
  let attempts = 0;
  const maxAttempts = 120; // ~2 minutes at 1s interval
  while (attempts < maxAttempts) {
    const get = await fetch(`https://livepeer.studio/api/asset/${assetId}`, {
      headers: { 'Authorization': `Bearer ${LIVEPEER_API_KEY}` },
    });
    if (!get.ok) {
      const t = await get.text().catch(() => '');
      throw new Error(`Livepeer asset status error: ${get.status} ${t}`);
    }
    const asset = await get.json();
    const status: string | undefined = asset?.status?.phase || asset?.status || asset?.phase;
    const downloadUrl: string | undefined = asset?.downloadUrl || asset?.download_url || asset?.files?.[0]?.downloadUrl;
    const playbackId: string | undefined = asset?.playbackId;
    if ((asset?.status === 'ready' || status === 'ready') && downloadUrl) {
      return { assetId, downloadUrl, playbackId };
    }
    if (asset?.status === 'failed' || status === 'failed' || status === 'error') {
      throw new Error(`Livepeer asset processing failed for ${assetId}`);
    }
    attempts++;
    await sleep(1000);
  }
  throw new Error(`Livepeer asset not ready after timeout: ${assetId}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json().catch(() => ({}))) as GenerateBody;
    if (!body.imageBase64 && !body.imageUrl) {
      return new Response(JSON.stringify({ error: 'imageBase64 or imageUrl is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1) Acquire source image bytes
    let imageBytes: Uint8Array;
    if (body.imageBase64) {
      imageBytes = base64ToUint8Array(body.imageBase64);
    } else {
      const res = await fetch(body.imageUrl!);
      if (!res.ok) throw new Error(`Failed to fetch imageUrl: ${res.status}`);
      const arr = new Uint8Array(await res.arrayBuffer());
      imageBytes = arr;
    }

    // 2) Generate creative prompt with LLM
    const prompt = await generatePromptWithOpenAI(body.styleHint);

    // 3) Generate transformed image via provider
    const seed = typeof body.seed === 'number' ? body.seed : Math.floor(Math.random() * 10_000_000);
    const provider = body.provider || 'openai';

    let resultDataUrl: string;
    switch (provider) {
      case 'openai':
      default:
        resultDataUrl = await imageToImageWithOpenAI(imageBytes, prompt, seed);
        break;
    }

    // 4) Upload to Livepeer Studio for caching/CDN URL
    let uploaded: { assetId?: string; downloadUrl?: string; playbackId?: string } = {};
    try {
      const bytes = base64ToUint8Array(resultDataUrl);
      uploaded = await uploadImageToLivepeer(bytes);
    } catch (e) {
      // If upload fails, return data URL so UI can still render
      console.warn('Livepeer upload failed, returning data URL:', e);
    }

    const payload: GenerateResult = {
      prompt,
      imageUrl: uploaded.downloadUrl || resultDataUrl,
      seed,
      assetId: uploaded.assetId,
      playbackId: uploaded.playbackId,
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in generate-transformation:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
