import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Recipe, RecipeIngredient } from "../../models";
import { countRecipeReferences, deleteRecipe, listAllIngredients, listRecipes } from "../../db/repositories/recipeRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { listActiveLots } from "../../db/repositories/inventoryRepo";
import { listLocations } from "../../db/repositories/locationRepo";
import { dateKey } from "../../utils/date";
import { useConfirmChoiceModal } from "../../components/useConfirmChoiceModal";

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
  const [sortBy, setSortBy] = useState<"title" | "calories" | "cost">("title");
  const [canMakeOnly, setCanMakeOnly] = useState(false);
  const [availabilityLocationId, setAvailabilityLocationId] = useState("");
  const [availabilityAsOfDate, setAvailabilityAsOfDate] = useState(dateKey(new Date()));
  const [allIngredients, setAllIngredients] = useState<RecipeIngredient[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [showFilters, setShowFilters] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const [activeLots, setActiveLots] = useState<{ pantryItemId: string; quantity: number; expiresAt?: string }[]>([]);
  const { requestChoice, modal } = useConfirmChoiceModal();

  const refresh = useCallback(async () => {
    setRecipes([...(await listRecipes())]);
    setAllIngredients([...(await listAllIngredients())]);
    setLocations([...(await listLocations())]);
    await listPantryItems(); // warm cache; not stored here
  }, []);

  useEffect(() => {
    refresh();
    const onSync = () => refresh();
    window.addEventListener("recipes-updated", onSync);
    window.addEventListener("recipe-ingredients-updated", onSync);
    window.addEventListener("pantry-items-updated", onSync);
    window.addEventListener("locations-updated", onSync);
    return () => {
      window.removeEventListener("recipes-updated", onSync);
      window.removeEventListener("recipe-ingredients-updated", onSync);
      window.removeEventListener("pantry-items-updated", onSync);
      window.removeEventListener("locations-updated", onSync);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipes
      .filter((r) => {
        const matchesText =
          !q ||
          r.title.toLowerCase().includes(q) ||
          r.tags.some((tag) => tag.toLowerCase().includes(q));
        const matchesMealType =
          mealTypeFilters.length === 0 || r.mealTypes?.some((type) => mealTypeFilters.includes(type));
        const caloriesOk =
          !maxCalories || (recipeCalories(r) !== undefined && (recipeCalories(r) as number) <= Number(maxCalories));
        const costOk =
          !maxCost || (r.estimatedCostPerServing !== undefined && r.estimatedCostPerServing <= Number(maxCost));
        const canMake = makeableByRecipe.get(r.id) ?? true;
        return matchesText && matchesMealType && caloriesOk && costOk && (!canMakeOnly || canMake);
      })
      .sort((a, b) => {
        if (sortBy === "title") return a.title.localeCompare(b.title);
        if (sortBy === "calories") {
          const aVal = recipeCalories(a) ?? Number.MAX_VALUE;
          const bVal = recipeCalories(b) ?? Number.MAX_VALUE;
          return aVal - bVal;
        }
        const aVal = a.estimatedCostPerServing ?? Number.MAX_VALUE;
        const bVal = b.estimatedCostPerServing ?? Number.MAX_VALUE;
        return aVal - bVal;
      });
  }, [recipes, search, mealTypeFilters, maxCalories, maxCost, sortBy, makeableByRecipe, canMakeOnly]);

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
          <input placeholder="Search recipes" value={search} onChange={(e) => setSearch(e.target.value)} />
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
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "title" | "calories" | "cost")}>
            <option value="title">Sort: title</option>
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
                <th className="recipes-col-cost">Cost</th>
                <th className="recipes-col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((recipe) => (
                <tr key={recipe.id}>
                  <td data-label="Image" className="recipes-col-image">
                    {recipe.imageUrl && (
                      <img src={recipe.imageUrl} alt={recipe.title} style={{ width: 48, height: 48, objectFit: "cover" }} />
                    )}
                  </td>
                  <td data-label="Title" className="recipes-col-title">
                    <button
                      className="ghost recipe-title-button"
                      onClick={() => navigate(`/recipes/${recipe.id}`)}
                    >
                      {recipe.title}
                    </button>
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
                  <td data-label="Cost" className="recipes-col-cost">{recipe.estimatedCostPerServing ?? "-"}</td>
                  <td data-label="Actions" className="table-actions recipes-col-actions">
                    <button className="secondary" onClick={() => navigate(`/recipes/${recipe.id}`)}>
                      Edit
                    </button>
                    <button className="danger" onClick={() => removeRecipe(recipe.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">No recipes match your filters.</td>
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
