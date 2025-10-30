import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";

interface ExportProgress {
  percent: number;
  timeMs: number;
}

export const useExport = () => {
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportTrim = useCallback(async (inputPath: string, startSec: number, endSec: number) => {
    setIsExporting(true);
    setError(null);
    setProgress({ percent: 0, timeMs: 0 });

    try {
      const outputPath = await invoke<string>("open_export_dialog");
      if (!outputPath) {
        setIsExporting(false);
        return false; // canceled
      }

      const unsubs: Array<() => void> = [];
      unsubs.push(
        await listen("export:progress", (e) => {
          const p = e.payload as any;
          if (p && typeof p.percent === "number") setProgress({ percent: p.percent, timeMs: p.timeMs ?? 0 });
        })
      );
      unsubs.push(
        await listen("export:success", () => {
          setProgress({ percent: 100, timeMs: progress?.timeMs ?? 0 });
          setIsExporting(false);
          unsubs.forEach((u) => u());
        })
      );
      unsubs.push(
        await listen("export:error", (e) => {
          setError(String((e.payload as any)?.message || "Export failed"));
          setIsExporting(false);
          unsubs.forEach((u) => u());
        })
      );

      await invoke("export_video", {
        inputPath,
        outputPath,
        startSec,
        endSec,
        fastCopy: false,
      });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setIsExporting(false);
      return false;
    }
  }, [progress?.timeMs]);

  /**
   * Export a composed timeline segment bounded by [fenceStart, fenceEnd), including
   * overlapping video/audio items and text overlays.
   */
  const exportTimelineSegment = useCallback(async (payload: {
    fenceStart: number;
    fenceEnd: number;
    videos: Array<{ path: string; seek: number; duration: number; offset: number; gain?: number; isBase: boolean }>;
    audios: Array<{ path: string; seek: number; duration: number; offset: number; gain?: number }>;
    overlays: Array<{ text: string; offset: number; duration: number; x: number; y: number; fontSize?: number; color?: string; align?: string }>;
    resolution?: "source" | "720p" | "1080p";
    normalizeEnabled?: boolean;
    fadeInSec?: number;
    fadeOutSec?: number;
  }) => {
    setIsExporting(true);
    setError(null);
    setProgress({ percent: 0, timeMs: 0 });

    try {
      const outputPath = await invoke<string>("open_export_dialog");
      if (!outputPath) {
        setIsExporting(false);
        return false;
      }

      const unsubs: Array<() => void> = [];
      unsubs.push(
        await listen("export:progress", (e) => {
          const p = e.payload as any;
          if (p && typeof p.percent === "number") setProgress({ percent: p.percent, timeMs: p.timeMs ?? 0 });
        })
      );
      unsubs.push(
        await listen("export:success", () => {
          setProgress({ percent: 100, timeMs: progress?.timeMs ?? 0 });
          setIsExporting(false);
          unsubs.forEach((u) => u());
        })
      );
      unsubs.push(
        await listen("export:error", (e) => {
          setError(String((e.payload as any)?.message || "Export failed"));
          setIsExporting(false);
          unsubs.forEach((u) => u());
        })
      );

      await invoke("export_timeline_segment_cmd", {
        req: {
          fence_start: payload.fenceStart,
          fence_end: payload.fenceEnd,
          videos: payload.videos.map(v => ({ path: v.path, seek: v.seek, duration: v.duration, offset: v.offset, gain: v.gain, is_base: v.isBase })),
          audios: payload.audios.map(a => ({ path: a.path, seek: a.seek, duration: a.duration, offset: a.offset, gain: a.gain })),
          overlays: payload.overlays.map(o => ({ text: o.text, offset: o.offset, duration: o.duration, x: o.x, y: o.y, font_size: o.fontSize, color: o.color, align: o.align })),
          resolution: payload.resolution ?? "source",
          normalize_enabled: payload.normalizeEnabled ?? true,
          normalize_target_lufs: -14.0,
          normalize_true_peak: -1.0,
          fade_in_sec: payload.fadeInSec ?? 0,
          fade_out_sec: payload.fadeOutSec ?? 0,
          output_path: outputPath,
        }
      });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setIsExporting(false);
      return false;
    }
  }, [progress?.timeMs]);

  return { exportTrim, exportTimelineSegment, progress, isExporting, error };
};


