import { PlannedMeal, Recipe } from "../../models";
import {
  createPlannedMeal,
  deletePlannedMeal
} from "../../db/repositories/mealPlanRepo";

type MealInput = Omit<PlannedMeal, "id" | "createdAt" | "updatedAt">;

function normalizePositiveInt(value: number | undefined, fallback = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(Math.round(num), 1);
}

export function defaultRecipeServings(recipe: Recipe | null | undefined, householdSize: number) {
  const recipeBase = recipe?.baseServings ?? recipe?.defaultServings;
  if (recipeBase && Number.isFinite(Number(recipeBase)) && Number(recipeBase) > 0) {
    return normalizePositiveInt(recipeBase, householdSize);
  }
  return normalizePositiveInt(householdSize, 1);
}

export function buildRecipeMealInput({
  date,
  mealSlotId,
  recipe,
  recipeId,
  servingsPlanned,
  householdSize,
  notes,
  assignedTo
}: {
  date: string;
  mealSlotId: string;
  recipe?: Recipe | null;
  recipeId?: string;
  servingsPlanned?: number;
  householdSize: number;
  notes?: string;
  assignedTo?: string;
}): MealInput {
  const nextRecipeId = recipeId || recipe?.id;
  const plannedServings = normalizePositiveInt(
    servingsPlanned,
    defaultRecipeServings(recipe, householdSize)
  );
  return {
    date,
    mealSlotId,
    type: "recipe",
    recipeId: nextRecipeId,
    servingsPlanned: plannedServings,
    notes: notes?.trim() || undefined,
    assignedTo: assignedTo || undefined
  };
}

export function buildFreeformMealInput({
  date,
  mealSlotId,
  freeformTitle,
  notes,
  assignedTo
}: {
  date: string;
  mealSlotId: string;
  freeformTitle: string;
  notes?: string;
  assignedTo?: string;
}): MealInput {
  return {
    date,
    mealSlotId,
    type: "freeform",
    freeformTitle: freeformTitle.trim(),
    notes: notes?.trim() || undefined,
    assignedTo: assignedTo || undefined
  };
}

export async function createMealWithRules({
  input
}: {
  input: MealInput;
  householdSize?: number;
  currentMeals?: PlannedMeal[];
}) {
  const created = await createPlannedMeal(input);
  return { created } as { created: PlannedMeal; error?: string };
}

export async function deleteMealWithRules({ meal }: { meal: PlannedMeal; householdSize?: number; currentMeals?: PlannedMeal[] }) {
  await deletePlannedMeal(meal.id);
  return {} as { sourceUpdate?: undefined };
}

export async function cloneMealWithRules({
  meal,
  targetDate,
  targetMealSlotId,
  householdSize
}: {
  meal: PlannedMeal;
  targetDate: string;
  targetMealSlotId: string;
  householdSize: number;
  currentMeals?: PlannedMeal[];
}) {
  if (meal.type === "recipe") {
    return createMealWithRules({
      input: buildRecipeMealInput({
        date: targetDate,
        mealSlotId: targetMealSlotId,
        recipeId: meal.recipeId,
        servingsPlanned: meal.servingsPlanned,
        householdSize,
        notes: meal.notes,
        assignedTo: meal.assignedTo
      })
    });
  }
  return createMealWithRules({
    input: buildFreeformMealInput({
      date: targetDate,
      mealSlotId: targetMealSlotId,
      freeformTitle: meal.freeformTitle || "Freeform",
      notes: meal.notes,
      assignedTo: meal.assignedTo
    })
  });
}
