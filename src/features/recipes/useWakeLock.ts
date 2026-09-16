import { useCallback, useEffect, useRef, useState } from "react";

type WakeLockSentinelLike = { released: boolean; release: () => Promise<void> };

/**
 * Hold the screen awake while cooking.
 *
 * Without this the phone sleeps partway through a recipe and you have to wake it with
 * whatever you're holding. The lock is dropped by the browser whenever the tab is hidden,
 * so it has to be re-acquired on the way back.
 *
 * Returns `supported: false` on browsers without the API (older iOS, Firefox) — callers
 * should hide the control rather than offer something that does nothing.
 */
export function useWakeLock(enabled: boolean) {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const [active, setActive] = useState(false);
  const supported =
    typeof navigator !== "undefined" && "wakeLock" in navigator;

  const release = useCallback(async () => {
    const sentinel = sentinelRef.current;
    sentinelRef.current = null;
    setActive(false);
    if (!sentinel || sentinel.released) return;
    try {
      await sentinel.release();
    } catch {
      /* already gone */
    }
  }, []);

  const acquire = useCallback(async () => {
    if (!supported || sentinelRef.current) return;
    try {
      const anyNav = navigator as unknown as {
        wakeLock: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
      };
      const sentinel = await anyNav.wakeLock.request("screen");
      sentinelRef.current = sentinel;
      setActive(true);
    } catch {
      // Denied (low battery, no user gesture yet) — cooking still works, the screen
      // just behaves normally.
      setActive(false);
    }
  }, [supported]);

  useEffect(() => {
    if (!supported) return;
    if (!enabled) {
      void release();
      return;
    }

    void acquire();

    // The browser drops the lock on tab switch, app backgrounding, or screen lock.
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void release();
    };
  }, [acquire, enabled, release, supported]);

  return { supported, active };
}
