import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { PantryItem, Recipe, RecipeIngredient } from "../../models";
import {
  addIngredient,
  createRecipe,
  deleteIngredient,
  deleteRecipe,
  listIngredients,
  listRecipes,
  updateIngredient,
  updateRecipe
} from "../../db/repositories/recipeRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [search, setSearch] = useState("");
  const [mealTypeFilters, setMealTypeFilters] = useState<string[]>([]);
  const [maxCalories, setMaxCalories] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [sortBy, setSortBy] = useState<"title" | "calories" | "cost">("title");
  const [showFilters, setShowFilters] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const location = useLocation();

  const refresh = useCallback(async () => {
    setRecipes([...(await listRecipes())]);
    setPantryItems([...(await listPantryItems())]);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const state = location.state as { recipeId?: string } | null;
    if (!state?.recipeId) return;
    const target = recipes.find((r) => r.id === state.recipeId);
    if (target) setSelected(target);
  }, [location.state, recipes]);

  useEffect(() => {
    if (!selected) return;
    listIngredients(selected.id).then(setIngredients);
  }, [selected]);

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
          !maxCalories || (r.caloriesPerServing !== undefined && r.caloriesPerServing <= Number(maxCalories));
        const costOk =
          !maxCost || (r.estimatedCostPerServing !== undefined && r.estimatedCostPerServing <= Number(maxCost));
        return matchesText && matchesMealType && caloriesOk && costOk;
      })
      .sort((a, b) => {
        if (sortBy === "title") return a.title.localeCompare(b.title);
        if (sortBy === "calories") {
          const aVal = a.caloriesPerServing ?? Number.MAX_VALUE;
          const bVal = b.caloriesPerServing ?? Number.MAX_VALUE;
          return aVal - bVal;
        }
        const aVal = a.estimatedCostPerServing ?? Number.MAX_VALUE;
        const bVal = b.estimatedCostPerServing ?? Number.MAX_VALUE;
        return aVal - bVal;
      });
  }, [recipes, search, mealTypeFilters, maxCalories, maxCost, sortBy]);

  async function saveRecipe(recipe: Recipe | Omit<Recipe, "id" | "createdAt" | "updatedAt">) {
    if ("id" in recipe && recipe.id) {
      await updateRecipe(recipe.id, recipe);
      setSelected(recipe);
    } else {
      const created = await createRecipe(recipe);
      setSelected(created);
    }
    await refresh();
  }

  async function removeRecipe(id: string) {
    if (!confirm("Delete this recipe?")) return;
    await deleteRecipe(id);
    setSelected(null);
    await refresh();
  }

  async function addRecipeIngredient(data: { pantryItemId: string; quantity: number; prepNote?: string }) {
    if (!selected) return;
    const { pantryItemId, quantity, prepNote } = data;
    if (!pantryItemId || quantity <= 0) return;
    const existing = ingredients.find((ing) => ing.pantryItemId === pantryItemId);
    if (existing) {
      const shouldMerge = confirm("This pantry item is already in the recipe. Merge quantities?");
      if (!shouldMerge) return;
      const mergedNote = [existing.prepNote, prepNote].filter(Boolean).join(" / ") || undefined;
      await updateIngredient(existing.id, {
        quantity: existing.quantity + quantity,
        prepNote: mergedNote
      });
    } else {
      await addIngredient({
        recipeId: selected.id,
        pantryItemId,
        quantity,
        prepNote
      });
    }
    setIngredients(await listIngredients(selected.id));
  }

  async function updateRecipeIngredient(id: string, changes: Partial<RecipeIngredient>) {
    await updateIngredient(id, changes);
    if (selected) setIngredients(await listIngredients(selected.id));
  }

  async function removeIngredient(id: string) {
    await deleteIngredient(id);
    if (selected) setIngredients(await listIngredients(selected.id));
  }

  return (
    <div className="grid grid-2">
      <section className={`panel ${selected ? "mobile-hide" : ""}`}>
        <div className="row">
          <input placeholder="Search recipes" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="secondary mobile-only" onClick={() => setShowFilters((prev) => !prev)}>
            Filter {showFilters ? "^" : "v"}
          </button>
          <button
            onClick={() =>
              setSelected({
                id: "",
                title: "",
                defaultServings: 2,
                mealTypes: [],
                tags: [],
                notes: "",
                steps: [""],
                caloriesPerServing: undefined,
                estimatedCostPerServing: undefined,
                imageUrl: "",
                createdAt: "",
                updatedAt: ""
              })
            }
          >
            Add Recipe
          </button>
        </div>
        <div className={`row ${showFilters ? "" : "hide-on-mobile-row"}`}>
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
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Image</th>
              <th>Title</th>
              <th>Meal types</th>
              <th>Servings</th>
              <th>Calories</th>
              <th>Cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((recipe) => (
              <tr key={recipe.id}>
                <td data-label="Image">
                  {recipe.imageUrl && (
                    <img src={recipe.imageUrl} alt={recipe.title} style={{ width: 48, height: 48, objectFit: "cover" }} />
                  )}
                </td>
                <td data-label="Title">
                  <button className="ghost" onClick={() => setSelected(recipe)}>
                    {recipe.title}
                  </button>
                </td>
                <td data-label="Meal types">
                  {recipe.mealTypes?.map((type) => (
                    <span key={type} className="tag">{type}</span>
                  ))}
                </td>
                <td data-label="Servings">{recipe.defaultServings}</td>
                <td data-label="Calories">{recipe.caloriesPerServing ?? "-"}</td>
                <td data-label="Cost">{recipe.estimatedCostPerServing ?? "-"}</td>
                <td data-label="Actions">
                  <button className="danger" onClick={() => removeRecipe(recipe.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        {selected ? (
          <RecipeEditor
            recipe={selected}
            pantryItems={pantryItems}
            ingredients={ingredients}
            onSave={saveRecipe}
            onAddIngredient={addRecipeIngredient}
            onUpdateIngredient={updateRecipeIngredient}
            onDeleteIngredient={removeIngredient}
            onBack={() => setSelected(null)}
          />
        ) : (
          <p>Select a recipe to edit.</p>
        )}
      </section>
    </div>
  );
}

function RecipeEditor({
  recipe,
  pantryItems,
  ingredients,
  onSave,
  onAddIngredient,
  onUpdateIngredient,
  onDeleteIngredient,
  onBack
}: {
  recipe: Recipe;
  pantryItems: PantryItem[];
  ingredients: RecipeIngredient[];
  onSave: (recipe: any) => void;
  onAddIngredient: (data: { pantryItemId: string; quantity: number; prepNote?: string }) => void;
  onUpdateIngredient: (id: string, changes: Partial<RecipeIngredient>) => void;
  onDeleteIngredient: (id: string) => void;
  onBack: () => void;
}) {
  const [form, setForm] = useState({
    title: recipe.title,
    url: recipe.url || "",
    defaultServings: recipe.defaultServings || 2,
    mealTypes: recipe.mealTypes || [],
    tags: recipe.tags.join(", "),
    notes: recipe.notes || "",
    steps: recipe.steps.length ? recipe.steps : [""],
    caloriesPerServing: recipe.caloriesPerServing?.toString() || "",
    estimatedCostPerServing: recipe.estimatedCostPerServing?.toString() || "",
    imageUrl: recipe.imageUrl || ""
  });
  const [ingredientFilter, setIngredientFilter] = useState("");
  const [ingredientDraft, setIngredientDraft] = useState({
    pantryItemId: "",
    quantity: "",
    prepNote: ""
  });

  useEffect(() => {
    setForm({
      title: recipe.title,
      url: recipe.url || "",
      defaultServings: recipe.defaultServings || 2,
      mealTypes: recipe.mealTypes || [],
      tags: recipe.tags.join(", "),
      notes: recipe.notes || "",
      steps: recipe.steps.length ? recipe.steps : [""],
      caloriesPerServing: recipe.caloriesPerServing?.toString() || "",
      estimatedCostPerServing: recipe.estimatedCostPerServing?.toString() || "",
      imageUrl: recipe.imageUrl || ""
    });
  }, [recipe]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      title: form.title.trim(),
      url: form.url || undefined,
      defaultServings: Number(form.defaultServings),
      mealTypes: form.mealTypes,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      notes: form.notes || undefined,
      steps: form.steps.map((s) => s.trim()).filter((s) => s.length > 0),
      caloriesPerServing: form.caloriesPerServing ? Number(form.caloriesPerServing) : undefined,
      estimatedCostPerServing: form.estimatedCostPerServing ? Number(form.estimatedCostPerServing) : undefined,
      imageUrl: form.imageUrl || undefined
    };
    if (recipe.id) {
      onSave({ ...recipe, ...payload });
    } else {
      onSave(payload);
    }
  }

  function updateStep(index: number, value: string) {
    const next = [...form.steps];
    next[index] = value;
    setForm({ ...form, steps: next });
  }

  function addStep() {
    setForm({ ...form, steps: [...form.steps, ""] });
  }

  function removeStep(index: number) {
    const next = form.steps.filter((_, i) => i !== index);
    setForm({ ...form, steps: next.length ? next : [""] });
  }

  return (
    <div className="grid">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>{recipe.id ? "Edit Recipe" : "New Recipe"}</h2>
        <button className="secondary mobile-only" type="button" onClick={onBack}>
          Back to list
        </button>
        {recipe.id && (
          <div className="row">
            {recipe.url && (
              <a className="tag" href={recipe.url} target="_blank" rel="noreferrer">
                Open URL
              </a>
            )}
            <Link className="tag" to={`/recipes/${recipe.id}/print`}>
              Print View
            </Link>
          </div>
        )}
      </div>
      <form className="grid" onSubmit={submit}>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" required />
        <div className="row">
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="URL" />
          <input
            type="number"
            value={form.defaultServings}
            onChange={(e) => setForm({ ...form, defaultServings: Number(e.target.value) })}
            placeholder="Default servings"
          />
        </div>
        <div className="row">
          {MEAL_TYPES.map((type) => (
            <label key={type}>
              <input
                type="checkbox"
                checked={form.mealTypes.includes(type)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    mealTypes: e.target.checked
                      ? [...form.mealTypes, type]
                      : form.mealTypes.filter((t) => t !== type)
                  })
                }
              />
              {type}
            </label>
          ))}
        </div>
        <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Tags (comma separated)" />
        <div className="row">
          <input
            type="number"
            value={form.caloriesPerServing}
            onChange={(e) => setForm({ ...form, caloriesPerServing: e.target.value })}
            placeholder="Calories per serving"
          />
          <input
            type="number"
            value={form.estimatedCostPerServing}
            onChange={(e) => setForm({ ...form, estimatedCostPerServing: e.target.value })}
            placeholder="Cost per serving"
          />
        </div>
        <div className="row">
          <input
            value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            placeholder="Image URL"
          />
          {form.imageUrl && (
            <img src={form.imageUrl} alt="Recipe preview" style={{ width: 64, height: 64, objectFit: "cover" }} />
          )}
        </div>
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" />
        <div className="panel">
          <h3>Ingredients</h3>
          {!recipe.id && <p>Save the recipe first to add ingredients.</p>}
          {recipe.id && pantryItems.length === 0 && (
            <div className="row">
              <p>No pantry items yet.</p>
              <Link className="tag" to="/pantry">
                Go to Pantry
              </Link>
            </div>
          )}
          {recipe.id && pantryItems.length > 0 && (
            <>
              <div className="row">
                <input
                  value={ingredientFilter}
                  onChange={(e) => setIngredientFilter(e.target.value)}
                  placeholder="Search pantry items"
                />
                <select
                  value={ingredientDraft.pantryItemId}
                  onChange={(e) => setIngredientDraft({ ...ingredientDraft, pantryItemId: e.target.value })}
                >
                  <option value="" disabled>
                    Select pantry item
                  </option>
                  {pantryItems
                    .filter((item) => item.name.toLowerCase().includes(ingredientFilter.trim().toLowerCase()))
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Quantity"
                  value={ingredientDraft.quantity}
                  onChange={(e) => setIngredientDraft({ ...ingredientDraft, quantity: e.target.value })}
                />
                <input
                  placeholder="Prep note"
                  value={ingredientDraft.prepNote}
                  onChange={(e) => setIngredientDraft({ ...ingredientDraft, prepNote: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => {
                    onAddIngredient({
                      pantryItemId: ingredientDraft.pantryItemId,
                      quantity: Number(ingredientDraft.quantity || 0),
                      prepNote: ingredientDraft.prepNote || undefined
                    });
                    setIngredientDraft({ pantryItemId: "", quantity: "", prepNote: "" });
                  }}
                >
                  Add Ingredient
                </button>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Note</th>
                    <th>Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredients.map((ing) => (
                    <tr key={ing.id}>
                      <td data-label="Item">{pantryItems.find((p) => p.id === ing.pantryItemId)?.name || ""}</td>
                      <td data-label="Qty">
                        <input
                          type="number"
                          value={ing.quantity}
                          step="0.01"
                          min="0.01"
                          onChange={(e) => onUpdateIngredient(ing.id, { quantity: Number(e.target.value) })}
                        />
                      </td>
                      <td data-label="Unit">{pantryItems.find((p) => p.id === ing.pantryItemId)?.baseUnit || ""}</td>
                      <td data-label="Note">
                        <input
                          value={ing.prepNote || ""}
                          onChange={(e) => onUpdateIngredient(ing.id, { prepNote: e.target.value })}
                        />
                      </td>
                      <td data-label="Remove">
                        <button className="danger" onClick={() => onDeleteIngredient(ing.id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
        <div>
          <strong>Steps</strong>
          {form.steps.map((step, idx) => (
            <div className="row" key={idx}>
              <textarea value={step} onChange={(e) => updateStep(idx, e.target.value)} placeholder={`Step ${idx + 1}`} />
              <button type="button" className="secondary" onClick={() => removeStep(idx)}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="secondary" onClick={addStep}>
            Add Step
          </button>
        </div>
        <div className="row">
          <button type="submit">Save</button>
        </div>
      </form>

      {recipe.id && recipe.steps.length > 0 && (
        <CookMode steps={recipe.steps} ingredients={ingredients} pantryItems={pantryItems} />
      )}
    </div>
  );
}

function CookMode({
  steps,
  ingredients,
  pantryItems
}: {
  steps: string[];
  ingredients: RecipeIngredient[];
  pantryItems: PantryItem[];
}) {
  const [index, setIndex] = useState(0);
  const step = steps[index] || "";

  return (
    <div className="panel">
      <h3>Cook Mode</h3>
      <div className="panel">
        <strong>Ingredients</strong>
        <ul>
          {ingredients.map((ing) => {
            const item = pantryItems.find((p) => p.id === ing.pantryItemId);
            if (!item) return null;
            return (
              <li key={ing.id}>
                {item.name} - {ing.quantity} {item.baseUnit}
                {ing.prepNote ? ` (${ing.prepNote})` : ""}
              </li>
            );
          })}
        </ul>
      </div>
      <p>{step}</p>
      <div className="row">
        <button className="secondary" onClick={() => setIndex(Math.max(index - 1, 0))}>
          Prev
        </button>
        <button onClick={() => setIndex(Math.min(index + 1, steps.length - 1))}>Next</button>
      </div>
      <p>
        {index + 1} / {steps.length}
      </p>
    </div>
  );
}
