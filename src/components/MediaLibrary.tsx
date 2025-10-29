import React, { useEffect, useState, useRef as useReactRef } from "react";
import { useExport } from "../hooks/useExport";
import { getMediaLibrary, deleteMediaItem, type MediaDto, ensurePreview, loadProjectState, saveProjectState, type PersistedState } from "../utils/api";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import VideoPlayer from "./VideoPlayer";
import Timeline from "./Timeline";
import { TimelineProvider, useTimeline } from "../context/TimelineContext";
import { useToastContext } from "../context/ToastContext";


const MediaLibrary: React.FC = () => {
  const [media, setMedia] = useState<MediaDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MediaDto | null>(null);
  const lastSelectedRef = useReactRef<MediaDto | null>(null);
  const { showToast, dismissToast } = useToastContext();

  const load = async () => {
    setLoading(true);
    try {
      const list = await getMediaLibrary();
      setMedia(list);
      if (!selected && list.length > 0) setSelected(list[0]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onImported = (ev: Event) => {
      try {
        const detail: any = (ev as CustomEvent).detail;
        const name = detail?.filename || detail?.name || "video";
        showToast(`Imported ${name}`, "success", 2000);
      } catch {}
      load();
    };
    window.addEventListener("media-imported", onImported as EventListener);
    const onRequestDelete = async () => {
      console.log("[MediaLibrary] request-delete received");
      try {
        const current = selected || lastSelectedRef.current;
        console.log("[MediaLibrary] current selected (fallback to last):", current);
        if (!current) {
          console.warn("[MediaLibrary] No selection to delete");
          return;
        }
        const confirmed = confirm("Delete selected video from library? This does not remove the original file.");
        if (!confirmed) return;
        console.log("[MediaLibrary] Deleting id=", current.id);
        await deleteMediaItem(Number(current.id));
        console.log("[MediaLibrary] Deleted. Reloading library...");
        await load();
        // Select the first available item after deletion
        const list = await getMediaLibrary();
        console.log("[MediaLibrary] Library size after delete:", list.length);
        setSelected(list[0] ?? null);
      } catch (e) {
        console.error("Delete failed:", e);
      }
    };
    window.addEventListener("request-delete", onRequestDelete as EventListener);
    console.log("[MediaLibrary] request-delete listener added");
    return () => {
      window.removeEventListener("media-imported", onImported as EventListener);
      window.removeEventListener("request-delete", onRequestDelete as EventListener);
      console.log("[MediaLibrary] request-delete listener removed");
    };
  }, []);

  // Prefer a direct ref sync without interval when selection changes
  useEffect(() => {
    // This effect exists to provide simple debug visibility
    console.log("[MediaLibrary] selection changed:", selected?.id);
    if (selected) {
      lastSelectedRef.current = selected;
    }
  }, [selected?.id]);

  // If a selected item lacks a preview, generate it once and reload (with toast)
  useEffect(() => {
    (async () => {
      if (selected && !selected.preview_path) {
        try {
          console.log("[MediaLibrary] generating preview for:", selected.path);
          // Show indeterminate preview generation toast
          const toastId = showToast("Generating preview…", "info", 20000);
          await ensurePreview(selected.path);
          await load();
          // Re-select the same item by filename
          const updated = (await getMediaLibrary()).find(m => m.path === selected.path);
          if (updated) setSelected(updated);
          dismissToast(toastId);
          showToast("Preview ready", "success", 2000);
        } catch (e) {
          console.warn("[MediaLibrary] ensurePreview failed:", e);
          showToast("Preview generation failed", "error", 4000);
        }
      }
    })();
  }, [selected?.path]);

  const handleImport = async () => {
    // Reuse backend file dialog command if present; otherwise rely on UI MenuBar
    try {
      // This component assumes MenuBar triggers open_file_dialog; for inline import
      // you can wire a call to invoke("open_file_dialog") and then importVideo(result.path)
      // Here we only refresh
      await load();
    } catch {}
  };

  const RightPanel: React.FC = () => {
    const timeline = useTimeline();
    const { exportTrim, isExporting, progress, error } = useExport();
    const { showToast, dismissToast } = useToastContext();
    const playerApiRef = useReactRef<{
      seek: (t: number) => void;
      play: () => void;
      pause: () => void;
      getDuration: () => number;
    } | null>(null);
    const lastTimeRef = useReactRef<number>(0);
    const exportToastIdRef = useReactRef<string | null>(null);

    // Load persisted state on selection change (apply trims and timeline settings)
    useEffect(() => {
      (async () => {
        const state = await loadProjectState();
        if (!state) return;
        // Timeline settings
        if (state.timeline?.pxPerSecond) timeline.setPxPerSecond(state.timeline.pxPerSecond);
        if (state.timeline?.loopTrim != null) timeline.setLoopTrim(!!state.timeline.loopTrim);
        // Trim for this media by path
        if (selected?.path && state.trimsByPath && state.trimsByPath[selected.path]) {
          const t = state.trimsByPath[selected.path];
          timeline.setTrimRange(t.inPoint, t.outPoint);
        }
      })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected?.path]);

    // Persist state when trims or timeline settings change
    useEffect(() => {
      (async () => {
        const base: PersistedState = { version: 1, lastSelectedPath: selected?.path, timeline: { pxPerSecond: timeline.state.pxPerSecond, loopTrim: timeline.state.loopTrim }, trimsByPath: {} };
        if (selected?.path) {
          base.trimsByPath![selected.path] = { inPoint: timeline.state.inPoint || 0, outPoint: timeline.state.outPoint || (timeline.state.duration || 0) };
        }
        await saveProjectState(base);
      })();
    }, [selected?.path, timeline.state.inPoint, timeline.state.outPoint, timeline.state.pxPerSecond, timeline.state.loopTrim]);

    // Export progress toast
    useEffect(() => {
      if (isExporting) {
        const id = showToast(`Exporting… ${progress?.percent?.toFixed(0) ?? 0}%`, "info", 60000);
        if (exportToastIdRef.current) dismissToast(exportToastIdRef.current);
        exportToastIdRef.current = id;
      } else if (!isExporting && exportToastIdRef.current) {
        dismissToast(exportToastIdRef.current);
        exportToastIdRef.current = null;
        if (!error) showToast("Export complete", "success", 3000);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isExporting, progress?.percent]);

    // Handle MenuBar request-export events and fire export for current selection
    useEffect(() => {
      const handler = async () => {
        if (!selected) return;
        const src = selected.path;
        const i = timeline.state.inPoint || 0;
        const o = timeline.state.outPoint || timeline.state.duration || 0;
        await exportTrim(src, i, o);
      };
      window.addEventListener("request-export", handler as EventListener);
      return () => window.removeEventListener("request-export", handler as EventListener);
    }, [selected?.path, timeline.state.inPoint, timeline.state.outPoint, timeline.state.duration, exportTrim]);

    // Preview progress toasts (global listeners)
    useEffect(() => {
      const onPreviewStart = (_e: Event) => {
        const id = showToast(`Generating preview… 0%`, "info", 60000);
        (window as any)._previewToastId = id;
      };
      const onPreviewProgress = (e: Event) => {
        const p: any = (e as any).payload ?? (e as CustomEvent).detail;
        const pct = Math.max(0, Math.min(100, Number(p?.percent ?? 0))).toFixed(0);
        const currentId = (window as any)._previewToastId as string | undefined;
        if (currentId) {
          dismissToast(currentId);
          (window as any)._previewToastId = showToast(`Generating preview… ${pct}%`, "info", 60000);
        }
      };
      const onPreviewSuccess = () => {
        const currentId = (window as any)._previewToastId as string | undefined;
        if (currentId) dismissToast(currentId);
        (window as any)._previewToastId = undefined;
        showToast("Preview ready", "success", 2000);
      };
      const unsubs: Array<() => void> = [] as any;
      const add = async (name: string, handler: any) => {
        if ((window as any).__TAURI__) {
          const { listen } = await import("@tauri-apps/api/event");
          const un = await listen(name, handler);
          unsubs.push(un);
        } else {
          window.addEventListener(name, handler as any);
          unsubs.push(() => window.removeEventListener(name, handler as any));
        }
      };
      void add("preview:start", onPreviewStart);
      void add("preview:progress", onPreviewProgress);
      void add("preview:success", onPreviewSuccess);
      return () => { unsubs.forEach((u) => { try { (u as any)(); } catch {} }); };
    }, [showToast, dismissToast]);
    useEffect(() => {
      if (selected) {
        timeline.setActiveClip(String(selected.id), selected.duration);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected?.id, selected?.duration]);
    return (
      <div className="flex-1 p-6 overflow-y-auto">
        {selected ? (
          <div className="space-y-6 max-w-5xl">
            <div className="text-base font-semibold">Preview</div>
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
              <VideoPlayer
                clip={{ id: String(selected.id), filePath: selected.preview_path || selected.path, fileName: selected.filename }}
                onTimeUpdate={(ct, dur) => {
                  if (dur && Math.abs((timeline.state.duration || 0) - dur) > 0.01) timeline.setDuration(dur);
                  timeline.setCurrentTime(ct);
                  // Loop/pause logic at outPoint
                  const i = timeline.state.inPoint || 0;
                  const o = timeline.state.outPoint || timeline.state.duration || 0;
                  if (o > i && ct >= o - 0.01 && playerApiRef.current) {
                    if (timeline.state.loopTrim) {
                      playerApiRef.current.seek(i);
                      playerApiRef.current.play();
                    } else {
                      playerApiRef.current.seek(o);
                      playerApiRef.current.pause();
                    }
                  }
                  lastTimeRef.current = ct;
                }}
                onReady={(api) => {
                  timeline.registerSeekHandler((t: number) => api.seek(t));
                  const d = api.getDuration();
                  if (d && Math.abs((timeline.state.duration || 0) - d) > 0.01) timeline.setDuration(d);
                  // Ensure default trim covers the full duration once known
                  const inPt = timeline.state.inPoint || 0;
                  if (d && (timeline.state.outPoint || 0) <= 0.11) {
                    // Treat very small default out as uninitialized
                    // Set out to full duration
                    // Defer to next tick to avoid conflicting state during onReady
                    setTimeout(() => {
                      const dur = api.getDuration();
                      timeline.setTrimRange(inPt, dur || d);
                    }, 0);
                  }
                  playerApiRef.current = api;
                }}
              />
            </div>
            {error && <div className="text-xs text-red-400">Export error: {error}</div>}
            <Timeline />
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="text-gray-400">Filename</div>
                <div className="text-gray-200 truncate" title={selected.filename}>{selected.filename}</div>
                <div className="text-gray-400">Resolution</div>
                <div className="text-gray-200">{selected.width ?? "?"}×{selected.height ?? "?"}</div>
                <div className="text-gray-400">Codec</div>
                <div className="text-gray-200">{selected.codec ?? "?"}</div>
                <div className="text-gray-400">Format</div>
                <div className="text-gray-200">{selected.format ?? "?"}</div>
                <div className="text-gray-400">Duration</div>
                <div className="text-gray-200">{selected.duration?.toFixed(1) ?? (timeline.state.duration ? timeline.state.duration.toFixed(1) : "?")}s</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-gray-400">
              <div className="text-5xl mb-3">🎬</div>
              <div className="text-base">No media selected.</div>
              <div className="text-sm">Use the Import button above to add a video.</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full bg-gray-900 text-white">
      {/* Sidebar */}
      <div className="w-80 border-r border-gray-800 p-4 overflow-y-auto">
        <div className="sticky top-0 bg-gray-900 pb-2 mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Media Library</h2>
          <button onClick={handleImport} className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded-md text-black text-sm">Refresh</button>
        </div>
        {loading ? (
          <div className="text-gray-400">Loading...</div>
        ) : media.length === 0 ? (
          <div className="text-gray-400 text-sm">No media yet. Use Import to add videos.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {media.map((m) => (
              <button key={m.id} onClick={() => setSelected(m)} className={`text-left bg-gray-800 rounded-md p-2 border transition-colors ${selected?.id === m.id ? "border-blue-500" : "border-gray-700 hover:border-gray-600"}`}>
                {m.thumbnail_path ? (
                  <img
                    src={convertFileSrc(m.thumbnail_path)}
                    alt={m.filename}
                    className="w-full h-28 object-cover rounded"
                    onError={(e) => {
                      const el = e.currentTarget as HTMLImageElement;
                      el.style.display = 'none';
                      (el.parentElement as HTMLElement).insertAdjacentHTML('beforeend', '<div class="w-full h-28 bg-gray-700 rounded"></div>');
                    }}
                  />
                ) : (
                  <div className="w-full h-28 bg-gray-700 rounded" />
                )}
                <div className="mt-2 text-xs truncate text-gray-200">{m.filename}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Preview + Timeline Panel */}
      <TimelineProvider>
        <RightPanel />
      </TimelineProvider>
    </div>
  );
};

export default MediaLibrary;


