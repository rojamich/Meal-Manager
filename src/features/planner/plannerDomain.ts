import { PlannedMeal, Recipe } from "../../models";
import {
  createPlannedMeal,
  deletePlannedMeal,
  getPlannedMeal,
  updatePlannedMeal
} from "../../db/repositories/mealPlanRepo";

type MealInput = Omit<PlannedMeal, "id" | "createdAt" | "updatedAt">;

function normalizePositiveInt(value: number | undefined, fallback = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(Math.round(num), 1);
}

function normalizeNonNegative(value: number | undefined, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(Math.round(num), 0);
}

export function defaultRecipeServings(recipe: Recipe | null | undefined, householdSize: number) {
  return normalizePositiveInt(householdSize, recipe?.defaultServings ?? recipe?.baseServings ?? 1);
}

export function defaultRecipeLeftovers(servingsPlanned: number, householdSize: number) {
  return Math.max(normalizePositiveInt(servingsPlanned) - normalizePositiveInt(householdSize), 0);
}

export function getEffectiveLeftoverRemaining(sourceMeal: PlannedMeal | null | undefined, householdSize: number) {
  if (!sourceMeal) return 0;
  if (typeof sourceMeal.leftoverServingsRemaining === "number") {
    return normalizeNonNegative(sourceMeal.leftoverServingsRemaining);
  }
  if (sourceMeal.type !== "recipe") return 0;
  return defaultRecipeLeftovers(sourceMeal.servingsPlanned ?? householdSize, householdSize);
}

export function validateLeftoverUsage(
  sourceMeal: PlannedMeal | null | undefined,
  servingsUsed: number,
  householdSize: number
) {
  if (!sourceMeal) {
    return {
      ok: false,
      remainingBefore: 0,
      remainingAfter: 0,
      message: "Leftover source not found."
    };
  }
  const used = normalizePositiveInt(servingsUsed);
  const remainingBefore = getEffectiveLeftoverRemaining(sourceMeal, householdSize);
  if (remainingBefore < used) {
    return {
      ok: false,
      remainingBefore,
      remainingAfter: remainingBefore,
      message: remainingBefore <= 0 ? "No leftovers remaining." : `Only ${remainingBefore} leftover servings remaining.`
    };
  }
  return {
    ok: true,
    remainingBefore,
    remainingAfter: Math.max(remainingBefore - used, 0),
    message: ""
  };
}

export function buildRecipeMealInput({
  date,
  mealSlotId,
  recipe,
  recipeId,
  servingsPlanned,
  householdSize,
  notes
}: {
  date: string;
  mealSlotId: string;
  recipe?: Recipe | null;
  recipeId?: string;
  servingsPlanned?: number;
  householdSize: number;
  notes?: string;
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
    leftoverServingsRemaining: defaultRecipeLeftovers(plannedServings, householdSize),
    notes: notes?.trim() || undefined
  };
}

export function buildLeftoverMealInput({
  date,
  mealSlotId,
  sourceMeal,
  servingsUsed,
  notes,
  freeformTitle
}: {
  date: string;
  mealSlotId: string;
  sourceMeal?: PlannedMeal | null;
  servingsUsed?: number;
  notes?: string;
  freeformTitle?: string;
}): MealInput {
  const sourceId = sourceMeal?.id;
  return {
    date,
    mealSlotId,
    type: "leftover",
    sourcePlannedMealId: sourceId,
    leftoverSourceMealId: sourceId,
    servingsPlanned: normalizePositiveInt(servingsUsed, 1),
    freeformTitle: freeformTitle?.trim() || undefined,
    notes: notes?.trim() || undefined
  };
}

export function buildFreeformMealInput({
  date,
  mealSlotId,
  freeformTitle,
  notes
}: {
  date: string;
  mealSlotId: string;
  freeformTitle: string;
  notes?: string;
}): MealInput {
  return {
    date,
    mealSlotId,
    type: "freeform",
    freeformTitle: freeformTitle.trim(),
    notes: notes?.trim() || undefined
  };
}

async function resolveSourceMeal(sourceMealId: string | undefined, currentMeals: PlannedMeal[]) {
  if (!sourceMealId) return undefined;
  return currentMeals.find((meal) => meal.id === sourceMealId) ?? (await getPlannedMeal(sourceMealId));
}

export async function createMealWithRules({
  input,
  householdSize,
  currentMeals,
  skipLeftoverDecrement = false
}: {
  input: MealInput;
  householdSize: number;
  currentMeals: PlannedMeal[];
  skipLeftoverDecrement?: boolean;
}) {
  if (input.type !== "leftover" || skipLeftoverDecrement) {
    const created = await createPlannedMeal(input);
    return { created };
  }

  const sourceId = input.leftoverSourceMealId || input.sourcePlannedMealId;
  const sourceMeal = await resolveSourceMeal(sourceId, currentMeals);
  if (!sourceMeal) {
    return { created: undefined, error: "Leftover source not found." };
  }

  const validation = validateLeftoverUsage(sourceMeal, input.servingsPlanned ?? 1, householdSize);
  if (!validation.ok) {
    return { created: undefined, error: validation.message };
  }

  await updatePlannedMeal(sourceMeal.id, { leftoverServingsRemaining: validation.remainingAfter });
  try {
    const created = await createPlannedMeal(input);
    return {
      created,
      sourceUpdate: { mealId: sourceMeal.id, leftoverServingsRemaining: validation.remainingAfter }
    };
  } catch (error) {
    await updatePlannedMeal(sourceMeal.id, { leftoverServingsRemaining: validation.remainingBefore });
    throw error;
  }
}

export async function deleteMealWithRules({
  meal,
  householdSize,
  currentMeals
}: {
  meal: PlannedMeal;
  householdSize: number;
  currentMeals: PlannedMeal[];
}) {
  let sourceUpdate:
    | {
        mealId: string;
        leftoverServingsRemaining: number;
      }
    | undefined;

  if (meal.type === "leftover") {
    const sourceId = meal.leftoverSourceMealId || meal.sourcePlannedMealId;
    const sourceMeal = await resolveSourceMeal(sourceId, currentMeals);
    if (sourceMeal) {
      const restored = getEffectiveLeftoverRemaining(sourceMeal, householdSize) + normalizePositiveInt(meal.servingsPlanned, 1);
      await updatePlannedMeal(sourceMeal.id, { leftoverServingsRemaining: restored });
      sourceUpdate = { mealId: sourceMeal.id, leftoverServingsRemaining: restored };
    }
  }

  await deletePlannedMeal(meal.id);
  return { sourceUpdate };
}

export async function cloneMealWithRules({
  meal,
  targetDate,
  targetMealSlotId,
  householdSize,
  currentMeals
}: {
  meal: PlannedMeal;
  targetDate: string;
  targetMealSlotId: string;
  householdSize: number;
  currentMeals: PlannedMeal[];
}) {
  if (meal.type === "recipe") {
    return createMealWithRules({
      input: buildRecipeMealInput({
        date: targetDate,
        mealSlotId: targetMealSlotId,
        recipeId: meal.recipeId,
        servingsPlanned: meal.servingsPlanned,
        householdSize,
        notes: meal.notes
      }),
      householdSize,
      currentMeals
    });
  }

  if (meal.type === "freeform") {
    return createMealWithRules({
      input: buildFreeformMealInput({
        date: targetDate,
        mealSlotId: targetMealSlotId,
        freeformTitle: meal.freeformTitle || "Freeform",
        notes: meal.notes
      }),
      householdSize,
      currentMeals
    });
  }

  const sourceId = meal.leftoverSourceMealId || meal.sourcePlannedMealId;
  const sourceMeal = await resolveSourceMeal(sourceId, currentMeals);
  if (!sourceMeal) {
    return {
      created: undefined,
      error: `Skipped leftover copy for ${meal.date}: source meal no longer exists.`
    };
  }

  return createMealWithRules({
    input: buildLeftoverMealInput({
      date: targetDate,
      mealSlotId: targetMealSlotId,
      sourceMeal,
      servingsUsed: meal.servingsPlanned,
      notes: meal.notes,
      freeformTitle: meal.freeformTitle
    }),
    householdSize,
    currentMeals
  });
}

export function listAvailableLeftoverMeals(
  meals: PlannedMeal[],
  householdSize: number,
  options?: { includeAnyRecent?: boolean }
) {
  const includeAnyRecent = options?.includeAnyRecent ?? false;
  return meals
    .filter((meal) => {
      if (meal.type === "leftover" && !includeAnyRecent) return false;
      return getEffectiveLeftoverRemaining(meal, householdSize) > 0;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getAllocatedLeftoverServings(
  meals: PlannedMeal[],
  sourceMealId: string,
  options?: { excludeMealId?: string }
) {
  return meals
    .filter(
      (meal) =>
        meal.type === "leftover" &&
        meal.id !== options?.excludeMealId &&
        (meal.leftoverSourceMealId || meal.sourcePlannedMealId) === sourceMealId
    )
    .reduce((total, meal) => total + normalizePositiveInt(meal.servingsPlanned, 1), 0);
}

export function calculateRecipeMealLeftoverState({
  meal,
  meals,
  nextServingsPlanned,
  householdSize
}: {
  meal: PlannedMeal;
  meals: PlannedMeal[];
  nextServingsPlanned: number;
  householdSize: number;
}) {
  const plannedServings = normalizePositiveInt(nextServingsPlanned, meal.servingsPlanned ?? householdSize);
  const producedLeftovers = defaultRecipeLeftovers(plannedServings, householdSize);
  const allocatedLeftovers = getAllocatedLeftoverServings(meals, meal.id);
  return {
    servingsPlanned: plannedServings,
    producedLeftovers,
    allocatedLeftovers,
    leftoverServingsRemaining: Math.max(producedLeftovers - allocatedLeftovers, 0),
    overflowServings: Math.max(allocatedLeftovers - producedLeftovers, 0)
  };
}
