import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PantryItem, Recipe, RecipeIngredient } from "../../models";
import {
  addIngredient,
  countRecipeReferences,
  createRecipe,
  deleteIngredient,
  deleteRecipe,
  duplicateRecipe,
  getRecipe,
  listIngredients,
  updateIngredient,
  updateRecipe
} from "../../db/repositories/recipeRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { listMealSlots } from "../../db/repositories/mealPlanRepo";
import { dateKey } from "../../utils/date";
import { getHouseholdSize } from "../settings/preferences";
import { buildRecipeMealInput, createMealWithRules } from "../planner/plannerDomain";
import { useConfirmChoiceModal } from "../../components/useConfirmChoiceModal";
import { useToast } from "../../components/useToast";
import CookMode from "./CookMode";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

function recipeBaseServings(recipe: Recipe) {
  return Math.max(recipe.baseServings ?? recipe.defaultServings ?? 2, 1);
}

const BLANK_RECIPE: Recipe = {
  id: "",
  title: "",
  baseServings: 2,
  defaultServings: 2,
  mealTypes: [],
  tags: [],
  notes: "",
  steps: [""],
  calories: undefined,
  caloriesPerServing: undefined,
  proteinGrams: undefined,
  timeMinutes: undefined,
  estimatedCostPerServing: undefined,
  imageUrl: "",
  createdAt: "",
  updatedAt: ""
};

export default function RecipeEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  const [recipe, setRecipe] = useState<Recipe | null>(isNew ? BLANK_RECIPE : null);
  const [notFound, setNotFound] = useState(false);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [mealSlots, setMealSlots] = useState<{ id: string; name: string }[]>([]);
  const { requestChoice, modal } = useConfirmChoiceModal();
  const { notify, toast } = useToast();

  const loadAux = useCallback(async () => {
    setPantryItems([...(await listPantryItems())]);
    setMealSlots([...(await listMealSlots())]);
  }, []);

  useEffect(() => {
    loadAux();
    const onSync = () => loadAux();
    window.addEventListener("pantry-items-updated", onSync);
    window.addEventListener("meal-slots-updated", onSync);
    return () => {
      window.removeEventListener("pantry-items-updated", onSync);
      window.removeEventListener("meal-slots-updated", onSync);
    };
  }, [loadAux]);

  useEffect(() => {
    if (isNew) {
      setRecipe(BLANK_RECIPE);
      setIngredients([]);
      setNotFound(false);
      return;
    }
    (async () => {
      const found = await getRecipe(id!);
      if (!found) {
        setNotFound(true);
        return;
      }
      setRecipe(found);
      setIngredients(await listIngredients(found.id));
    })();
  }, [id, isNew]);

  useEffect(() => {
    if (!recipe?.id) return;
    const onSync = () => {
      void getRecipe(recipe.id).then((next) => next && setRecipe(next));
      void listIngredients(recipe.id).then(setIngredients);
    };
    window.addEventListener("recipes-updated", onSync);
    window.addEventListener("recipe-ingredients-updated", onSync);
    return () => {
      window.removeEventListener("recipes-updated", onSync);
      window.removeEventListener("recipe-ingredients-updated", onSync);
    };
  }, [recipe?.id]);

  async function saveAndStay(payload: Recipe | Omit<Recipe, "id" | "createdAt" | "updatedAt">) {
    if ("id" in payload && payload.id) {
      await updateRecipe(payload.id, payload);
      const next = await getRecipe(payload.id);
      if (next) {
        setRecipe(next);
        setIngredients(await listIngredients(next.id));
      }
      return next || null;
    }
    const created = await createRecipe(payload);
    setRecipe(created);
    setIngredients(await listIngredients(created.id));
    if (isNew) {
      // Switch URL to the saved recipe so subsequent edits update in place.
      navigate(`/recipes/${created.id}`, { replace: true });
    }
    return created;
  }

  async function handleAddIngredient(
    recipeId: string,
    data: { pantryItemId: string; quantity: number; prepNote?: string; altGroup?: string }
  ) {
    if (!recipeId) return;
    const { pantryItemId, quantity, prepNote, altGroup } = data;
    if (!pantryItemId || !(quantity > 0)) return;
    const existing = ingredients.find((ing) => ing.pantryItemId === pantryItemId);
    if (existing) {
      const choice = await requestChoice({
        title: "Merge Ingredient?",
        message: "This pantry item is already in the recipe.",
        detail: "Merging will add the new quantity to the existing line.",
        choices: [
          { label: "Merge quantities", value: "merge", tone: "primary" },
          { label: "Cancel", value: "cancel", tone: "neutral" }
        ]
      });
      if (choice !== "merge") return;
      const mergedNote = [existing.prepNote, prepNote].filter(Boolean).join(" / ") || undefined;
      await updateIngredient(existing.id, {
        quantity: existing.quantity + quantity,
        prepNote: mergedNote,
        altGroup: altGroup ?? existing.altGroup
      });
    } else {
      await addIngredient({
        recipeId,
        pantryItemId,
        quantity,
        prepNote,
        altGroup
      });
    }
    setIngredients(await listIngredients(recipeId));
  }

  async function handleUpdateIngredient(ingId: string, changes: Partial<RecipeIngredient>) {
    await updateIngredient(ingId, changes);
    if (recipe?.id) setIngredients(await listIngredients(recipe.id));
  }

  async function handleDeleteIngredient(ingId: string) {
    await deleteIngredient(ingId);
    if (recipe?.id) setIngredients(await listIngredients(recipe.id));
  }

  async function handleAddRecipeToPlanner(
    recipeId: string,
    date: string,
    mealSlotId: string,
    servingsPlanned?: number
  ) {
    if (!recipe) return;
    const householdSize = getHouseholdSize();
    await createMealWithRules({
      input: buildRecipeMealInput({
        date,
        mealSlotId,
        recipe,
        servingsPlanned,
        householdSize
      })
    });
    notify("Added to planner", "success");
    void recipeId;
  }

  async function handleDuplicate() {
    if (!recipe?.id) return;
    const copy = await duplicateRecipe(recipe.id);
    if (!copy) return;
    notify(`Created "${copy.title}"`, "success");
    navigate(`/recipes/${copy.id}`);
  }

  async function handleDelete() {
    if (!recipe?.id) return;
    const { plannedMealCount } = await countRecipeReferences(recipe.id);
    const detail =
      plannedMealCount > 0
        ? `This recipe is used in ${plannedMealCount} planned meal${plannedMealCount === 1 ? "" : "s"}. Deleting will leave them as "Recipe" placeholders on the planner.`
        : undefined;
    const choice = await requestChoice({
      title: "Delete Recipe?",
      message: "This will remove this recipe and its ingredient list.",
      detail,
      choices: [
        { label: "Delete", value: "confirm-delete", tone: "danger" },
        { label: "Cancel", value: "cancel", tone: "neutral" }
      ]
    });
    if (choice !== "confirm-delete") return;
    await deleteRecipe(recipe.id);
    navigate("/recipes");
  }

  function handleBack() {
    navigate("/recipes");
  }

  if (notFound) {
    return (
      <div className="panel">
        <p>Recipe not found. <Link to="/recipes">Back to recipes</Link></p>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="panel">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <>
      <RecipeEditorForm
        recipe={recipe}
        pantryItems={pantryItems}
        ingredients={ingredients}
        mealSlots={mealSlots}
        onSave={saveAndStay}
        onAddIngredient={handleAddIngredient}
        onUpdateIngredient={handleUpdateIngredient}
        onDeleteIngredient={handleDeleteIngredient}
        onAddToPlanner={handleAddRecipeToPlanner}
        onBack={handleBack}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
      />
      {modal}
      {toast}
    </>
  );
}

function RecipeEditorForm({
  recipe,
  pantryItems,
  ingredients,
  mealSlots,
  onSave,
  onAddIngredient,
  onUpdateIngredient,
  onDeleteIngredient,
  onAddToPlanner,
  onBack,
  onDelete,
  onDuplicate
}: {
  recipe: Recipe;
  pantryItems: PantryItem[];
  ingredients: RecipeIngredient[];
  mealSlots: { id: string; name: string }[];
  onSave: (recipe: any) => Promise<Recipe | null | undefined>;
  onAddIngredient: (
    recipeId: string,
    data: { pantryItemId: string; quantity: number; prepNote?: string; altGroup?: string }
  ) => void;
  onUpdateIngredient: (id: string, changes: Partial<RecipeIngredient>) => void;
  onDeleteIngredient: (id: string) => void;
  onAddToPlanner: (recipeId: string, date: string, mealSlotId: string, servingsPlanned?: number) => Promise<void>;
  onBack: () => void;
  onDelete: () => void;
  onDuplicate: () => void | Promise<void>;
}) {
  const [form, setForm] = useState({
    title: recipe.title,
    url: recipe.url || "",
    baseServings: recipe.baseServings ?? recipe.defaultServings ?? 2,
    mealTypes: recipe.mealTypes || [],
    tags: recipe.tags.join(", "),
    notes: recipe.notes || "",
    steps: recipe.steps.length ? recipe.steps : [""],
    calories: (recipe.calories ?? recipe.caloriesPerServing)?.toString() || "",
    proteinGrams: recipe.proteinGrams?.toString() || "",
    timeMinutes: recipe.timeMinutes?.toString() || "",
    estimatedCostPerServing: recipe.estimatedCostPerServing?.toString() || "",
    imageUrl: recipe.imageUrl || ""
  });
  const [ingredientFilter, setIngredientFilter] = useState("");
  const [ingredientDraft, setIngredientDraft] = useState({
    pantryItemId: "",
    quantity: "1",
    prepNote: "",
    altGroup: ""
  });
  const [ingredientError, setIngredientError] = useState<string | null>(null);
  const [noMatches, setNoMatches] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [plannerDate, setPlannerDate] = useState(dateKey(new Date()));
  const [plannerSlotId, setPlannerSlotId] = useState("");
  const [plannerServings, setPlannerServings] = useState("");
  const [plannerMessage, setPlannerMessage] = useState("");

  const filteredPantryItems = useMemo(
    () =>
      pantryItems.filter((item) =>
        item.name.toLowerCase().includes(ingredientFilter.trim().toLowerCase())
      ),
    [pantryItems, ingredientFilter]
  );
  const pantryItemById = useMemo(
    () => new Map(pantryItems.map((item) => [item.id, item])),
    [pantryItems]
  );

  function submitIngredientDraft() {
    const qty = Number(ingredientDraft.quantity || 0);
    if (!recipe.id) {
      setIngredientError("Save the recipe first.");
      return;
    }
    if (!ingredientDraft.pantryItemId || !(qty > 0)) {
      setIngredientError("Select a pantry item and enter a quantity > 0.");
      return;
    }
    setIngredientError(null);
    onAddIngredient(recipe.id, {
      pantryItemId: ingredientDraft.pantryItemId,
      quantity: qty,
      prepNote: ingredientDraft.prepNote || undefined,
      altGroup: ingredientDraft.altGroup.trim() || undefined
    });
    setIngredientDraft({ pantryItemId: "", quantity: "1", prepNote: "", altGroup: "" });
  }

  useEffect(() => {
    if (!pantryItems.length) return;
    if (ingredientFilter.trim().length === 0) {
      const stillValid = pantryItems.some((item) => item.id === ingredientDraft.pantryItemId);
      if (!stillValid) {
        setIngredientDraft((prev) => ({ ...prev, pantryItemId: pantryItems[0].id }));
      }
      setNoMatches(false);
      return;
    }
    if (filteredPantryItems.length > 0) {
      const selectedIsInFiltered = filteredPantryItems.some((item) => item.id === ingredientDraft.pantryItemId);
      if (!selectedIsInFiltered) {
        setIngredientDraft((prev) => ({
          ...prev,
          pantryItemId: filteredPantryItems[0].id
        }));
      }
      setNoMatches(false);
    } else {
      setNoMatches(true);
    }
  }, [ingredientFilter, filteredPantryItems, pantryItems, ingredientDraft.pantryItemId]);

  useEffect(() => {
    setForm({
      title: recipe.title,
      url: recipe.url || "",
      baseServings: recipe.baseServings ?? recipe.defaultServings ?? 2,
      mealTypes: recipe.mealTypes || [],
      tags: recipe.tags.join(", "),
      notes: recipe.notes || "",
      steps: recipe.steps.length ? recipe.steps : [""],
      calories: (recipe.calories ?? recipe.caloriesPerServing)?.toString() || "",
      proteinGrams: recipe.proteinGrams?.toString() || "",
      timeMinutes: recipe.timeMinutes?.toString() || "",
      estimatedCostPerServing: recipe.estimatedCostPerServing?.toString() || "",
      imageUrl: recipe.imageUrl || ""
    });
    setIngredientDraft({ pantryItemId: "", quantity: "1", prepNote: "", altGroup: "" });
    setIngredientFilter("");
    setIngredientError(null);
    setSavedAt(null);
    setPlannerDate(dateKey(new Date()));
    setPlannerServings(String(recipeBaseServings(recipe)));
    setPlannerMessage("");
    // Intentionally keyed on recipe.id only: unrelated updates (pantry/meal-slot
    // events, remote sync) must not wipe unsaved form edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe.id]);

  useEffect(() => {
    setPlannerSlotId((prev) => (prev && mealSlots.some((slot) => slot.id === prev) ? prev : mealSlots[0]?.id || ""));
  }, [mealSlots]);

  function buildPayload() {
    const calories = form.calories ? Number(form.calories) : undefined;
    return {
      title: form.title.trim(),
      url: form.url || undefined,
      baseServings: Math.max(Number(form.baseServings) || 1, 1),
      defaultServings: Math.max(Number(form.baseServings) || 1, 1),
      mealTypes: form.mealTypes,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      notes: form.notes || undefined,
      steps: form.steps.map((s) => s.trim()).filter((s) => s.length > 0),
      calories,
      caloriesPerServing: calories,
      proteinGrams: form.proteinGrams ? Number(form.proteinGrams) : undefined,
      timeMinutes: form.timeMinutes ? Number(form.timeMinutes) : undefined,
      estimatedCostPerServing: form.estimatedCostPerServing ? Number(form.estimatedCostPerServing) : undefined,
      imageUrl: form.imageUrl || undefined
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = buildPayload();
    if (recipe.id) {
      await Promise.resolve(onSave({ ...recipe, ...payload }));
    } else {
      await Promise.resolve(onSave(payload));
    }
    setSavedAt(new Date().toLocaleTimeString());
  }

  async function handleSaveAndClose() {
    const payload = buildPayload();
    await Promise.resolve(onSave(recipe.id ? { ...recipe, ...payload } : payload));
    setSavedAt(new Date().toLocaleTimeString());
    onBack();
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

  async function handleAddToPlanner() {
    if (!recipe.id || !plannerSlotId) return;
    const servings = plannerServings ? Number(plannerServings) : undefined;
    await onAddToPlanner(recipe.id, plannerDate, plannerSlotId, servings);
    setPlannerMessage("Added to planner");
  }

  return (
    <div className="grid recipe-editor-shell">
      <div className="row resource-toolbar" style={{ justifyContent: "space-between" }}>
        <div className="row resource-toolbar">
          <button className="secondary" type="button" onClick={onBack}>
            ← Back
          </button>
          <h2 style={{ margin: 0 }}>{recipe.id ? "Edit Recipe" : "New Recipe"}</h2>
        </div>
        <div className="row resource-toolbar">
          {recipe.url && (
            <a className="tag" href={recipe.url} target="_blank" rel="noreferrer">
              Open URL
            </a>
          )}
          {recipe.id && (
            <Link className="tag" to={`/recipes/${recipe.id}/print`}>
              Print View
            </Link>
          )}
          {recipe.id && (
            <button
              type="button"
              className="secondary"
              title="Make a copy you can tweak"
              onClick={() => void onDuplicate()}
            >
              Duplicate
            </button>
          )}
          {recipe.id && (
            <button type="button" className="danger" onClick={() => void onDelete()}>
              Delete
            </button>
          )}
        </div>
      </div>
      <form className="grid resource-form" onSubmit={submit}>
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Title"
          required
        />
        <div className="row resource-toolbar form-row-grid">
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="URL" />
          <label className="field-stack">
            <span>Base servings</span>
            <input
              type="number"
              min="1"
              value={form.baseServings}
              onChange={(e) => setForm({ ...form, baseServings: Number(e.target.value) })}
            />
          </label>
        </div>
        <p className="muted field-note">Ingredients scale by servingsPlanned / baseServings.</p>
        <div className="row resource-toolbar form-row-grid recipe-mealtype-row">
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
        <input
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.target.value })}
          placeholder="Tags (comma separated)"
        />
        <div className="row resource-toolbar form-row-grid">
          <label className="field-stack">
            <span>Calories (per serving)</span>
            <input
              type="number"
              min="0"
              value={form.calories}
              onChange={(e) => setForm({ ...form, calories: e.target.value })}
            />
          </label>
          <label className="field-stack">
            <span>Protein (g per serving)</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.proteinGrams}
              onChange={(e) => setForm({ ...form, proteinGrams: e.target.value })}
            />
          </label>
          <label className="field-stack">
            <span>Time (minutes)</span>
            <input
              type="number"
              min="0"
              value={form.timeMinutes}
              onChange={(e) => setForm({ ...form, timeMinutes: e.target.value })}
            />
          </label>
          <input
            type="number"
            value={form.estimatedCostPerServing}
            onChange={(e) => setForm({ ...form, estimatedCostPerServing: e.target.value })}
            placeholder="Cost per serving"
          />
        </div>
        <div className="row resource-toolbar form-row-grid recipe-image-row">
          <input
            value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            placeholder="Image URL"
          />
          {form.imageUrl && (
            <img src={form.imageUrl} alt="Recipe preview" style={{ width: 64, height: 64, objectFit: "cover" }} />
          )}
        </div>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Notes"
        />
        <div className="panel">
          <h3>Ingredients</h3>
          <p className="info-box">Ingredients save as you add/remove them.</p>
          {!recipe.id && <p>Save the recipe first to add ingredients.</p>}
          {recipe.id && pantryItems.length === 0 && (
            <div className="row resource-toolbar">
              <p>No pantry items yet.</p>
              <Link className="tag" to="/pantry">
                Go to Pantry
              </Link>
            </div>
          )}
          {recipe.id && pantryItems.length > 0 && (
            <>
              <div className="row resource-toolbar ingredient-editor-row">
                <input
                  value={ingredientFilter}
                  onChange={(e) => setIngredientFilter(e.target.value)}
                  placeholder="Search pantry items"
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    submitIngredientDraft();
                  }}
                />
                <select
                  className="ingredient-select"
                  value={ingredientDraft.pantryItemId}
                  onChange={(e) =>
                    setIngredientDraft({ ...ingredientDraft, pantryItemId: e.target.value })
                  }
                >
                  <option value="" disabled>
                    Select pantry item
                  </option>
                  {filteredPantryItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {noMatches && <span className="muted">No matches</span>}
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Quantity"
                  value={ingredientDraft.quantity}
                  onChange={(e) => setIngredientDraft({ ...ingredientDraft, quantity: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    submitIngredientDraft();
                  }}
                />
                {ingredientDraft.pantryItemId && (
                  <span className="muted">{pantryItemById.get(ingredientDraft.pantryItemId)?.baseUnit}</span>
                )}
                <input
                  placeholder="Prep note"
                  value={ingredientDraft.prepNote}
                  onChange={(e) => setIngredientDraft({ ...ingredientDraft, prepNote: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    submitIngredientDraft();
                  }}
                />
                <input
                  placeholder="Alt group"
                  value={ingredientDraft.altGroup}
                  onChange={(e) => setIngredientDraft({ ...ingredientDraft, altGroup: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    submitIngredientDraft();
                  }}
                />
                <button type="button" onClick={submitIngredientDraft}>
                  Add Ingredient
                </button>
              </div>
              {ingredientError && <p className="muted">{ingredientError}</p>}
              <div className="ingredients-list">
                <div className="ingredient-grid-header">
                  <span>Item</span>
                  <span>Qty</span>
                  <span>Unit</span>
                  <span>Alt group</span>
                  <span>Note</span>
                  <span>Remove</span>
                </div>
                <div className="ingredient-list-body">
                  {ingredients.map((ing) => {
                    const pantryItem = pantryItemById.get(ing.pantryItemId);
                    return (
                      <div key={ing.id} className="ingredient-row">
                        <div className="ingredient-field ingredient-field-item">
                          <span className="ingredient-card-label">Item</span>
                          <div className="ingredient-static-value">{pantryItem?.name || ""}</div>
                        </div>
                        <div className="ingredient-field ingredient-field-qty">
                          <span className="ingredient-card-label">Qty</span>
                          <input
                            type="number"
                            value={ing.quantity}
                            step="0.01"
                            min="0.01"
                            onChange={(e) =>
                              onUpdateIngredient(ing.id, { quantity: Number(e.target.value) })
                            }
                          />
                        </div>
                        <div className="ingredient-field ingredient-field-unit">
                          <span className="ingredient-card-label">Unit</span>
                          <div className="ingredient-static-value">{pantryItem?.baseUnit || ""}</div>
                        </div>
                        <div className="ingredient-field ingredient-field-alt-group">
                          <span className="ingredient-card-label">Alt group</span>
                          <input
                            value={ing.altGroup || ""}
                            onChange={(e) => onUpdateIngredient(ing.id, { altGroup: e.target.value })}
                          />
                        </div>
                        <div className="ingredient-field ingredient-field-note">
                          <span className="ingredient-card-label">Note</span>
                          <input
                            value={ing.prepNote || ""}
                            onChange={(e) => onUpdateIngredient(ing.id, { prepNote: e.target.value })}
                          />
                        </div>
                        <div className="ingredient-field ingredient-field-remove">
                          <span className="ingredient-card-label">Remove</span>
                          <button className="danger" onClick={() => onDeleteIngredient(ing.id)}>
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
        {recipe.id && (
          <div className="panel">
            <h3>Add to Planner</h3>
            <div className="row resource-toolbar form-row-grid">
              <input type="date" value={plannerDate} onChange={(e) => setPlannerDate(e.target.value)} />
              <select value={plannerSlotId} onChange={(e) => setPlannerSlotId(e.target.value)}>
                <option value="">Select slot</option>
                {mealSlots.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.name}
                  </option>
                ))}
              </select>
              <label className="field-stack">
                <span>Servings planned</span>
                <input
                  type="number"
                  min="1"
                  value={plannerServings}
                  onChange={(e) => setPlannerServings(e.target.value)}
                />
              </label>
              <button type="button" onClick={() => void handleAddToPlanner()} disabled={!plannerSlotId}>
                Add to planner
              </button>
            </div>
            <p className="muted field-note">Ingredients scale by servingsPlanned / baseServings.</p>
            {plannerMessage && <p className="muted">{plannerMessage}</p>}
          </div>
        )}
        <div>
          <strong>Steps</strong>
          {form.steps.map((step, idx) => (
            <div className="row resource-toolbar recipe-step-row" key={idx}>
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
        <div className="row resource-toolbar">
          <button type="submit" className="secondary">
            Save Recipe
          </button>
          <button type="button" onClick={handleSaveAndClose}>
            Save & Close
          </button>
          {savedAt && <span className="muted">Saved {savedAt}</span>}
        </div>
      </form>

      {recipe.id && recipe.steps.length > 0 && (
        <CookMode steps={recipe.steps} ingredients={ingredients} pantryItems={pantryItems} />
      )}
    </div>
  );
}
