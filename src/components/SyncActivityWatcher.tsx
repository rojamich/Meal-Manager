import { useEffect } from "react";
import Toast from "./Toast";
import { useState } from "react";

// Listens for sync-remote-applied events dispatched by the (lazy-loaded) sync engine.
// Surfaces a small toast for the highest-value "live" change: grocery line check-offs.
// Stays lightweight — does NOT import firebase or the sync engine, only listens to a
// window CustomEvent emitted by the engine when it actually loads.

const SYNC_REMOTE_APPLIED_EVENT = "sync-remote-applied";

interface RemoteAppliedDetail {
  tableName: string;
  docId: string;
  type: "added" | "modified" | "removed";
  data: any | null;
  previous: any | null;
}

export default function SyncActivityWatcher() {
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<RemoteAppliedDetail>).detail;
      if (!detail) return;

      // Toast only for grocery line check changes (the canonical live-collaboration case).
      if (detail.tableName !== "groceryLines") return;
      if (detail.type !== "modified") return;

      const prevChecked = Boolean(detail.previous?.checked);
      const nextChecked = Boolean(detail.data?.checked);
      if (prevChecked === nextChecked) return;

      const label = detail.data?.freeformLabel || "Grocery item";
      const message = nextChecked
        ? `${label} checked off`
        : `${label} un-checked`;
      setToast({ message, key: Date.now() });
    };
    window.addEventListener(SYNC_REMOTE_APPLIED_EVENT, handler);
    return () => window.removeEventListener(SYNC_REMOTE_APPLIED_EVENT, handler);
  }, []);

  if (!toast) return null;

  return (
    <Toast
      key={toast.key}
      open
      message={toast.message}
      tone="info"
      onDismiss={() => setToast(null)}
      durationMs={2500}
    />
  );
}
