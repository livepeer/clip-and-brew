/**
 * AI Image Transformation utilities
 * 
 * Provides helpers for capturing snapshots, generating creative prompts,
 * and transforming images using LLM + image generation APIs.
 */

import { supabase } from '@/integrations/supabase/client';

export interface TransformationPrompt {
  prompt: string;
  method: 'llm' | 'template';
  components?: {
    style: string;
    environment: string;
    effect: string;
  };
}

export interface TransformationResult {
  imageUrl: string;
  prompt: string;
  method: 'livepeer' | 'dalle' | 'replicate';
  details?: any;
}

/**
 * Capture a snapshot from a video element as base64
 */
export function captureSnapshot(
  videoElement: HTMLVideoElement,
  maxWidth: number = 512,
  maxHeight: number = 512
): { dataUrl: string; base64: string; blob: Blob } {
  // Create a canvas to capture the frame
  const canvas = document.createElement('canvas');
  
  // Calculate dimensions maintaining aspect ratio
  const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
  let width = maxWidth;
  let height = maxHeight;
  
  if (aspectRatio > 1) {
    // Landscape
    height = width / aspectRatio;
  } else {
    // Portrait
    width = height * aspectRatio;
  }
  
  canvas.width = width;
  canvas.height = height;
  
  // Draw the current video frame
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(videoElement, 0, 0, width, height);
  
  // Convert to data URL and base64
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  
  // Also create a blob for upload if needed
  canvas.toBlob((blob) => {
    if (!blob) throw new Error('Failed to create blob from canvas');
  }, 'image/png');
  
  // Synchronous blob creation
  const binStr = atob(base64);
  const len = binStr.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = binStr.charCodeAt(i);
  }
  const blob = new Blob([arr], { type: 'image/png' });
  
  return { dataUrl, base64, blob };
}

/**
 * Generate a creative transformation prompt using LLM or templates
 */
export async function generateTransformationPrompt(
  useLLM: boolean = false
): Promise<TransformationPrompt> {
  const { data, error } = await supabase.functions.invoke(
    'generate-transformation-prompt',
    { body: { useLLM } }
  );
  
  if (error) {
    console.error('Failed to generate prompt:', error);
    throw error;
  }
  
  if (!data?.prompt) {
    throw new Error('No prompt returned from server');
  }
  
  return data as TransformationPrompt;
}

/**
 * Transform an image using AI image generation
 */
export async function transformImage(params: {
  imageBase64?: string;
  imageUrl?: string;
  prompt: string;
  strength?: number;
}): Promise<TransformationResult> {
  const { data, error } = await supabase.functions.invoke(
    'transform-image',
    { 
      body: {
        imageBase64: params.imageBase64,
        imageUrl: params.imageUrl,
        prompt: params.prompt,
        strength: params.strength || 0.7,
      }
    }
  );
  
  if (error) {
    console.error('Failed to transform image:', error);
    throw error;
  }
  
  if (!data?.imageUrl) {
    throw new Error('No image URL returned from transformation');
  }
  
  return data as TransformationResult;
}

/**
 * Complete transformation pipeline: capture → generate prompt → transform
 */
export async function performFullTransformation(
  videoElement: HTMLVideoElement,
  customPrompt?: string,
  useLLM: boolean = false,
  strength: number = 0.7
): Promise<{
  original: { dataUrl: string; base64: string };
  transformed: TransformationResult;
  prompt: string;
}> {
  // Step 1: Capture snapshot
  console.log('Capturing snapshot...');
  const { dataUrl, base64 } = captureSnapshot(videoElement);
  
  // Step 2: Generate prompt (if not provided)
  let prompt = customPrompt;
  if (!prompt) {
    console.log('Generating transformation prompt...');
    const promptData = await generateTransformationPrompt(useLLM);
    prompt = promptData.prompt;
  }
  
  console.log('Using prompt:', prompt);
  
  // Step 3: Transform image
  console.log('Transforming image...');
  const transformed = await transformImage({
    imageBase64: base64,
    prompt,
    strength,
  });
  
  return {
    original: { dataUrl, base64 },
    transformed,
    prompt,
  };
}

/**
 * Upload a snapshot to Livepeer for persistent storage
 * Returns a permanent URL that can be used for transformations
 */
export async function uploadSnapshotToLivepeer(
  blob: Blob,
  filename: string = `snapshot-${Date.now()}.png`
): Promise<{ assetId: string; url: string }> {
  // Request upload URL
  const { data: uploadData, error: uploadError } = await supabase.functions.invoke(
    'studio-request-upload',
    { body: {} }
  );
  
  if (uploadError || !uploadData?.uploadUrl) {
    throw new Error('Failed to get upload URL');
  }
  
  // Upload the blob
  const putResponse = await fetch(uploadData.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/png',
    },
    body: blob,
  });
  
  if (!putResponse.ok) {
    throw new Error('Failed to upload snapshot');
  }
  
  // Return asset info
  return {
    assetId: uploadData.assetId,
    url: uploadData.uploadUrl,
  };
}
