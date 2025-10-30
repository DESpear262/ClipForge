import React, { useRef, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { readBinaryFile } from "@tauri-apps/api/fs";
import type { ProjectClip } from "../context/ProjectContext";

/**
 * Video player component with custom controls
 * 
 * Provides play/pause, seek, and time display functionality
 *
 * Architecture notes:
 * - Uses Tauri v1 asset protocol via `convertFileSrc()` to safely expose
 *   local file paths to the WebView (served under the asset protocol).
 * - Falls back to a Blob URL via `readBinaryFile()` if the asset URL is not
 *   reachable in the current environment (e.g., dev refusing asset.localhost).
 */
interface VideoPlayerProps {
  clip: ProjectClip;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  /**
   * Provides an API to control the player (seek/play/pause) once ready
   */
  onReady?: (api: { seek: (t: number) => void; play: () => void; pause: () => void; getDuration: () => number }) => void;
  /**
   * Show native controls. Defaults to true.
   */
  showControls?: boolean;
  /**
   * Start muted. Defaults to false.
   */
  muted?: boolean;
  /**
   * Playback volume 0..1. Defaults to 1.
   */
  volume?: number;
  /**
   * Optional callbacks for play/pause state changes of the native video.
   */
  onPlay?: () => void;
  onPause?: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ clip, onTimeUpdate, onReady, showControls = true, muted = false, volume = 1, onPlay, onPause }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [, setIsPlaying] = useState(false);
  const [, setCurrentTime] = useState(0);
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
  // Note: Native controls handle play/pause

  /**
   * Handle seek bar input
   */
  // Note: Native controls handle seek

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
    console.log("[VideoPlayer] loadedmetadata: duration=", videoRef.current.duration, "videoSrc=", videoSrc);
    setDuration(videoRef.current.duration);
    setIsLoading(false);
    setHasError(false);
    // Expose control API when metadata is ready
    if (onReady && videoRef.current) {
      const vid = videoRef.current;
      onReady({
        seek: (t: number) => {
          try {
            const nt = Math.max(0, t);
            console.log("[VideoPlayer] external seek ->", nt.toFixed(3));
            vid.currentTime = nt;
          } catch {}
        },
        play: () => { try { vid.play(); } catch {} },
        pause: () => { try { vid.pause(); } catch {} },
        getDuration: () => vid.duration || 0,
      });
    }
  };

  /**
   * Handle video play/pause events
   */
  const handlePlay = () => { setIsPlaying(true); try { onPlay?.(); } catch {} };
  const handlePause = () => { setIsPlaying(false); try { onPause?.(); } catch {} };

  /**
   * Handle video error
   */
  const handleError = () => {
    if (videoRef.current) {
      const err = (videoRef.current as any).error;
      console.warn("[VideoPlayer] error event:", err);
      logVideoState("onerror");
    }
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
      // Clear previous source first to force a clean re-init
      setVideoSrc("");
      if (clip.filePath.toLowerCase().endsWith(".webm")) {
        // For previews, avoid asset.localhost entirely; read and create blob directly
        (async () => {
          try {
            console.time("[VideoPlayer] readFile(.webm)");
            const bytes = await readBinaryFile(clip.filePath);
            console.timeEnd("[VideoPlayer] readFile(.webm)");
            const uint = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as any);
            const buffer = uint.buffer.slice(uint.byteOffset, uint.byteOffset + uint.byteLength);
            const blob = new Blob([buffer], { type: "video/webm" });
            const blobUrl = URL.createObjectURL(blob);
            console.log("[VideoPlayer] Blob URL (.webm) created, bytes=", uint.byteLength);
            setVideoSrc(blobUrl);
          } catch (e) {
            console.error("[VideoPlayer] Failed to create blob from .webm:", e);
            setHasError(true);
          } finally {
            setIsLoading(false);
          }
        })();
      } else {
        const url = convertFileSrc(clip.filePath);
        console.log("[VideoPlayer] Using asset URL:", url);
        setVideoSrc(url);
      }
    } catch (e) {
      console.error("Failed to resolve video path:", e);
      setHasError(true);
    } finally {
      if (!clip.filePath.toLowerCase().endsWith(".webm")) {
        setIsLoading(false);
      }
    }
  }, [clip.filePath]);

  // When the source changes, explicitly reload the video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;
    try {
      // Ensure the element reloads the new source
      console.log("[VideoPlayer] load() start for src:", videoSrc);
      video.src = videoSrc;
      video.load();
      setTimeout(() => {
        logVideoState("after-load-timeout-100ms");
      }, 100);
    } catch (e) {
      console.warn("[VideoPlayer] load() failed: ", e);
    }
  }, [videoSrc]);

  // Fallback: if the asset URL fails to load, read file and create a blob URL
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleSourceError = async () => {
      try {
        console.warn("[VideoPlayer] Asset URL failed, falling back to blob...");
        setIsLoading(true);
        logVideoState("onerror-before-fallback");
        console.time("[VideoPlayer] readFile");
        const bytes = await readBinaryFile(clip.filePath);
        console.timeEnd("[VideoPlayer] readFile");
        // Normalize to a contiguous ArrayBuffer for Blob
        const uint = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as any);
        const buffer = uint.buffer.slice(uint.byteOffset, uint.byteOffset + uint.byteLength);
        const mime = mimeFromExt(clip.filePath);
        const blob = new Blob([buffer], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        console.log("[VideoPlayer] Blob URL created, bytes=", uint.byteLength, "mime=", mime);
        setVideoSrc(blobUrl);
        // Ensure the element reloads to the blob immediately
        const v = videoRef.current;
        if (v) {
          v.src = blobUrl;
          v.load();
          setTimeout(() => {
            logVideoState("after-blob-load-timeout-100ms");
          }, 100);
        }
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

  // Set up event listeners after a source is set
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
  }, [videoSrc]);

  // Apply volume changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    try { video.volume = Math.max(0, Math.min(1, volume)); } catch {}
  }, [volume]);

  // No blob URL cleanup needed when using convertFileSrc

  // Calculate seek bar progress
  // Seek progress derived from native controls when needed

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
            key={videoSrc}
            ref={videoRef}
            className="w-full h-auto max-h-96"
            preload="auto"
            controls={showControls}
            playsInline
            muted={muted}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={handlePlay}
            onPause={handlePause}
            onError={handleError}
            onEnded={handleEnded}
          >
            <source src={videoSrc} type={mimeFromExt(clip.filePath)} />
          </video>
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

      {/* Native controls handle play/pause/seek/time; external controls removed */}
    </div>
  );
};

export default VideoPlayer;

