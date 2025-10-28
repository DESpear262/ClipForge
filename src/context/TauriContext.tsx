import React, { createContext, useContext } from "react";
import { invoke } from "@tauri-apps/api/tauri";

/**
 * Context interface for Tauri-related functionality
 * 
 * Provides centralized access to app-wide actions and state.
 * These will be implemented in future PRs:
 * - showImportDialog: PR #3 (File Import System)
 * - showExportDialog: PR #8 (FFmpeg Export Pipeline)
 */
interface TauriContextType {
  showImportDialog: () => Promise<void>;
  showExportDialog: () => Promise<void>;
  showHelpDialog: () => void;
}

/**
 * Tauri context for managing cross-component communication
 * 
 * These are stub implementations that call the Rust backend.
 * Full functionality will be implemented in future PRs.
 */
const TauriContext = createContext<TauriContextType>({
  showImportDialog: async () => {
    await invoke("open_import_dialog");
  },
  showExportDialog: async () => {
    await invoke("open_export_dialog");
  },
  showHelpDialog: () => {
    alert(
      "ClipForge v0.1.0-mvp\n\n" +
      "A lightweight desktop video editor.\n\n" +
      "Workflow: Import → Preview → Trim → Export"
    );
  },
});

/**
 * Hook to access Tauri context
 */
export const useTauriContext = () => {
  return useContext(TauriContext);
};

/**
 * Tauri context provider component
 * 
 * Provides stub implementations that bridge to Rust commands.
 * Future PRs will implement full functionality here.
 */
export const TauriProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <TauriContext.Provider
      value={{
  showImportDialog: async () => {
    const isTauri = typeof (window as any).__TAURI__ !== "undefined" || typeof (window as any).__TAURI_INTERNALS__ !== "undefined";
    if (!isTauri) return;
    try {
      const result = await invoke<{ path: string; name: string } | null>("open_file_dialog");
      if (result && result.path) {
        try {
          const media = await invoke<any>("import_video", { videoPath: result.path });
          // Notify listeners to refresh media library
          window.dispatchEvent(new CustomEvent("media-imported", { detail: media }));
        } catch (e) {
          console.error("import_video failed:", e);
        }
      }
    } catch (error) {
      console.error("Import dialog error:", error);
    }
  },
        showExportDialog: async () => {
          try {
            await invoke("open_export_dialog");
          } catch (error) {
            console.error("Export dialog error:", error);
          }
        },
        showHelpDialog: () => {
          alert(
            "ClipForge v0.1.0-mvp\n\n" +
            "A lightweight desktop video editor.\n\n" +
            "Workflow: Import → Preview → Trim → Export"
          );
        },
      }}
    >
      {children}
    </TauriContext.Provider>
  );
};

