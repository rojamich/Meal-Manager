import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LocationProfile,
  PantryItem,
  PlannedMeal,
  PurchaseEntry,
  Recipe,
  RecipeIngredient
} from "../../models";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { listAllIngredients } from "../../db/repositories/recipeRepo";
import { listPurchaseEntries } from "../../db/repositories/purchaseRepo";
import { listLocations } from "../../db/repositories/locationRepo";
import {
  averageCostPerServing,
  buildRecipeCostBreakdown,
  compareWithEatingOut,
  servingsConsumedByMeal
} from "../../utils/mealCost";
import { buildCurrencyRates } from "../../utils/price";

/**
 * Costing the plan, once, for everything on the planner that needs it.
 *
 * Both the summary panel and the badge on each meal card want the same numbers, and
 * computing them twice would mean two sets of database reads and two chances to drift
 * apart on a rule as fiddly as how leftovers are charged. The planner owns the call and
 * hands the result to both.
 *
 * Everything here is in **US dollars**, whichever country the plan is for. A week in
 * pesos and a week in dollars are both answering "is this worth cooking", and that
 * question is only answerable if the two weeks are in the same unit. Each ingredient is
 * converted at the rate frozen on the purchase it came from, so the figure still
 * reflects what was actually paid rather than today's rate.
 */

export interface MealCostRow {
  meal: PlannedMeal;
  title: string;
  /** Servings this meal accounts for on its own day, after leftovers are settled. */
  servings: number;
  costPerServing?: number;
  total?: number;
  /** Cooking this costs at least as much as eating out here, per serving. */
  dearerThanEatingOut?: boolean;
  /** What the same number of people eating out would have cost. */
  eatOutTotal?: number;
}

export interface PlanCostAnalysis {
  dayTotals: { day: string; total: number; rows: MealCostRow[] }[];
  weekTotal: number;
  pricedMeals: number;
  unpricedMeals: number;
  dearer: MealCostRow[];
  avgPerServing?: number;
  totalServings: number;
  eatOutEquivalent?: number;
  /** Per-meal figures, for the badge on each card. */
  byMealId: Map<string, MealCostRow>;
  currency: string;
  eatOut?: number;
}

export function useMealCosts({
  days,
  meals,
  recipes,
  householdSize,
  locationId
}: {
  days: string[];
  meals: PlannedMeal[];
  recipes: Recipe[];
  householdSize: number;
  locationId?: string;
}): PlanCostAnalysis {

  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [locations, setLocations] = useState<LocationProfile[]>([]);

  const refresh = useCallback(async () => {
    const [items, ingredientRows, purchaseRows, locationRows] = await Promise.all([
      listPantryItems(),
      listAllIngredients(),
      listPurchaseEntries(),
      listLocations()
    ]);
    setPantryItems([...items]);
    setIngredients([...ingredientRows]);
    setPurchases([...purchaseRows]);
    setLocations([...locationRows]);
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => void refresh();
    window.addEventListener("purchases-updated", handler);
    window.addEventListener("recipe-ingredients-updated", handler);
    window.addEventListener("pantry-items-updated", handler);
    return () => {
      window.removeEventListener("purchases-updated", handler);
      window.removeEventListener("recipe-ingredients-updated", handler);
      window.removeEventListener("pantry-items-updated", handler);
    };
  }, [refresh]);

  const location = useMemo(
    () => locations.find((loc) => loc.id === locationId),
    [locationId, locations]
  );
  // The planner reports in dollars, so everything it compares has to arrive in dollars.
  const currency = "USD";
  const localRate = location?.exchangeRateToUSD;
  const eatOut =
    location?.eatOutCostPerPerson !== undefined && localRate
      ? location.eatOutCostPerPerson * localRate
      : undefined;

  const rates = useMemo(
    () => buildCurrencyRates(locations, locationId),
    [locations, locationId]
  );

  const analysis = useMemo(() => {
    const ingredientsByRecipe = new Map<string, RecipeIngredient[]>();
    for (const ing of ingredients) {
      ingredientsByRecipe.set(ing.recipeId, [...(ingredientsByRecipe.get(ing.recipeId) ?? []), ing]);
    }
    const recipeById = new Map(recipes.map((r) => [r.id, r]));

    // One breakdown per recipe, not per planned meal: the same recipe often appears
    // several times in a week and the per-serving cost does not change between them.
    const perServingCache = new Map<string, number | undefined>();
    const costPerServingFor = (recipeId: string) => {
      if (perServingCache.has(recipeId)) return perServingCache.get(recipeId);
      const recipe = recipeById.get(recipeId);
      if (!recipe) {
        perServingCache.set(recipeId, undefined);
        return undefined;
      }
      const breakdown = buildRecipeCostBreakdown({
        recipe,
        ingredients: ingredientsByRecipe.get(recipeId) ?? [],
        pantryItems,
        purchases,
        locationId,
        rates,
        annualInflationPct: location?.annualInflationPct
      });
      // Only the converted figure is offered. A hand-typed estimate is in some
      // unstated currency and a local total would be pesos wearing a dollar sign, so
      // either would make the week's total a number of nothing in particular.
      const value = breakdown.costPerServingUsd;
      perServingCache.set(recipeId, value);
      return value;
    };

    // A meal with no stated servings falls back to its recipe's own yield, which is
    // exactly what grocery generation assumes. Falling back to household size here
    // instead would charge for two servings of ingredients the list had just bought
    // four of.
    const defaultServingsFor = (m: PlannedMeal) => {
      const r = m.recipeId ? recipeById.get(m.recipeId) : undefined;
      return Math.max(r?.baseServings ?? r?.defaultServings ?? householdSize, 1);
    };

    // Computed over every meal, not just the visible ones: leftovers eaten next week
    // still reduce what the day they were cooked on is charged.
    const consumed = servingsConsumedByMeal(meals, defaultServingsFor);

    const inRange = meals.filter((meal) => days.includes(meal.date));
    const byDay = new Map<string, MealCostRow[]>();
    const byMealId = new Map<string, MealCostRow>();
    let weekTotal = 0;
    let pricedMeals = 0;
    let unpricedMeals = 0;
    const dearer: MealCostRow[] = [];

    for (const meal of inRange) {
      const servings = consumed.get(meal.id) ?? defaultServingsFor(meal);
      const recipe = meal.recipeId ? recipeById.get(meal.recipeId) : undefined;
      const title = recipe?.title || meal.freeformTitle || "Meal";

      // Leftover meals carry their own share now rather than being free: the batch cost
      // is split across the servings eaten, so every day shows what it actually uses.
      const isLeftover = meal.type === "leftover" || Boolean(meal.leftoverSourceMealId);
      const costPerServing = meal.recipeId ? costPerServingFor(meal.recipeId) : undefined;

      const row: MealCostRow = {
        meal,
        title: isLeftover ? `${title} (leftovers)` : title,
        servings,
        costPerServing,
        total: costPerServing !== undefined ? costPerServing * servings : undefined
      };

      if (costPerServing !== undefined && servings > 0) {
        weekTotal += row.total ?? 0;
        pricedMeals += 1;
        // Judged per serving, so a big batch is never penalised for being big.
        const comparison = compareWithEatingOut(costPerServing, eatOut, servings);
        if (comparison) {
          row.eatOutTotal = comparison.eatOutTotal;
          if (comparison.worseThanEatingOut) {
            row.dearerThanEatingOut = true;
            dearer.push(row);
          }
        }
      } else if (costPerServing === undefined) {
        unpricedMeals += 1;
      }

      byDay.set(meal.date, [...(byDay.get(meal.date) ?? []), row]);
      byMealId.set(meal.id, row);
    }

    const dayTotals = days.map((day) => {
      const rows = byDay.get(day) ?? [];
      return {
        day,
        total: rows.reduce((sum, row) => sum + (row.total ?? 0), 0),
        rows
      };
    });

    // Weighted by servings, so a one-serving snack cannot swing the average as hard as
    // a dinner that fed six.
    const allRows = [...byDay.values()].flat();
    const { average: avgPerServing, servings: totalServings } = averageCostPerServing(allRows);
    const eatOutEquivalent = eatOut !== undefined ? eatOut * totalServings : undefined;

    return {
      dayTotals,
      weekTotal,
      pricedMeals,
      unpricedMeals,
      dearer,
      avgPerServing,
      totalServings,
      eatOutEquivalent,
      byMealId,
      currency,
      eatOut
    };
  }, [
    currency,
    days,
    eatOut,
    householdSize,
    ingredients,
    location?.annualInflationPct,
    locationId,
    meals,
    pantryItems,
    purchases,
    rates,
    recipes
  ]);

  return analysis;
}

