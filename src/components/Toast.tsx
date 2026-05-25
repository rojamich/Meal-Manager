import { useEffect } from "react";
import { createPortal } from "react-dom";

export type ToastTone = "info" | "success" | "error";

export interface ToastProps {
  open: boolean;
  message: string;
  tone?: ToastTone;
  onDismiss: () => void;
  durationMs?: number;
}

export default function Toast({
  open,
  message,
  tone = "info",
  onDismiss,
  durationMs = 3500
}: ToastProps) {
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [open, onDismiss, durationMs, message]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={`toast toast-${tone}`} role="status" aria-live="polite" onClick={onDismiss}>
      <span>{message}</span>
    </div>,
    document.body
  );
}
