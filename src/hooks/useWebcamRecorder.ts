import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { writeBinaryFile, createDir } from "@tauri-apps/api/fs";
import { appDataDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/tauri";

export interface WebcamOptions {
  deviceId?: string;
  width?: number; // 1280, 1920
  height?: number; // 720, 1080
  fps?: number; // 30, 60
  includeMic?: boolean;
}

export interface WebcamState {
  isRecording: boolean;
  elapsedMs: number;
  previewStream: MediaStream | null;
  tempWebmPath?: string;
  outputMp4Path?: string;
  error?: string | null;
}

export interface DeviceInfo { id: string; label: string; kind: "videoinput" | "audioinput" | string; }

export function useWebcamRecorder() {
  const [state, setState] = useState<WebcamState>({ isRecording: false, elapsedMs: 0, previewStream: null });
  const chunksRef = useRef<BlobPart[]>([]);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const startedAtRef = useRef<number>(0);

  const listVideoDevices = useCallback(async (): Promise<DeviceInfo[]> => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === "videoinput").map(d => ({ id: d.deviceId, label: d.label || "Camera", kind: d.kind }));
  }, []);

  const ensurePreview = useCallback(async (opts?: WebcamOptions) => {
    // Stop previous stream
    if (state.previewStream) {
      state.previewStream.getTracks().forEach(t => t.stop());
    }
    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: opts?.deviceId ? { exact: opts.deviceId } : undefined,
        width: opts?.width || 1920,
        height: opts?.height || 1080,
        frameRate: opts?.fps || 30,
      },
      audio: opts?.includeMic || false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    setState(s => ({ ...s, previewStream: stream }));
    return stream;
  }, [state.previewStream]);

  const start = useCallback(async (opts?: WebcamOptions) => {
    try {
      const stream = state.previewStream || await ensurePreview(opts);
      chunksRef.current = [];
      startedAtRef.current = Date.now();

      // Pick supported MIME
      let mime = "video/webm;codecs=vp9,opus";
      if (!MediaRecorder.isTypeSupported(mime)) mime = "video/webm;codecs=vp8,opus";
      if (!MediaRecorder.isTypeSupported(mime)) mime = "video/webm";

      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 });
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {};
      rec.start(1000);
      mediaRecRef.current = rec;
      setState(s => ({ ...s, isRecording: true, elapsedMs: 0, error: null }));
      // Tick elapsed
      const tick = () => {
        if (!mediaRecRef.current) return;
        const elapsed = Date.now() - startedAtRef.current;
        setState(s => ({ ...s, elapsedMs: elapsed }));
        if (mediaRecRef.current && mediaRecRef.current.state === "recording") requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) {
      setState(s => ({ ...s, error: e instanceof Error ? e.message : String(e) }));
      throw e;
    }
  }, [ensurePreview, state.previewStream]);

  const stop = useCallback(async () => {
    if (!mediaRecRef.current) return null;
    const rec = mediaRecRef.current;
    mediaRecRef.current = null;
    if (rec.state !== "inactive") rec.stop();
    // Build blob
    const blob = new Blob(chunksRef.current, { type: chunksRef.current[0] ? (chunksRef.current[0] as any).type || "video/webm" : "video/webm" });
    chunksRef.current = [];

    // Save to app_data_dir/recordings
    const dir = (await appDataDir()) + "recordings";
    await createDir(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "").replace("T", "_").slice(0, 15);
    const webmPath = `${dir}/Camera_${ts}.webm`;
    const mp4Path = `${dir}/Camera_${ts}.mp4`;
    const buf = new Uint8Array(await blob.arrayBuffer());
    await writeBinaryFile(webmPath, buf);
    setState(s => ({ ...s, tempWebmPath: webmPath }));

    // Transcode via backend
    const out = await invoke<string>("transcode_recording", { inputPath: webmPath, outputPath: mp4Path });
    setState(s => ({ ...s, isRecording: false, outputMp4Path: out }));
    return out;
  }, []);

  useEffect(() => {
    return () => {
      if (state.previewStream) state.previewStream.getTracks().forEach(t => t.stop());
      if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") mediaRecRef.current.stop();
    };
  }, [state.previewStream]);

  const prettyElapsed = useMemo(() => {
    const s = Math.floor((state.elapsedMs || 0) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [state.elapsedMs]);

  return { state, listVideoDevices, ensurePreview, start, stop, prettyElapsed };
}


