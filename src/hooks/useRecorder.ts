import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";

/**
 * useRecorder: Manage a screen recording session (start/stop/status)
 *
 * This hook calls Tauri commands to start/stop recording and subscribes to
 * record:* events for progress. It currently supports full-desktop capture.
 */
export interface CaptureSource {
  id: string;
  kind: "display" | "window";
  name: string;
}

export interface RecordingState {
  isRecording: boolean;
  elapsedMs: number;
  outputPath?: string;
  error?: string | null;
}

export function useRecorder() {
  const [state, setState] = useState<RecordingState>({ isRecording: false, elapsedMs: 0 });
  const unsubsRef = useRef<Array<() => void>>([]);

  // Subscribe to backend events
  useEffect(() => {
    const add = async (name: string, handler: (payload: any) => void) => {
      const un = await listen(name, (e) => handler((e as any).payload));
      unsubsRef.current.push(un);
    };
    void add("record:start", (p) => {
      setState({ isRecording: true, elapsedMs: 0, outputPath: p?.outputPath });
    });
    void add("record:progress", (p) => {
      setState((prev) => ({ ...prev, isRecording: true, elapsedMs: Number(p?.elapsedMs || prev.elapsedMs), outputPath: p?.outputPath || prev.outputPath }));
    });
    void add("record:stopped", (p) => {
      setState((prev) => ({ ...prev, isRecording: false, outputPath: p?.outputPath }));
    });
    void add("record:error", (p) => {
      setState((prev) => ({ ...prev, isRecording: false, error: String(p?.message || "Recording error") }));
    });
    void add("record:ffmpeg", (p) => {
      try { console.info("[record:ffmpeg]", p?.line ?? p); } catch {}
    });
    return () => {
      unsubsRef.current.forEach((u) => { try { u(); } catch {} });
      unsubsRef.current = [];
    };
  }, []);

  const listSources = useCallback(async (): Promise<CaptureSource[]> => {
    try {
      return await invoke<CaptureSource[]>("list_capture_sources_cmd");
    } catch {
      return [{ id: "desktop", kind: "display", name: "Desktop (Primary)" }];
    }
  }, []);

  const start = useCallback(async (opts?: { fps?: number; outputPath?: string }) => {
    try {
      const out = await invoke<string>("start_screen_recording_cmd", { fps: opts?.fps, outputPath: opts?.outputPath });
      setState({ isRecording: true, elapsedMs: 0, outputPath: out });
      return out;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ isRecording: false, elapsedMs: 0, error: msg });
      throw e;
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      const out = await invoke<string>("stop_recording_cmd");
      setState((prev) => ({ ...prev, isRecording: false, outputPath: out }));
      return out;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState((prev) => ({ ...prev, isRecording: false, error: msg }));
      throw e;
    }
  }, []);

  const prettyElapsed = useMemo(() => {
    const s = Math.floor((state.elapsedMs || 0) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [state.elapsedMs]);

  return { state, start, stop, listSources, prettyElapsed };
}


