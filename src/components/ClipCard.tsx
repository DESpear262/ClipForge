import React from "react";
import type { ProjectClip } from "../context/ProjectContext";
import { useFFmpeg } from "../hooks/useFFmpeg";
import { useToast } from "../hooks/useToast";
import {
  formatDuration,
  formatFileSize,
  formatBitrate,
  getVideoDescription,
} from "../utils/formatters";

/**
 * Individual clip card component
 * 
 * Displays video metadata in a compact card format
 */
interface ClipCardProps {
  clip: ProjectClip;
  onRetryProbe?: (clipId: string) => void;
}

const ClipCard: React.FC<ClipCardProps> = ({ clip, onRetryProbe }) => {
  const { probeMetadata } = useFFmpeg();
  const { showToast } = useToast();

  /**
   * Retry metadata probing for this clip
   */
  const handleRetryProbe = async () => {
    if (!onRetryProbe) return;

    try {
      const metadata = await probeMetadata(clip.filePath);
      if (metadata) {
        onRetryProbe(clip.id);
        showToast("Metadata updated successfully", "success");
      } else {
        showToast("Failed to probe metadata", "error");
      }
    } catch (error) {
      console.error("Retry probe error:", error);
      showToast("Failed to probe metadata", "error");
    }
  };

  if (!clip.metadata) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-white truncate">{clip.fileName}</h3>
          <button
            onClick={handleRetryProbe}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded transition-colors text-black font-semibold"
          >
            Retry Probe
          </button>
        </div>
        <p className="text-gray-400 text-sm">Metadata not available</p>
      </div>
    );
  }

  const { metadata } = clip;

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-white truncate">{clip.fileName}</h3>
        <button
          onClick={handleRetryProbe}
          className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 rounded transition-colors text-black font-semibold"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">Duration:</span>
          <span className="text-white font-mono text-sm">
            {formatDuration(metadata.duration)}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">Resolution:</span>
          <span className="text-white font-mono text-sm">
            {metadata.width}x{metadata.height}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">Size:</span>
          <span className="text-white font-mono text-sm">
            {formatFileSize(metadata.size)}
          </span>
        </div>

        {metadata.bitrate && (
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">Bitrate:</span>
            <span className="text-white font-mono text-sm">
              {formatBitrate(metadata.bitrate)}
            </span>
          </div>
        )}

        {metadata.fps && (
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">Frame Rate:</span>
            <span className="text-white font-mono text-sm">
              {metadata.fps.toFixed(1)} fps
            </span>
          </div>
        )}

        <div className="pt-2 border-t border-gray-700">
          <p className="text-gray-300 text-xs">
            {getVideoDescription(metadata)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ClipCard;

