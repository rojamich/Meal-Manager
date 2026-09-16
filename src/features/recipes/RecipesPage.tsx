import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PantryItem, PurchaseEntry, Recipe, RecipeIngredient } from "../../models";
import { countRecipeReferences, deleteRecipe, duplicateRecipe, listAllIngredients, listRecipes } from "../../db/repositories/recipeRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { listActiveLots } from "../../db/repositories/inventoryRepo";
import { listLocations } from "../../db/repositories/locationRepo";
import { listPurchaseEntries } from "../../db/repositories/purchaseRepo";
import { useActiveLocationId } from "../locations/activeLocation";
import { buildRecipeCostBreakdown, effectiveCostPerServing } from "../../utils/mealCost";
import { useConfirmChoiceModal } from "../../components/useConfirmChoiceModal";
import { safeImageUrl } from "../../utils/url";
import { buildCurrencyRates } from "../../utils/price";
import { compareNames } from "../../utils/sort";
import { getLastCookedByRecipe } from "../../db/repositories/cookHistoryRepo";
import { calendarDaysAgo, dateKey, formatLastCooked } from "../../utils/date";
import { LocationProfile } from "../../models";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

function recipeBaseServings(recipe: Recipe) {
  return Math.max(recipe.baseServings ?? recipe.defaultServings ?? 2, 1);
}

function recipeCalories(recipe: Recipe) {
  return recipe.calories ?? recipe.caloriesPerServing;
}

function recipeMetaSummary(recipe: Recipe) {
  const parts: string[] = [];
  if (recipeCalories(recipe) !== undefined) parts.push(`${recipeCalories(recipe)} cal`);
  if (recipe.proteinGrams !== undefined) parts.push(`${recipe.proteinGrams}g protein`);
  if (recipe.timeMinutes !== undefined) parts.push(`${recipe.timeMinutes} min`);
  return parts.join(" • ") || "-";
}

export default function RecipesPage() {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState("");
  const [mealTypeFilters, setMealTypeFilters] = useState<string[]>([]);
  const [maxCalories, setMaxCalories] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [maxTime, setMaxTime] = useState("");
  const [notCookedInDays, setNotCookedInDays] = useState("");
  const [lastCookedByRecipe, setLastCookedByRecipe] = useState<Map<string, string>>(new Map());
  const [sortBy, setSortBy] = useState<"title" | "calories" | "cost" | "time" | "lastCooked">("title");
  const [canMakeOnly, setCanMakeOnly] = useState(false);
  const [availabilityLocationId, setAvailabilityLocationId] = useState("");
  const [availabilityAsOfDate, setAvailabilityAsOfDate] = useState(dateKey(new Date()));
  const [allIngredients, setAllIngredients] = useState<RecipeIngredient[]>([]);
  const [locations, setLocations] = useState<LocationProfile[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [activeLocationId] = useActiveLocationId();
  const [showFilters, setShowFilters] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const [activeLots, setActiveLots] = useState<{ pantryItemId: string; quantity: number; expiresAt?: string }[]>([]);
  const { requestChoice, modal } = useConfirmChoiceModal();

  const refresh = useCallback(async () => {
    setRecipes([...(await listRecipes())]);
    setAllIngredients([...(await listAllIngredients())]);
    setLocations([...(await listLocations())]);
    setPantryItems([...(await listPantryItems())]);
    setPurchases([...(await listPurchaseEntries())]);
    setLastCookedByRecipe(await getLastCookedByRecipe());
  }, []);

  useEffect(() => {
    refresh();
    const onSync = () => refresh();
    window.addEventListener("recipes-updated", onSync);
    window.addEventListener("recipe-ingredients-updated", onSync);
    window.addEventListener("pantry-items-updated", onSync);
    window.addEventListener("locations-updated", onSync);
    window.addEventListener("purchases-updated", onSync);
    window.addEventListener("planned-meals-updated", onSync);
    window.addEventListener("cooked-portions-updated", onSync);
    return () => {
      window.removeEventListener("recipes-updated", onSync);
      window.removeEventListener("recipe-ingredients-updated", onSync);
      window.removeEventListener("pantry-items-updated", onSync);
      window.removeEventListener("locations-updated", onSync);
      window.removeEventListener("purchases-updated", onSync);
      window.removeEventListener("planned-meals-updated", onSync);
      window.removeEventListener("cooked-portions-updated", onSync);
    };
  }, [refresh]);

  useEffect(() => {
    listActiveLots(availabilityLocationId || undefined).then((lots) => {
      setActiveLots(
        lots.map((lot) => ({
          pantryItemId: lot.pantryItemId,
          quantity: lot.quantity,
          expiresAt: lot.expiresAt
        }))
      );
    });
  }, [availabilityLocationId, recipes]);

  const makeableByRecipe = useMemo(() => {
    const asOf = dateKey(availabilityAsOfDate);
    const availability = new Map<string, number>();
    activeLots
      .filter((lot) => !lot.expiresAt || dateKey(lot.expiresAt) >= asOf)
      .forEach((lot) => {
        availability.set(lot.pantryItemId, (availability.get(lot.pantryItemId) ?? 0) + lot.quantity);
      });

    const ingredientsByRecipe = new Map<string, RecipeIngredient[]>();
    allIngredients.forEach((ing) => {
      const list = ingredientsByRecipe.get(ing.recipeId) ?? [];
      list.push(ing);
      ingredientsByRecipe.set(ing.recipeId, list);
    });

    const result = new Map<string, boolean>();
    recipes.forEach((recipe) => {
      const recipeIngredients = ingredientsByRecipe.get(recipe.id) ?? [];
      const grouped = new Map<string, RecipeIngredient[]>();
      const plain: RecipeIngredient[] = [];
      recipeIngredients.forEach((ing) => {
        const group = ing.altGroup?.trim();
        if (!group) plain.push(ing);
        else {
          const list = grouped.get(group) ?? [];
          list.push(ing);
          grouped.set(group, list);
        }
      });
      let ok = true;
      for (const ing of plain) {
        if ((availability.get(ing.pantryItemId) ?? 0) < ing.quantity) {
          ok = false;
          break;
        }
      }
      if (ok) {
        for (const options of grouped.values()) {
          const satisfied = options.some((opt) => (availability.get(opt.pantryItemId) ?? 0) >= opt.quantity);
          if (!satisfied) {
            ok = false;
            break;
          }
        }
      }
      result.set(recipe.id, ok);
    });
    return result;
  }, [activeLots, allIngredients, availabilityAsOfDate, recipes]);

  const currencyRates = useMemo(
    () => buildCurrencyRates(locations, activeLocationId || undefined),
    [locations, activeLocationId]
  );

  const costInfoByRecipe = useMemo(() => {
    const ingredientsByRecipe = new Map<string, RecipeIngredient[]>();
    allIngredients.forEach((ing) => {
      const list = ingredientsByRecipe.get(ing.recipeId) ?? [];
      list.push(ing);
      ingredientsByRecipe.set(ing.recipeId, list);
    });
    const result = new Map<string, { cost?: number; computed: boolean; complete: boolean }>();
    recipes.forEach((recipe) => {
      const breakdown = buildRecipeCostBreakdown({
        recipe,
        ingredients: ingredientsByRecipe.get(recipe.id) ?? [],
        pantryItems,
        purchases,
        locationId: activeLocationId || undefined,
        rates: currencyRates
      });
      result.set(recipe.id, {
        cost: effectiveCostPerServing(breakdown, recipe),
        computed: breakdown.pricedCount > 0,
        complete: breakdown.complete
      });
    });
    return result;
  }, [activeLocationId, allIngredients, currencyRates, pantryItems, purchases, recipes]);

  // Searching only title and tags meant you could not ask "what uses chicken", even
  // though every ingredient and pantry item is already loaded on this page.
  const ingredientNamesByRecipe = useMemo(() => {
    const nameById = new Map(pantryItems.map((item) => [item.id, item.name.toLowerCase()]));
    const byRecipe = new Map<string, string[]>();
    for (const ing of allIngredients) {
      const name = nameById.get(ing.pantryItemId);
      if (!name) continue;
      const list = byRecipe.get(ing.recipeId);
      if (list) list.push(name);
      else byRecipe.set(ing.recipeId, [name]);
    }
    return byRecipe;
  }, [allIngredients, pantryItems]);

  const ingredientMatch = useCallback(
    (recipe: Recipe) => {
      const q = search.trim().toLowerCase();
      if (!q) return "";
      if (recipe.title.toLowerCase().includes(q)) return "";
      if (recipe.tags.some((tag) => tag.toLowerCase().includes(q))) return "";
      return (ingredientNamesByRecipe.get(recipe.id) ?? []).find((name) => name.includes(q)) ?? "";
    },
    [ingredientNamesByRecipe, search]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipes
      .filter((r) => {
        const matchesText =
          !q ||
          r.title.toLowerCase().includes(q) ||
          r.tags.some((tag) => tag.toLowerCase().includes(q)) ||
          (ingredientNamesByRecipe.get(r.id) ?? []).some((name) => name.includes(q));
        const matchesMealType =
          mealTypeFilters.length === 0 || r.mealTypes?.some((type) => mealTypeFilters.includes(type));
        const caloriesOk =
          !maxCalories || (recipeCalories(r) !== undefined && (recipeCalories(r) as number) <= Number(maxCalories));
        const cost = costInfoByRecipe.get(r.id)?.cost;
        const costOk = !maxCost || (cost !== undefined && cost <= Number(maxCost));
        const timeOk =
          !maxTime || (r.timeMinutes !== undefined && r.timeMinutes <= Number(maxTime));
        // "Not cooked in N days" deliberately keeps never-cooked recipes — they are the
        // ones you are most likely to be looking for.
        const lastCooked = lastCookedByRecipe.get(r.id);
        const staleOk =
          !notCookedInDays ||
          !lastCooked ||
          (calendarDaysAgo(lastCooked) ?? Infinity) >= Number(notCookedInDays);
        const canMake = makeableByRecipe.get(r.id) ?? true;
        return (
          matchesText && matchesMealType && caloriesOk && costOk && timeOk && staleOk &&
          (!canMakeOnly || canMake)
        );
      })
      .sort((a, b) => {
        if (sortBy === "title") return compareNames(a.title, b.title);
        if (sortBy === "lastCooked") {
          // Never cooked sorts first: "" precedes any ISO timestamp.
          const aVal = lastCookedByRecipe.get(a.id) ?? "";
          const bVal = lastCookedByRecipe.get(b.id) ?? "";
          if (aVal === bVal) return compareNames(a.title, b.title);
          return aVal.localeCompare(bVal);
        }
        if (sortBy === "time") {
          return (a.timeMinutes ?? Number.MAX_VALUE) - (b.timeMinutes ?? Number.MAX_VALUE);
        }
        if (sortBy === "calories") {
          const aVal = recipeCalories(a) ?? Number.MAX_VALUE;
          const bVal = recipeCalories(b) ?? Number.MAX_VALUE;
          return aVal - bVal;
        }
        const aVal = costInfoByRecipe.get(a.id)?.cost ?? Number.MAX_VALUE;
        const bVal = costInfoByRecipe.get(b.id)?.cost ?? Number.MAX_VALUE;
        return aVal - bVal;
      });
  }, [recipes, search, mealTypeFilters, maxCalories, maxCost, maxTime, notCookedInDays, sortBy, makeableByRecipe, canMakeOnly, costInfoByRecipe, ingredientNamesByRecipe, lastCookedByRecipe]);

  async function removeRecipe(id: string) {
    const { plannedMealCount } = await countRecipeReferences(id);
    const detail =
      plannedMealCount > 0
        ? `This recipe is used in ${plannedMealCount} planned meal${plannedMealCount === 1 ? "" : "s"}. Deleting will leave them as "Recipe" placeholders on the planner.`
        : undefined;
    const choice = await requestChoice({
      title: "Delete Recipe?",
      message: "This will remove the selected recipe and its ingredient list.",
      detail,
      choices: [
        { label: "Delete", value: "confirm-delete", tone: "danger" },
        { label: "Cancel", value: "cancel", tone: "neutral" }
      ]
    });
    if (choice !== "confirm-delete") return;
    await deleteRecipe(id);
    await refresh();
  }

  return (
    <div className="grid">
      <section className="panel">
        <div className="row resource-toolbar">
          <input
            placeholder="Search title, tag, or ingredient"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="secondary mobile-only" onClick={() => setShowFilters((prev) => !prev)}>
            Filter {showFilters ? "^" : "v"}
          </button>
          <button onClick={() => navigate("/recipes/new")}>Add Recipe</button>
        </div>
        <div className={`row resource-toolbar ${showFilters ? "" : "hide-on-mobile-row"}`}>
          {MEAL_TYPES.map((type) => (
            <label key={type}>
              <input
                type="checkbox"
                checked={mealTypeFilters.includes(type)}
                onChange={(e) =>
                  setMealTypeFilters((prev) =>
                    e.target.checked ? [...prev, type] : prev.filter((t) => t !== type)
                  )
                }
              />
              {type}
            </label>
          ))}
          <input
            type="number"
            placeholder="Max calories"
            value={maxCalories}
            onChange={(e) => setMaxCalories(e.target.value)}
          />
          <input
            type="number"
            placeholder="Max cost"
            value={maxCost}
            onChange={(e) => setMaxCost(e.target.value)}
          />
          <input
            type="number"
            min="1"
            placeholder="Max minutes"
            value={maxTime}
            onChange={(e) => setMaxTime(e.target.value)}
          />
          <input
            type="number"
            min="1"
            placeholder="Not cooked in (days)"
            value={notCookedInDays}
            onChange={(e) => setNotCookedInDays(e.target.value)}
            title="Show recipes you haven't made in at least this many days, plus ones you've never made"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "title" | "calories" | "cost" | "time")}
          >
            <option value="title">Sort: title</option>
            <option value="time">Sort: time</option>
            <option value="lastCooked">Sort: least recently cooked</option>
            <option value="calories">Sort: calories</option>
            <option value="cost">Sort: cost</option>
          </select>
          <label>
            <input
              type="checkbox"
              checked={canMakeOnly}
              onChange={(e) => setCanMakeOnly(e.target.checked)}
            />
            Can make with pantry
          </label>
          <select value={availabilityLocationId} onChange={(e) => setAvailabilityLocationId(e.target.value)}>
            <option value="">All locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
          <label>
            As of date
            <input
              type="date"
              value={availabilityAsOfDate}
              onChange={(e) => setAvailabilityAsOfDate(e.target.value)}
            />
          </label>
        </div>
        <div className="table-wrap recipes-list-wrap">
          <table className="table recipes-table recipes-list-table">
            <thead>
              <tr>
                <th className="recipes-col-image">Image</th>
                <th className="recipes-col-title">Title</th>
                <th className="recipes-col-meal-types">Meal types</th>
                <th className="recipes-col-servings">Servings</th>
                <th className="recipes-col-metadata">Metadata</th>
                <th className="recipes-col-last-cooked">Last cooked</th>
                <th className="recipes-col-cost">Cost</th>
                <th className="recipes-col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((recipe) => (
                <tr key={recipe.id}>
                  <td data-label="Image" className="recipes-col-image">
                    {safeImageUrl(recipe.imageUrl) && (
                      <img
                        src={safeImageUrl(recipe.imageUrl)}
                        alt={recipe.title}
                        style={{ width: 48, height: 48, objectFit: "cover" }}
                      />
                    )}
                  </td>
                  <td data-label="Title" className="recipes-col-title">
                    <button
                      className="ghost recipe-title-button"
                      onClick={() => navigate(`/recipes/${recipe.id}`)}
                    >
                      {recipe.title}
                    </button>
                    {ingredientMatch(recipe) && (
                      <span className="match-reason">contains {ingredientMatch(recipe)}</span>
                    )}
                  </td>
                  <td data-label="Meal types" className="recipes-col-meal-types">
                    <div className="recipes-meal-types">
                      {recipe.mealTypes?.map((type) => (
                        <span key={type} className="tag">{type}</span>
                      ))}
                    </div>
                  </td>
                  <td data-label="Servings" className="recipes-col-servings">{recipeBaseServings(recipe)}</td>
                  <td data-label="Metadata" className="recipes-col-metadata">{recipeMetaSummary(recipe)}</td>
                  <td data-label="Last cooked" className="recipes-col-last-cooked">
                    {(() => {
                      const lastCooked = lastCookedByRecipe.get(recipe.id);
                      const days = lastCooked ? calendarDaysAgo(lastCooked) : undefined;
                      return (
                        <span
                          className={`last-cooked${lastCooked ? "" : " last-cooked-never"}${
                            days !== undefined && days <= 7 ? " last-cooked-recent" : ""
                          }`}
                          title={lastCooked ? new Date(lastCooked).toLocaleString() : "Never cooked"}
                        >
                          {formatLastCooked(lastCooked)}
                        </span>
                      );
                    })()}
                  </td>
                  <td data-label="Cost" className="recipes-col-cost">
                    {(() => {
                      const info = costInfoByRecipe.get(recipe.id);
                      if (info?.cost === undefined) return "-";
                      const label = `${info.cost.toFixed(2)}${info.computed && !info.complete ? "+" : ""}`;
                      const title = info.computed
                        ? info.complete
                          ? "Per serving, computed from your price history"
                          : "Per serving; some ingredients have no price data yet"
                        : "Manual estimate (no price history for these ingredients)";
                      return <span title={title}>{label}</span>;
                    })()}
                  </td>
                  <td data-label="Actions" className="table-actions recipes-col-actions">
                    <button className="secondary" onClick={() => navigate(`/recipes/${recipe.id}`)}>
                      Edit
                    </button>
                    <button
                      className="secondary"
                      title="Make a copy you can tweak"
                      onClick={async () => {
                        const copy = await duplicateRecipe(recipe.id);
                        if (copy) navigate(`/recipes/${copy.id}`);
                      }}
                    >
                      Duplicate
                    </button>
                    <button className="danger" onClick={() => removeRecipe(recipe.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">No recipes match your filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {modal}
    </div>
  );
}
