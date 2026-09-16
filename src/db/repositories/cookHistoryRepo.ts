import { db } from "../db";

/**
 * When each recipe was last actually cooked, as `recipeId → ISO timestamp`.
 *
 * Two sources, because neither is complete on its own:
 *
 * - `plannedMeals.cookedAt` is the durable record, but it is also set when a *leftover*
 *   meal is eaten (see eatLeftoverMeal). Eating Thursday's leftovers is not cooking, so
 *   leftover meals are excluded or every recipe would look freshly made.
 * - `cookedPortions` is written exactly when something is cooked, but portions can be
 *   deleted outright, so old history disappears from it.
 *
 * Taking the latest across both survives either one being pruned.
 */
export async function getLastCookedByRecipe(): Promise<Map<string, string>> {
  const [meals, portions] = await Promise.all([
    db.plannedMeals.toArray(),
    db.cookedPortions.toArray()
  ]);

  const lastCooked = new Map<string, string>();
  const record = (recipeId: string | undefined, cookedAt: string | undefined) => {
    if (!recipeId || !cookedAt) return;
    const current = lastCooked.get(recipeId);
    // ISO timestamps compare correctly as strings.
    if (!current || cookedAt > current) lastCooked.set(recipeId, cookedAt);
  };

  for (const meal of meals) {
    if (meal.type === "leftover") continue;
    record(meal.recipeId, meal.cookedAt);
  }
  // Archived portions count — archived just means the leftovers got eaten up.
  for (const portion of portions) {
    record(portion.recipeId, portion.cookedAt);
  }

  return lastCooked;
}
