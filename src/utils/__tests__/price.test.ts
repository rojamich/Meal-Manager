import { describe, expect, it } from "vitest";
import { LocationProfile, PurchaseEntry } from "../../models";
import { bestUnitPrice, buildCurrencyRates, convertAmount, unitPrice } from "../price";

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
