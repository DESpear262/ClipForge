import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface MicOptions { deviceId?: string; echoCancellation?: boolean; noiseSuppression?: boolean; autoGain?: boolean; }
export interface MicState { stream: MediaStream | null; level: number; deviceId?: string; error?: string | null; isRecording?: boolean; }

export function useMicrophone() {
  const [state, setState] = useState<MicState>({ stream: null, level: 0, isRecording: false });
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const srcNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const previewPromiseRef = useRef<Promise<MediaStream> | null>(null);

  const listDevices = useCallback(async () => {
    const devs = await navigator.mediaDevices.enumerateDevices();
    try { console.info("[mic] devices:", devs); } catch {}
    return devs.filter(d => d.kind === "audioinput").map(d => ({ id: d.deviceId, label: d.label || "Microphone" }));
  }, []);

  const startPreview = useCallback(async (opts?: MicOptions) => {
    try {
      if (previewPromiseRef.current) {
        try { const s = await previewPromiseRef.current; return s; } catch { /* fallthrough */ }
      }
      if (state.stream) state.stream.getTracks().forEach(t => t.stop());
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: opts?.deviceId && opts.deviceId !== "default" ? { exact: opts.deviceId } : undefined,
          echoCancellation: opts?.echoCancellation ?? true,
          noiseSuppression: opts?.noiseSuppression ?? true,
          autoGainControl: opts?.autoGain ?? true,
        },
        video: false,
      };
      try { console.info("[mic] getUserMedia constraints:", constraints); } catch {}
      const p = navigator.mediaDevices.getUserMedia(constraints);
      previewPromiseRef.current = p;
      const stream = await p;
      previewPromiseRef.current = null;
      // WebAudio for VU
      const ctx = audioCtxRef.current || new AudioContext();
      audioCtxRef.current = ctx;
      try { await ctx.resume(); } catch {}
      const src = ctx.createMediaStreamSource(stream);
      srcNodeRef.current = src;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      src.connect(analyser);
      // Attach track diagnostics
      const ats = stream.getAudioTracks();
      ats.forEach((t) => {
        try { console.info("[mic] track settings", t.getSettings?.(), "readyState=", t.readyState); } catch {}
        // @ts-ignore
        t.onended = () => { try { console.warn("[mic] track ended"); } catch {} };
        // @ts-ignore
        t.onmute = () => { try { console.warn("[mic] track muted"); } catch {} };
        // @ts-ignore
        t.onunmute = () => { try { console.info("[mic] track unmuted"); } catch {} };
      });
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        // Peak estimation from waveform
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          peak = Math.max(peak, Math.abs(v));
        }
        setState(s => ({ ...s, level: peak }));
        rafRef.current = requestAnimationFrame(loop);
      };
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(loop);
      setState((s) => ({ ...s, stream, level: 0, deviceId: opts?.deviceId ?? s.deviceId }));
      return stream;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try { console.error("[mic] startPreview error:", e); } catch {}
      setState(s => ({ ...s, error: msg }));
      throw e;
    }
  }, [state.stream]);

  const stopPreview = useCallback(() => {
    try { console.info("[mic] stopPreview called"); } catch {}
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (srcNodeRef.current) { try { srcNodeRef.current.disconnect(); } catch {} }
    if (analyserRef.current) { try { analyserRef.current.disconnect(); } catch {} }
    if (state.stream) state.stream.getTracks().forEach(t => t.stop());
    setState((s) => ({ ...s, stream: null, level: 0 }));
  }, [state.stream]);

  const startRecording = useCallback(async (opts?: MicOptions) => {
    const stream = state.stream || await startPreview(opts);
    chunksRef.current = [];
    startedAtRef.current = Date.now();
    const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm" });
    rec.ondataavailable = (e) => { try { console.info("[mic] chunk", e.data?.size); } catch {} if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstart = () => { try { console.info("[mic] recorder onstart"); } catch {} setState((s) => ({ ...s, isRecording: true })); };
    rec.onstop = () => { try { console.info("[mic] recorder onstop"); } catch {} setState((s) => ({ ...s, isRecording: false })); };
    rec.onerror = (e) => { try { console.error("[mic] recorder error", e); } catch {} };
    recRef.current = rec;
    try { console.info("[mic] MediaRecorder started"); } catch {}
    rec.start();
    // onstart will flip the flag
  }, [state.stream, startPreview]);

  const stopRecording = useCallback(async () => {
    const rec = recRef.current;
    if (!rec) return null;
    // await final dataavailable on stop
    const stopped = new Promise<void>((resolve) => {
      rec.addEventListener("stop", () => resolve(), { once: true });
    });
    try { rec.requestData?.(); } catch {}
    if (rec.state !== "inactive") rec.stop();
    await stopped;
    recRef.current = null;
    const blob = new Blob(chunksRef.current, { type: chunksRef.current[0] ? (chunksRef.current[0] as any).type || "audio/webm" : "audio/webm" });
    chunksRef.current = [];
    const elapsedMs = Date.now() - startedAtRef.current;
    try { console.info("[mic] stopRecording elapsedMs=", elapsedMs, "size=", blob.size); } catch {}
    // Persist
    const { appDataDir } = await import("@tauri-apps/api/path");
    const { writeBinaryFile, createDir } = await import("@tauri-apps/api/fs");
    const { invoke } = await import("@tauri-apps/api/tauri");
    const dir = (await appDataDir()) + "recordings";
    await createDir(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "").replace("T", "_").slice(0, 15);
    const webmPath = `${dir}/Mic_${ts}.webm`;
    const m4aPath = `${dir}/Mic_${ts}.m4a`;
    const buf = new Uint8Array(await blob.arrayBuffer());
    await writeBinaryFile(webmPath, buf);
    const out = await invoke<string>("transcode_audio", { inputPath: webmPath, outputPath: m4aPath });
    setState(s => ({ ...s, isRecording: false }));
    return { path: out, elapsedMs };
  }, []);

  const levelDb = useMemo(() => {
    const p = Math.max(1e-6, state.level);
    return (20 * Math.log10(p)).toFixed(1);
  }, [state.level]);

  // Do not auto-stop on StrictMode dev re-mounts; only stop when user toggles or page unloads
  useEffect(() => {
    const onBeforeUnload = () => {
      try { if (recRef.current && recRef.current.state === "recording") recRef.current.stop(); } catch {}
      try { if (state.stream) state.stream.getTracks().forEach(t => t.stop()); } catch {}
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => { window.removeEventListener("beforeunload", onBeforeUnload); };
  }, [state.stream]);

  return { state, listDevices, startPreview, stopPreview, levelDb, startRecording, stopRecording };
}

