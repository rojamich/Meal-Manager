import { RefObject, type CSSProperties, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { MealSlot, Person, PlannedMeal, Recipe } from "../../models";
import { defaultRecipeServings, LeftoverCandidate } from "./plannerDomain";
import { formatDateLabel } from "../../utils/date";

export default function InlineAddPanel({
  recipes,
  slots: _slots,
  people,
  inlineType,
  setInlineType,
  inlineRecipeId,
  setInlineRecipeId,
  inlineServings,
  setInlineServings,
  householdSize,
  inlineFreeformTitle,
  setInlineFreeformTitle,
  inlineNotes,
  setInlineNotes,
  inlineAssignedTo,
  setInlineAssignedTo,
  recipeSearch,
  setRecipeSearch,
  leftoverCandidates,
  inlineLeftoverSourceId,
  setInlineLeftoverSourceId,
  panelRef,
  panelStyle,
  onSave,
  onCancel
}: {
  recipes: Recipe[];
  slots: MealSlot[];
  people: Person[];
  inlineType: PlannedMeal["type"];
  setInlineType: (value: PlannedMeal["type"]) => void;
  inlineRecipeId: string;
  setInlineRecipeId: (value: string) => void;
  inlineServings: string;
  setInlineServings: (value: string) => void;
  householdSize: number;
  inlineFreeformTitle: string;
  setInlineFreeformTitle: (value: string) => void;
  inlineNotes: string;
  setInlineNotes: (value: string) => void;
  inlineAssignedTo: string;
  setInlineAssignedTo: (value: string) => void;
  recipeSearch: string;
  setRecipeSearch: (value: string) => void;
  leftoverCandidates: LeftoverCandidate[];
  inlineLeftoverSourceId: string;
  setInlineLeftoverSourceId: (value: string) => void;
  panelRef: RefObject<HTMLDivElement>;
  panelStyle?: CSSProperties | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const filteredRecipes = recipes.filter((recipe) =>
    recipe.title.toLowerCase().includes(recipeSearch.trim().toLowerCase())
  );
  const firstRecipeSearchRef = useRef<HTMLInputElement | null>(null);
  const firstFreeformRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inlineType === "recipe" && firstRecipeSearchRef.current) {
      firstRecipeSearchRef.current.focus();
    }
    if (inlineType === "freeform" && firstFreeformRef.current) {
      firstFreeformRef.current.focus();
    }
  }, [inlineType]);

  return (
    <div
      className="panel planner-inline-panel"
      ref={panelRef}
      style={panelStyle ?? undefined}
      data-planner-inline-panel="true"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="row">
        <select value={inlineType} onChange={(e) => setInlineType(e.target.value as PlannedMeal["type"])}>
          <option value="recipe">Recipe</option>
          <option value="freeform">Freeform</option>
          <option value="leftover">Leftovers</option>
        </select>
        <button className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {inlineType === "recipe" && (
        <>
          {recipes.length === 0 ? (
            <p>
              No recipes yet. <Link className="tag" to="/recipes">Go to Recipes</Link>
            </p>
          ) : (
            <>
              <input
                ref={firstRecipeSearchRef}
                placeholder="Search recipes"
                value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)}
              />
              <select
                value={inlineRecipeId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setInlineRecipeId(nextId);
                  if (!nextId) {
                    setInlineServings("");
                    return;
                  }
                  const selectedRecipe = recipes.find((recipe) => recipe.id === nextId);
                  setInlineServings(String(defaultRecipeServings(selectedRecipe, householdSize)));
                }}
              >
                <option value="">Select recipe</option>
                {filteredRecipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.title}
                  </option>
                ))}
              </select>
              <label className="field-stack">
                <span>Servings planned</span>
                <input
                  type="number"
                  min="1"
                  value={inlineServings}
                  onChange={(e) => setInlineServings(e.target.value)}
                />
              </label>
              <p className="muted field-note">
                Defaults to the recipe's base servings. Change here to scale ingredients.
              </p>
            </>
          )}
        </>
      )}

      {inlineType === "freeform" && (
        <input
          ref={firstFreeformRef}
          placeholder="Title"
          value={inlineFreeformTitle}
          onChange={(e) => setInlineFreeformTitle(e.target.value)}
        />
      )}

      {inlineType === "leftover" && (
        <>
          {leftoverCandidates.length === 0 ? (
            <p className="muted">
              No recent meals with servings to spare. Plan a recipe meal first (leftovers link to it).
            </p>
          ) : (
            <>
              <label className="field-stack">
                <span>Leftovers from</span>
                <select
                  value={inlineLeftoverSourceId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setInlineLeftoverSourceId(nextId);
                    const candidate = leftoverCandidates.find((c) => c.meal.id === nextId);
                    if (candidate) {
                      setInlineServings(
                        String(Math.min(candidate.servingsRemaining, Math.max(householdSize, 1)))
                      );
                    }
                  }}
                >
                  <option value="">Select meal</option>
                  {leftoverCandidates.map(({ meal, servingsRemaining }) => {
                    const recipe = recipes.find((r) => r.id === meal.recipeId);
                    const title = recipe?.title || meal.freeformTitle || "Meal";
                    return (
                      <option key={meal.id} value={meal.id}>
                        {title} — {formatDateLabel(meal.date)} ({servingsRemaining} left)
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="field-stack">
                <span>Servings to eat</span>
                <input
                  type="number"
                  min="1"
                  value={inlineServings}
                  onChange={(e) => setInlineServings(e.target.value)}
                />
              </label>
              <p className="muted field-note">
                Linked leftovers don't add ingredients to the grocery list or deduct from the pantry.
              </p>
            </>
          )}
        </>
      )}

      {people.length > 0 && (
        <label className="field-stack">
          <span>Assigned to</span>
          <select value={inlineAssignedTo} onChange={(e) => setInlineAssignedTo(e.target.value)}>
            <option value="">Shared</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <textarea placeholder="Notes" value={inlineNotes} onChange={(e) => setInlineNotes(e.target.value)} />
      <div className="row">
        <button onClick={onSave}>Save</button>
      </div>
    </div>
  );
}
