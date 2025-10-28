import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Line, Rect, Text, Group } from "react-konva";
import { useTimeline } from "../context/TimelineContext";

/**
 * Konva-based single-clip timeline with grid, clip bar, and playhead.
 *
 * - Renders a horizontal time grid with adaptive tick spacing
 * - Shows a single clip block from 0..duration
 * - Playhead follows currentTime; click/drag to seek
 * - Zoom via slider adjusts pxPerSecond
 */
const Timeline: React.FC = () => {
  const { state, setCurrentTime, setPxPerSecond, requestSeek } = useTimeline();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 800, height: 160 });
  const [isDragging, setIsDragging] = useState(false);

  // Resize observer to track container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        setSize((prev) => ({ width: Math.max(300, cr.width), height: prev.height }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const timelineWidth = size.width;
  const timelineHeight = size.height;
  const totalPx = (state.duration || 0) * state.pxPerSecond;

  // Determine tick spacing based on zoom
  const { majorEverySec, minorEverySec } = useMemo(() => {
    const pps = state.pxPerSecond;
    // target ~80-120px between major ticks
    const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    let major = 1;
    for (const c of candidates) {
      if (c * pps >= 80) { major = c; break; }
    }
    let minor = major / 2;
    if (minor < 0.5) minor = 0.5;
    return { majorEverySec: major, minorEverySec: minor };
  }, [state.pxPerSecond]);

  const formatTime = (tSec: number) => {
    const t = Math.max(0, Math.round(tSec));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  // Generate grid lines and labels
  const grid = useMemo(() => {
    const lines: { x: number; major: boolean; label?: string }[] = [];
    const duration = state.duration || 0;
    const end = Math.max(duration, timelineWidth / state.pxPerSecond);
    const addLines = (step: number, isMajor: boolean) => {
      for (let t = 0; t <= end + 0.0001; t += step) {
        const x = t * state.pxPerSecond;
        lines.push({ x, major: isMajor, label: isMajor ? formatTime(t) : undefined });
      }
    };
    addLines(minorEverySec, false);
    addLines(majorEverySec, true);
    return lines;
  }, [state.duration, state.pxPerSecond, majorEverySec, minorEverySec, timelineWidth]);

  // Mouse interactions: click/drag to seek
  const stageRef = useRef<any>(null);
  const toTimeFromX = useCallback((x: number) => {
    const clampedX = Math.max(0, x);
    const t = clampedX / state.pxPerSecond;
    return Math.max(0, Math.min(t, state.duration || Number.MAX_SAFE_INTEGER));
  }, [state.pxPerSecond, state.duration]);

  const handleDown = useCallback((evt: any) => {
    setIsDragging(true);
    const stage = evt.target.getStage?.();
    const pos = stage?.getPointerPosition();
    if (!pos) return;
    const t = toTimeFromX(pos.x);
    console.log("[Timeline] mousedown seek ->", t.toFixed(3));
    setCurrentTime(t);
    requestSeek(t);
  }, [setCurrentTime, requestSeek, toTimeFromX]);

  const handleMove = useCallback((evt: any) => {
    if (!isDragging) return;
    const stage = evt.target.getStage?.();
    const pos = stage?.getPointerPosition();
    if (!pos) return;
    const t = toTimeFromX(pos.x);
    setCurrentTime(t);
    requestSeek(t);
  }, [isDragging, setCurrentTime, requestSeek, toTimeFromX]);

  const handleUp = useCallback(() => setIsDragging(false), []);
  const handleLeave = useCallback(() => setIsDragging(false), []);

  const playheadX = (state.currentTime || 0) * state.pxPerSecond;

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-300">Timeline</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Zoom</span>
          <input
            type="range"
            min={10}
            max={1000}
            step={10}
            value={state.pxPerSecond}
            onChange={(e) => setPxPerSecond(Number(e.target.value))}
            className="w-40"
          />
        </div>
      </div>
      <div ref={containerRef} className="w-full" style={{ height: timelineHeight }}>
        <Stage
          width={timelineWidth}
          height={timelineHeight}
          ref={stageRef}
          onMouseDown={handleDown}
          onMouseMove={handleMove}
          onMouseUp={handleUp}
          onMouseLeave={handleLeave}
        >
          <Layer listening={false}>
            {/* Background */}
            <Rect x={0} y={0} width={timelineWidth} height={timelineHeight} fill="#1f2937" />
          </Layer>
          <Layer listening={false}>
            {/* Grid */}
            {grid.map((g, i) => (
              <Group key={i}>
                <Line
                  points={[g.x, 0, g.x, timelineHeight]}
                  stroke={g.major ? "#374151" : "#2d3748"}
                  strokeWidth={g.major ? 1 : 0.5}
                />
                {g.major && g.label && g.x >= 0 && g.x <= timelineWidth && (
                  <Text x={g.x + 4} y={4} text={g.label} fontSize={12} fill="#9ca3af" />
                )}
              </Group>
            ))}
          </Layer>
          <Layer listening={false}>
            {/* Clip block (single clip from 0..duration) */}
            <Rect
              x={0}
              y={timelineHeight / 2 - 18}
              width={Math.max(timelineWidth, totalPx)}
              height={36}
              fill="#2563eb"
              opacity={0.25}
              cornerRadius={6}
            />
          </Layer>
          <Layer>
            {/* Playhead */}
            <Line points={[playheadX, 0, playheadX, timelineHeight]} stroke="#f59e0b" strokeWidth={2} />
          </Layer>
          <Layer>
            {/* Interaction overlay to ensure pointer events are captured across the surface */}
            <Rect
              x={0}
              y={0}
              width={timelineWidth}
              height={timelineHeight}
              fill="rgba(0,0,0,0)"
              onMouseDown={handleDown}
              onMouseMove={handleMove}
              onMouseUp={handleUp}
              onMouseLeave={handleLeave}
            />
          </Layer>
        </Stage>
      </div>
    </div>
  );
};

export default Timeline;


