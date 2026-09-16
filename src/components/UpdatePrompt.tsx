import { useEffect, useState } from "react";

/**
 * A new service worker used to activate and reload silently, which could discard whatever
 * was half-typed into a form. Offer the reload instead of taking it.
 */
export default function UpdatePrompt() {
  const [apply, setApply] = useState<(() => void) | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ apply: () => void }>).detail;
      if (typeof detail?.apply === "function") setApply(() => detail.apply);
    };
    window.addEventListener("app-update-ready", handler);
    return () => window.removeEventListener("app-update-ready", handler);
  }, []);

  if (!apply) return null;

  return (
    <div className="update-prompt" role="status">
      <span>A new version of Meal Manager is ready.</span>
      <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
        <button type="button" onClick={apply}>
          Reload now
        </button>
        <button type="button" className="secondary" onClick={() => setApply(null)}>
          Later
        </button>
      </div>
    </div>
  );
}
