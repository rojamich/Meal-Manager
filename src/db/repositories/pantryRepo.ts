import { db } from "../db";
import { PantryItem } from "../../models";
import { newId } from "../../utils/id";

export async function listPantryItems() {
  return db.pantryItems.orderBy("name").toArray();
}

export async function getPantryItem(id: string) {
  return db.pantryItems.get(id);
}

export async function createPantryItem(input: Omit<PantryItem, "id" | "createdAt" | "updatedAt">) {
  const existing = await db.pantryItems.toArray();
  const nameLower = input.name.trim().toLowerCase();
  if (existing.some((item) => item.name.trim().toLowerCase() === nameLower)) {
    throw new Error("Pantry item with that name already exists");
  }
  const now = new Date().toISOString();
  const item: PantryItem = {
    ...input,
    id: newId(),
    createdAt: now,
    updatedAt: now
  };
  await db.pantryItems.add(item);
  return item;
}

export async function updatePantryItem(id: string, changes: Partial<PantryItem>) {
  const now = new Date().toISOString();
  await db.pantryItems.update(id, { ...changes, updatedAt: now });
}

export async function deletePantryItem(id: string) {
  await db.pantryItems.delete(id);
}