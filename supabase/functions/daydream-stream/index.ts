import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[EDGE] daydream-stream function called (version: 2025-10-12-correct-api-endpoint)');

  try {
    const DAYDREAM_API_KEY = Deno.env.get('DAYDREAM_API_KEY');
    if (!DAYDREAM_API_KEY) {
      throw new Error('DAYDREAM_API_KEY is not configured');
    }

    const body = await req.json();
    const initialParams = body.initialParams;

    console.log('[EDGE] Creating Daydream stream');

    // Use the correct /api/streams endpoint (not /v1/streams)
    // Based on HAR: POST /api/streams with {"name":"...","preset":"daydream","metadata":{"model":"streamdiffusion"}}
    const createPayload: any = {
      name: `Stream ${Date.now()}`,
      preset: 'daydream',
      metadata: {
        model: 'streamdiffusion'
      }
    };

    // If initial params provided, include them in the creation
    if (initialParams) {
      console.log('[EDGE] Including initial params in stream creation:', JSON.stringify(initialParams, null, 2));
      createPayload.params = initialParams;
    }

    const createResponse = await fetch('https://daydream.live/api/streams', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DAYDREAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createPayload),
    });

    const streamData = await createResponse.json();
    console.log('Daydream stream created:', streamData);

    if (!createResponse.ok) {
      console.error('Daydream API error:', streamData);
      return new Response(JSON.stringify({ error: streamData }), {
        status: createResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract the fields we need - API response has different structure
    const { id } = streamData;
    
    // The HAR shows the response has an id, but we need to construct the playback/whip URLs
    // Based on the working implementation pattern
    const output_playback_id = id; // Use the stream ID as playback ID
    const whip_url = `https://daydream.live/api/streams/${id}/whip`;

    // Return immediately with stream info
    return new Response(JSON.stringify({ id, output_playback_id, whip_url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in daydream-stream function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
