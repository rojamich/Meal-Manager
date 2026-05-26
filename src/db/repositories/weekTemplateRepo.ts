import { db } from "../db";
import { WeekTemplate } from "../../models";
import { newId } from "../../utils/id";
import { addDays, dateKey, parseISODate } from "../../utils/date";
import {
  buildFreeformMealInput,
  buildRecipeMealInput,
  createMealWithRules
} from "../../features/planner/plannerDomain";
import { getHouseholdSize } from "../../features/settings/preferences";

export async function listWeekTemplates() {
  const rows = await db.weekTemplates.orderBy("createdAt").reverse().toArray();
  return rows
    .map((row) => ({ ...row, schemaVersion: row.schemaVersion || 1 }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createWeekTemplate(
  input: Omit<WeekTemplate, "id" | "createdAt" | "schemaVersion">
) {
  const template: WeekTemplate = {
    ...input,
    id: newId(),
    schemaVersion: 1,
    createdAt: new Date().toISOString()
  };
  await db.weekTemplates.add(template);
  return template;
}

export async function deleteWeekTemplate(id: string) {
  await db.weekTemplates.delete(id);
}

export async function applyWeekTemplateToWeek(template: WeekTemplate, weekStart: string, weekEnd: string) {
  const existing = await db.plannedMeals.toArray();
  const idsToDelete = existing
    .filter((meal) => {
      const key = dateKey(meal.date);
      return key >= dateKey(weekStart) && key <= dateKey(weekEnd);
    })
    .map((meal) => meal.id);
  if (idsToDelete.length) await db.plannedMeals.bulkDelete(idsToDelete);

  const householdSize = getHouseholdSize();
  const weekStartDate = parseISODate(dateKey(weekStart));
  let contextMeals = (await db.plannedMeals.toArray()).filter(
    (meal) => meal.date < dateKey(weekStart) || meal.date > dateKey(weekEnd)
  );

  for (const day of template.days) {
    const targetDate = dateKey(addDays(weekStartDate, day.weekday));
    for (const meal of day.meals) {
      if (meal.type === "recipe" && meal.recipeId) {
        const result = await createMealWithRules({
          input: buildRecipeMealInput({
            date: targetDate,
            mealSlotId: meal.mealSlotId,
            recipeId: meal.recipeId,
            servingsPlanned: meal.servingsPlanned,
            householdSize,
            notes: meal.notes
          })
        });
        if (result.created) contextMeals = [...contextMeals, result.created];
        continue;
      }

      const title = meal.freeformTitle || "Freeform";
      const result = await createMealWithRules({
        input: buildFreeformMealInput({
          date: targetDate,
          mealSlotId: meal.mealSlotId,
          freeformTitle: title,
          notes: meal.notes
        })
      });
      if (result.created) contextMeals = [...contextMeals, result.created];
    }
  }
}
