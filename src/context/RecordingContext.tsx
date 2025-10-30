import React, { createContext, useContext, useMemo } from "react";
import { useMicrophone } from "../hooks/useMicrophone";
import { useWebcamRecorder } from "../hooks/useWebcamRecorder";
import { useRecorder } from "../hooks/useRecorder";

/**
 * RecordingContext
 * Centralizes microphone, webcam, and screen recorder hooks into a single shared provider
 * so that multiple UI components reflect the same recording state and control methods.
 *
 * This avoids desynchronization when the combined recorder orchestrates mic/webcam/screen
 * while the individual panels (AudioMeter, WebcamRecorder, ScreenRecorder) display badges
 * and timers. Consumers should use useRecording() to access shared state and controls.
 */
interface RecordingContextValue {
  mic: ReturnType<typeof useMicrophone>;
  webcam: ReturnType<typeof useWebcamRecorder>;
  screen: ReturnType<typeof useRecorder>;
}

const Ctx = createContext<RecordingContextValue | null>(null);

export const RecordingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mic = useMicrophone();
  const webcam = useWebcamRecorder();
  const screen = useRecorder();

  const value = useMemo(() => ({ mic, webcam, screen }), [mic, webcam, screen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useRecording() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRecording must be used within RecordingProvider");
  return ctx;
}


