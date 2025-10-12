import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[EDGE] daydream-prompt function called (version: 2025-10-12-correct-api-endpoint)');

  try {
    const DAYDREAM_API_KEY = Deno.env.get('DAYDREAM_API_KEY');
    if (!DAYDREAM_API_KEY) {
      throw new Error('DAYDREAM_API_KEY is not configured');
    }

    const { streamId, ...promptBody } = await req.json();
    if (!streamId) {
      throw new Error('streamId is required');
    }

    console.log('[EDGE] Updating prompt for stream:', streamId);
    console.log('[EDGE] Params being sent:', JSON.stringify(promptBody, null, 2));

    // PATCH /v1/streams/:id with body: { params: { ... } }
    const response = await fetch(`https://api.daydream.live/v1/streams/${streamId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${DAYDREAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(promptBody),
    });

    const data = await response.json();
    console.log('[EDGE] Daydream API response status:', response.status);
    console.log('[EDGE] Daydream API response:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error('[EDGE] Daydream API error:', JSON.stringify(data, null, 2));
      // Pass through the full Daydream error response to frontend
      return new Response(JSON.stringify({ 
        error: 'Daydream API Error',
        daydreamError: data,
        status: response.status 
      }), {
        status: 400, // Use 400 instead of passing through 404, so frontend sees it as error not "not found"
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in daydream-prompt function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
