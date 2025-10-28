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


