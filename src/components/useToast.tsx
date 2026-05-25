import { useCallback, useState } from "react";
import Toast, { ToastTone } from "./Toast";

interface ToastState {
  message: string;
  tone: ToastTone;
  key: number;
}

export function useToast() {
  const [state, setState] = useState<ToastState | null>(null);

  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    setState({ message, tone, key: Date.now() });
  }, []);

  const dismiss = useCallback(() => setState(null), []);

  const toast = state ? (
    <Toast
      key={state.key}
      open
      message={state.message}
      tone={state.tone}
      onDismiss={dismiss}
    />
  ) : null;

  return { notify, toast };
}
