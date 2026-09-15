import { db } from "../db";
import { PantryItem } from "../../models";
import { newId } from "../../utils/id";
import { compareNames } from "../../utils/sort";

export async function listPantryItems() {
  // Sorted in memory rather than with orderBy("name"): the index is case-sensitive, so it
  // would list every capitalised item before every lowercase one.
  const items = await db.pantryItems.toArray();
  return items.sort((a, b) => compareNames(a.name, b.name));
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

export async function countPantryItemReferences(id: string) {
  const [ingredientCount, lotCount, essentialCount, purchaseCount] = await Promise.all([
    db.recipeIngredients.where("pantryItemId").equals(id).count(),
    db.inventoryLots.where("pantryItemId").equals(id).count(),
    db.essentialItems.where("pantryItemId").equals(id).count(),
    db.purchaseEntries.where("pantryItemId").equals(id).count()
  ]);
  return { ingredientCount, lotCount, essentialCount, purchaseCount };
}

export async function deletePantryItem(id: string) {
  await db.pantryItems.delete(id);
}