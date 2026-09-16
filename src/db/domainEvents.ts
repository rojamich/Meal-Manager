/**
 * Domain events tell pages a table changed so they can re-read it.
 *
 * Listeners respond by reloading the whole table, so emitting once per row would turn a
 * batch write into one full reload per row — applying a week template writes up to 21
 * meals. Emits are collected into a short window and flushed once instead.
 *
 * The window is a fixed batching window, not a debounce: later emits join the pending set
 * without pushing the flush back, so a long run of writes can never starve the refresh.
 */
const BATCH_WINDOW_MS = 50;

const pending = new Set<string>();
let flushHandle: number | null = null;

export function emitDomainEvent(...names: string[]): void {
  if (typeof window === "undefined") return;
  for (const name of names) pending.add(name);
  if (flushHandle != null) return;
  flushHandle = window.setTimeout(() => {
    flushHandle = null;
    const queued = Array.from(pending);
    pending.clear();
    for (const name of queued) {
      window.dispatchEvent(new CustomEvent(name));
    }
  }, BATCH_WINDOW_MS);
}
