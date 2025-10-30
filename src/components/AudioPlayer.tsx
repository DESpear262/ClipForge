import React, { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { readBinaryFile } from "@tauri-apps/api/fs";

interface AudioPlayerProps {
  srcPath: string;
  onReady?: (api: { seek: (t: number) => void; play: () => void; pause: () => void; getDuration: () => number }) => void;
  volume?: number;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ srcPath, onReady, volume = 1 }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioSrc, setAudioSrc] = useState<string>("");

  useEffect(() => {
    // Load via blob for webm/mp3/wav, or asset URL
    const load = async () => {
      try {
        if (srcPath.toLowerCase().endsWith(".webm") || srcPath.toLowerCase().endsWith(".mp3") || srcPath.toLowerCase().endsWith(".wav")) {
          const bytes = await readBinaryFile(srcPath);
          const uint = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as any);
          const buffer = uint.buffer.slice(uint.byteOffset, uint.byteOffset + uint.byteLength);
          const ext = srcPath.split(".").pop()?.toLowerCase();
          const mime = ext === "mp3" ? "audio/mpeg" : ext === "wav" ? "audio/wav" : "audio/webm";
          const blob = new Blob([buffer], { type: mime });
          setAudioSrc(URL.createObjectURL(blob));
        } else {
          setAudioSrc(convertFileSrc(srcPath));
        }
      } catch (e) {
        try { console.warn("[AudioPlayer] failed to load", e); } catch {}
      }
    };
    setAudioSrc("");
    void load();
  }, [srcPath]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioSrc) return;
    el.src = audioSrc;
    el.load();
  }, [audioSrc]);

  // Apply volume
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    try { el.volume = Math.max(0, Math.min(1, volume)); } catch {}
  }, [volume]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onLoaded = () => {
      onReady?.({
        seek: (t: number) => { try { el.currentTime = Math.max(0, t); } catch {} },
        play: () => { try { el.play(); } catch {} },
        pause: () => { try { el.pause(); } catch {} },
        getDuration: () => el.duration || 0,
      });
    };
    el.addEventListener("loadedmetadata", onLoaded, { once: true });
    return () => { el.removeEventListener("loadedmetadata", onLoaded as any); };
  }, [audioSrc]);

  return <audio ref={audioRef} className="hidden" />;
};

export default AudioPlayer;


