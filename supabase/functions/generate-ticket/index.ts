import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create authenticated client from request
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create service role client for database operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { clipId } = await req.json();
    console.log('Generating ticket for clip:', clipId, 'user:', user.id);

    if (!clipId) {
      return new Response(JSON.stringify({ error: 'clipId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Look up the clip and get its session
    const { data: clip, error: clipError } = await supabase
      .from('clips')
      .select('session_id')
      .eq('id', clipId)
      .single();

    if (clipError || !clip) {
      console.error('Clip not found:', clipError);
      return new Response(JSON.stringify({ error: 'Clip not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the user owns this session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('user_id')
      .eq('id', clip.session_id)
      .single();

    if (sessionError || !session) {
      console.error('Session not found:', sessionError);
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (session.user_id !== user.id) {
      console.error('User does not own this session');
      return new Response(JSON.stringify({ error: 'Forbidden: You do not own this clip' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sessionId = clip.session_id;
    console.log('Verified ownership, generating ticket for session:', sessionId);

    // Generate unique code (base36 of timestamp + random)
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();

    // Create ticket in database
    const { data: ticket, error } = await supabase
      .from('tickets')
      .insert({
        session_id: sessionId,
        code,
      })
      .select()
      .single();

    if (error) throw error;

    // Generate QR code data URL (simple approach - in production use a proper QR library)
    const qrData = `DD-COFFEE-${code}`;

    console.log('Ticket created:', ticket);

    return new Response(JSON.stringify({
      id: ticket.id,
      code: ticket.code,
      qrData,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in generate-ticket function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
