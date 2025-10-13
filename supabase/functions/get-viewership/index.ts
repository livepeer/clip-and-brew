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
    const LIVEPEER_API_KEY = Deno.env.get('LIVEPEER_STUDIO_API_KEY');
    if (!LIVEPEER_API_KEY) {
      throw new Error('LIVEPEER_STUDIO_API_KEY is not configured');
    }

    const { playbackId } = await req.json();

    if (!playbackId) {
      throw new Error('playbackId is required');
    }

    console.log('Fetching viewership for playbackId:', playbackId);

    // Get viewership data from Livepeer API
    const response = await fetch(
      `https://livepeer.studio/api/data/views/query/total/${playbackId}`,
      {
        headers: {
          'Authorization': `Bearer ${LIVEPEER_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Livepeer API error:', response.status, errorText);

      // Return 0 views if API fails (graceful degradation)
      return new Response(JSON.stringify({
        viewCount: 0,
        playtimeMins: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    console.log('Viewership data:', data);

    return new Response(JSON.stringify({
      viewCount: data.viewCount || 0,
      playtimeMins: data.playtimeMins || 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in get-viewership function:', error);

    // Return 0 views on error (graceful degradation)
    return new Response(JSON.stringify({
      viewCount: 0,
      playtimeMins: 0,
      error: error.message,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

