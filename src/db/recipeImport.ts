import { db } from "./db";
import { BaseUnit, PantryItem, Recipe, RecipeIngredient, StorageType } from "../models";
import { newId } from "../utils/id";
import { itemMatchKey, normalizeItemName } from "../utils/itemNames";

export interface ImportedIngredient {
  name: string;
  quantity: number;
  unit: BaseUnit;
  category?: string;
  storageType?: StorageType;
  prepNote?: string;
  altGroup?: string;
}

export interface ImportedRecipe {
  title: string;
  baseServings?: number;
  timeMinutes?: number;
  calories?: number;
  proteinGrams?: number;
  mealTypes?: string[];
  tags?: string[];
  notes?: string;
  steps?: string[];
  ingredients?: ImportedIngredient[];
}

export interface RecipeImportSummary {
  recipesAdded: string[];
  recipesSkipped: string[];
  itemsReused: Array<{ wanted: string; matched: string }>;
  itemsCreated: string[];
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Validate and describe the file before anything is written. */
export function parseRecipeImport(raw: unknown): ImportedRecipe[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("That file isn't a recipe pack.");
  }
  const recipes = asArray<ImportedRecipe>((raw as { recipes?: unknown }).recipes).filter(
    (recipe) => recipe && typeof recipe === "object" && typeof recipe.title === "string"
  );
  if (!recipes.length) {
    throw new Error("No recipes found in that file.");
  }
  return recipes;
}

/**
 * Add recipes without disturbing anything already saved.
 *
 * Unlike the full backup restore, this never clears a table. Ingredients are matched to
 * existing pantry items by meaning rather than exact text, so importing a recipe calling
 * for "Onions" reuses the "onion" already in the pantry instead of adding a near-duplicate
 * beside it. A recipe whose title already exists is skipped rather than duplicated.
 */
export async function importRecipes(recipes: ImportedRecipe[]): Promise<RecipeImportSummary> {
  const summary: RecipeImportSummary = {
    recipesAdded: [],
    recipesSkipped: [],
    itemsReused: [],
    itemsCreated: []
  };

  const now = new Date().toISOString();
  const existingItems = await db.pantryItems.toArray();
  const existingRecipes = await db.recipes.toArray();

  // Built once and kept current as we go, so two recipes in the same file sharing an
  // ingredient create it once rather than twice.
  const itemsByKey = new Map<string, PantryItem>();
  for (const item of existingItems) {
    const key = itemMatchKey(item.name);
    if (key && !itemsByKey.has(key)) itemsByKey.set(key, item);
  }
  const recipeKeys = new Set(existingRecipes.map((recipe) => itemMatchKey(recipe.title)));

  const newItems: PantryItem[] = [];
  const newRecipes: Recipe[] = [];
  const newIngredients: RecipeIngredient[] = [];

  for (const incoming of recipes) {
    const title = normalizeItemName(incoming.title);
    const titleKey = itemMatchKey(title);
    if (titleKey && recipeKeys.has(titleKey)) {
      summary.recipesSkipped.push(title);
      continue;
    }
    recipeKeys.add(titleKey);

    const servings = Math.max(Number(incoming.baseServings) || 2, 1);
    const recipe: Recipe = {
      id: newId(),
      title,
      baseServings: servings,
      defaultServings: servings,
      mealTypes: asArray<string>(incoming.mealTypes),
      tags: asArray<string>(incoming.tags),
      steps: asArray<string>(incoming.steps),
      notes: incoming.notes,
      timeMinutes: Number.isFinite(Number(incoming.timeMinutes))
        ? Number(incoming.timeMinutes)
        : undefined,
      calories: Number.isFinite(Number(incoming.calories)) ? Number(incoming.calories) : undefined,
      proteinGrams: Number.isFinite(Number(incoming.proteinGrams))
        ? Number(incoming.proteinGrams)
        : undefined,
      createdAt: now,
      updatedAt: now
    };
    newRecipes.push(recipe);
    summary.recipesAdded.push(title);

    for (const ing of asArray<ImportedIngredient>(incoming.ingredients)) {
      const wanted = normalizeItemName(ing.name || "");
      const key = itemMatchKey(wanted);
      if (!wanted || !key) continue;

      let item = itemsByKey.get(key);
      if (item) {
        if (item.name !== wanted) summary.itemsReused.push({ wanted, matched: item.name });
      } else {
        item = {
          id: newId(),
          name: wanted,
          category: ing.category || "other",
          storageType: ing.storageType || "pantry",
          baseUnit: ing.unit || "g",
          createdAt: now,
          updatedAt: now
        };
        itemsByKey.set(key, item);
        newItems.push(item);
        summary.itemsCreated.push(wanted);
      }

      newIngredients.push({
        id: newId(),
        recipeId: recipe.id,
        pantryItemId: item.id,
        quantity: Math.max(Number(ing.quantity) || 0, 0),
        prepNote: ing.prepNote,
        altGroup: ing.altGroup,
        createdAt: now,
        updatedAt: now
      });
    }
  }

  await db.transaction("rw", db.pantryItems, db.recipes, db.recipeIngredients, async () => {
    if (newItems.length) await db.pantryItems.bulkAdd(newItems);
    if (newRecipes.length) await db.recipes.bulkAdd(newRecipes);
    if (newIngredients.length) await db.recipeIngredients.bulkAdd(newIngredients);
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pantry-items-updated"));
    window.dispatchEvent(new CustomEvent("recipes-updated"));
    window.dispatchEvent(new CustomEvent("recipe-ingredients-updated"));
  }

  return summary;
}
