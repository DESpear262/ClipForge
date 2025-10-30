import React, { useEffect, useState, useRef as useReactRef } from "react";
import { useExport } from "../hooks/useExport";
import { getMediaLibrary, deleteMediaItem, type MediaDto, ensurePreview, loadProjectState, saveProjectState, type PersistedState, importVideo } from "../utils/api";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import VideoPlayer from "./VideoPlayer";
import TimelinePreview from "./TimelinePreview";
import TransitionMenu from "./Timeline/TransitionMenu";
import OverlayMenu from "./Timeline/OverlayMenu";
import StreamMixer from "./StreamMixer";
import Timeline from "./Timeline";
import { TimelineProvider, useTimeline } from "../context/TimelineContext";
import { useToastContext } from "../context/ToastContext";
import RightToolbar from "./RightToolbar";


const MediaLibrary: React.FC = () => {
  const [media, setMedia] = useState<MediaDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MediaDto | null>(null);
  const lastSelectedRef = useReactRef<MediaDto | null>(null);
  const { showToast, dismissToast } = useToastContext();

  // NOTE: Audio/Video tab UI was removed per product decision. We keep minimal
  // helpers and comments for potential future re-introduction. The library now
  // shows videos only (mp4/mov/webm). To revisit tabs: restore filter logic and
  // UI, and wire audio import/display.
  const videoExts = new Set([".mp4", ".mov", ".webm"]);
  const extOf = (nameOrPath?: string) => (nameOrPath || "").toLowerCase().slice((nameOrPath || "").lastIndexOf("."));
  const isVideo = (m: MediaDto) => videoExts.has(extOf(m.filename || m.path));

  const load = async () => {
    setLoading(true);
    try {
      const list = await getMediaLibrary();
      setMedia(list);
      if (!selected) {
        const firstVideo = list.find(isVideo);
        if (firstVideo) setSelected(firstVideo);
      }
    } finally {
      setLoading(false);
    }
  };

  // Note: Mic audio auto-import and Audio tab were removed per product decision.
  // Keeping this comment as a breadcrumb for future re-introduction.

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
    try {
      const { invoke } = await import("@tauri-apps/api/tauri");
      const result = await invoke<{ path: string; name: string } | null>("open_file_dialog", {});
      if (!result) return;
      const ext = extOf(result.name);
      if (!videoExts.has(ext)) return alert("Please select a video: mp4, mov, webm");
      await importVideo(result.path);
      const ev = new CustomEvent("media-imported", { detail: { path: result.path, filename: result.name } });
      window.dispatchEvent(ev);
      await load();
    } catch {}
  };

  const RightPanel: React.FC = () => {
    const timeline = useTimeline();
    const { exportTrim, exportTimelineSegment, isExporting, progress, error } = useExport();
    const { showToast, dismissToast } = useToastContext();
    const playerApiRef = useReactRef<{
      seek: (t: number) => void;
      play: () => void;
      pause: () => void;
      getDuration: () => number;
    } | null>(null);
    const lastTimeRef = useReactRef<number>(0);
    const exportToastIdRef = useReactRef<string | null>(null);
    const [resolution, setResolution] = useState<"source" | "720p" | "1080p">("source");
    const [normalizeEnabled, setNormalizeEnabled] = useState<boolean>(true);
    const [fadeInSec, setFadeInSec] = useState<number>(0);
    const [fadeOutSec, setFadeOutSec] = useState<number>(0);

    // Load persisted state on initial mount and when selection changes (apply trims/timeline settings and hydrate timelineDoc once)
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
        // Hydrate multi-track doc if present (only when empty to avoid overwriting)
        if (state.timelineDoc && timeline.state.items.length === 0) {
          timeline.hydrateTimeline({ tracks: state.timelineDoc.tracks, items: state.timelineDoc.items, transitions: state.timelineDoc.transitions || [] });
        }
        // Export settings (PR#12)
        if (state.exportSettings) {
          if (typeof state.exportSettings.normalizeEnabled === 'boolean') setNormalizeEnabled(state.exportSettings.normalizeEnabled);
          if (typeof state.exportSettings.fadeInSec === 'number') setFadeInSec(state.exportSettings.fadeInSec);
          if (typeof state.exportSettings.fadeOutSec === 'number') setFadeOutSec(state.exportSettings.fadeOutSec);
        }
      })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected?.path]);

    // Persist state when trims, timeline settings, or multi-track doc change
    useEffect(() => {
      (async () => {
        const base: PersistedState = {
          version: 1,
          lastSelectedPath: selected?.path,
          timeline: { pxPerSecond: timeline.state.pxPerSecond, loopTrim: timeline.state.loopTrim },
          trimsByPath: {},
          timelineDoc: timeline.serializeTimeline(),
          exportSettings: { normalizeEnabled, targetLufs: -14, truePeak: -1, fadeInSec, fadeOutSec },
        };
        if (selected?.path) {
          base.trimsByPath![selected.path] = { inPoint: timeline.state.inPoint || 0, outPoint: timeline.state.outPoint || (timeline.state.duration || 0) };
        }
        await saveProjectState(base);
      })();
    }, [selected?.path, timeline.state.inPoint, timeline.state.outPoint, timeline.state.pxPerSecond, timeline.state.loopTrim, timeline.state.items, timeline.state.tracks, normalizeEnabled, fadeInSec, fadeOutSec]);

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

    // PR #9: Apply highlight globally when backend signals success
    useEffect(() => {
      let unlisten: any;
      (async () => {
        try {
          const { listen } = await import("@tauri-apps/api/event");
          unlisten = await listen("ai:highlight:success", (e: any) => {
            const mid = Number(e?.payload?.mediaId ?? -1);
            if (!selected || Number(selected.id) !== mid) return;
            const s = Number(e?.payload?.start ?? 0);
            const ed = Number(e?.payload?.end ?? 0);
            const start = isFinite(s) ? s : 0;
            const end = isFinite(ed) ? ed : (timeline.state.duration || 0);
            // Apply globally: set trim range and enable loop
            timeline.setTrimRange(start, end);
            timeline.setLoopTrim(true);
            try { playerApiRef.current?.seek(start); } catch {}
            showToast("Highlight applied", "success", 2500);
          });
        } catch (e) {
          console.warn("Failed to listen for ai:highlight:success", e);
        }
      })();
      return () => { try { unlisten && unlisten(); } catch {} };
    }, [selected?.id, timeline.state.duration]);

    // Handle MenuBar request-export events and fire export for current selection
    useEffect(() => {
      const handler = async () => {
        if (!selected) return;
        // If a timeline item is selected, export that fence with overlapping media; otherwise fall back to single-clip trim export
        const selId = timeline.state.selectedItemId;
        const item = selId ? timeline.state.items.find(it => it.id === selId) : undefined;
        if (item) {
          const fenceStart = item.start;
          const fenceEnd = item.end;
          // Build videos from tracks of kind 'video' that overlap the fence
          const trackKindOf = (trackId: string) => timeline.state.tracks.find(t => t.id === trackId)?.kind;
          const overlaps = (it: typeof item) => Math.max(0, Math.min(fenceEnd, it.end) - Math.max(fenceStart, it.start)) > 0.0001;
          const clipFor = (it: typeof item) => {
            const overStart = Math.max(fenceStart, it.start);
            const overEnd = Math.min(fenceEnd, it.end);
            const duration = Math.max(0, overEnd - overStart);
            const seek = Math.max(0, it.trimIn + (overStart - it.start));
            const offset = Math.max(0, overStart - fenceStart);
            return { path: it.path, seek, duration, offset, gain: it.gain };
          };
          const videos = timeline.state.items
            .filter(it => trackKindOf(it.trackId) === "video" && overlaps(it))
            .map(v => ({ ...clipFor(v), isBase: v.id === selId }));
          // Ensure base exists (selected item)
          if (!videos.some(v => v.isBase)) {
            videos.push({ ...clipFor(item), isBase: true });
          }
          // Audio: include audio from video items and any audio track items overlapping
          const audiosFromVideos = timeline.state.items
            .filter(it => trackKindOf(it.trackId) === "video" && overlaps(it))
            .map(clipFor);
          const audiosFromA = timeline.state.items
            .filter(it => trackKindOf(it.trackId) === "audio" && overlaps(it))
            .map(clipFor);
          const audios = [...audiosFromVideos, ...audiosFromA];
          // Text overlays
          const overlays = timeline.state.items
            .filter(it => trackKindOf(it.trackId) === "overlay" && overlaps(it) && !!it.overlayText)
            .map(it => {
              const overStart = Math.max(fenceStart, it.start);
              const overEnd = Math.min(fenceEnd, it.end);
              return {
                text: it.overlayText || "",
                offset: Math.max(0, overStart - fenceStart),
                duration: Math.max(0, overEnd - overStart),
                x: (it.overlayX ?? 0.5),
                y: (it.overlayY ?? 0.85),
                fontSize: it.overlayFontSize ?? 24,
                color: it.overlayColor ?? "#ffffff",
                align: it.overlayAlign ?? "center",
              };
            });
          await exportTimelineSegment({ fenceStart, fenceEnd, videos, audios, overlays, resolution, normalizeEnabled, fadeInSec, fadeOutSec });
          return;
        }
        // Fallback: single-clip trim export using global in/out
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
            <div className="text-base font-semibold flex items-center justify-between">
              <span>Preview</span>
              {selected && (
                <div className="flex items-center gap-2">
                  <select
                    className="px-2 py-1 bg-gray-200 text-black text-xs rounded"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value as any)}
                    title="Export resolution"
                  >
                    <option value="source">Source</option>
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={normalizeEnabled} onChange={(e) => setNormalizeEnabled(e.target.checked)} />
                    Normalize
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    Fade In
                    <select className="px-1 py-0.5 bg-gray-200 text-black text-xs rounded" value={fadeInSec}
                      onChange={(e) => setFadeInSec(Number(e.target.value))}>
                      {[0, 0.5, 1, 2, 3].map(n => (
                        <option key={`fi-${n}`} value={n}>{n}s</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    Fade Out
                    <select className="px-1 py-0.5 bg-gray-200 text-black text-xs rounded" value={fadeOutSec}
                      onChange={(e) => setFadeOutSec(Number(e.target.value))}>
                      {[0, 0.5, 1, 2, 3].map(n => (
                        <option key={`fo-${n}`} value={n}>{n}s</option>
                      ))}
                    </select>
                  </label>
                  {(() => {
                    const videoTracks = timeline.state.tracks.filter(t => t.kind === "video");
                    const audioTracks = timeline.state.tracks.filter(t => t.kind === "audio");
                    let chosenTrack = videoTracks[0]?.id || "V1";
                    return (
                      <>
                        <select
                          className="px-2 py-1 bg-gray-200 text-black text-xs rounded"
                          defaultValue={chosenTrack}
                          onChange={(e) => { chosenTrack = e.target.value; }}
                        >
                          {[...videoTracks, ...audioTracks].map(t => (
                            <option key={t.id} value={t.id}>Add to {t.id}</option>
                          ))}
                        </select>
                        <button
                          className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-black text-xs"
                          onClick={() => {
                            const id = `tclip_${Date.now()}`;
                            const start = Math.max(0, timeline.state.currentTime || 0);
                            const mediaDur = Number(selected.duration ?? timeline.state.duration ?? 0) || 0;
                            const trimIn = 0;
                            const len = Math.max(0.5, mediaDur > 0 ? Math.min(mediaDur, 5) : 5);
                            const trimOut = Math.max(trimIn + len, len);
                            timeline.addItem({
                              id,
                              mediaId: Number(selected.id),
                              path: selected.path,
                              trackId: chosenTrack,
                              start,
                              end: start + len,
                              trimIn,
                              trimOut,
                            });
                          }}
                        >
                          Add
                        </button>
                      </>
                    );
                  })()}
                  <TransitionMenu />
                  <OverlayMenu />
                </div>
              )}
            </div>
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
              {/* Use TimelinePreview only when there is at least one video item; otherwise show the single-clip preview */}
              {(() => {
                const hasVideoItems = timeline.state.items.some(it => {
                  const tr = timeline.state.tracks.find(t => t.id === it.trackId);
                  return tr?.kind === "video";
                });
                if (hasVideoItems) {
                  try { console.info("[RightPanel] Using TimelinePreview (video items present)"); } catch {}
                  return <TimelinePreview />;
                }
                try { console.info("[RightPanel] Using single VideoPlayer (no video items)"); } catch {}
                return (
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
                      const inPt = timeline.state.inPoint || 0;
                      if (d && (timeline.state.outPoint || 0) <= 0.11) {
                        setTimeout(() => {
                          const dur = api.getDuration();
                          timeline.setTrimRange(inPt, dur || d);
                        }, 0);
                      }
                      playerApiRef.current = api;
                    }}
                  />
                );
              })()}
            </div>
            <StreamMixer />
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
      {/* Sidebar with independent scroll areas (Video only) */}
      <div className="w-80 border-r border-gray-800 p-0 flex flex-col">
        <div className="px-4 pt-4 pb-2 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Media Library</h2>
            <button onClick={handleImport} className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded-md text-black text-sm">Import</button>
          </div>
          {/* Tabs removed per product decision; library shows videos only. */}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="text-gray-400">Loading...</div>
          ) : media.filter(isVideo).length === 0 ? (
            <div className="text-gray-400 text-sm">No videos yet. Use Import to add videos.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {media.filter(isVideo).map((m) => (
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
      </div>

      {/* Preview + Timeline Panel + Right Toolbar (both under TimelineProvider) */}
      <TimelineProvider>
        <div className="flex-1 flex min-w-0">
          <RightPanel />
          <RightToolbar selected={selected} />
        </div>
      </TimelineProvider>
    </div>
  );
};

export default MediaLibrary;


