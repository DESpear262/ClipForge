import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { VideoMetadata } from "../types/media";

/**
 * Custom hook for FFmpeg operations
 * 
 * Provides functions to probe video metadata and execute FFmpeg commands.
 * Used by the import workflow (PR #4) and export pipeline (PR #8).
 */
export const useFFmpeg = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Probe video file metadata using FFprobe
   * 
   * Returns duration, resolution, codec, and file size information
   * @param videoPath - Absolute path to video file
   * @returns Promise with VideoMetadata or null on error
   */
  const probeMetadata = useCallback(
    async (videoPath: string): Promise<VideoMetadata | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const metadata = await invoke<VideoMetadata>(
          "probe_video_metadata",
          { videoPath }
        );
        setIsLoading(false);
        return metadata;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        console.error("FFprobe error:", errorMsg);
        setIsLoading(false);
        return null;
      }
    },
    []
  );

  /**
   * Execute FFmpeg command for video processing
   * 
   * Placeholder for PR #8 (FFmpeg Export Pipeline)
   * Will be used for trimming and exporting videos
   */
  const executeFFmpeg = useCallback(
    async (args: string[]): Promise<boolean> => {
      setIsLoading(true);
      setError(null);

      try {
        // TODO: Implement FFmpeg execution in PR #8
        console.log("FFmpeg execution with args:", args);
        setIsLoading(false);
        return true;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        console.error("FFmpeg execution error:", errorMsg);
        setIsLoading(false);
        return false;
      }
    },
    []
  );

  return {
    probeMetadata,
    executeFFmpeg,
    isLoading,
    error,
  };
};

