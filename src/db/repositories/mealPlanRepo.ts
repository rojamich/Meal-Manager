import { db } from "../db";
import { PlannedMeal } from "../../models";
import { newId } from "../../utils/id";

export async function listMealSlots() {
  return db.mealSlots.orderBy("sortOrder").toArray();
}

export async function listPlannedMeals(startDate: string, endDate: string) {
  return db.plannedMeals.where("date").between(startDate, endDate, true, true).toArray();
}

export async function getPlannedMeal(id: string) {
  return db.plannedMeals.get(id);
}

export async function listPastUneatenLeftovers(beforeDate: string) {
  return db.plannedMeals
    .filter((meal) => meal.type === "leftover" && !meal.cookedAt && meal.date < beforeDate)
    .toArray();
}

export async function listLeftoverMealsForSources(sourceMealIds: string[]) {
  if (!sourceMealIds.length) return [];
  const ids = new Set(sourceMealIds);
  return db.plannedMeals
    .filter((meal) => !!meal.leftoverSourceMealId && ids.has(meal.leftoverSourceMealId))
    .toArray();
}

export async function createPlannedMeal(input: Omit<PlannedMeal, "id" | "createdAt" | "updatedAt">) {
  const now = new Date().toISOString();
  const meal: PlannedMeal = {
    ...input,
    id: newId(),
    createdAt: now,
    updatedAt: now
  };
  await db.plannedMeals.add(meal);
  return meal;
}

export async function updatePlannedMeal(id: string, changes: Partial<PlannedMeal>) {
  const now = new Date().toISOString();
  await db.plannedMeals.update(id, { ...changes, updatedAt: now });
}

export async function deletePlannedMeal(id: string) {
  await db.plannedMeals.delete(id);
}

export async function deletePlannedMealsInRange(startDate: string, endDate: string) {
  await db.plannedMeals.where("date").between(startDate, endDate, true, true).delete();
}
