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
import { formatDateLabel } from "../../utils/date";

/**
 * What the plan in front of you costs, and when it stops being worth cooking.
 *
 * The recipes page can already tell you what one recipe costs per serving, but that is
 * not the question you are actually asking. The question is whether *this week*, as
 * planned, is worth the shopping — and whether any particular night has quietly become
 * more expensive than walking to a restaurant. Both need the plan, the servings and the
 * eat-out baseline together, which is why this lives on the planner.
 *
 * Meals with no priced ingredients are counted separately rather than as zero. A week
 * total that silently treats unknown as free reads as reassuring and is simply wrong.
 *
 * Each day is charged what it *consumes*, so a batch cooked on Sunday and finished on
 * Wednesday shows up across those days rather than landing entirely on Sunday. The
 * shares always add back up to the batch.
 */

interface MealCostRow {
  meal: PlannedMeal;
  title: string;
  servings: number;
  costPerServing?: number;
  total?: number;
  /** Cooking this costs at least as much as eating out here, per serving. */
  dearerThanEatingOut?: boolean;
  /** What the same number of people eating out would have cost. */
  eatOutTotal?: number;
}

export default function PlanCostPanel({
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
}) {
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [locations, setLocations] = useState<LocationProfile[]>([]);
  const [open, setOpen] = useState(false);

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
  const currency = location?.currencyCode ?? "";
  const eatOut = location?.eatOutCostPerPerson;

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
      const value =
        breakdown.pricedCount > 0 ? breakdown.costPerServing : recipe.estimatedCostPerServing;
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
      eatOutEquivalent
    };
  }, [
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

  const money = (value: number) => `${value.toFixed(2)}${currency ? ` ${currency}` : ""}`;

  if (analysis.pricedMeals === 0 && analysis.unpricedMeals === 0) return null;

  return (
    <section className="panel">
      <div className="row resource-toolbar" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>
          Plan cost: {analysis.pricedMeals > 0 ? money(analysis.weekTotal) : "—"}
        </h2>
        <button type="button" className="secondary" onClick={() => setOpen((prev) => !prev)}>
          {open ? "Hide detail" : "Show detail"}
        </button>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        {analysis.avgPerServing !== undefined && (
          <>
            <strong>{money(analysis.avgPerServing)}</strong> a serving across{" "}
            {analysis.totalServings} serving{analysis.totalServings === 1 ? "" : "s"}
            {analysis.eatOutEquivalent !== undefined && (
              <> · eating out for the same {analysis.totalServings} would be about{" "}
              {money(analysis.eatOutEquivalent)}</>
            )}
            {" · "}
          </>
        )}
        {analysis.pricedMeals} meal{analysis.pricedMeals === 1 ? "" : "s"} priced
        {analysis.unpricedMeals > 0 && (
          <>
            {" · "}
            <strong>{analysis.unpricedMeals}</strong> not priced yet, so the real total is higher
          </>
        )}
        {!eatOut && (
          <>
            {" · "}set an eating-out cost on this location to see when cooking stops being cheaper
          </>
        )}
      </p>

      {analysis.dearer.length > 0 && eatOut !== undefined && (
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13 }}>
            <strong>Costs more than eating out</strong> (about {money(eatOut)} a head here),
            compared serving for serving:{" "}
            {analysis.dearer
              .map((row) => `${row.title} at ${row.costPerServing?.toFixed(2)} a serving`)
              .join(", ")}
          </p>
        </div>
      )}

      {open && (
        <>
        <p className="muted" style={{ fontSize: 12 }}>
          Whether a meal beats eating out is decided per serving, not on the batch total —
          a pot that feeds six costs more than an omelette and is not the worse deal for it.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Meal</th>
              <th>Servings eaten</th>
              <th>Per serving</th>
              <th>Batch total</th>
              <th>Eating out, same servings</th>
            </tr>
          </thead>
          <tbody>
            {analysis.dayTotals
              .filter((entry) => entry.rows.length > 0)
              .map((entry) =>
                entry.rows.map((row, index) => (
                  <tr key={row.meal.id}>
                    <td data-label="Day">{index === 0 ? formatDateLabel(entry.day) : ""}</td>
                    <td data-label="Meal">
                      {row.title}
                      {row.dearerThanEatingOut && (
                        <span className="muted" style={{ fontSize: 11 }}> · dearer than eating out</span>
                      )}
                    </td>
                    <td data-label="Servings eaten">{row.servings}</td>
                    <td data-label="Per serving">
                      <strong>
                        {row.costPerServing !== undefined ? row.costPerServing.toFixed(2) : "—"}
                      </strong>
                    </td>
                    <td data-label="Batch total">
                      {row.total !== undefined ? row.total.toFixed(2) : "—"}
                    </td>
                    <td data-label="Eating out, same servings">
                      {row.eatOutTotal !== undefined ? row.eatOutTotal.toFixed(2) : "—"}
                    </td>
                  </tr>
                ))
              )}
          </tbody>
        </table>
        </>
      )}
    </section>
  );
}
