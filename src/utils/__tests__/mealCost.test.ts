import { describe, expect, it } from "vitest";
import { PantryItem, PurchaseEntry, Recipe, RecipeIngredient } from "../../models";
import {
  averageCostPerServing,
  buildRecipeCostBreakdown,
  compareWithEatingOut,
  effectiveCostPerServing
} from "../mealCost";

const item = (over: Partial<PantryItem> & { id: string; name: string }): PantryItem => ({
  category: "other",
  storageType: "pantry",
  baseUnit: "g",
  createdAt: "x",
  updatedAt: "x",
  ...over
});

const purchase = (over: Partial<PurchaseEntry> & { pantryItemId: string }): PurchaseEntry => ({
  id: over.id ?? `p-${over.pantryItemId}`,
  quantity: over.quantity ?? 1000,
  totalPrice: over.totalPrice ?? 1000,
  currencyCode: over.currencyCode ?? "ARS",
  date: over.date ?? "2026-09-01",
  createdAt: "x",
  updatedAt: "x",
  ...over
});

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: "r1",
  title: "Test dish",
  baseServings: 4,
  defaultServings: 4,
  mealTypes: [],
  tags: [],
  steps: [],
  createdAt: "x",
  updatedAt: "x",
  ...over
});

const ingredient = (
  over: Partial<RecipeIngredient> & { pantryItemId: string }
): RecipeIngredient => ({
  id: over.id ?? `i-${over.pantryItemId}`,
  recipeId: over.recipeId ?? "r1",
  quantity: over.quantity ?? 100,
  createdAt: "x",
  updatedAt: "x",
  ...over
});

describe("buildRecipeCostBreakdown", () => {
  it("divides ingredient quantities by base servings", () => {
    // 800 g of chorizo at 12.50/g over 4 servings = 2500 a serving.
    const result = buildRecipeCostBreakdown({
      recipe: recipe({ baseServings: 4 }),
      ingredients: [ingredient({ pantryItemId: "chorizo", quantity: 800 })],
      pantryItems: [item({ id: "chorizo", name: "Chorizo" })],
      purchases: [purchase({ pantryItemId: "chorizo", quantity: 400, totalPrice: 5000 })]
    });
    expect(result.costPerServing).toBe(2500);
    expect(result.complete).toBe(true);
    expect(result.lines[0].qtyPerServing).toBe(200);
  });

  it("sums only the ingredients it can price, and says how many that was", () => {
    const result = buildRecipeCostBreakdown({
      recipe: recipe(),
      ingredients: [
        ingredient({ pantryItemId: "a", quantity: 400 }),
        ingredient({ pantryItemId: "b", quantity: 400 })
      ],
      pantryItems: [item({ id: "a", name: "A" }), item({ id: "b", name: "B" })],
      purchases: [purchase({ pantryItemId: "a", quantity: 100, totalPrice: 100 })]
    });
    expect(result.pricedCount).toBe(1);
    expect(result.lineCount).toBe(2);
    expect(result.complete).toBe(false);
    expect(result.costPerServing).toBe(100);
  });

  it("counts a negligible ingredient as priced at zero rather than missing", () => {
    const result = buildRecipeCostBreakdown({
      recipe: recipe(),
      ingredients: [
        ingredient({ pantryItemId: "a", quantity: 400 }),
        ingredient({ pantryItemId: "salt", quantity: 8 })
      ],
      pantryItems: [
        item({ id: "a", name: "A" }),
        item({ id: "salt", name: "Salt", negligibleCost: true })
      ],
      purchases: [purchase({ pantryItemId: "a", quantity: 100, totalPrice: 100 })]
    });
    expect(result.complete).toBe(true);
    expect(result.pricedCount).toBe(2);
    expect(result.costPerServing).toBe(100);
    expect(result.lines.find((l) => l.label === "Salt")?.negligible).toBe(true);
  });

  it("picks the cheapest priced option in an alt group", () => {
    const result = buildRecipeCostBreakdown({
      recipe: recipe(),
      ingredients: [
        ingredient({ id: "i1", pantryItemId: "pricey", quantity: 100, altGroup: "cheese" }),
        ingredient({ id: "i2", pantryItemId: "cheap", quantity: 100, altGroup: "cheese" })
      ],
      pantryItems: [item({ id: "pricey", name: "Pricey" }), item({ id: "cheap", name: "Cheap" })],
      purchases: [
        purchase({ id: "p1", pantryItemId: "pricey", quantity: 100, totalPrice: 900 }),
        purchase({ id: "p2", pantryItemId: "cheap", quantity: 100, totalPrice: 100 })
      ]
    });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].label).toBe("cheese: Cheap");
  });

  it("reports the age of the oldest price behind the figure", () => {
    const result = buildRecipeCostBreakdown({
      recipe: recipe(),
      ingredients: [
        ingredient({ pantryItemId: "fresh", quantity: 400 }),
        ingredient({ pantryItemId: "old", quantity: 400 })
      ],
      pantryItems: [item({ id: "fresh", name: "Fresh" }), item({ id: "old", name: "Old" })],
      purchases: [
        purchase({ pantryItemId: "fresh", quantity: 100, totalPrice: 100, date: "2026-09-19" }),
        purchase({ pantryItemId: "old", quantity: 100, totalPrice: 100, date: "2025-09-20" })
      ],
      asOfDate: "2026-09-20"
    });
    expect(result.oldestPriceAgeDays).toBe(365);
    expect(result.hasStalePrices).toBe(true);
  });

  it("carries old prices forward when the location states an inflation rate", () => {
    const withoutInflation = buildRecipeCostBreakdown({
      recipe: recipe({ baseServings: 1 }),
      ingredients: [ingredient({ pantryItemId: "a", quantity: 100 })],
      pantryItems: [item({ id: "a", name: "A" })],
      purchases: [purchase({ pantryItemId: "a", quantity: 100, totalPrice: 1000, date: "2025-09-20" })],
      asOfDate: "2026-09-20"
    });
    const withInflation = buildRecipeCostBreakdown({
      recipe: recipe({ baseServings: 1 }),
      ingredients: [ingredient({ pantryItemId: "a", quantity: 100 })],
      pantryItems: [item({ id: "a", name: "A" })],
      purchases: [purchase({ pantryItemId: "a", quantity: 100, totalPrice: 1000, date: "2025-09-20" })],
      asOfDate: "2026-09-20",
      annualInflationPct: 100
    });
    expect(withoutInflation.costPerServing).toBe(1000);
    expect(withInflation.costPerServing).toBeCloseTo(2000, 0);
  });
});

describe("effectiveCostPerServing", () => {
  it("prefers the computed figure once anything is priced", () => {
    const breakdown = buildRecipeCostBreakdown({
      recipe: recipe({ baseServings: 1 }),
      ingredients: [ingredient({ pantryItemId: "a", quantity: 100 })],
      pantryItems: [item({ id: "a", name: "A" })],
      purchases: [purchase({ pantryItemId: "a", quantity: 100, totalPrice: 250 })]
    });
    expect(effectiveCostPerServing(breakdown, recipe({ estimatedCostPerServing: 9 }))).toBe(250);
  });

  it("falls back to the hand-entered estimate when nothing is priced", () => {
    const breakdown = buildRecipeCostBreakdown({
      recipe: recipe(),
      ingredients: [ingredient({ pantryItemId: "a", quantity: 100 })],
      pantryItems: [item({ id: "a", name: "A" })],
      purchases: []
    });
    expect(effectiveCostPerServing(breakdown, recipe({ estimatedCostPerServing: 9 }))).toBe(9);
  });
});

describe("compareWithEatingOut", () => {
  it("flags a meal that costs at least as much as going out", () => {
    expect(compareWithEatingOut(2500, 2000)?.worseThanEatingOut).toBe(true);
    expect(compareWithEatingOut(1500, 2000)?.worseThanEatingOut).toBe(false);
  });

  it("calls it close when the two are within a tenth of each other", () => {
    expect(compareWithEatingOut(1950, 2000)?.closeCall).toBe(true);
    expect(compareWithEatingOut(1200, 2000)?.closeCall).toBe(false);
  });

  it("says nothing without both numbers, rather than guessing", () => {
    expect(compareWithEatingOut(undefined, 2000)).toBeUndefined();
    expect(compareWithEatingOut(2500, undefined)).toBeUndefined();
    expect(compareWithEatingOut(2500, 0)).toBeUndefined();
  });

  it("judges per serving, so batch size never changes the verdict", () => {
    const small = compareWithEatingOut(1500, 2000, 2);
    const big = compareWithEatingOut(1500, 2000, 8);
    expect(small?.worseThanEatingOut).toBe(false);
    expect(big?.worseThanEatingOut).toBe(false);
    // The batch that feeds eight costs far more in total and is still the better deal.
    expect(big?.cookTotal).toBe(12000);
    expect(small?.cookTotal).toBe(3000);
  });

  it("carries the batch figures for the money question", () => {
    const c = compareWithEatingOut(2500, 2000, 4);
    expect(c?.cookTotal).toBe(10000);
    expect(c?.eatOutTotal).toBe(8000);
    expect(c?.difference).toBe(500);
    expect(c?.totalDifference).toBe(2000);
  });

  it("treats a missing or nonsense serving count as one", () => {
    expect(compareWithEatingOut(2500, 2000)?.servings).toBe(1);
    expect(compareWithEatingOut(2500, 2000, 0)?.servings).toBe(1);
    expect(compareWithEatingOut(2500, 2000, -3)?.servings).toBe(1);
  });
});

describe("averageCostPerServing", () => {
  it("weights by servings rather than treating every meal alike", () => {
    // A plain mean would be (1000 + 100) / 2 = 550, letting the snack dominate.
    const result = averageCostPerServing([
      { costPerServing: 1000, servings: 6 },
      { costPerServing: 100, servings: 1 }
    ]);
    expect(result.servings).toBe(7);
    expect(result.average).toBeCloseTo(871.43, 2);
  });

  it("ignores meals with no price instead of counting them as free", () => {
    const result = averageCostPerServing([
      { costPerServing: 500, servings: 2 },
      { costPerServing: undefined, servings: 4 }
    ]);
    expect(result.servings).toBe(2);
    expect(result.average).toBe(500);
  });

  it("returns no average when nothing is priced", () => {
    const result = averageCostPerServing([{ costPerServing: undefined, servings: 4 }]);
    expect(result.average).toBeUndefined();
    expect(result.servings).toBe(0);
  });
});
