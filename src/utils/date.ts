export function dateKey(input: Date | string) {
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const date = typeof input === "string" ? new Date(input) : input;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseISODate(value: string) {
  return new Date(value + "T00:00:00");
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfWeek(date: Date, weekStart = 1) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day < weekStart ? 7 : 0) + day - weekStart;
  d.setDate(d.getDate() - diff);
  return d;
}

export function formatDateLabel(value: string) {
  const d = parseISODate(value);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDateLong(value: string) {
  const d = parseISODate(value);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Whole calendar days between two instants, so a late-evening cook still reads "Today". */
export function calendarDaysAgo(iso: string): number | undefined {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return undefined;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(new Date()) - startOfDay(then)) / 86_400_000);
}

/**
 * How long ago a recipe was last made, phrased the way you'd say it when deciding what to
 * cook — the point is "not this again", so precision matters less than the rough distance.
 */
export function formatLastCooked(iso?: string): string {
  if (!iso) return "Never";
  const days = calendarDaysAgo(iso);
  if (days === undefined) return "Never";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "A year ago" : `${years} years ago`;
}
