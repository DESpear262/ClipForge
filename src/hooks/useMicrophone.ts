import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface MicOptions { deviceId?: string; echoCancellation?: boolean; noiseSuppression?: boolean; autoGain?: boolean; }
export interface MicState { stream: MediaStream | null; level: number; deviceId?: string; error?: string | null; }

export function useMicrophone() {
  const [state, setState] = useState<MicState>({ stream: null, level: 0 });
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const srcNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const listDevices = useCallback(async () => {
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.filter(d => d.kind === "audioinput").map(d => ({ id: d.deviceId, label: d.label || "Microphone" }));
  }, []);

  const startPreview = useCallback(async (opts?: MicOptions) => {
    try {
      if (state.stream) state.stream.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: opts?.deviceId ? { exact: opts.deviceId } : undefined,
          echoCancellation: opts?.echoCancellation ?? true,
          noiseSuppression: opts?.noiseSuppression ?? true,
          autoGainControl: opts?.autoGain ?? true,
        },
        video: false,
      });
      // WebAudio for VU
      const ctx = audioCtxRef.current || new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      srcNodeRef.current = src;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      src.connect(analyser);
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
      setState({ stream, level: 0, deviceId: opts?.deviceId });
      return stream;
    } catch (e) {
      setState(s => ({ ...s, error: e instanceof Error ? e.message : String(e) }));
      throw e;
    }
  }, [state.stream]);

  const stopPreview = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (srcNodeRef.current) { try { srcNodeRef.current.disconnect(); } catch {} }
    if (analyserRef.current) { try { analyserRef.current.disconnect(); } catch {} }
    if (state.stream) state.stream.getTracks().forEach(t => t.stop());
    setState({ stream: null, level: 0 });
  }, [state.stream]);

  const levelDb = useMemo(() => {
    const p = Math.max(1e-6, state.level);
    return (20 * Math.log10(p)).toFixed(1);
  }, [state.level]);

  useEffect(() => () => { stopPreview(); }, [stopPreview]);

  return { state, listDevices, startPreview, stopPreview, levelDb };
}
