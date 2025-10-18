import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Get clip ID from URL path
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (pathParts.length < 2 || pathParts[0] !== 'proxy-raw-video') {
      return new Response(JSON.stringify({ error: 'Invalid path. Expected /proxy-raw-video/{clipId}[/filename]' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clipId = pathParts[1];
    const filename = pathParts[2] || `brewdream-${clipId.substring(0, 8)}.webm`;

    console.log('Proxying raw video for clip:', clipId, 'filename:', filename);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch clip data
    const { data: clip, error: clipError } = await supabase
      .from('clips')
      .select('raw_uploaded_file_url, asset_ready')
      .eq('id', clipId)
      .single();

    if (clipError) {
      console.error('Error fetching clip:', clipError);
      return new Response(JSON.stringify({ error: 'Clip not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!clip.raw_uploaded_file_url) {
      return new Response(JSON.stringify({ error: 'No raw video available for this clip' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Fetching raw video from:', clip.raw_uploaded_file_url);

    // Fetch the raw video from Livepeer
    const videoResponse = await fetch(clip.raw_uploaded_file_url);

    if (!videoResponse.ok) {
      console.error('Failed to fetch raw video:', videoResponse.status, videoResponse.statusText);
      return new Response(JSON.stringify({ error: 'Failed to fetch video from storage' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check file size - object stores always provide Content-Length
    const contentLength = videoResponse.headers.get('content-length');
    const maxSize = 20 * 1024 * 1024; // 20MB

    if (!contentLength) {
      console.error('No Content-Length header from object store');
      return new Response(JSON.stringify({ error: 'Invalid response from storage' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (parseInt(contentLength) > maxSize) {
      console.error('Video file too large:', contentLength, 'bytes');
      return new Response(JSON.stringify({ error: 'Video file too large (max 20MB)' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const videoData = await videoResponse.arrayBuffer();

    console.log('Video loaded successfully:', videoData.byteLength, 'bytes');

    let contentType = videoResponse.headers.get('content-type');
    if (!contentType || contentType === 'application/octet-stream') {
      // default to webm if content type is octet-stream
      contentType = 'video/webm';
    }

    return new Response(videoData, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Length': videoData.byteLength.toString(),
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error in proxy-raw-video function:', error);
    return new Response(JSON.stringify({
      error: message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
