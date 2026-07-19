import { PlannedMeal, Recipe } from "../../models";

export default function MealLabel({
  meal,
  recipes
}: {
  meal: PlannedMeal;
  recipes: Recipe[];
  /** Kept for backward compatibility with callers that still pass it. */
  householdSize?: number;
  /** Kept for backward compatibility with callers that still pass it. */
  showRemaining?: boolean;
}) {
  if (meal.type === "recipe") {
    const recipe = recipes.find((r) => r.id === meal.recipeId);
    return <span>{recipe?.title || "Recipe"}</span>;
  }
  if (meal.type === "leftover") {
    const recipe = recipes.find((r) => r.id === meal.recipeId);
    const title = recipe?.title || meal.freeformTitle || "Leftovers";
    return (
      <span>
        {title} <span className="leftover-badge">leftovers</span>
      </span>
    );
  }
  return <span>{meal.freeformTitle || "Freeform"}</span>;
}
