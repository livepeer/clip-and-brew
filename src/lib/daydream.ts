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
 * If initialParams provided, updates the stream with those params (with retry for "not ready" state)
 * The param update happens in the background and won't block stream/camera initialization
 */
export async function createDaydreamStream(initialParams?: StreamDiffusionParams): Promise<DaydreamStream> {
  // Step 1: Create stream (only accepts pipeline_id)
  const { data, error } = await supabase.functions.invoke('daydream-stream', {
    body: { 
      pipeline_id: 'pip_SDXL-turbo' // Correct SDXL pipeline ID
    }
  });

  if (error) throw error;
  if (!data) throw new Error('No stream data returned');

  const stream = data as DaydreamStream;

  // Step 2: Update with initial params in the background (non-blocking)
  // This allows camera to start immediately while params are being updated
  if (initialParams) {
    // Fire and forget - don't await
    updateDaydreamPromptsWithRetry(stream.id, initialParams).catch(err => {
      console.error('Background param update failed:', err);
    });
  }

  return stream;
}

/**
 * Update stream prompts with retry logic for "Stream not ready yet" errors
 * Daydream streams need a moment to initialize before accepting parameter updates
 */
async function updateDaydreamPromptsWithRetry(
  streamId: string,
  params: StreamDiffusionParams,
  maxRetries: number = 10,
  delayMs: number = 1000
): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Wait before attempting (except first attempt)
      if (attempt > 0) {
        console.log(`Retrying param update in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      await updateDaydreamPrompts(streamId, params);
      console.log('✓ Stream params updated successfully');
      return; // Success!
      
    } catch (error: any) {
      // Check multiple places where the error message might be
      const errorStr = JSON.stringify(error);
      const errorMessage = error?.message || error?.error?.error || errorStr;
      
      // Check if it's a "not ready" error
      const isNotReadyError = 
        errorMessage.includes('not ready') || 
        errorMessage.includes('Stream not ready') ||
        errorStr.includes('not ready') ||
        errorStr.includes('Stream not ready');
      
      if (isNotReadyError) {
        console.log(`Stream not ready yet (attempt ${attempt + 1}/${maxRetries})`);
        // Continue to next retry
      } else {
        // For other errors, log but don't retry
        console.error('Non-retryable error updating stream params:', error);
        console.warn('Stream will use default parameters');
        return; // Exit without throwing
      }
    }
  }
  
  // All retries exhausted
  console.warn(`⚠ Failed to update initial stream params after ${maxRetries} retries. Stream will use defaults.`);
}

/**
 * Start WHIP publish from a MediaStream to Daydream
 * Returns the RTCPeerConnection for later cleanup
 */
export async function startWhipPublish(
  whipUrl: string,
  stream: MediaStream
): Promise<RTCPeerConnection> {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 3,
  });

  // Add all tracks from the stream
  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  // Create offer
  const offer = await pc.createOffer({
    offerToReceiveAudio: false,
    offerToReceiveVideo: false,
  });
  await pc.setLocalDescription(offer);

  // Wait for ICE gathering to complete (non-trickle ICE) with timeout
  const ICE_TIMEOUT = 2000; // 2 second timeout - aggressive for fast UX

  await Promise.race([
    new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
      } else {
        const checkState = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }
        };
        pc.addEventListener('icegatheringstatechange', checkState);
      }
    }),
    new Promise<void>((resolve) => setTimeout(resolve, ICE_TIMEOUT))
  ]);

  // Send offer to WHIP endpoint
  const offerSdp = pc.localDescription!.sdp!;
  const response = await fetch(whipUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sdp',
    },
    body: offerSdp,
  });

  if (!response.ok) {
    throw new Error(`WHIP publish failed: ${response.status} ${response.statusText}`);
  }

  // Get answer SDP and set it
  const answerSdp = await response.text();
  await pc.setRemoteDescription({
    type: 'answer',
    sdp: answerSdp,
  });

  return pc;
}

/**
 * Update StreamDiffusion prompts for a stream
 * Sends the full params object as required by Daydream API
 */
export async function updateDaydreamPrompts(
  streamId: string,
  params: StreamDiffusionParams
): Promise<void> {
  // Ensure every controlnet includes enabled: true as required by Daydream API
  const defaultControlnets = [
    {
      enabled: true,
      model_id: 'xinsir/controlnet-depth-sdxl-1.0',
      preprocessor: 'depth_tensorrt',
      preprocessor_params: {},
      conditioning_scale: 0.3,
    },
    {
      enabled: true,
      model_id: 'xinsir/controlnet-canny-sdxl-1.0',
      preprocessor: 'canny',
      preprocessor_params: {},
      conditioning_scale: 0,
    },
    {
      enabled: true,
      model_id: 'xinsir/controlnet-tile-sdxl-1.0',
      preprocessor: 'feedback',
      preprocessor_params: {},
      conditioning_scale: 0,
    },
  ];

  const mergedControlnets = (params.controlnets || defaultControlnets).map((cn) => ({
    enabled: true,
    preprocessor_params: {},
    ...cn,
  }));

  // CRITICAL: Always include model_id to prevent Daydream from loading default
  // API expects just { params: { ... } } structure for PATCH /v1/streams/:id
  const body = {
    params: {
      model_id: params.model_id || 'stabilityai/sdxl-turbo', // ALWAYS include
      prompt: params.prompt,
      negative_prompt: params.negative_prompt || 'blurry, low quality, flat, 2d, distorted',
      num_inference_steps: params.num_inference_steps || 50,
      seed: params.seed || 42,
      t_index_list: params.t_index_list || [6, 12, 18],
      controlnets: mergedControlnets,
      // ALWAYS specify IP-Adapter (even if disabled)
      ip_adapter: params.ip_adapter || {
        enabled: false,
        type: 'regular',
        scale: 0,
        weight_type: 'linear',
        insightface_model_name: 'buffalo_l',
      },
      ...(params.ip_adapter_style_image_url
        ? { ip_adapter_style_image_url: params.ip_adapter_style_image_url }
        : {}),
    },
  };

  const { error } = await supabase.functions.invoke('daydream-prompt', {
    body: { streamId, ...body },
  });

  if (error) throw error;
}
