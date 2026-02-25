import { db } from "../db";
import { Recipe, RecipeIngredient } from "../../models";
import { newId } from "../../utils/id";

function normalizeRecipe<T extends Partial<Recipe>>(recipe: T): T & Pick<Recipe, "baseServings" | "defaultServings"> {
  const servings = Math.max(Number(recipe.baseServings ?? recipe.defaultServings ?? 2), 1);
  return {
    ...recipe,
    baseServings: servings,
    defaultServings: servings
  } as T & Pick<Recipe, "baseServings" | "defaultServings">;
}

export async function listRecipes() {
  const recipes = await db.recipes.orderBy("title").toArray();
  return recipes.map((recipe) => normalizeRecipe(recipe));
}

export async function getRecipe(id: string) {
  const recipe = await db.recipes.get(id);
  return recipe ? normalizeRecipe(recipe) : undefined;
}

export async function listIngredients(recipeId: string) {
  return db.recipeIngredients.where("recipeId").equals(recipeId).toArray();
}

export async function listAllIngredients() {
  return db.recipeIngredients.toArray();
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
