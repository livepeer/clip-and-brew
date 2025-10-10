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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { code } = await req.json();
    console.log('Redeeming ticket with code:', code);

    if (!code) {
      return new Response(JSON.stringify({ error: 'Ticket code is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if ticket exists
    const { data: ticket, error: fetchError } = await supabase
      .from('tickets')
      .select('*')
      .eq('code', code)
      .single();

    if (fetchError || !ticket) {
      console.error('Ticket not found:', fetchError);
      return new Response(JSON.stringify({ error: 'Ticket not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if already redeemed
    if (ticket.redeemed) {
      console.log('Ticket already redeemed');
      return new Response(JSON.stringify({ error: 'Ticket already redeemed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Redeem the ticket
    const { data: updatedTicket, error: updateError } = await supabase
      .from('tickets')
      .update({ redeemed: true })
      .eq('code', code)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating ticket:', updateError);
      throw updateError;
    }

    console.log('Ticket redeemed successfully:', updatedTicket);

    return new Response(JSON.stringify({
      success: true,
      ticket: updatedTicket,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in redeem-ticket function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

