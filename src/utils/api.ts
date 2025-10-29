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


