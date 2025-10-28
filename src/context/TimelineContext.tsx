import React, { createContext, useContext, useMemo, useRef, useState, useCallback } from "react";
import { useProject } from "./ProjectContext";

/**
 * Timeline state and coordination context
 *
 * Provides shared state for timeline rendering and playhead control,
 * and a registered seek handler that the video player supplies.
 */
export interface TimelineState {
  currentTime: number;
  duration: number;
  pxPerSecond: number;
  inPoint: number;
  outPoint: number;
  loopTrim: boolean;
  activeClipId?: string;
}

interface TimelineContextType {
  state: TimelineState;
  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
  setPxPerSecond: (pps: number) => void;
  /**
   * Request a seek on the bound media element. No-op if not registered.
   */
  requestSeek: (t: number) => void;
  /**
   * Register the seek handler from the player; call with undefined to clear.
   */
  registerSeekHandler: (fn?: (t: number) => void) => void;
  /**
   * Set or update the active clip; initializes trim range if missing
   */
  setActiveClip: (clipId: string, duration?: number) => void;
  /**
   * Update trim points with clamping and min gap
   */
  setTrimRange: (inPoint: number, outPoint: number) => void;
  setInPoint: (inPoint: number) => void;
  setOutPoint: (outPoint: number) => void;
  setLoopTrim: (loop: boolean) => void;
}

const TimelineContext = createContext<TimelineContextType | undefined>(undefined);

export const useTimeline = () => {
  const ctx = useContext(TimelineContext);
  if (!ctx) throw new Error("useTimeline must be used within TimelineProvider");
  return ctx;
};

export const TimelineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setClipTrim, state: project } = useProject();
  const MIN_GAP = 0.1;
  const [state, setState] = useState<TimelineState>({ currentTime: 0, duration: 0, pxPerSecond: 100, inPoint: 0, outPoint: 0, loopTrim: false, activeClipId: undefined });
  const seekHandlerRef = useRef<((t: number) => void) | undefined>(undefined);

  const setCurrentTime = useCallback((t: number) => {
    setState((prev) => ({ ...prev, currentTime: Math.max(0, Math.min(t, prev.duration || Infinity)) }));
  }, []);

  const setDuration = useCallback((d: number) => {
    setState((prev) => {
      const duration = Math.max(0, d || 0);
      const inPoint = Math.max(0, Math.min(prev.inPoint, duration));
      const outPoint = Math.max(inPoint + MIN_GAP, Math.min(prev.outPoint || duration, duration));
      return { ...prev, duration, inPoint, outPoint };
    });
  }, []);

  const setPxPerSecond = useCallback((pps: number) => {
    const clamped = Math.max(1, Math.min(pps, 2000));
    setState((prev) => ({ ...prev, pxPerSecond: clamped }));
  }, []);

  const requestSeek = useCallback((t: number) => {
    const fn = seekHandlerRef.current;
    if (fn) fn(Math.max(0, t));
  }, []);

  const registerSeekHandler = useCallback((fn?: (t: number) => void) => {
    seekHandlerRef.current = fn;
  }, []);

  const setTrimRange = useCallback((inPoint: number, outPoint: number) => {
    setState((prev) => {
      const duration = prev.duration || 0;
      const i = Math.max(0, Math.min(inPoint, duration));
      const o = Math.max(i + MIN_GAP, Math.min(outPoint, duration));
      if (prev.activeClipId) setClipTrim(prev.activeClipId, i, o);
      return { ...prev, inPoint: i, outPoint: o };
    });
  }, [setClipTrim]);

  const setInPoint = useCallback((inPoint: number) => {
    setTrimRange(inPoint, state.outPoint || state.duration || 0);
  }, [setTrimRange, state.outPoint, state.duration]);

  const setOutPoint = useCallback((outPoint: number) => {
    setTrimRange(state.inPoint || 0, outPoint);
  }, [setTrimRange, state.inPoint]);

  const setActiveClip = useCallback((clipId: string, duration?: number) => {
    setState((prev) => {
      const d = duration ?? prev.duration;
      const saved = project.clipTrimById?.[clipId];
      const inPoint = saved ? saved.inPoint : 0;
      const outPoint = saved ? saved.outPoint : Math.max(MIN_GAP, d || 0);
      return { ...prev, activeClipId: clipId, duration: d || prev.duration, inPoint, outPoint };
    });
  }, [project.clipTrimById]);

  const setLoopTrim = useCallback((loop: boolean) => {
    setState((prev) => ({ ...prev, loopTrim: loop }));
  }, []);

  const value = useMemo<TimelineContextType>(
    () => ({ state, setCurrentTime, setDuration, setPxPerSecond, requestSeek, registerSeekHandler, setActiveClip, setTrimRange, setInPoint, setOutPoint, setLoopTrim }),
    [state, setCurrentTime, setDuration, setPxPerSecond, requestSeek, registerSeekHandler, setActiveClip, setTrimRange, setInPoint, setOutPoint, setLoopTrim]
  );

  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;
};


