/**
 * Daydream Realtime Streaming Client
 *
 * Provides helpers for creating streams, publishing via WHIP, and updating prompts.
 * All API calls are proxied through Supabase edge functions to keep API keys server-side.
 */

import { supabase } from '@/integrations/supabase/client';

export interface DaydreamStream {
  id: string;
  output_playback_id: string;
  whip_url: string;
}

export interface StreamDiffusionParams {
  model_id?: string;
  prompt: string;
  negative_prompt?: string;
  num_inference_steps?: number;
  seed?: number;
  t_index_list?: number[];
  controlnets?: Array<{
    enabled?: boolean;
    model_id: string;
    preprocessor: string;
    preprocessor_params?: Record<string, unknown>;
    conditioning_scale: number;
  }>;
  ip_adapter?: {
    enabled?: boolean;
    type?: 'regular' | 'faceid';
    scale?: number;
    weight_type?: string;
    insightface_model_name?: 'buffalo_l';
  };
  ip_adapter_style_image_url?: string;
}

/**
 * Create a new Daydream stream with the StreamDiffusion pipeline
 * If initialParams provided, the edge function handles parameter initialization with retry logic
 */
export async function createDaydreamStream(initialParams?: StreamDiffusionParams): Promise<DaydreamStream> {
  console.log('[DAYDREAM] Creating stream with initialParams:', JSON.stringify(initialParams, null, 2));
  
  const { data, error } = await supabase.functions.invoke('daydream-stream', {
    body: { 
      pipeline_id: 'pip_SDXL-turbo',
      initialParams // Will be sent as pipeline_params to Daydream
    }
  });

  if (error) {
    console.error('[DAYDREAM] Error creating stream:', error);
    throw error;
  }
  if (!data) {
    console.error('[DAYDREAM] No stream data returned from edge function');
    throw new Error('No stream data returned');
  }

  console.log('[DAYDREAM] Stream created:', data);
  return data as DaydreamStream;
}

