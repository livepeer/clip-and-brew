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
 * If initialParams provided, immediately updates the stream with those params
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

  // Step 2: Immediately update with initial params if provided
  // This prevents the stream from starting with Daydream defaults
  if (initialParams) {
    await updateDaydreamPrompts(stream.id, initialParams);
  }

  return stream;
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
  // Also always specify ip_adapter even if disabled (API requirement)
  const body = {
    model_id: 'streamdiffusion',
    pipeline: 'live-video-to-video',
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
