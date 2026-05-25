import { InventoryLot, LocationProfile, PantryItem, PlannedMeal, Recipe, RecipeIngredient } from "../../models";
import { applyLotConsumption } from "../../db/repositories/inventoryRepo";
import { updatePlannedMeal } from "../../db/repositories/mealPlanRepo";
import { roundQty } from "../../utils/math";

export interface CookLotAllocation {
  lotId: string;
  available: number;
  suggested: number;
  expiresAt?: string;
  locationName?: string;
}

export interface CookIngredientPlan {
  pantryItemId: string;
  name: string;
  unit: string;
  category?: string;
  prepNote?: string;
  altGroup?: string;
  altGroupSkipped?: boolean;
  neededQty: number;
  allocations: CookLotAllocation[];
  coveredQty: number;
  shortfallQty: number;
  missingPantryItem?: boolean;
}

export interface CookPlan {
  ingredients: CookIngredientPlan[];
  totalShortfall: number;
  unknownIngredients: number;
}

export interface BuildCookPlanInput {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
  lots: InventoryLot[];
  pantryItems: PantryItem[];
  locations?: LocationProfile[];
  servings: number;
  locationId?: string;
}

function recipeBaseServings(recipe: Recipe) {
  return Math.max(recipe.baseServings ?? recipe.defaultServings ?? 1, 1);
}

function sortLotsForConsumption(lots: InventoryLot[]) {
  return [...lots].sort((a, b) => {
    if (!!a.expiresAt !== !!b.expiresAt) return a.expiresAt ? -1 : 1;
    if (a.expiresAt && b.expiresAt) {
      const cmp = a.expiresAt.localeCompare(b.expiresAt);
      if (cmp !== 0) return cmp;
    }
    return a.purchasedAt.localeCompare(b.purchasedAt);
  });
}

function planIngredient(
  pantryItemId: string,
  neededQty: number,
  ingredient: RecipeIngredient,
  pantryItems: PantryItem[],
  lots: InventoryLot[],
  locations: LocationProfile[] | undefined,
  locationId: string | undefined,
  altGroupSkipped: boolean
): CookIngredientPlan {
  const item = pantryItems.find((p) => p.id === pantryItemId);
  const activeLots = lots.filter(
    (lot) =>
      lot.pantryItemId === pantryItemId &&
      !lot.archivedAt &&
      lot.quantity > 0 &&
      (!locationId || lot.locationId === locationId)
  );
  const sorted = sortLotsForConsumption(activeLots);

  let remaining = neededQty;
  const allocations: CookLotAllocation[] = sorted.map((lot) => {
    const take = Math.min(lot.quantity, Math.max(remaining, 0));
    remaining = Math.max(remaining - take, 0);
    return {
      lotId: lot.id,
      available: lot.quantity,
      suggested: roundQty(take),
      expiresAt: lot.expiresAt,
      locationName: locations?.find((loc) => loc.id === lot.locationId)?.name
    };
  });

  const coveredQty = roundQty(allocations.reduce((sum, a) => sum + a.suggested, 0));
  const shortfallQty = roundQty(Math.max(neededQty - coveredQty, 0));

  return {
    pantryItemId,
    name: item?.name || "Unknown ingredient",
    unit: item?.baseUnit || "count",
    category: item?.category,
    prepNote: ingredient.prepNote,
    altGroup: ingredient.altGroup?.trim() || undefined,
    altGroupSkipped: altGroupSkipped || undefined,
    neededQty: roundQty(neededQty),
    allocations,
    coveredQty,
    shortfallQty,
    missingPantryItem: !item
  };
}

export function buildCookPlan({
  recipe,
  ingredients,
  lots,
  pantryItems,
  locations,
  servings,
  locationId
}: BuildCookPlanInput): CookPlan {
  const factor = Math.max(servings, 0) / recipeBaseServings(recipe);
  const plans: CookIngredientPlan[] = [];

  const normalGroup: RecipeIngredient[] = [];
  const altGroups = new Map<string, RecipeIngredient[]>();
  for (const ing of ingredients) {
    const group = ing.altGroup?.trim();
    if (!group) {
      normalGroup.push(ing);
    } else {
      const list = altGroups.get(group) ?? [];
      list.push(ing);
      altGroups.set(group, list);
    }
  }

  for (const ing of normalGroup) {
    const neededQty = roundQty(ing.quantity * factor);
    plans.push(planIngredient(ing.pantryItemId, neededQty, ing, pantryItems, lots, locations, locationId, false));
  }

  for (const [, options] of altGroups) {
    const candidatePlans = options.map((opt) => {
      const neededQty = roundQty(opt.quantity * factor);
      return planIngredient(opt.pantryItemId, neededQty, opt, pantryItems, lots, locations, locationId, false);
    });
    const chosenIndex = candidatePlans.findIndex((p) => p.shortfallQty === 0);
    const chosen = chosenIndex >= 0 ? chosenIndex : 0;
    candidatePlans.forEach((plan, index) => {
      plans.push({ ...plan, altGroupSkipped: index !== chosen });
    });
  }

  const totalShortfall = plans
    .filter((p) => !p.altGroupSkipped)
    .reduce((sum, p) => sum + p.shortfallQty, 0);
  const unknownIngredients = plans.filter((p) => p.missingPantryItem && !p.altGroupSkipped).length;

  return { ingredients: plans, totalShortfall: roundQty(totalShortfall), unknownIngredients };
}

export interface CommitCookInput {
  meal: PlannedMeal;
  plan: CookPlan;
}

export async function commitCook({ meal, plan }: CommitCookInput) {
  const consumptions = plan.ingredients
    .filter((ing) => !ing.altGroupSkipped)
    .flatMap((ing) =>
      ing.allocations
        .filter((alloc) => alloc.suggested > 0)
        .map((alloc) => ({ lotId: alloc.lotId, qtyConsumed: alloc.suggested }))
    );
  if (consumptions.length) {
    await applyLotConsumption(consumptions);
  }
  await updatePlannedMeal(meal.id, { cookedAt: new Date().toISOString() });
}

export async function uncookMeal(meal: PlannedMeal) {
  await updatePlannedMeal(meal.id, { cookedAt: undefined });
}
