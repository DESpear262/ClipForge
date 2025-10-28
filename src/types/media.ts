/**
 * Type definitions for media-related structures
 */

/**
 * Video metadata returned by FFprobe
 */
export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  bitrate?: number;
  codec: string;
  size: number;
}

/**
 * Trim parameters for video editing
 */
export interface TrimParams {
  start: number; // Start time in seconds
  end: number;  // End time in seconds
}

/**
 * Export progress information
 */
export interface ExportProgress {
  percentage: number;
  time: number; // Current time in seconds
}

