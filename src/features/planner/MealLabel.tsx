import { PlannedMeal, Recipe } from "../../models";
import { getEffectiveLeftoverRemaining } from "./plannerDomain";

export default function MealLabel({
  meal,
  recipes,
  householdSize = 1,
  showRemaining = true
}: {
  meal: PlannedMeal;
  recipes: Recipe[];
  householdSize?: number;
  showRemaining?: boolean;
}) {
  if (meal.type === "recipe") {
    const recipe = recipes.find((r) => r.id === meal.recipeId);
    const remaining = getEffectiveLeftoverRemaining(meal, householdSize);
    return (
      <span>
        {recipe?.title || "Recipe"}
        {showRemaining && typeof remaining === "number" && remaining > 0 ? ` (${remaining})` : ""}
      </span>
    );
  }
  if (meal.type === "leftover") {
    return <span>{meal.freeformTitle ? `Leftover: ${meal.freeformTitle}` : "Leftover"}</span>;
  }
  return <span>{meal.freeformTitle || "Freeform"}</span>;
}
