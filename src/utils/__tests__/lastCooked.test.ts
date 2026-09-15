import { describe, expect, it, vi, afterEach } from "vitest";
import { calendarDaysAgo, formatLastCooked } from "../date";

const daysAgo = (n: number, hour = 12) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

afterEach(() => vi.useRealTimers());

describe("calendarDaysAgo", () => {
  it("counts whole calendar days, not elapsed hours", () => {
    expect(calendarDaysAgo(daysAgo(0))).toBe(0);
    expect(calendarDaysAgo(daysAgo(1))).toBe(1);
    expect(calendarDaysAgo(daysAgo(10))).toBe(10);
  });

  // Cooking at 11pm should still read "Today" an hour later, not "Yesterday".
  it("treats late-evening and early-morning on the same date as today", () => {
    expect(calendarDaysAgo(daysAgo(0, 23))).toBe(0);
    expect(calendarDaysAgo(daysAgo(0, 1))).toBe(0);
  });

  it("returns undefined for an unparseable timestamp", () => {
    expect(calendarDaysAgo("not a date")).toBeUndefined();
  });
});

describe("formatLastCooked", () => {
  it("says Never when there is no history", () => {
    expect(formatLastCooked(undefined)).toBe("Never");
    expect(formatLastCooked("")).toBe("Never");
    expect(formatLastCooked("garbage")).toBe("Never");
  });

  it("uses words for the recent past", () => {
    expect(formatLastCooked(daysAgo(0))).toBe("Today");
    expect(formatLastCooked(daysAgo(1))).toBe("Yesterday");
    expect(formatLastCooked(daysAgo(3))).toBe("3 days ago");
    expect(formatLastCooked(daysAgo(9))).toBe("Last week");
  });

  it("coarsens as the gap grows", () => {
    expect(formatLastCooked(daysAgo(21))).toBe("3 weeks ago");
    expect(formatLastCooked(daysAgo(90))).toBe("3 months ago");
    expect(formatLastCooked(daysAgo(400))).toBe("A year ago");
    expect(formatLastCooked(daysAgo(800))).toBe("2 years ago");
  });
});
