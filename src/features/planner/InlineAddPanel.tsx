import { RefObject, type CSSProperties, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { MealSlot, PlannedMeal, Recipe } from "../../models";
import {
  defaultRecipeServings,
  getEffectiveLeftoverRemaining,
  listAvailableLeftoverMeals
} from "./plannerDomain";

export default function InlineAddPanel({
  recipes,
  slots,
  recentPlanned,
  currentMeals,
  inlineType,
  setInlineType,
  inlineRecipeId,
  setInlineRecipeId,
  inlineServings,
  setInlineServings,
  householdSize,
  inlineLeftoverSource,
  setInlineLeftoverSource,
  inlineLeftoverServingsUsed,
  setInlineLeftoverServingsUsed,
  includeAnyRecent,
  setIncludeAnyRecent,
  inlineFreeformTitle,
  setInlineFreeformTitle,
  inlineNotes,
  setInlineNotes,
  recipeSearch,
  setRecipeSearch,
  panelRef,
  panelStyle,
  onSave,
  onCancel
}: {
  recipes: Recipe[];
  slots: MealSlot[];
  recentPlanned: PlannedMeal[];
  currentMeals: PlannedMeal[];
  inlineType: PlannedMeal["type"];
  setInlineType: (value: PlannedMeal["type"]) => void;
  inlineRecipeId: string;
  setInlineRecipeId: (value: string) => void;
  inlineServings: string;
  setInlineServings: (value: string) => void;
  householdSize: number;
  inlineLeftoverSource: string;
  setInlineLeftoverSource: (value: string) => void;
  inlineLeftoverServingsUsed: string;
  setInlineLeftoverServingsUsed: (value: string) => void;
  includeAnyRecent: boolean;
  setIncludeAnyRecent: (value: boolean) => void;
  inlineFreeformTitle: string;
  setInlineFreeformTitle: (value: string) => void;
  inlineNotes: string;
  setInlineNotes: (value: string) => void;
  recipeSearch: string;
  setRecipeSearch: (value: string) => void;
  panelRef: RefObject<HTMLDivElement>;
  panelStyle?: CSSProperties | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const filteredRecipes = recipes.filter((recipe) =>
    recipe.title.toLowerCase().includes(recipeSearch.trim().toLowerCase())
  );
  const mergedMeals = useMemo(() => {
    const map = new Map<string, PlannedMeal>();
    currentMeals.forEach((meal) => map.set(meal.id, meal));
    recentPlanned.forEach((meal) => {
      if (!map.has(meal.id)) map.set(meal.id, meal);
    });
    return Array.from(map.values());
  }, [currentMeals, recentPlanned]);
  const recentMealOptions = listAvailableLeftoverMeals(mergedMeals, householdSize, {
    includeAnyRecent
  });
  const recipeTitle = (recipeId?: string) => recipes.find((r) => r.id === recipeId)?.title || "Recipe";
  const slotLabel = (mealSlotId?: string) => slots.find((slot) => slot.id === mealSlotId)?.name || "Slot";
  const typeLabel = (type: PlannedMeal["type"]) =>
    type === "recipe" ? "Recipe" : type === "leftover" ? "Leftover" : "Freeform";
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
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <div className="row">
        <select value={inlineType} onChange={(e) => setInlineType(e.target.value as PlannedMeal["type"])}>
          <option value="recipe">Recipe</option>
          <option value="leftover">Leftover</option>
          <option value="freeform">Freeform</option>
        </select>
        <button className="secondary" onClick={onCancel}>Cancel</button>
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
              <p className="muted field-note">Ingredients scale by servingsPlanned / baseServings.</p>
            </>
          )}
        </>
      )}

      {inlineType === "leftover" && (
        <>
          {recentMealOptions.length === 0 && recipes.length === 0 ? (
            <p>
              No recent meals or recipes yet. <Link className="tag" to="/recipes">Go to Recipes</Link>
            </p>
          ) : (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={includeAnyRecent}
                  onChange={(e) => setIncludeAnyRecent(e.target.checked)}
                />
                Any recent meal
              </label>
              <select value={inlineLeftoverSource} onChange={(e) => setInlineLeftoverSource(e.target.value)}>
                <option value="">Select source</option>
                {recentMealOptions.map((meal) => (
                  <option key={meal.id} value={`meal:${meal.id}`}>
                    {recipeTitle(meal.recipeId)} | {meal.date} | {slotLabel(meal.mealSlotId)} | {typeLabel(meal.type)} | remaining {getEffectiveLeftoverRemaining(meal, householdSize)}
                  </option>
                ))}
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={`recipe:${recipe.id}`}>
                    Recipe: {recipe.title}
                  </option>
                ))}
              </select>
              <label className="field-stack">
                <span>Servings used</span>
                <input
                  type="number"
                  min="1"
                  value={inlineLeftoverServingsUsed}
                  onChange={(e) => setInlineLeftoverServingsUsed(e.target.value)}
                />
              </label>
            </>
          )}
        </>
      )}

      {inlineType === "freeform" && (
        <>
          <input
            ref={firstFreeformRef}
            placeholder="Title"
            value={inlineFreeformTitle}
            onChange={(e) => setInlineFreeformTitle(e.target.value)}
          />
        </>
      )}

      <textarea placeholder="Notes" value={inlineNotes} onChange={(e) => setInlineNotes(e.target.value)} />
      <div className="row">
        <button onClick={onSave}>Save</button>
      </div>
    </div>
  );
}
