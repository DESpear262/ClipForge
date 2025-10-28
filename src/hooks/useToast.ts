import { useState, useCallback } from "react";

/**
 * Toast notification types
 */
export type ToastType = "success" | "error" | "info" | "warning";

/**
 * Toast message structure
 */
export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

/**
 * Custom hook for toast notifications
 * 
 * Manages a queue of toast messages with auto-dismiss functionality
 */
export const useToast = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  /**
   * Show a toast notification
   */
  const showToast = useCallback(
    (message: string, type: ToastType = "info", duration = 3000) => {
      console.log("[useToast] showToast called:", { message, type, duration });
      const id = `toast_${Date.now()}_${Math.random()}`;
      const newToast: Toast = { id, message, type, duration };

      console.log("[useToast] Adding toast:", newToast);
      setToasts((prev) => {
        const updated = [...prev, newToast];
        console.log("[useToast] Updated toasts:", updated);
        return updated;
      });

      // Auto-dismiss after duration
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    },
    []
  );

  /**
   * Dismiss a specific toast
   */
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return {
    toasts,
    showToast,
    dismissToast,
  };
};




