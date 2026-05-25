import type { CSSProperties } from "react";
import { addDays, dateKey, parseISODate } from "../../utils/date";

export function formatWeekdayLabel(value: string) {
  const d = parseISODate(value);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function colorFromId(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }
  return `hsl(${hash}, 48%, 38%)`;
}

export function tintFromAccent(accent: string) {
  const match = /hsl\((\d+),\s*(\d+)%?,\s*(\d+)%\)/.exec(accent);
  if (!match) return "#f1f5f9";
  const hue = Number(match[1]);
  return `hsl(${hue}, 28%, 92%)`;
}

export function weekRange(anchorDate: string) {
  const start = parseISODate(anchorDate);
  const end = addDays(start, 6);
  return { start: dateKey(start), end: dateKey(end) };
}

export function monthRange(anchorDate: string) {
  const d = parseISODate(anchorDate);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: dateKey(start), end: dateKey(end) };
}

export function buildInlinePanelStyle(
  anchorEl: HTMLElement | null,
  panelEl?: HTMLDivElement | null
): CSSProperties {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 12;
  const gap = 8;
  const panelWidth = panelEl?.offsetWidth || 360;
  const panelHeight = panelEl?.offsetHeight || 320;
  const width = Math.min(380, viewportWidth - margin * 2);

  if (!anchorEl) {
    return {
      position: "fixed",
      top: margin,
      left: Math.max(margin, (viewportWidth - width) / 2),
      width,
      maxHeight: viewportHeight - margin * 2,
      overflowY: "auto"
    };
  }

  const anchorRect = anchorEl.getBoundingClientRect();
  let left = anchorRect.left;
  if (left + panelWidth > viewportWidth - margin) {
    left = Math.max(margin, anchorRect.right - panelWidth);
  }
  left = Math.min(Math.max(left, margin), Math.max(margin, viewportWidth - panelWidth - margin));

  let top = anchorRect.bottom + gap;
  if (top + panelHeight > viewportHeight - margin) {
    top = Math.max(margin, anchorRect.top - panelHeight - gap);
  }
  top = Math.min(Math.max(top, margin), Math.max(margin, viewportHeight - panelHeight - margin));

  return {
    position: "fixed",
    top,
    left,
    width,
    maxHeight: viewportHeight - margin * 2,
    overflowY: "auto"
  };
}
