import React, { createContext, useContext, useMemo, useRef, useState, useCallback } from "react";

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
}

const TimelineContext = createContext<TimelineContextType | undefined>(undefined);

export const useTimeline = () => {
  const ctx = useContext(TimelineContext);
  if (!ctx) throw new Error("useTimeline must be used within TimelineProvider");
  return ctx;
};

export const TimelineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<TimelineState>({ currentTime: 0, duration: 0, pxPerSecond: 100 });
  const seekHandlerRef = useRef<((t: number) => void) | undefined>(undefined);

  const setCurrentTime = useCallback((t: number) => {
    setState((prev) => ({ ...prev, currentTime: Math.max(0, Math.min(t, prev.duration || Infinity)) }));
  }, []);

  const setDuration = useCallback((d: number) => {
    setState((prev) => ({ ...prev, duration: Math.max(0, d || 0) }));
  }, []);

  const setPxPerSecond = useCallback((pps: number) => {
    const clamped = Math.max(10, Math.min(pps, 1000));
    setState((prev) => ({ ...prev, pxPerSecond: clamped }));
  }, []);

  const requestSeek = useCallback((t: number) => {
    const fn = seekHandlerRef.current;
    if (fn) fn(Math.max(0, t));
  }, []);

  const registerSeekHandler = useCallback((fn?: (t: number) => void) => {
    seekHandlerRef.current = fn;
  }, []);

  const value = useMemo<TimelineContextType>(
    () => ({ state, setCurrentTime, setDuration, setPxPerSecond, requestSeek, registerSeekHandler }),
    [state, setCurrentTime, setDuration, setPxPerSecond, requestSeek, registerSeekHandler]
  );

  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;
};


