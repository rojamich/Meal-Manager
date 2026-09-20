/**
 * Local storage that never takes the page down with it.
 *
 * `localStorage` throws rather than returning null in a private window, with site data
 * blocked, or when the quota is full. A preference failing to load is a nuisance; an
 * exception thrown while restoring one is a blank screen, so every access is guarded.
 */

export function getLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setLocal<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage unavailable or full — losing a preference beats throwing. */
  }
}

export function removeLocal(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
