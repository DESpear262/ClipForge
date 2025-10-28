import React from "react";
import type { Toast } from "../hooks/useToast";

/**
 * Single toast notification component
 */
interface ToastProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const ToastComponent: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const getToastStyles = () => {
    const baseStyles = "px-4 py-3 rounded-lg shadow-lg flex items-center gap-3";
    
    switch (toast.type) {
      case "success":
        return `${baseStyles} bg-green-600 text-white`;
      case "error":
        return `${baseStyles} bg-red-600 text-white`;
      case "warning":
        return `${baseStyles} bg-yellow-600 text-black`;
      case "info":
      default:
        return `${baseStyles} bg-blue-600 text-white`;
    }
  };

  const getIcon = () => {
    switch (toast.type) {
      case "success":
        return "✓";
      case "error":
        return "✕";
      case "warning":
        return "⚠";
      case "info":
      default:
        return "ℹ";
    }
  };

  return (
    <div className={getToastStyles()}>
      <span className="font-bold">{getIcon()}</span>
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="hover:opacity-70 transition-opacity"
      >
        ✕
      </button>
    </div>
  );
};

/**
 * Toast container component
 * 
 * Displays toast notifications in a fixed position
 */
interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  console.log("[ToastContainer] Rendering with toasts:", toasts);
  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastComponent
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
};

