import React, { createContext, useContext, useMemo, useRef, useState, useCallback } from "react";
import { useProject } from "./ProjectContext";

/**
 * Multi-track timeline types (PR#5)
 * Tracks are logical rows; items reference media by id/path and occupy a time range on a track.
 */
export type TrackKind = "video" | "audio" | "overlay";
export interface TrackDef { id: string; kind: TrackKind }
export interface TimelineItem {
  id: string;
  mediaId: number;
  path: string;
  trackId: string;
  start: number;
  end: number;
  trimIn: number;
  trimOut: number;
  gain?: number; // 0..1 volume for preview/export
  // Overlay props (for track kind 'overlay')
  overlayText?: string;
  overlayX?: number; // 0..1 relative
  overlayY?: number; // 0..1 relative
  overlayFontSize?: number;
  overlayColor?: string;
  overlayAlign?: "center" | "left" | "right";
}

export type TransitionType = "crossfade" | "fadeblack";
export interface TransitionDef {
  id: string;
  fromItemId: string;
  toItemId: string;
  type: TransitionType;
  duration: number; // seconds
}

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
  // Multi-track additions
  tracks: TrackDef[];
  items: TimelineItem[];
  selectedItemId?: string;
  transitions: TransitionDef[];
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
  // Multi-track API
  setTracks: (tracks: TrackDef[]) => void;
  addItem: (item: TimelineItem) => void;
  updateItem: (id: string, patch: Partial<Omit<TimelineItem, "id">>) => void;
  moveItem: (id: string, toTrackId: string, newStart: number) => void;
  deleteItem: (id: string) => void;
  selectItem: (id?: string) => void;
  serializeTimeline: () => { tracks: TrackDef[]; items: TimelineItem[]; transitions: TransitionDef[] };
  hydrateTimeline: (doc: { tracks: TrackDef[]; items: TimelineItem[]; transitions?: TransitionDef[] }) => void;
  // Transitions
  addTransition: (t: TransitionDef) => void;
  updateTransition: (id: string, patch: Partial<Omit<TransitionDef, "id">>) => void;
  deleteTransition: (id: string) => void;
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
  const [state, setState] = useState<TimelineState>({
    currentTime: 0,
    duration: 0,
    pxPerSecond: 100,
    inPoint: 0,
    outPoint: 0,
    loopTrim: false,
    activeClipId: undefined,
    tracks: [
      { id: "V1", kind: "video" },
      { id: "V2", kind: "video" },
      { id: "A1", kind: "audio" },
      { id: "O1", kind: "overlay" },
    ],
    items: [],
    selectedItemId: undefined,
    transitions: [],
  });
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
      // Defer ProjectProvider update to avoid React warning about cross-provider updates during render
      if (prev.activeClipId) {
        const clipId = prev.activeClipId;
        queueMicrotask(() => setClipTrim(clipId, i, o));
      }
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

  // ===== Multi-track operations =====
  const setTracks = useCallback((tracks: TrackDef[]) => {
    setState((prev) => ({ ...prev, tracks }));
  }, []);

  const addItem = useCallback((item: TimelineItem) => {
    setState((prev) => {
      const track = prev.tracks.find(t => t.id === item.trackId);
      const isAudio = track?.kind === "audio";
      const next = {
        ...prev,
        items: [...prev.items, item],
        selectedItemId: isAudio ? prev.selectedItemId : item.id,
      };
      try { console.info("[Timeline] addItem", { item, prevSelected: prev.selectedItemId, nextSelected: next.selectedItemId, items: next.items.length }); } catch {}
      return next;
    });
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<Omit<TimelineItem, "id">>) => {
    setState((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));
  }, []);

  const moveItem = useCallback((id: string, toTrackId: string, newStart: number) => {
    setState((prev) => {
      const it = prev.items.find((x) => x.id === id);
      if (!it) return prev;
      const len = Math.max(MIN_GAP, (it.end - it.start));
      const start = Math.max(0, newStart);
      const end = start + len;
      return {
        ...prev,
        items: prev.items.map((x) => (x.id === id ? { ...x, trackId: toTrackId, start, end } : x)),
      };
    });
  }, []);

  const deleteItem = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      items: prev.items.filter((it) => it.id !== id),
      selectedItemId: prev.selectedItemId === id ? undefined : prev.selectedItemId,
    }));
  }, []);

  const selectItem = useCallback((id?: string) => {
    setState((prev) => ({ ...prev, selectedItemId: id }));
  }, []);

  const serializeTimeline = useCallback(() => {
    return { tracks: state.tracks, items: state.items, transitions: state.transitions };
  }, [state.tracks, state.items, state.transitions]);

  const hydrateTimeline = useCallback((doc: { tracks: TrackDef[]; items: TimelineItem[]; transitions?: TransitionDef[] }) => {
    setState((prev) => ({
      ...prev,
      tracks: doc.tracks ?? prev.tracks,
      items: doc.items ?? prev.items,
      transitions: doc.transitions ?? prev.transitions,
    }));
  }, []);

  // Transitions
  const addTransition = useCallback((t: TransitionDef) => {
    setState((prev) => ({ ...prev, transitions: [...prev.transitions, t] }));
  }, []);
  const updateTransition = useCallback((id: string, patch: Partial<Omit<TransitionDef, "id">>) => {
    setState((prev) => ({
      ...prev,
      transitions: prev.transitions.map((tr) => (tr.id === id ? { ...tr, ...patch } : tr)),
    }));
  }, []);
  const deleteTransition = useCallback((id: string) => {
    setState((prev) => ({ ...prev, transitions: prev.transitions.filter((t) => t.id !== id) }));
  }, []);

  const value = useMemo<TimelineContextType>(
    () => ({
      state,
      setCurrentTime,
      setDuration,
      setPxPerSecond,
      requestSeek,
      registerSeekHandler,
      setActiveClip,
      setTrimRange,
      setInPoint,
      setOutPoint,
      setLoopTrim,
      setTracks,
      addItem,
      updateItem,
      moveItem,
      deleteItem,
      selectItem,
      serializeTimeline,
      hydrateTimeline,
      addTransition,
      updateTransition,
      deleteTransition,
    }),
    [state, setCurrentTime, setDuration, setPxPerSecond, requestSeek, registerSeekHandler, setActiveClip, setTrimRange, setInPoint, setOutPoint, setLoopTrim, setTracks, addItem, updateItem, moveItem, deleteItem, selectItem, serializeTimeline, hydrateTimeline, addTransition, updateTransition, deleteTransition]
  );

  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;
};


