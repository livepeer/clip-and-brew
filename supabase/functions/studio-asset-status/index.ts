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

    const { assetId } = await req.json();

    if (!assetId) {
      throw new Error('assetId is required');
    }

    console.log('Fetching asset status for:', assetId);

    // Get asset status from Livepeer Studio
    const response = await fetch(`https://livepeer.studio/api/asset/${assetId}`, {
      headers: {
        'Authorization': `Bearer ${LIVEPEER_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Livepeer API error:', response.status, errorText);
      throw new Error(`Livepeer API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('Asset status response:', JSON.stringify(data, null, 2));

    // Extract status - can be nested in status.phase or direct
    const status = data.status?.phase || data.status;
    console.log('Asset status:', status);

    // Return normalized asset data with error details if present
    // Livepeer API returns playbackId, not asset_playback_id
    const result: any = {
      status: status,
      playbackId: data.playbackId || data.id, // fallback to id if playbackId not present
      downloadUrl: data.downloadUrl,
      assetId: data.id,
    };

    // Include error information if the asset failed
    if (data.status?.errorMessage || data.errors) {
      result.error = {
        message: data.status?.errorMessage || JSON.stringify(data.errors),
      };
      console.error('Asset has errors:', result.error);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in studio-asset-status function:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
