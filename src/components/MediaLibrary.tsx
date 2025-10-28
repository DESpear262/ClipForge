import React, { useEffect, useState } from "react";
import { importVideo, getMediaLibrary, deleteMediaItem, type MediaDto, ensurePreview } from "../utils/api";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import VideoPlayer from "./VideoPlayer";
import Timeline from "./Timeline";
import { TimelineProvider, useTimeline } from "../context/TimelineContext";

const MediaLibrary: React.FC = () => {
  const [media, setMedia] = useState<MediaDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MediaDto | null>(null);

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
    const onImported = () => { load(); };
    window.addEventListener("media-imported", onImported as EventListener);
    return () => window.removeEventListener("media-imported", onImported as EventListener);
  }, []);

  // If a selected item lacks a preview, generate it once and reload
  useEffect(() => {
    (async () => {
      if (selected && !selected.preview_path) {
        try {
          console.log("[MediaLibrary] generating preview for:", selected.path);
          await ensurePreview(selected.path);
          await load();
          // Re-select the same item by filename
          const updated = (await getMediaLibrary()).find(m => m.path === selected.path);
          if (updated) setSelected(updated);
        } catch (e) {
          console.warn("[MediaLibrary] ensurePreview failed:", e);
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
    return (
      <div className="flex-1 p-6 overflow-y-auto">
        {selected ? (
          <div className="space-y-4 max-w-5xl">
            <div className="text-base font-semibold">Preview</div>
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
              {console.log("[MediaLibrary] selected preview_path:", selected.preview_path, "path:", selected.path)}
              <VideoPlayer
                clip={{ id: String(selected.id), filePath: selected.preview_path || selected.path, fileName: selected.filename }}
                onTimeUpdate={(ct, dur) => {
                  if (dur && Math.abs((timeline.state.duration || 0) - dur) > 0.01) timeline.setDuration(dur);
                  timeline.setCurrentTime(ct);
                }}
                onReady={(api) => {
                  timeline.registerSeekHandler((t: number) => api.seek(t));
                  const d = api.getDuration();
                  if (d && Math.abs((timeline.state.duration || 0) - d) > 0.01) timeline.setDuration(d);
                }}
              />
            </div>
            <Timeline />
            <div className="text-sm text-gray-300">
              <div>Resolution: {selected.width ?? "?"}×{selected.height ?? "?"} • Codec: {selected.codec ?? "?"}</div>
              <div>Format: {selected.format ?? "?"} • Duration: {selected.duration?.toFixed(1) ?? (timeline.state.duration ? timeline.state.duration.toFixed(1) : "?")}s</div>
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


