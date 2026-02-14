import { db } from "../db";
import { Recipe, RecipeIngredient } from "../../models";
import { newId } from "../../utils/id";

export async function listRecipes() {
  return db.recipes.orderBy("title").toArray();
}

export async function getRecipe(id: string) {
  return db.recipes.get(id);
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
    ...input,
    id: newId(),
    createdAt: now,
    updatedAt: now
  };
  await db.recipes.add(recipe);
  return recipe;
}

export async function updateRecipe(id: string, changes: Partial<Recipe>) {
  const now = new Date().toISOString();
  await db.recipes.update(id, { ...changes, updatedAt: now });
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
