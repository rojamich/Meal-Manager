import { db } from "../db";
import { PlannedMeal } from "../../models";
import { newId } from "../../utils/id";

export async function listMealSlots() {
  return db.mealSlots.orderBy("sortOrder").toArray();
}

export async function listPlannedMeals(startDate: string, endDate: string) {
  const all = await db.plannedMeals.toArray();
  return all.filter((meal) => meal.date >= startDate && meal.date <= endDate);
}

export async function getPlannedMeal(id: string) {
  return db.plannedMeals.get(id);
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
  const all = await db.plannedMeals.toArray();
  const ids = all
    .filter((meal) => meal.date >= startDate && meal.date <= endDate)
    .map((meal) => meal.id);
  if (!ids.length) return;
  await db.plannedMeals.bulkDelete(ids);
}
