import { invoke } from "@tauri-apps/api/tauri";

export interface MediaDto {
  id: number;
  path: string;
  filename: string;
  duration?: number;
  width?: number;
  height?: number;
  file_size?: number;
  format?: string;
  codec?: string;
  fps?: number;
  thumbnail_path?: string;
  preview_path?: string;
  created_at?: string;
}

export async function importVideo(videoPath: string) {
  return await invoke<MediaDto>("import_video", { videoPath });
}

export async function importAudio(audioPath: string) {
  return await invoke<MediaDto>("import_audio", { audioPath });
}

export async function getMediaLibrary() {
  return await invoke<MediaDto[]>("get_media_library");
}

export async function deleteMediaItem(id: number) {
  return await invoke<void>("delete_media_item", { id });
}

export async function ensurePreview(videoPath: string) {
  return await invoke<string>("ensure_preview", { videoPath });
}

// Project state persistence
export interface PersistedState {
  version: number;
  lastSelectedPath?: string;
  timeline?: {
    pxPerSecond?: number;
    loopTrim?: boolean;
  };
  trimsByPath?: Record<string, { inPoint: number; outPoint: number }>;
  /**
   * Multi-track timeline document (PR#5)
   * Stores tracks and timeline items for editing. This is a stopgap until
   * full project JSON moves to /projects/*.clipforge.json.
   */
  timelineDoc?: {
    tracks: Array<{ id: string; kind: "video" | "audio" | "overlay" }>;
    items: Array<{
      id: string;
      mediaId: number;
      path: string;
      trackId: string;
      start: number; // timeline start (seconds)
      end: number;   // timeline end (seconds)
      trimIn: number;  // media-relative in
      trimOut: number; // media-relative out
      gain?: number; // 0..1 volume
      overlayText?: string;
      overlayX?: number;
      overlayY?: number;
      overlayFontSize?: number;
      overlayColor?: string;
      overlayAlign?: "center" | "left" | "right";
    }>;
    transitions?: Array<{ id: string; fromItemId: string; toItemId: string; type: "crossfade" | "fadeblack"; duration: number }>;
  };
  /**
   * Export settings for audio enhancements (PR#12)
   */
  exportSettings?: {
    normalizeEnabled?: boolean;
    targetLufs?: number; // default -14
    truePeak?: number;   // default -1.0 dBTP
    fadeInSec?: number;  // default 0
    fadeOutSec?: number; // default 0
  };
}

export async function loadProjectState(): Promise<PersistedState | null> {
  try {
    return await invoke<PersistedState | null>("load_project_state");
  } catch {
    return null;
  }
}

export async function saveProjectState(state: PersistedState): Promise<void> {
  await invoke("save_project_state", { state });
}


