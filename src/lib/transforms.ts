import { supabase } from '@/integrations/supabase/client';

export type Provider = 'openai' | 'stability';

export interface TransformationRequest {
  imageBase64?: string; // data URL or raw b64
  imageUrl?: string;
  styleHint?: string;
  seed?: number;
  provider?: Provider;
}

export interface TransformationResult {
  prompt: string;
  imageUrl: string; // CDN or data URL
  seed: number;
  assetId?: string;
  playbackId?: string;
}

// Capture a square frame from an HTMLVideoElement (cover fit into 768x768)
export function captureVideoFrameDataUrl(video: HTMLVideoElement, size = 768): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const videoAspect = video.videoWidth / video.videoHeight;
  const targetAspect = 1;

  let sx = 0, sy = 0, sWidth = video.videoWidth, sHeight = video.videoHeight;
  if (videoAspect > targetAspect) {
    // video is wider than square
    sWidth = video.videoHeight * targetAspect;
    sx = (video.videoWidth - sWidth) / 2;
  } else if (videoAspect < targetAspect) {
    // video is taller than square
    sHeight = video.videoWidth / targetAspect;
    sy = (video.videoHeight - sHeight) / 2;
  }

  ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}

export async function generateTransformation(req: TransformationRequest): Promise<TransformationResult> {
  const { data, error } = await supabase.functions.invoke('generate-transformation', {
    body: req,
  });
  if (error) throw error;
  return data as TransformationResult;
}
