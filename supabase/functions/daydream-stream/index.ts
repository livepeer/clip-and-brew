import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const DAYDREAM_API_KEY = Deno.env.get('DAYDREAM_API_KEY');
    if (!DAYDREAM_API_KEY) {
      throw new Error('DAYDREAM_API_KEY is not configured');
    }

    const body = await req.json();
    // Default to the StreamDiffusion pipeline if not specified
    const requestBody = {
      pipeline_id: body.pipeline_id || 'pip_qpUgXycjWF6YMeSL',
      ...body,
    };

    console.log('Creating Daydream stream with body:', requestBody);

    // Create stream via Daydream API
    const response = await fetch('https://api.daydream.live/v1/streams', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DAYDREAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.log('Daydream stream created - Full response:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error('Daydream API error:', data);
      return new Response(JSON.stringify({ error: data }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Temporarily return full data to debug playback URL format
    // TODO: Return only essential fields for security after debugging
    console.log('Returning stream data:', data);
    return new Response(JSON.stringify(data), {
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
