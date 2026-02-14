import { db } from "../db";
import { PlannedMeal, WeekTemplate } from "../../models";
import { newId } from "../../utils/id";
import { addDays, dateKey, parseISODate } from "../../utils/date";

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
  await db.transaction("rw", [db.plannedMeals], async () => {
    const existing = await db.plannedMeals.toArray();
    const idsToDelete = existing
      .filter((meal) => {
        const key = dateKey(meal.date);
        return key >= dateKey(weekStart) && key <= dateKey(weekEnd);
      })
      .map((meal) => meal.id);
    if (idsToDelete.length) await db.plannedMeals.bulkDelete(idsToDelete);

    const weekStartDate = parseISODate(dateKey(weekStart));
    const now = new Date().toISOString();
    const inserts: PlannedMeal[] = [];
    template.days.forEach((day) => {
      const targetDate = dateKey(addDays(weekStartDate, day.weekday));
      day.meals.forEach((meal) => {
        inserts.push({
          ...meal,
          id: newId(),
          date: targetDate,
          createdAt: now,
          updatedAt: now
        });
      });
    });
    if (inserts.length) await db.plannedMeals.bulkAdd(inserts);
  });
}
