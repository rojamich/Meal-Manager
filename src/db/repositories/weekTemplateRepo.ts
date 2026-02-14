import { db } from "../db";
import { WeekTemplate } from "../../models";
import { newId } from "../../utils/id";

export async function listWeekTemplates() {
  return db.weekTemplates.orderBy("createdAt").reverse().toArray();
}

export async function createWeekTemplate(
  input: Omit<WeekTemplate, "id" | "createdAt">
) {
  const template: WeekTemplate = {
    ...input,
    id: newId(),
    createdAt: new Date().toISOString()
  };
  await db.weekTemplates.add(template);
  return template;
}

export async function deleteWeekTemplate(id: string) {
  await db.weekTemplates.delete(id);
}
