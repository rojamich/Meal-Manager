import { useEffect, useState } from "react";
import { DATA_LOAD_ERROR_EVENT, DataLoadErrorDetail } from "../utils/loadError";

/**
 * Shows a single dismissible banner when a page-level data load fails, so a storage
 * problem reads as a problem rather than as an empty pantry.
 */
export default function DataErrorBanner() {
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<DataLoadErrorDetail>).detail;
      if (!detail?.what) return;
      setFailed((prev) => (prev.includes(detail.what) ? prev : [...prev, detail.what]));
    };
    window.addEventListener(DATA_LOAD_ERROR_EVENT, handler);
    return () => window.removeEventListener(DATA_LOAD_ERROR_EVENT, handler);
  }, []);

  if (!failed.length) return null;

  return (
    <div className="data-error-banner" role="alert">
      <div>
        <strong>Couldn't load {failed.join(", ")}.</strong>{" "}
        <span>
          This screen may be missing data. That usually means the browser blocked local
          storage — check private browsing, or close other tabs running this app.
        </span>
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
        <button type="button" className="secondary" onClick={() => setFailed([])}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
