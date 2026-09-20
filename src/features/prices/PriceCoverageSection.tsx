import { useCallback, useEffect, useMemo, useState } from "react";
import { LocationProfile, PantryItem, PurchaseEntry, Recipe, RecipeIngredient } from "../../models";
import { listPantryItems, updatePantryItem } from "../../db/repositories/pantryRepo";
import { listAllIngredients, listRecipes } from "../../db/repositories/recipeRepo";
import { listPurchaseEntries } from "../../db/repositories/purchaseRepo";
import { listLocations } from "../../db/repositories/locationRepo";
import {
  STALE_PRICE_DAYS,
  bestUnitPriceInfo,
  buildCurrencyRates,
  formatPriceAge
} from "../../utils/price";
import { useActiveLocationId } from "../locations/activeLocation";
import { packQtyFor } from "../../utils/mealCost";

/**
 * Which ingredients are holding meal costs back, worst first.
 *
 * Price coverage builds up unevenly: you record what you happen to buy, and meanwhile a
 * handful of unpriced staples quietly keep half the recipe book showing "3.40+" instead
 * of a real figure. Guessing which ones to chase is hopeless, so they are ranked by how
 * many recipes each one blocks — the top of this list is the shortest route to a book
 * where the costs actually mean something.
 */

interface CoverageRow {
  item: PantryItem;
  recipesBlocked: number;
  /** Set when a price exists but is old enough to be worth refreshing. */
  staleAgeDays?: number;
}

export default function PriceCoverageSection({ embedded = false }: { embedded?: boolean } = {}) {
  const [activeLocationId] = useActiveLocationId();
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [locations, setLocations] = useState<LocationProfile[]>([]);

  const refresh = useCallback(async () => {
    const [items, recipeRows, ingredientRows, purchaseRows, locationRows] = await Promise.all([
      listPantryItems(),
      listRecipes(),
      listAllIngredients(),
      listPurchaseEntries(),
      listLocations()
    ]);
    setPantryItems([...items]);
    setRecipes([...recipeRows]);
    setIngredients([...ingredientRows]);
    setPurchases([...purchaseRows]);
    setLocations([...locationRows]);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const rates = useMemo(
    () => buildCurrencyRates(locations, activeLocationId || undefined),
    [locations, activeLocationId]
  );

  const inflation = useMemo(
    () => locations.find((loc) => loc.id === activeLocationId)?.annualInflationPct,
    [locations, activeLocationId]
  );

  const analysis = useMemo(() => {
    const itemById = new Map(pantryItems.map((item) => [item.id, item]));
    const priceOptions = {
      locationId: activeLocationId || undefined,
      rates,
      annualInflationPct: inflation
    };

    // One price lookup per item rather than per ingredient row: a staple appears in
    // dozens of recipes and the answer does not change between them.
    interface PriceStatus {
      has: boolean;
      ageDays?: number;
    }
    const priced = new Map<string, PriceStatus>();
    const priceFor = (itemId: string): PriceStatus => {
      const cached = priced.get(itemId);
      if (cached) return cached;
      const item = itemById.get(itemId);
      const info = item?.negligibleCost ? undefined : bestUnitPriceInfo(purchases, itemId, priceOptions);
      const result: PriceStatus = item?.negligibleCost
        ? { has: true }
        : info
          ? { has: true, ageDays: info.ageDays }
          : { has: false };
      priced.set(itemId, result);
      return result;
    };

    const blockedRecipes = new Map<string, Set<string>>();
    const recipesFullyPriced = new Set<string>();
    const recipesWithIngredients = new Set<string>();

    const byRecipe = new Map<string, RecipeIngredient[]>();
    for (const ing of ingredients) {
      byRecipe.set(ing.recipeId, [...(byRecipe.get(ing.recipeId) ?? []), ing]);
    }

    for (const recipe of recipes) {
      const rows = byRecipe.get(recipe.id) ?? [];
      if (!rows.length) continue;
      recipesWithIngredients.add(recipe.id);
      let complete = true;
      for (const ing of rows) {
        if (priceFor(ing.pantryItemId).has) continue;
        complete = false;
        const set = blockedRecipes.get(ing.pantryItemId) ?? new Set<string>();
        set.add(recipe.id);
        blockedRecipes.set(ing.pantryItemId, set);
      }
      if (complete) recipesFullyPriced.add(recipe.id);
    }

    const missing: CoverageRow[] = [...blockedRecipes.entries()]
      .map(([itemId, set]) => ({ item: itemById.get(itemId), recipesBlocked: set.size }))
      .filter((row): row is CoverageRow => Boolean(row.item))
      .sort((a, b) => b.recipesBlocked - a.recipesBlocked || a.item.name.localeCompare(b.item.name));

    // Items used in recipes whose price exists but has gone off.
    const usedInRecipes = new Set(ingredients.map((ing) => ing.pantryItemId));
    const stale: CoverageRow[] = [...usedInRecipes]
      .map((itemId) => ({ item: itemById.get(itemId), info: priceFor(itemId) }))
      .filter((row) => row.item && row.info.has && (row.info.ageDays ?? 0) > STALE_PRICE_DAYS)
      .map((row) => ({
        item: row.item as PantryItem,
        recipesBlocked: 0,
        staleAgeDays: row.info.ageDays
      }))
      .sort((a, b) => (b.staleAgeDays ?? 0) - (a.staleAgeDays ?? 0));

    // Everything a recipe uses that is being charged a whole packet. Sweeping through
    // this once, ticking off butter, milk, oil and spices, is what stops the cautious
    // default from overstating the things you genuinely do use up.
    const packaged = [...usedInRecipes]
      .map((itemId) => itemById.get(itemId))
      .filter(
        (row): row is PantryItem =>
          Boolean(row) && !row!.sharedAcrossMeals && !row!.negligibleCost && packQtyFor(row) !== undefined
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      missing,
      stale,
      packaged,
      recipesFullyPriced: recipesFullyPriced.size,
      recipeTotal: recipesWithIngredients.size,
      itemsUsed: usedInRecipes.size,
      itemsPriced: [...usedInRecipes].filter((id) => priceFor(id).has).length
    };
  }, [activeLocationId, ingredients, inflation, pantryItems, purchases, rates, recipes]);

  async function markNegligible(item: PantryItem) {
    await updatePantryItem(item.id, { negligibleCost: true });
    await refresh();
  }

  async function markShared(item: PantryItem) {
    await updatePantryItem(item.id, { sharedAcrossMeals: true });
    await refresh();
  }

  const body = (
    <>
      {!embedded && <h3>Price coverage</h3>}
      <p className="muted" style={{ fontSize: 12 }}>
        <strong>{analysis.itemsPriced}</strong> of {analysis.itemsUsed} ingredients used in
        recipes have a price, giving a full cost for <strong>{analysis.recipesFullyPriced}</strong>{" "}
        of {analysis.recipeTotal} recipes. The list below is ordered by how many recipes each
        missing price is holding back, so the top few are worth entering first.
      </p>

      {analysis.missing.length === 0 ? (
        <p className="muted">Every ingredient in every recipe has a price. Nothing to chase.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Ingredient</th>
              <th>Recipes waiting on it</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {analysis.missing.slice(0, 40).map((row) => (
              <tr key={row.item.id}>
                <td data-label="Ingredient">{row.item.name}</td>
                <td data-label="Recipes waiting on it">{row.recipesBlocked}</td>
                <td data-label="Actions">
                  <button
                    type="button"
                    className="secondary"
                    title="Salt, water, a pinch of pepper — counted as free rather than missing"
                    onClick={() => markNegligible(row.item)}
                  >
                    Cost is negligible
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {analysis.packaged.length > 0 && (
        <>
          <h4 style={{ marginBottom: 4 }}>Charged as whole packs</h4>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            A recipe using part of one of these is charged the whole pack, on the assumption
            the rest gets left behind. That is the cautious default. Tick off the ones you
            genuinely use across many meals — butter, milk, oil, spices — and they will be
            charged only for what each recipe takes.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Sold in</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {analysis.packaged.slice(0, 40).map((row) => (
                <tr key={row.id}>
                  <td data-label="Ingredient">{row.name}</td>
                  <td data-label="Sold in">
                    {row.packSize} {row.packUnit ?? row.baseUnit}
                  </td>
                  <td data-label="Actions">
                    <button type="button" className="secondary" onClick={() => markShared(row)}>
                      Used across meals
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {analysis.stale.length > 0 && (
        <>
          <h4 style={{ marginBottom: 4 }}>Prices worth refreshing</h4>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            These have a price, but an old one. They still count toward a recipe&rsquo;s cost —
            they are just the numbers most likely to be wrong.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Last price</th>
              </tr>
            </thead>
            <tbody>
              {analysis.stale.slice(0, 20).map((row) => (
                <tr key={row.item.id}>
                  <td data-label="Ingredient">{row.item.name}</td>
                  <td data-label="Last price">{formatPriceAge(row.staleAgeDays ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );

  return embedded ? <div>{body}</div> : <div className="panel">{body}</div>;
}
