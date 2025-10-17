/**
 * StudioRecorder - A reusable component that wraps any content and handles
 * recording → Livepeer Studio upload → asset processing.
 *
 * This component provides recording capabilities for any HTML video or canvas element
 * within its children, exposing controls via ref handle and progress via callbacks.
 */

import React, { forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import { VideoRecorder, uploadToLivepeer, type UploadDoneResult } from '@/lib/recording';

export interface StudioRecorderHandle {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
}

export interface StudioRecorderProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;

  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  onProgress?: (progress: UploadProgress) => void;
  onUploadDone?: (result: UploadDoneResult) => void;
  onComplete?: (result: RecordingResult) => void;
  onError?: (error: Error) => void;
}

export interface RecordingResult {
  assetId: string;
  playbackId: string;
  downloadUrl?: string;
  rawUploadedFileUrl?: string;
  durationMs: number;
}

export interface UploadProgress {
  phase: 'recording' | 'uploading' | 'processing' | 'complete';
  step?: string;
  progress?: number;
}

export const StudioRecorder = forwardRef<StudioRecorderHandle, StudioRecorderProps>(
  ({ children, className, style, onRecordingStart, onRecordingStop, onProgress, onUploadDone, onComplete, onError }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const recorderRef = useRef<VideoRecorder | null>(null);
    const recordStartTimeRef = useRef<number | null>(null);
    const isRecordingRef = useRef<boolean>(false);
    const isProcessingRef = useRef<boolean>(false);

    const startRecording = useCallback(async () => {
      // Prevent multiple simultaneous recordings
      if (isRecordingRef.current) {
        console.warn('Recording already in progress');
        return;
      }

      // Prevent starting while processing a previous recording
      if (isProcessingRef.current) {
        console.warn('Still processing previous recording');
        return;
      }

      try {
        // Find video or canvas element in children
        let videoElement = containerRef.current?.querySelector('video') as HTMLVideoElement;

        // If no video element found, try canvas
        if (!videoElement) {
          const canvasElement = containerRef.current?.querySelector('canvas') as HTMLCanvasElement;
          if (canvasElement) {
            // Canvas elements support captureStream too
            videoElement = canvasElement as unknown as HTMLVideoElement;
          }
        }

        if (!videoElement) {
          throw new Error('No video or canvas element found in StudioRecorder children');
        }

        // Check if captureStream is supported
        if (!VideoRecorder.isSupported(videoElement)) {
          throw new Error('Video capture not supported on this browser');
        }

        // Create and start recorder
        const recorder = new VideoRecorder(videoElement);
        await recorder.start();

        recorderRef.current = recorder;
        recordStartTimeRef.current = Date.now();
        isRecordingRef.current = true;

        onProgress?.({ phase: 'recording', step: 'Recording...' });
        onRecordingStart?.();

        console.log('StudioRecorder: Recording started');
      } catch (error) {
        console.error('StudioRecorder: Failed to start recording', error);
        isRecordingRef.current = false;
        recorderRef.current = null;
        recordStartTimeRef.current = null;
        onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    }, [onRecordingStart, onProgress, onError]);

    const stopRecording = useCallback(async () => {
      if (!recorderRef.current || !recordStartTimeRef.current) {
        console.warn('No active recording to stop');
        return;
      }

      // Mark as no longer recording (but processing)
      isRecordingRef.current = false;
      isProcessingRef.current = true;

      const recordingDuration = Date.now() - recordStartTimeRef.current;

      try {
        // Stop the recorder and get the blob
        console.log('StudioRecorder: Stopping recorder...');
        const { blob, durationMs } = await recorderRef.current.stop();
        recorderRef.current = null;
        recordStartTimeRef.current = null;

        onRecordingStop?.();

        console.log('StudioRecorder: Recording stopped, uploading to Livepeer...', {
          durationMs,
          size: blob.size,
        });

        // Generate filename with timestamp
        const timestamp = Date.now();
        const filename = `studio-recording-${timestamp}.webm`;

        // Upload to Livepeer Studio with progress tracking
        onProgress?.({ phase: 'uploading', step: 'Uploading...' });

        const { assetId, playbackId, downloadUrl, rawUploadedFileUrl } = await uploadToLivepeer(
          blob,
          filename,
          (progress) => {
            // Forward progress updates to parent
            onProgress?.(progress as UploadProgress);
          },
          (uploadDoneResult) => {
            // Forward upload done notification to parent
            onUploadDone?.(uploadDoneResult);
          }
        );

        console.log('StudioRecorder: Upload complete', { assetId, playbackId, downloadUrl, rawUploadedFileUrl });

        // Notify completion with asset info
        onProgress?.({ phase: 'complete', step: 'Complete!', progress: 100 });
        onComplete?.({
          assetId,
          playbackId,
          downloadUrl,
          rawUploadedFileUrl,
          durationMs,
        });
      } catch (error) {
        console.error('StudioRecorder: Failed to stop/upload recording', error);
        onError?.(error instanceof Error ? error : new Error(String(error)));
      } finally {
        isProcessingRef.current = false;
      }
    }, [onRecordingStop, onProgress, onUploadDone, onComplete, onError]);

    // Cleanup on unmount
    React.useEffect(() => {
      return () => {
        if (recorderRef.current) {
          console.log('StudioRecorder: Cleaning up recorder on unmount');
          recorderRef.current.stop().catch(console.error);
          recorderRef.current = null;
        }
        isRecordingRef.current = false;
        isProcessingRef.current = false;
        recordStartTimeRef.current = null;
      };
    }, []);

    // Expose handle methods
    useImperativeHandle(
      ref,
      () => ({
        startRecording,
        stopRecording,
      }),
      [startRecording, stopRecording]
    );

    // Render children wrapped in a container div
    // Default to full width/height to not interfere with layout
    return (
      <div
        ref={containerRef}
        className={className || 'w-full h-full'}
        style={style || { width: '100%', height: '100%' }}
      >
        {children}
      </div>
    );
  }
);

StudioRecorder.displayName = 'StudioRecorder';

