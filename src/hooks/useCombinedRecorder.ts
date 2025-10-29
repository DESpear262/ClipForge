import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";

export interface CombinedOptions {
  fps?: number;
  outputPath?: string;
  webcamDevice: string;
  audioDevice?: string;
  corner?: "br" | "bl" | "tr" | "tl";
  pipWidthPx?: number;
  marginPx?: number;
}

export interface CombinedState {
  isRecording: boolean;
  elapsedMs: number;
  outputPath?: string;
  error?: string | null;
}

export function useCombinedRecorder() {
  const [state, setState] = useState<CombinedState>({ isRecording: false, elapsedMs: 0 });
  const unsubsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const a = await listen("record:start", (e) => {
        const p: any = (e as any).payload;
        if (p?.mode === "combined") setState({ isRecording: true, elapsedMs: 0, outputPath: p?.outputPath });
      });
      const b = await listen("record:progress", (e) => {
        const p: any = (e as any).payload;
        setState((s) => ({ ...s, elapsedMs: Number(p?.elapsedMs || s.elapsedMs), outputPath: p?.outputPath || s.outputPath }));
      });
      const c = await listen("record:stopped", () => setState((s) => ({ ...s, isRecording: false })));
      unsubsRef.current.push(a, b, c);
    })();
    return () => { unsubsRef.current.forEach(u => { try { u(); } catch {} }); unsubsRef.current = []; };
  }, []);

  const listVideoDevices = useCallback(async (): Promise<string[]> => {
    try { return await invoke<string[]>("list_video_devices_cmd"); } catch { return []; }
  }, []);
  const listAudioDevices = useCallback(async (): Promise<string[]> => {
    try { return await invoke<string[]>("list_audio_devices_cmd"); } catch { return []; }
  }, []);

  const start = useCallback(async (opts: CombinedOptions) => {
    try {
      const out = await invoke<string>("start_combined_recording_cmd", {
        fps: opts.fps,
        outputPath: opts.outputPath,
        webcamDevice: opts.webcamDevice,
        audioDevice: opts.audioDevice,
        corner: opts.corner,
        pipWidthPx: opts.pipWidthPx,
        marginPx: opts.marginPx,
      });
      setState({ isRecording: true, elapsedMs: 0, outputPath: out });
      return out;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ isRecording: false, elapsedMs: 0, error: msg });
      throw e;
    }
  }, []);

  const stop = useCallback(async () => {
    try { const out = await invoke<string>("stop_recording_cmd"); setState((s)=>({ ...s, isRecording:false })); return out; } catch (e) { throw e; }
  }, []);

  const prettyElapsed = useMemo(() => {
    const s = Math.floor((state.elapsedMs || 0) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [state.elapsedMs]);

  return { state, listVideoDevices, listAudioDevices, start, stop, prettyElapsed };
}
