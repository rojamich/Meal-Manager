import { describe, expect, it } from "vitest";
import { PantryItem, PlannedMeal, PurchaseEntry, Recipe, RecipeIngredient } from "../../models";
import { buildRecipeCostBreakdown, packQtyFor, servingsConsumedByMeal } from "../mealCost";

/**
 * Charging a recipe for the packets it forces you to buy, rather than the grams it
 * takes out of them. These cover the part of the model that is a deliberate
 * over-estimate, so the arithmetic is worth pinning down precisely.
 */

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

const meal = (over: Partial<PlannedMeal> & { id: string }): PlannedMeal => ({
  date: over.date ?? "2026-09-20",
  mealSlotId: over.mealSlotId ?? "dinner",
  type: over.type ?? "recipe",
  createdAt: "x",
  updatedAt: "x",
  ...over
});

describe("packQtyFor", () => {
  it("converts the sold-in size into the item's base units", () => {
    expect(packQtyFor(item({ id: "a", name: "A", packSize: 1, packUnit: "kg" }))).toBe(1000);
    expect(packQtyFor(item({ id: "a", name: "A", packSize: 970 }))).toBe(970);
  });

  it("returns nothing for items bought loose", () => {
    expect(packQtyFor(item({ id: "a", name: "A" }))).toBeUndefined();
    expect(packQtyFor(item({ id: "a", name: "A", packSize: 0 }))).toBeUndefined();
    expect(packQtyFor(undefined)).toBeUndefined();
  });

  it("returns nothing when the pack unit cannot measure the item", () => {
    expect(
      packQtyFor(item({ id: "a", name: "A", baseUnit: "ml", packSize: 1, packUnit: "kg" }))
    ).toBeUndefined();
  });
});

describe("charging whole packets", () => {
  // A 970 g jar, priced at 1000 for 1000 g, so exactly 1 per gram and 970 a jar.
  const passata = item({ id: "passata", name: "Passata", packSize: 970 });
  const passataPrice = purchase({ pantryItemId: "passata", quantity: 1000, totalPrice: 1000 });

  it("charges the whole jar when a recipe uses only part of it", () => {
    const result = buildRecipeCostBreakdown({
      recipe: recipe({ baseServings: 4 }),
      ingredients: [ingredient({ pantryItemId: "passata", quantity: 200 })],
      pantryItems: [passata],
      purchases: [passataPrice]
    });
    expect(result.costToMake).toBe(970);
    expect(result.costPerServing).toBe(242.5);
    expect(result.lines[0].basis).toBe("package");
    expect(result.lines[0].packsCharged).toBe(1);
    expect(result.lines[0].wastedQty).toBe(770);
    expect(result.leftoverCost).toBe(770);
  });

  it("rounds up to the number of packets actually needed", () => {
    const result = buildRecipeCostBreakdown({
      recipe: recipe({ baseServings: 1 }),
      ingredients: [ingredient({ pantryItemId: "passata", quantity: 1200 })],
      pantryItems: [passata],
      purchases: [passataPrice]
    });
    expect(result.lines[0].packsCharged).toBe(2);
    expect(result.costToMake).toBe(1940);
  });

  it("wastes nothing when the recipe uses exactly one packet", () => {
    const result = buildRecipeCostBreakdown({
      recipe: recipe({ baseServings: 1 }),
      ingredients: [ingredient({ pantryItemId: "passata", quantity: 970 })],
      pantryItems: [passata],
      purchases: [passataPrice]
    });
    expect(result.lines[0].packsCharged).toBe(1);
    expect(result.lines[0].wastedQty).toBe(0);
    expect(result.leftoverCost).toBe(0);
  });

  it("charges only what is used once an item is marked shared across meals", () => {
    const result = buildRecipeCostBreakdown({
      recipe: recipe({ baseServings: 4 }),
      ingredients: [ingredient({ pantryItemId: "passata", quantity: 200 })],
      pantryItems: [item({ ...passata, sharedAcrossMeals: true })],
      purchases: [passataPrice]
    });
    expect(result.costToMake).toBe(200);
    expect(result.lines[0].basis).toBe("usage");
    expect(result.leftoverCost).toBe(0);
  });

  it("charges loose goods by weight, because there is no packet to round up to", () => {
    const result = buildRecipeCostBreakdown({
      recipe: recipe({ baseServings: 4 }),
      ingredients: [ingredient({ pantryItemId: "mince", quantity: 537 })],
      pantryItems: [item({ id: "mince", name: "Mince" })],
      purchases: [purchase({ pantryItemId: "mince", quantity: 1000, totalPrice: 1000 })]
    });
    expect(result.costToMake).toBe(537);
    expect(result.lines[0].basis).toBe("loose");
    expect(result.unknownPackCount).toBe(1);
  });

  it("picks the alt-group option cheapest to actually buy, not cheapest per gram", () => {
    const result = buildRecipeCostBreakdown({
      recipe: recipe({ baseServings: 1 }),
      ingredients: [
        ingredient({ id: "i1", pantryItemId: "bulk", quantity: 100, altGroup: "cheese" }),
        ingredient({ id: "i2", pantryItemId: "small", quantity: 100, altGroup: "cheese" })
      ],
      pantryItems: [
        item({ id: "bulk", name: "Bulk", packSize: 5000 }),
        item({ id: "small", name: "Small", packSize: 200 })
      ],
      purchases: [
        purchase({ id: "pb", pantryItemId: "bulk", quantity: 1000, totalPrice: 500 }),
        purchase({ id: "ps", pantryItemId: "small", quantity: 1000, totalPrice: 1000 })
      ]
    });
    // Bulk is 0.5/g but only sold in a 5 kg jar: 2500. Small is 1/g in a 200 g tub: 200.
    expect(result.lines[0].label).toBe("cheese: Small");
    expect(result.costToMake).toBe(200);
  });

  it("reports an unpriced packaged item rather than charging it as free", () => {
    const result = buildRecipeCostBreakdown({
      recipe: recipe(),
      ingredients: [ingredient({ pantryItemId: "passata", quantity: 200 })],
      pantryItems: [passata],
      purchases: []
    });
    expect(result.pricedCount).toBe(0);
    expect(result.costToMake).toBe(0);
    expect(result.lines[0].basis).toBe("package");
    expect(result.lines[0].costToMake).toBeUndefined();
  });

  it("does not scale linearly with servings, because a jar is a jar", () => {
    const forFour = buildRecipeCostBreakdown({
      recipe: recipe({ baseServings: 4 }),
      ingredients: [ingredient({ pantryItemId: "passata", quantity: 400 })],
      pantryItems: [passata],
      purchases: [passataPrice]
    });
    const forEight = buildRecipeCostBreakdown({
      recipe: recipe({ baseServings: 8 }),
      ingredients: [ingredient({ pantryItemId: "passata", quantity: 800 })],
      pantryItems: [passata],
      purchases: [passataPrice]
    });
    // Both fit in one jar, so doubling the recipe halves the cost per serving.
    expect(forFour.costToMake).toBe(970);
    expect(forEight.costToMake).toBe(970);
    expect(forEight.costPerServing).toBeCloseTo(forFour.costPerServing / 2, 6);
  });
});

describe("servingsConsumedByMeal", () => {
  it("charges a cooked meal only the servings its leftovers did not claim", () => {
    const meals = [
      meal({ id: "cook", servingsPlanned: 6 }),
      meal({ id: "lo1", date: "2026-09-21", servingsPlanned: 2, leftoverSourceMealId: "cook" }),
      meal({ id: "lo2", date: "2026-09-22", servingsPlanned: 2, leftoverSourceMealId: "cook" })
    ];
    const consumed = servingsConsumedByMeal(meals);
    expect(consumed.get("cook")).toBe(2);
    expect(consumed.get("lo1")).toBe(2);
    expect(consumed.get("lo2")).toBe(2);
  });

  it("makes the shares add back up to the batch, so nothing is counted twice", () => {
    const meals = [
      meal({ id: "cook", servingsPlanned: 6 }),
      meal({ id: "lo1", servingsPlanned: 4, leftoverSourceMealId: "cook" })
    ];
    const total = [...servingsConsumedByMeal(meals).values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(6);
  });

  it("never goes negative when leftovers claim more than was cooked", () => {
    const meals = [
      meal({ id: "cook", servingsPlanned: 2 }),
      meal({ id: "lo1", servingsPlanned: 5, leftoverSourceMealId: "cook" })
    ];
    expect(servingsConsumedByMeal(meals).get("cook")).toBe(0);
  });

  it("leaves a meal with no leftovers charged in full", () => {
    expect(servingsConsumedByMeal([meal({ id: "solo", servingsPlanned: 3 })]).get("solo")).toBe(3);
  });

  it("falls back to the given default when a meal states no servings", () => {
    expect(servingsConsumedByMeal([meal({ id: "x" })], 2).get("x")).toBe(2);
  });
});
