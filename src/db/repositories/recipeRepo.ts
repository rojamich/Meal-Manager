import { db } from "../db";
import { Recipe, RecipeIngredient } from "../../models";
import { newId } from "../../utils/id";
import { compareNames } from "../../utils/sort";

/**
 * Order ingredients by the pantry item name they display, case-insensitively.
 *
 * The name lives on the pantry item rather than the ingredient row, so this has to join
 * before it can sort — which is why the table's own ordering could never do it.
 */
async function sortByItemName(ingredients: RecipeIngredient[]): Promise<RecipeIngredient[]> {
  if (ingredients.length < 2) return ingredients;
  const items = await db.pantryItems.bulkGet([...new Set(ingredients.map((i) => i.pantryItemId))]);
  const nameById = new Map<string, string>();
  for (const item of items) {
    if (item) nameById.set(item.id, item.name);
  }
  return [...ingredients].sort((a, b) => {
    const byName = compareNames(nameById.get(a.pantryItemId), nameById.get(b.pantryItemId));
    // Stable tiebreak so two items sharing a name keep a consistent order between reads.
    return byName !== 0 ? byName : a.id.localeCompare(b.id);
  });
}

function normalizeRecipe<T extends Partial<Recipe>>(recipe: T): T & Pick<Recipe, "baseServings" | "defaultServings"> {
  const servings = Math.max(Number(recipe.baseServings ?? recipe.defaultServings ?? 2), 1);
  return {
    ...recipe,
    baseServings: servings,
    defaultServings: servings
  } as T & Pick<Recipe, "baseServings" | "defaultServings">;
}

export async function listRecipes() {
  // Not orderBy("title") — that index sorts by code unit, so every capitalised title
  // would come before every lowercase one.
  const recipes = (await db.recipes.toArray()).sort((a, b) => compareNames(a.title, b.title));
  return recipes.map((recipe) => normalizeRecipe(recipe));
}

export async function getRecipe(id: string) {
  const recipe = await db.recipes.get(id);
  return recipe ? normalizeRecipe(recipe) : undefined;
}

export async function listIngredients(recipeId: string) {
  const ingredients = await db.recipeIngredients.where("recipeId").equals(recipeId).toArray();
  return sortByItemName(ingredients);
}

export async function listAllIngredients() {
  return sortByItemName(await db.recipeIngredients.toArray());
}

export async function createRecipe(input: Omit<Recipe, "id" | "createdAt" | "updatedAt">) {
  const now = new Date().toISOString();
  const recipe: Recipe = {
    ...normalizeRecipe(input),
    id: newId(),
    createdAt: now,
    updatedAt: now
  };
  await db.recipes.add(recipe);
  return recipe;
}

export async function updateRecipe(id: string, changes: Partial<Recipe>) {
  const now = new Date().toISOString();
  const normalizedChanges =
    "baseServings" in changes || "defaultServings" in changes ? normalizeRecipe(changes) : changes;
  await db.recipes.update(id, { ...normalizedChanges, updatedAt: now });
}

export async function duplicateRecipe(id: string) {
  const source = await getRecipe(id);
  if (!source) return undefined;
  const sourceIngredients = await listIngredients(id);
  const now = new Date().toISOString();
  const copy: Recipe = {
    ...source,
    id: newId(),
    title: `${source.title} (copy)`,
    createdAt: now,
    updatedAt: now
  };
  const copiedIngredients: RecipeIngredient[] = sourceIngredients.map((ing) => ({
    ...ing,
    id: newId(),
    recipeId: copy.id,
    createdAt: now,
    updatedAt: now
  }));
  await db.transaction("rw", db.recipes, db.recipeIngredients, async () => {
    await db.recipes.add(copy);
    if (copiedIngredients.length) await db.recipeIngredients.bulkAdd(copiedIngredients);
  });
  return copy;
}

export async function countRecipeReferences(id: string) {
  const plannedMealCount = await db.plannedMeals.where("recipeId").equals(id).count();
  const ingredientCount = await db.recipeIngredients.where("recipeId").equals(id).count();
  return { plannedMealCount, ingredientCount };
}

export async function deleteRecipe(id: string) {
  await db.recipeIngredients.where("recipeId").equals(id).delete();
  await db.recipes.delete(id);
}

export async function addIngredient(input: Omit<RecipeIngredient, "id" | "createdAt" | "updatedAt">) {
  const now = new Date().toISOString();
  const ingredient: RecipeIngredient = {
    ...input,
    id: newId(),
    createdAt: now,
    updatedAt: now
  };
  await db.recipeIngredients.add(ingredient);
  return ingredient;
}

export async function updateIngredient(id: string, changes: Partial<RecipeIngredient>) {
  const now = new Date().toISOString();
  await db.recipeIngredients.update(id, { ...changes, updatedAt: now });
}

export async function deleteIngredient(id: string) {
  await db.recipeIngredients.delete(id);
}
