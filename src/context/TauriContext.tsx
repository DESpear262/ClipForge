import React, { createContext, useContext } from "react";
import { invoke } from "@tauri-apps/api/core";

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
    if (!isTauri) {
      // In browser dev mode, do nothing; caller should fallback to HTML file input
      return;
    }
    try {
      await invoke("open_file_dialog");
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

