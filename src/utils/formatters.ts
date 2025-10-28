import type { VideoMetadata } from "../types/media";

/**
 * Format duration in seconds to human-readable string
 * @param seconds - Duration in seconds
 * @returns Formatted string (e.g., "1:23", "1:23:45")
 */
export const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }
};

/**
 * Format file size in bytes to human-readable string
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.2 MB", "500 KB")
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  if (i === 0) return `${bytes} ${units[i]}`;
  
  const size = bytes / Math.pow(k, i);
  return `${size.toFixed(1)} ${units[i]}`;
};

/**
 * Format bitrate in bits per second to kbps
 * @param bps - Bitrate in bits per second
 * @returns Formatted string (e.g., "1500 kbps")
 */
export const formatBitrate = (bps: number): string => {
  const kbps = Math.round(bps / 1000);
  return `${kbps} kbps`;
};

/**
 * Format resolution as width x height
 * @param width - Video width in pixels
 * @param height - Video height in pixels
 * @returns Formatted string (e.g., "1920x1080")
 */
export const formatResolution = (width: number, height: number): string => {
  return `${width}x${height}`;
};

/**
 * Format frame rate with 1 decimal place
 * @param fps - Frames per second
 * @returns Formatted string (e.g., "30.0 fps")
 */
export const formatFps = (fps: number): string => {
  return `${fps.toFixed(1)} fps`;
};

/**
 * Get a user-friendly description of the video metadata
 * @param metadata - Video metadata object
 * @returns Formatted description string
 */
export const getVideoDescription = (metadata: VideoMetadata): string => {
  const parts: string[] = [];
  
  parts.push(formatResolution(metadata.width, metadata.height));
  
  if (metadata.fps) {
    parts.push(formatFps(metadata.fps));
  }
  
  parts.push(metadata.codec.toUpperCase());
  
  if (metadata.containerFormat) {
    parts.push(metadata.containerFormat.toUpperCase());
  }
  
  return parts.join(" • ");
};

