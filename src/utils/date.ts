export function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
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