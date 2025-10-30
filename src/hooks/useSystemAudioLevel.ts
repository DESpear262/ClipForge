import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface SystemAudioLevelState {
  active: boolean;
  level: number; // 0..1 peak
  deviceLabel?: string;
  error?: string | null;
}

const MATCHERS = ["stereo mix", "virtual", "loopback", "what u hear", "wave out"];

export function useSystemAudioLevel() {
  const [state, setState] = useState<SystemAudioLevelState>({ active: false, level: 0 });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const srcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cand = devices.find(d => d.kind === "audioinput" && MATCHERS.some(m => (d.label || "").toLowerCase().includes(m)));
      if (!cand) {
        setState({ active: false, level: 0, error: null });
        return false;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: cand.deviceId } }, video: false });
      streamRef.current = stream;
      const ctx = audioCtxRef.current || new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      srcRef.current = src;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          peak = Math.max(peak, Math.abs(v));
        }
        setState(s => ({ ...s, active: true, deviceLabel: cand.label || "System audio", level: peak, error: null }));
        rafRef.current = requestAnimationFrame(loop);
      };
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(loop);
      return true;
    } catch (e) {
      setState({ active: false, level: 0, error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { srcRef.current?.disconnect(); } catch {}
    try { analyserRef.current?.disconnect(); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setState({ active: false, level: 0 });
  }, []);

  useEffect(() => {
    start();
    return () => stop();
  }, [start, stop]);

  const levelDb = useMemo(() => {
    const p = Math.max(1e-6, state.level);
    return (20 * Math.log10(p)).toFixed(1);
  }, [state.level]);

  return { state, levelDb, restart: start, stop };
}
