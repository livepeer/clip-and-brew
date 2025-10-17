import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const LIVEPEER_API_KEY = Deno.env.get('LIVEPEER_STUDIO_API_KEY');
    if (!LIVEPEER_API_KEY) {
      throw new Error('LIVEPEER_STUDIO_API_KEY is not configured');
    }

    // Create a unique name for the asset
    const name = `Brewdream Clip ${new Date().toISOString()}`;

    console.log('Requesting upload URL for:', name);

    // Request upload from Livepeer Studio
    const response = await fetch('https://livepeer.studio/api/asset/request-upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LIVEPEER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Livepeer API error:', response.status, errorText);
      throw new Error(`Livepeer API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('Upload URL response:', data);

    // Normalize response structure for client (matching Livepeer API schema)
    const uploadUrl = data?.url;
    const tusEndpoint = data?.tusEndpoint;
    const assetId = data?.asset?.id;
    const playbackId = data?.asset?.playbackId;

    // Try to fetch the corresponding task and extract the raw upload URL
    let rawUploadedFileUrl: string | undefined = undefined;
    try {
      if (assetId) {
        const filtersParam = encodeURIComponent(JSON.stringify([{ id: 'outputAssetId', value: assetId }]));
        const tasksUrl = `https://livepeer.studio/api/task?limit=2&filters=${filtersParam}`;
        const tasksResponse = await fetch(tasksUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${LIVEPEER_API_KEY}`,
          }
        });
        if (tasksResponse.ok) {
          const tasks = await tasksResponse.json();
          const task = Array.isArray(tasks) ? tasks[0] : undefined;
          rawUploadedFileUrl = task?.params?.upload?.url;
          console.log('Derived rawUploadedFileUrl from task:', rawUploadedFileUrl);
        } else {
          const errorText = await tasksResponse.text();
          console.warn('Failed to fetch tasks:', tasksResponse.status, errorText);
        }
      }
    } catch (err) {
      console.warn('Error while fetching tasks for rawUploadedFileUrl:', err);
    }

    return new Response(JSON.stringify({
      uploadUrl,
      tusEndpoint,
      assetId,
      playbackId,
      rawUploadedFileUrl
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error in studio-request-upload function:', error);
    return new Response(JSON.stringify({
      error: message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
