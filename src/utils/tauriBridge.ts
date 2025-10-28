import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";

/**
 * Tauri IPC bridge utilities
 * 
 * Provides typed wrappers for Rust command invocations and event handling
 */

/**
 * Execute a Tauri command with typed parameters
 * @param cmd - Command name
 * @param args - Command arguments
 * @returns Promise with result
 */
export const invokeCommand = async <T = any>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> => {
  try {
    return await invoke<T>(cmd, args);
  } catch (error) {
    console.error(`Failed to invoke command '${cmd}':`, error);
    throw error;
  }
};

/**
 * Emit a custom event to the Rust backend
 * @param event - Event name
 * @param payload - Event data
 */
export const emitEvent = async <T = any>(
  event: string,
  payload?: T
): Promise<void> => {
  try {
    await emit(event, payload);
  } catch (error) {
    console.error(`Failed to emit event '${event}':`, error);
    throw error;
  }
};

/**
 * Listen for a custom event from the Rust backend
 * @param event - Event name
 * @param handler - Event handler callback
 * @returns Unlisten function
 */
export const listenToEvent = async <T = any>(
  event: string,
  handler: (payload: T) => void
): Promise<() => void> => {
  try {
    const unlisten = await listen<T>(event, (event) => {
      handler(event.payload);
    });
    return unlisten;
  } catch (error) {
    console.error(`Failed to listen to event '${event}':`, error);
    throw error;
  }
};

/**
 * Test IPC communication with the Rust backend
 * This can be called on app startup to verify the bridge works
 */
export const testIPC = async (): Promise<boolean> => {
  try {
    const result = await invokeCommand<string>("test_ipc", {});
    console.log("IPC test successful:", result);
    return true;
  } catch (error) {
    console.error("IPC test failed:", error);
    return false;
  }
};

