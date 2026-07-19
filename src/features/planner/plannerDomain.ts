import { PlannedMeal, Recipe } from "../../models";
import {
  createPlannedMeal,
  deletePlannedMeal,
  getPlannedMeal,
  listLeftoverMealsForSources,
  listPastUneatenLeftovers,
  listPlannedMeals,
  updatePlannedMeal
} from "../../db/repositories/mealPlanRepo";
import {
  consumeCookedPortion,
  findCookedPortionBySourceMealId,
  restoreCookedPortionServings
} from "../../db/repositories/cookedPortionsRepo";
import { addDays, dateKey, parseISODate } from "../../utils/date";

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

export function buildLeftoverMealInput({
  date,
  mealSlotId,
  sourceMeal,
  servingsPlanned,
  notes,
  assignedTo
}: {
  date: string;
  mealSlotId: string;
  sourceMeal: PlannedMeal;
  servingsPlanned?: number;
  notes?: string;
  assignedTo?: string;
}): MealInput {
  return {
    date,
    mealSlotId,
    type: "leftover",
    recipeId: sourceMeal.recipeId,
    freeformTitle: sourceMeal.type === "freeform" ? sourceMeal.freeformTitle : undefined,
    leftoverSourceMealId: sourceMeal.id,
    servingsPlanned: normalizePositiveInt(servingsPlanned, 1),
    notes: notes?.trim() || undefined,
    assignedTo: assignedTo || undefined
  };
}

export interface LeftoverCandidate {
  meal: PlannedMeal;
  /** Servings not yet claimed by linked leftover meals. */
  servingsRemaining: number;
}

const LEFTOVER_LOOKBACK_DAYS = 7;

/**
 * Recipe meals planned in the week up to (and including) targetDate that still
 * have unclaimed servings. Excludes leftover meals themselves.
 */
export async function listLeftoverSourceCandidates(
  targetDate: string,
  excludeMealId?: string
): Promise<LeftoverCandidate[]> {
  const start = dateKey(addDays(parseISODate(targetDate), -LEFTOVER_LOOKBACK_DAYS));
  const meals = await listPlannedMeals(start, targetDate);
  const sources = meals.filter(
    (meal) => meal.type === "recipe" && meal.id !== excludeMealId
  );
  const linked = await listLeftoverMealsForSources(sources.map((meal) => meal.id));
  const claimedBySource = new Map<string, number>();
  for (const meal of linked) {
    const sourceId = meal.leftoverSourceMealId!;
    claimedBySource.set(
      sourceId,
      (claimedBySource.get(sourceId) ?? 0) + Math.max(meal.servingsPlanned ?? 1, 1)
    );
  }
  return sources
    .map((meal) => {
      const total = Math.max(meal.servingsPlanned ?? 1, 1);
      const claimed = claimedBySource.get(meal.id) ?? 0;
      return { meal, servingsRemaining: Math.max(total - claimed, 0) };
    })
    .filter((candidate) => candidate.servingsRemaining > 0)
    .sort((a, b) => b.meal.date.localeCompare(a.meal.date));
}

/**
 * Mark a leftover meal eaten: consume its servings from the cooked portion the
 * source meal produced (if one exists) and stamp the meal as eaten.
 */
export async function eatLeftoverMeal(meal: PlannedMeal) {
  let consumed = 0;
  if (meal.leftoverSourceMealId) {
    const portion = await findCookedPortionBySourceMealId(meal.leftoverSourceMealId);
    if (portion && portion.servingsRemaining > 0) {
      consumed = Math.min(Math.max(meal.servingsPlanned ?? 1, 1), portion.servingsRemaining);
      await consumeCookedPortion(portion.id, consumed);
    }
  }
  await updatePlannedMeal(meal.id, { cookedAt: new Date().toISOString() });
  return { consumed };
}

/** Undo eatLeftoverMeal: put the servings back on the fridge portion. */
export async function uneatLeftoverMeal(meal: PlannedMeal) {
  let restored = 0;
  if (meal.leftoverSourceMealId) {
    const portion = await findCookedPortionBySourceMealId(meal.leftoverSourceMealId, {
      includeArchived: true
    });
    if (portion) {
      restored = Math.min(
        Math.max(meal.servingsPlanned ?? 1, 1),
        portion.servingsTotal - portion.servingsRemaining
      );
      if (restored > 0) await restoreCookedPortionServings(portion.id, restored);
    }
  }
  await updatePlannedMeal(meal.id, { cookedAt: undefined });
  return { restored };
}

/**
 * Auto-eat sweep: leftover meals whose day has passed, that aren't marked eaten
 * yet and whose source has a cooked portion with servings left, get eaten.
 * Meals whose source was never cooked are left alone.
 *
 * Concurrent calls share one run (React StrictMode mounts effects twice; two
 * interleaved sweeps would double-consume fridge servings), and each meal is
 * re-checked right before eating in case something else marked it meanwhile.
 */
let autoEatRun: Promise<number> | null = null;

export function autoEatPastLeftovers(todayKey: string) {
  if (!autoEatRun) {
    autoEatRun = runAutoEatSweep(todayKey).finally(() => {
      autoEatRun = null;
    });
  }
  return autoEatRun;
}

async function runAutoEatSweep(todayKey: string) {
  const pastLeftovers = await listPastUneatenLeftovers(todayKey);
  let eaten = 0;
  for (const meal of pastLeftovers) {
    if (!meal.leftoverSourceMealId) continue;
    const fresh = await getPlannedMeal(meal.id);
    if (!fresh || fresh.cookedAt) continue;
    const portion = await findCookedPortionBySourceMealId(meal.leftoverSourceMealId);
    if (!portion || portion.servingsRemaining <= 0) continue;
    await eatLeftoverMeal(fresh);
    eaten += 1;
  }
  return eaten;
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
  if (meal.type === "leftover") {
    return createMealWithRules({
      input: {
        date: targetDate,
        mealSlotId: targetMealSlotId,
        type: "leftover",
        recipeId: meal.recipeId,
        freeformTitle: meal.freeformTitle,
        leftoverSourceMealId: meal.leftoverSourceMealId,
        servingsPlanned: meal.servingsPlanned,
        notes: meal.notes,
        assignedTo: meal.assignedTo
      }
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
