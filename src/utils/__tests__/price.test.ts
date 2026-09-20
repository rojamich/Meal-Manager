import { describe, expect, it } from "vitest";
import { LocationProfile, PurchaseEntry } from "../../models";
import {
  ageAdjust,
  bestUnitPrice,
  bestUnitPriceInfo,
  buildCurrencyRates,
  convertAmount,
  formatPriceAge,
  unitPrice
} from "../price";

const purchase = (over: Partial<PurchaseEntry>): PurchaseEntry => ({
  id: over.id ?? "p1",
  pantryItemId: over.pantryItemId ?? "item-1",
  quantity: over.quantity ?? 1,
  totalPrice: over.totalPrice ?? 1,
  currencyCode: over.currencyCode ?? "USD",
  locationId: over.locationId,
  date: over.date ?? "2026-01-01",
  createdAt: "x",
  updatedAt: "x"
});

const location = (over: Partial<LocationProfile>): LocationProfile => ({
  id: over.id ?? "loc",
  name: over.name ?? "Home",
  currencyCode: over.currencyCode ?? "USD",
  exchangeRateToUSD: over.exchangeRateToUSD,
  createdAt: "x",
  updatedAt: "x"
});

const LOCATIONS = [
  location({ id: "us", currencyCode: "USD", exchangeRateToUSD: 1 }),
  location({ id: "jp", currencyCode: "JPY", exchangeRateToUSD: 0.0067 }),
  location({ id: "no-rate", currencyCode: "XYZ" })
];

describe("unitPrice", () => {
  it("divides total by quantity", () => {
    expect(unitPrice(purchase({ totalPrice: 10, quantity: 4 }))).toBe(2.5);
  });

  it("returns 0 rather than dividing by zero", () => {
    expect(unitPrice(purchase({ totalPrice: 10, quantity: 0 }))).toBe(0);
  });
});

describe("convertAmount", () => {
  const rates = buildCurrencyRates(LOCATIONS, "us");

  it("is a no-op within one currency", () => {
    expect(convertAmount(5, "USD", "USD", rates)).toBe(5);
  });

  it("converts through USD", () => {
    expect(convertAmount(1000, "JPY", "USD", rates)).toBeCloseTo(6.7, 5);
  });

  it("refuses a currency with no rate on file", () => {
    expect(convertAmount(10, "XYZ", "USD", rates)).toBeUndefined();
  });

  it("refuses to guess when no rates are supplied", () => {
    expect(convertAmount(10, "JPY", "USD", undefined)).toBeUndefined();
  });
});

describe("bestUnitPrice", () => {
  it("returns undefined when the item has no history", () => {
    expect(bestUnitPrice([], "item-1")).toBeUndefined();
  });

  it("prefers the most recent purchase at the active location", () => {
    const purchases = [
      purchase({ id: "a", locationId: "us", totalPrice: 4, quantity: 1, date: "2026-01-01" }),
      purchase({ id: "b", locationId: "us", totalPrice: 9, quantity: 1, date: "2026-03-01" }),
      purchase({ id: "c", locationId: "jp", totalPrice: 1, quantity: 1, date: "2026-04-01" })
    ];
    expect(bestUnitPrice(purchases, "item-1", "us")).toBe(9);
  });

  it("converts a foreign purchase into the reporting currency", () => {
    const rates = buildCurrencyRates(LOCATIONS, "us");
    const purchases = [
      purchase({ id: "a", locationId: "jp", currencyCode: "JPY", totalPrice: 1000, quantity: 1 })
    ];
    expect(bestUnitPrice(purchases, "item-1", "jp", rates)).toBeCloseTo(6.7, 5);
  });

  // The bug this suite exists for: 320 JPY and $2.10 used to be averaged into 161.05.
  it("never averages across currencies when no rates are available", () => {
    const purchases = [
      purchase({ id: "a", currencyCode: "USD", totalPrice: 2.1, quantity: 1, date: "2026-02-01" }),
      purchase({ id: "b", currencyCode: "JPY", totalPrice: 320, quantity: 1, date: "2026-01-01" })
    ];
    // Reports in USD (the most recent purchase's currency) and drops the yen entry.
    expect(bestUnitPrice(purchases, "item-1")).toBe(2.1);
  });

  it("averages across currencies once rates make them comparable", () => {
    const rates = buildCurrencyRates(LOCATIONS, "us");
    const purchases = [
      purchase({ id: "a", currencyCode: "USD", totalPrice: 2, quantity: 1, date: "2026-02-01" }),
      purchase({ id: "b", currencyCode: "JPY", totalPrice: 1000, quantity: 1, date: "2026-01-01" })
    ];
    // (2.00 + 6.70) / 2
    expect(bestUnitPrice(purchases, "item-1", undefined, rates)).toBeCloseTo(4.35, 5);
  });

  it("treats USD as its own reference even with no USD location", () => {
    const rates = buildCurrencyRates([location({ id: "jp", currencyCode: "JPY", exchangeRateToUSD: 0.0067 })]);
    expect(rates.toUsd.get("USD")).toBe(1);
  });
});

describe("ageAdjust", () => {
  it("leaves a price alone when no inflation rate is given", () => {
    expect(ageAdjust(100, "2026-01-01", "2026-09-01")).toBe(100);
    expect(ageAdjust(100, "2026-01-01", "2026-09-01", 0)).toBe(100);
  });

  it("carries an old price forward at the stated annual rate", () => {
    // A full year at 100% doubles it.
    expect(ageAdjust(100, "2025-09-20", "2026-09-20", 100)).toBeCloseTo(200, 0);
  });

  it("scales by the fraction of a year actually elapsed", () => {
    const halfYear = ageAdjust(100, "2026-03-20", "2026-09-20", 100);
    expect(halfYear).toBeGreaterThan(130);
    expect(halfYear).toBeLessThan(150);
  });

  it("never discounts a price for being from the future", () => {
    expect(ageAdjust(100, "2026-12-01", "2026-09-20", 100)).toBe(100);
  });
});

describe("bestUnitPriceInfo", () => {
  const rates = buildCurrencyRates(LOCATIONS, "us");

  it("reports the age of the price it returns", () => {
    const info = bestUnitPriceInfo(
      [purchase({ id: "a", locationId: "us", totalPrice: 10, quantity: 2, date: "2026-06-20" })],
      "item-1",
      { locationId: "us", rates, asOfDate: "2026-09-20" }
    );
    expect(info?.price).toBe(5);
    expect(info?.asOf).toBe("2026-06-20");
    expect(info?.ageDays).toBe(92);
    expect(info?.source).toBe("location");
    expect(info?.sampleCount).toBe(1);
  });

  it("dates an average by its most recent contributor", () => {
    const info = bestUnitPriceInfo(
      [
        purchase({ id: "a", totalPrice: 2, quantity: 1, date: "2026-01-10" }),
        purchase({ id: "b", totalPrice: 4, quantity: 1, date: "2026-08-10" })
      ],
      "item-1",
      { rates, asOfDate: "2026-09-20" }
    );
    expect(info?.price).toBe(3);
    expect(info?.source).toBe("average");
    expect(info?.sampleCount).toBe(2);
    expect(info?.asOf).toBe("2026-08-10");
  });

  it("adjusts a stale local price for inflation and says that it did", () => {
    const info = bestUnitPriceInfo(
      [purchase({ id: "a", locationId: "us", totalPrice: 1000, quantity: 1, date: "2025-09-20" })],
      "item-1",
      { locationId: "us", rates, asOfDate: "2026-09-20", annualInflationPct: 50 }
    );
    expect(info?.rawPrice).toBe(1000);
    expect(info?.price).toBeCloseTo(1500, 0);
    expect(info?.inflationAdjusted).toBe(true);
  });

  it("leaves today's price untouched even with inflation set", () => {
    const info = bestUnitPriceInfo(
      [purchase({ id: "a", locationId: "us", totalPrice: 1000, quantity: 1, date: "2026-09-20" })],
      "item-1",
      { locationId: "us", rates, asOfDate: "2026-09-20", annualInflationPct: 50 }
    );
    expect(info?.price).toBe(1000);
    expect(info?.inflationAdjusted).toBe(false);
  });

  it("still returns nothing when there is no usable history", () => {
    expect(bestUnitPriceInfo([], "item-1", { rates })).toBeUndefined();
  });

  it("agrees with the bare-number helper", () => {
    const purchases = [
      purchase({ id: "a", locationId: "us", totalPrice: 9, quantity: 3, date: "2026-05-01" })
    ];
    expect(bestUnitPrice(purchases, "item-1", "us", rates)).toBe(
      bestUnitPriceInfo(purchases, "item-1", { locationId: "us", rates })?.price
    );
  });
});

describe("formatPriceAge", () => {
  it("phrases age the way you would judge whether to trust it", () => {
    expect(formatPriceAge(0)).toBe("today");
    expect(formatPriceAge(1)).toBe("yesterday");
    expect(formatPriceAge(5)).toBe("5d old");
    expect(formatPriceAge(30)).toBe("4w old");
    expect(formatPriceAge(120)).toBe("4mo old");
    expect(formatPriceAge(400)).toBe("1yr old");
    expect(formatPriceAge(900)).toBe("2yr old");
  });
});
