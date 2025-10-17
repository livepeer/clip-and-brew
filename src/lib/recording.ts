/**
 * Recording utilities for capturing video stream to Livepeer Studio assets
 */

import { supabase } from '@/integrations/supabase/client';
import fixWebmDuration from 'fix-webm-duration';
import * as tus from 'tus-js-client';

// Extend HTMLVideoElement to include captureStream method
interface HTMLVideoElementWithCapture extends HTMLVideoElement {
  captureStream?: () => MediaStream;
}

interface RecordingResult {
  blob: Blob;
  durationMs: number;
  mimeType: string;
}

interface UploadResult {
  assetId: string;
  playbackId: string;
  downloadUrl?: string;
  rawUploadedFileUrl?: string;
}

interface UploadProgress {
  phase: string;
  step?: string;
  progress?: number;
}

export interface UploadDoneResult {
  assetId: string;
  playbackId: string;
  rawUploadedFileUrl?: string;
}

/**
 * Start recording from a video element using MediaRecorder
 */
export class VideoRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private startTime: number | null = null;
  private mimeType: string = '';

  constructor(private videoElement: HTMLVideoElement) {}

  /**
   * Start recording the video stream
   */
  async start(): Promise<void> {
    // Capture stream from video element
    const stream = (this.videoElement as HTMLVideoElementWithCapture).captureStream?.();

    if (!stream) {
      throw new Error('captureStream is not supported on this video element');
    }

    // Try different MIME types in order of preference
    // Prefer VP9 with Opus for better quality and compatibility
    const mimeCandidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];

    this.mimeType = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m)) || '';

    if (!this.mimeType) {
      throw new Error('No supported video MIME type found');
    }

    console.log('Recording with MIME type:', this.mimeType);

    // Create MediaRecorder with optimized settings
    // Set audioBitsPerSecond to avoid AudioContext conflicts when capturing player audio
    // The player's WebRTC audio is already processed; we just pass it through
    this.recorder = new MediaRecorder(stream, {
      mimeType: this.mimeType,
      videoBitsPerSecond: 2500000, // 2.5 Mbps for good quality
      audioBitsPerSecond: 128000, // 128 kbps, standard quality, avoids re-encoding conflicts
    });
    this.chunks = [];
    this.startTime = Date.now();

    // Collect data chunks
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        console.log('Chunk received:', e.data.size, 'bytes');
        this.chunks.push(e.data);
      }
    };

    // Add error handler
    this.recorder.onerror = (e: Event) => {
      console.error('MediaRecorder error:', e);
    };

    // Start recording with 1000ms timeslice for stable chunks
    // Shorter timeslices can cause incomplete/invalid WebM files
    this.recorder.start(1000);
  }

  /**
   * Stop recording and return the recorded blob
   */
  async stop(): Promise<RecordingResult> {
    if (!this.recorder || !this.startTime) {
      throw new Error('Recording not started');
    }

    // Stop the recorder and wait for it to finish
    // We need to wait for both the stop event AND final data chunks
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Recording stop timed out'));
      }, 5000);

      this.recorder!.onstop = () => {
        clearTimeout(timeout);
        // Wait a bit for final chunks to arrive
        setTimeout(() => resolve(), 100);
      };

      // Request any remaining data before stopping to ensure all chunks are flushed
      this.recorder!.requestData();
      this.recorder!.stop();
    });

    const durationMs = Date.now() - this.startTime;

    // Ensure we have chunks
    if (this.chunks.length === 0) {
      throw new Error('No video data recorded - the recording may have failed');
    }

    // Create blob with explicit type
    let blob = new Blob(this.chunks, { type: this.mimeType || 'video/webm' });

    console.log('Recording stopped (before duration fix):', {
      durationMs,
      size: blob.size,
      type: blob.type,
      chunks: this.chunks.length
    });

    // Validate blob size (should be at least 1KB for a valid video)
    if (blob.size < 1000) {
      throw new Error(`Recording too small (${blob.size} bytes) - video may be corrupted`);
    }

    // Fix WebM duration metadata to ensure proper processing by Catalyst/MediaConvert
    // This adds the duration field that's missing when concatenating MediaRecorder chunks
    try {
      console.log('Fixing WebM duration metadata...');
      blob = await fixWebmDuration(blob, durationMs, { logger: false });
      console.log('WebM duration fixed:', {
        newSize: blob.size,
        durationMs
      });
    } catch (error) {
      console.error('Failed to fix WebM duration (proceeding anyway):', error);
      // Continue with original blob if fixing fails
    }

    return { blob, durationMs, mimeType: this.mimeType };
  }

  /**
   * Check if captureStream is supported
   */
  static isSupported(videoElement: HTMLVideoElement): boolean {
    return typeof (videoElement as HTMLVideoElementWithCapture).captureStream === 'function';
  }
}

/**
 * Upload a recorded blob to Livepeer Studio and wait for asset to be ready
 */
export async function uploadToLivepeer(
  blob: Blob,
  filename: string,
  onProgress?: (progress: UploadProgress) => void,
  onUploadDone?: (result: UploadDoneResult) => void
): Promise<UploadResult> {
  // Step 1: Request upload URL from server
  console.log('Requesting upload URL...');
  const { data: uploadData, error: uploadError } = await supabase.functions.invoke(
    'studio-request-upload',
    { body: {} }
  );

  if (uploadError) {
    console.error('Failed to request upload URL:', uploadError);
    throw new Error(`Failed to request upload: ${uploadError.message || 'Unknown error'}`);
  }

  if (!uploadData?.assetId) {
    console.error('Invalid upload response:', uploadData);
    throw new Error('Failed to get asset ID from server');
  }

  console.log('Got upload data for asset:', uploadData.assetId);

  // Step 2: Upload using TUS resumable upload (preferred) or PUT fallback
  const file = new File([blob], filename, { type: blob.type });

  let uploaded = false;
  if (uploadData.tusEndpoint) {
    // Use TUS resumable upload
    console.log('Starting TUS upload...', {
      size: blob.size,
      type: blob.type,
      filename,
      tusEndpoint: uploadData.tusEndpoint
    });

    onProgress?.({ phase: 'uploading', step: 'Uploading...' });

    try {
      await new Promise<void>((resolve, reject) => {
        // Create TUS upload inside the promise
        const upload = new tus.Upload(file, {
          endpoint: uploadData.tusEndpoint,
          retryDelays: [0, 1000, 2000, 5000, 10000, 20000],
          metadata: {
            filename: filename,
            filetype: blob.type || 'video/webm',
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            const progress = bytesUploaded / bytesTotal;
            onProgress?.({
              phase: 'uploading',
              step: `Uploading...`,
              progress
            });
          },
          onSuccess: () => {
            console.log('TUS upload completed successfully');
            resolve();
          },
          onError: (error) => {
            console.error('TUS upload failed:', error);
            reject(new Error(`TUS upload failed: ${error.message || 'Unknown error'}`));
          }
        });

        upload.start();
      });
      uploaded = true;
    } catch (error) {
      console.error('TUS upload failed:', error);
    }
  }
  if (!uploaded && uploadData?.uploadUrl) {
    // Fallback to PUT upload
    console.log('TUS not available, using PUT upload fallback...', {
      size: blob.size,
      type: blob.type,
      filename,
      uploadUrl: uploadData.uploadUrl
    });

    onProgress?.({ phase: 'uploading', step: 'Uploading...' });

    const putResponse = await fetch(uploadData.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': blob.type || 'video/webm',
      },
      body: blob,
    });

    if (!putResponse.ok) {
      const errorText = await putResponse.text().catch(() => 'Unknown error');
      console.error('PUT upload failed:', putResponse.status, errorText);
      throw new Error(`Upload failed: ${putResponse.status} - ${errorText}`);
    }
    uploaded = true;

    console.log('PUT upload successful');
  }
  if (!uploaded) {
    throw new Error('Upload failed');
  }

  // Step 3: Poll for asset readiness with better error handling
  let attempts = 0;
  const maxAttempts = 300; // 5 minutes max (polling every 1s)
  let assetData: {
    status?: string;
    playbackId?: string;
    downloadUrl?: string;
    error?: { message?: string };
    progress?: number;
  } | null = null;
  let uploadDoneCalled = false;

  while (attempts < maxAttempts) {
    const { data, error } = await supabase.functions.invoke('studio-asset-status', {
      body: { assetId: uploadData.assetId },
    });

    if (error) {
      console.error('Error checking asset status:', error);
      throw new Error(`Failed to check asset status: ${error.message || 'Unknown error'}`);
    }

    assetData = data as typeof assetData;
    const status = assetData?.status;
    const progress = assetData?.progress || (attempts / maxAttempts);
    console.log(`Asset status (attempt ${attempts + 1}/${maxAttempts}):`, status, assetData);

    // Notify that upload is done and processing has started (first time we see 'processing' status)
    if (!uploadDoneCalled && status === 'processing') {
      uploadDoneCalled = true;
      onUploadDone?.({
        assetId: uploadData.assetId,
        playbackId: uploadData.playbackId,
        rawUploadedFileUrl: uploadData.rawUploadedFileUrl
      });
    }

    // Report progress to caller
    onProgress?.({
      phase: 'processing',
      step: `Processing: ${status || 'waiting'}...`,
      progress: Math.min(progress, 99), // Cap at 99% until ready
    });

    if (status === 'ready') {
      console.log('Asset is ready!', assetData);
      break;
    }

    if (status === 'failed' || status === 'error') {
      const errorMsg = assetData?.error?.message || 'Unknown processing error';
      console.error('Asset processing failed:', errorMsg, assetData);
      throw new Error(`Video processing failed: ${errorMsg}. The video file may be invalid or unsupported.`);
    }

    attempts++;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (assetData?.status !== 'ready') {
    console.error('Asset processing timeout. Last status:', assetData);
    throw new Error('Video processing timed out after 5 minutes. Please try recording again.');
  }

  if (!assetData?.playbackId) {
    console.error('Asset ready but no playbackId:', assetData);
    throw new Error('Video processed but playback ID is missing');
  }

  onProgress?.({ phase: 'complete', step: 'Complete!', progress: 100 });

  return {
    assetId: uploadData.assetId,
    playbackId: assetData.playbackId!,
    downloadUrl: assetData.downloadUrl,
    rawUploadedFileUrl: uploadData.rawUploadedFileUrl,
  };
}

