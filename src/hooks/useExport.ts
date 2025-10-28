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

  return { exportTrim, progress, isExporting, error };
};


