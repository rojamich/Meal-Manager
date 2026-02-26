import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PantryItem, Recipe, RecipeIngredient } from "../../models";
import { getRecipe, listIngredients } from "../../db/repositories/recipeRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { roundQty } from "../../utils/math";

function getEffectiveBaseServings(recipe: Recipe) {
  return Math.max(recipe.baseServings ?? recipe.defaultServings ?? 1, 1);
}

function getCaloriesPerServing(recipe: Recipe) {
  return recipe.calories ?? recipe.caloriesPerServing;
}

export default function CookPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [stepsViewMode, setStepsViewMode] = useState<"step" | "full">("step");

  useEffect(() => {
    if (!id) return;
    getRecipe(id).then((value) => value && setRecipe(value));
    listIngredients(id).then(setIngredients);
    listPantryItems().then(setPantryItems);
  }, [id]);

  const plannedServings = Math.max(Number(searchParams.get("servings") || 0) || 0, 0);
  const hasPlannedServings = searchParams.has("servings") && plannedServings > 0;
  const effectiveServings = useMemo(() => {
    if (!recipe) return 1;
    return Math.max(plannedServings || getEffectiveBaseServings(recipe), 1);
  }, [plannedServings, recipe]);

  const scaledIngredients = useMemo(() => {
    if (!recipe) return [];
    const factor = effectiveServings / getEffectiveBaseServings(recipe);
    return ingredients.map((ing) => ({
      ...ing,
      scaledQty: roundQty(ing.quantity * factor)
    }));
  }, [effectiveServings, ingredients, recipe]);

  if (!recipe) return <div className="container"><div className="panel"><p>Loading...</p></div></div>;

  const currentStep = recipe.steps[stepIndex] || "";
  const totalSteps = Math.max(recipe.steps.length, 1);
  const perServingCalories = getCaloriesPerServing(recipe);
  const perServingProtein = recipe.proteinGrams;
  const totalCalories = perServingCalories !== undefined ? Math.round(perServingCalories * effectiveServings) : undefined;
  const totalProtein =
    perServingProtein !== undefined ? Math.round(perServingProtein * effectiveServings * 10) / 10 : undefined;

  return (
    <div className="container">
      <div className="panel grid">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0 }}>{recipe.title}</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              Servings: {effectiveServings} (base {getEffectiveBaseServings(recipe)})
            </p>
            {(perServingCalories !== undefined || perServingProtein !== undefined) && (
              <p className="muted" style={{ marginTop: 6 }}>
                Per serving:
                {perServingCalories !== undefined ? ` ${perServingCalories} cal` : ""}
                {perServingProtein !== undefined ? `${perServingCalories !== undefined ? " •" : ""} ${perServingProtein}g protein` : ""}
              </p>
            )}
            {hasPlannedServings && (totalCalories !== undefined || totalProtein !== undefined) && (
              <p className="muted" style={{ marginTop: 6 }}>
                Total:
                {totalCalories !== undefined ? ` ${totalCalories} cal` : ""}
                {totalProtein !== undefined ? `${totalCalories !== undefined ? " •" : ""} ${totalProtein}g protein` : ""}
              </p>
            )}
          </div>
        </div>

        {recipe.notes && (
          <div className="panel">
            <strong>Notes</strong>
            <p style={{ marginBottom: 0 }}>{recipe.notes}</p>
          </div>
        )}

        <div className="panel">
          <strong>Ingredients</strong>
          <ul>
            {scaledIngredients.map((ing) => {
              const item = pantryItems.find((p) => p.id === ing.pantryItemId);
              return (
                <li key={ing.id}>
                  {item?.name || "Item"} - {ing.scaledQty} {item?.baseUnit || ""}
                  {ing.prepNote ? ` (${ing.prepNote})` : ""}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>Steps</strong>
            <div className="row">
              <button
                className={stepsViewMode === "full" ? "" : "secondary"}
                onClick={() => setStepsViewMode("full")}
                type="button"
              >
                Full
              </button>
              <button
                className={stepsViewMode === "step" ? "" : "secondary"}
                onClick={() => setStepsViewMode("step")}
                type="button"
              >
                Step mode
              </button>
            </div>
          </div>
          {stepsViewMode === "step" ? (
            <>
              <p>{currentStep}</p>
              <div className="row">
                <button className="secondary" onClick={() => setStepIndex((idx) => Math.max(idx - 1, 0))}>
                  Prev
                </button>
                <button onClick={() => setStepIndex((idx) => Math.min(idx + 1, Math.max(recipe.steps.length - 1, 0)))}>
                  Next
                </button>
                <span className="muted">
                  {Math.min(stepIndex + 1, totalSteps)} / {totalSteps}
                </span>
              </div>
            </>
          ) : null}
          {stepsViewMode === "full" ? recipe.steps.length > 0 ? (
            <ol>
              {recipe.steps.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
          ) : (
            <p className="muted">No steps added.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
