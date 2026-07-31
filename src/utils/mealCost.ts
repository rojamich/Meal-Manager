import { PantryItem, PurchaseEntry, Recipe, RecipeIngredient } from "../models";
import { bestUnitPrice } from "./price";

export interface RecipeCostLine {
  key: string;
  label: string;
  unit: string;
  qtyPerServing: number;
  /** Price per base unit from purchase history; undefined = no price data. */
  unitPrice?: number;
  costPerServing?: number;
}

export interface RecipeCostBreakdown {
  lines: RecipeCostLine[];
  pricedCount: number;
  lineCount: number;
  /** Sum of the priced lines only. */
  costPerServing: number;
  /** True when every ingredient line has a price. */
  complete: boolean;
}

/**
 * Per-serving cost of a recipe from purchase history. Quantities are stated at
 * baseServings, so cost per serving is independent of how a meal is scaled.
 * For alt groups (interchangeable options like "any cheese"), the cheapest
 * priced option is used; if none is priced, the first option stands in.
 */
export function buildRecipeCostBreakdown({
  recipe,
  ingredients,
  pantryItems,
  purchases,
  locationId
}: {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
  pantryItems: PantryItem[];
  purchases: PurchaseEntry[];
  locationId?: string;
}): RecipeCostBreakdown {
  const baseServings = Math.max(recipe.baseServings ?? recipe.defaultServings ?? 1, 1);
  const itemById = new Map(pantryItems.map((item) => [item.id, item]));

  const normal: RecipeIngredient[] = [];
  const altGroups = new Map<string, RecipeIngredient[]>();
  for (const ing of ingredients) {
    const group = ing.altGroup?.trim();
    if (!group) {
      normal.push(ing);
    } else {
      altGroups.set(group, [...(altGroups.get(group) ?? []), ing]);
    }
  }

  const lines: RecipeCostLine[] = [];
  const pushLine = (ing: RecipeIngredient, labelPrefix?: string) => {
    const item = itemById.get(ing.pantryItemId);
    const price = bestUnitPrice(purchases, ing.pantryItemId, locationId);
    const qtyPerServing = ing.quantity / baseServings;
    const name = item?.name || "Unknown ingredient";
    lines.push({
      key: ing.id,
      label: labelPrefix ? `${labelPrefix}: ${name}` : name,
      unit: item?.baseUnit || "count",
      qtyPerServing,
      unitPrice: price,
      costPerServing: price !== undefined ? qtyPerServing * price : undefined
    });
  };

  for (const ing of normal) pushLine(ing);
  for (const [groupLabel, options] of altGroups) {
    const priced = options
      .map((opt) => ({ opt, price: bestUnitPrice(purchases, opt.pantryItemId, locationId) }))
      .filter((entry) => entry.price !== undefined)
      .sort((a, b) => a.price! * a.opt.quantity - b.price! * b.opt.quantity);
    pushLine(priced[0]?.opt ?? options[0], groupLabel);
  }

  const pricedCount = lines.filter((line) => line.costPerServing !== undefined).length;
  const costPerServing = lines.reduce((sum, line) => sum + (line.costPerServing ?? 0), 0);

  return {
    lines,
    pricedCount,
    lineCount: lines.length,
    costPerServing,
    complete: lines.length > 0 && pricedCount === lines.length
  };
}

/**
 * Cost per serving to display for a recipe: computed from price history when
 * at least one ingredient is priced, else the manually entered estimate.
 */
export function effectiveCostPerServing(
  breakdown: RecipeCostBreakdown | undefined,
  recipe: Recipe
): number | undefined {
  if (breakdown && breakdown.pricedCount > 0) return breakdown.costPerServing;
  return recipe.estimatedCostPerServing;
}
