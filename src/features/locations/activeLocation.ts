import { useEffect, useState } from "react";

const STORAGE_KEY = "active-location-id";
const CHANGE_EVENT = "active-location-changed";

export function getActiveLocationId(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setActiveLocationId(id: string) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: id }));
}

export function useActiveLocationId(): [string, (id: string) => void] {
  const [id, setId] = useState<string>(() => getActiveLocationId());

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setId(typeof detail === "string" ? detail : getActiveLocationId());
    };
    const storageHandler = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setId(event.newValue || "");
    };
    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  const update = (next: string) => {
    setActiveLocationId(next);
  };
  return [id, update];
}
