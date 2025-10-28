import React, { useRef, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import type { ProjectClip } from "../context/ProjectContext";
import { formatDuration } from "../utils/formatters";

/**
 * Video player component with custom controls
 * 
 * Provides play/pause, seek, and time display functionality
 *
 * Architecture notes:
 * - Uses Tauri v2 asset resolution via `convertFileSrc()` to safely expose
 *   local file paths to the WebView (served under the asset protocol).
 * - Falls back to a Blob URL via plugin-fs if the asset URL is not reachable
 *   in the current environment (e.g., dev server refusing asset.localhost).
 */
interface VideoPlayerProps {
  clip: ProjectClip;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ clip, onTimeUpdate }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string>("");
  
  // Infer MIME type for Blob fallback
  const mimeFromExt = (path: string) => {
    const ext = path.toLowerCase().split(".").pop() || "";
    if (ext === "mp4") return "video/mp4";
    if (ext === "webm") return "video/webm";
    if (ext === "mov") return "video/quicktime";
    return "application/octet-stream";
  };

  // Helpful pretty printer for ready/network state
  const logVideoState = (ctx: string) => {
    const v = videoRef.current;
    if (!v) return;
    const readyMap: Record<number, string> = {
      0: "HAVE_NOTHING",
      1: "HAVE_METADATA",
      2: "HAVE_CURRENT_DATA",
      3: "HAVE_FUTURE_DATA",
      4: "HAVE_ENOUGH_DATA",
    };
    const netMap: Record<number, string> = {
      0: "NETWORK_EMPTY",
      1: "NETWORK_IDLE",
      2: "NETWORK_LOADING",
      3: "NETWORK_NO_SOURCE",
    };
    console.log(
      `[VideoPlayer] ${ctx} src=`, v.currentSrc,
      `readyState=`, v.readyState, readyMap[v.readyState] ?? "?",
      `networkState=`, v.networkState, netMap[v.networkState] ?? "?",
      `time=`, v.currentTime,
      `dur=`, v.duration
    );
  };

  // No additional helpers needed when using convertFileSrc

  /**
   * Handle play/pause toggle
   */
  const handlePlayPause = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  /**
   * Handle seek bar input
   */
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;

    const seekTime = (parseFloat(e.target.value) / 100) * duration;
    videoRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  /**
   * Handle video time updates
   */
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;

    const current = videoRef.current.currentTime;
    const total = videoRef.current.duration;

    setCurrentTime(current);
    if (total && total !== duration) {
      setDuration(total);
    }

    // Notify parent component of time updates
    if (onTimeUpdate) {
      onTimeUpdate(current, total);
    }
  };

  /**
   * Handle video loaded metadata
   */
  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;

    setDuration(videoRef.current.duration);
    setIsLoading(false);
    setHasError(false);
  };

  /**
   * Handle video play/pause events
   */
  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  /**
   * Handle video error
   */
  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
    setIsPlaying(false);
  };

  /**
   * Handle video ended
   */
  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Resolve a URL for the local file via the asset protocol
  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    try {
      const url = convertFileSrc(clip.filePath);
      console.log("[VideoPlayer] Using asset URL:", url);
      setVideoSrc(url);
      // Fire a diagnostic HEAD request for visibility (non-blocking for playback)
      // This helps us log why asset.localhost might fail in dev.
      try {
        fetch(url, { method: "HEAD" })
          .then(async (res) => {
            console.log("[VideoPlayer] HEAD asset status:", res.status, res.statusText);
            console.log("[VideoPlayer] HEAD asset headers:", Object.fromEntries(res.headers.entries()));
          })
          .catch((err) => {
            console.warn("[VideoPlayer] HEAD asset failed:", err);
          });
      } catch (e) {
        console.warn("[VideoPlayer] HEAD asset threw:", e);
      }
    } catch (e) {
      console.error("Failed to resolve video path:", e);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [clip.filePath]);

  // Fallback: if the asset URL fails to load, read file and create a blob URL
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleSourceError = async () => {
      try {
        console.warn("[VideoPlayer] Asset URL failed, falling back to blob...");
        setIsLoading(true);
        logVideoState("onerror-before-fallback");
        const bytes = await readFile(clip.filePath);
        const blob = new Blob([bytes], { type: mimeFromExt(clip.filePath) });
        const blobUrl = URL.createObjectURL(blob);
        console.log("[VideoPlayer] Blob URL created, length(bytes)=", bytes.byteLength);
        setVideoSrc(blobUrl);
      } catch (err) {
        console.error("[VideoPlayer] Fallback failed:", err);
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    };

    video.addEventListener("error", handleSourceError, { once: true });
    return () => {
      video.removeEventListener("error", handleSourceError as any);
    };
  }, [clip.filePath, videoSrc]);

  // Set up event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const log = (e: Event) => {
      logVideoState(`event:${e.type}`);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("error", handleError);
    video.addEventListener("ended", handleEnded);
    // Extra diagnostics
    [
      "abort","canplay","canplaythrough","durationchange","emptied","loadeddata",
      "loadedmetadata","loadstart","progress","ratechange","seeked","seeking",
      "stalled","suspend","waiting"
    ].forEach((name) => video.addEventListener(name, log));

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("error", handleError);
      video.removeEventListener("ended", handleEnded);
      [
        "abort","canplay","canplaythrough","durationchange","emptied","loadeddata",
        "loadedmetadata","loadstart","progress","ratechange","seeked","seeking",
        "stalled","suspend","waiting"
      ].forEach((name) => video.removeEventListener(name, log));
    };
  }, []);

  // No blob URL cleanup needed when using convertFileSrc

  // Calculate seek bar progress
  const seekProgress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (hasError) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 text-center">
        <div className="text-red-400 text-4xl mb-4">⚠️</div>
        <h3 className="text-xl font-semibold text-white mb-2">Cannot Load Video</h3>
        <p className="text-gray-400 mb-4">
          The video file may be corrupted or in an unsupported format.
        </p>
        <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-black font-semibold">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      {/* Video Element */}
      <div className="relative">
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            className="w-full h-auto max-h-96"
            preload="metadata"
          />
        ) : (
          <div className="w-full h-60 bg-black" />
        )}
        
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center">
            <div className="text-white">Loading video...</div>
          </div>
        )}
      </div>

      {/* Custom Controls */}
      <div className="p-4 space-y-3">
        {/* Seek Bar */}
        <div className="flex items-center space-x-3">
          <input
            type="range"
            min="0"
            max="100"
            value={seekProgress}
            onChange={handleSeek}
            className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
            disabled={isLoading}
          />
        </div>

        {/* Control Buttons and Time */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={handlePlayPause}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-black font-semibold disabled:opacity-50"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
          </div>

          <div className="text-white font-mono text-sm">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;

