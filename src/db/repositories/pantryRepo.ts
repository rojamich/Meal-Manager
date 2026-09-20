import { db } from "../db";
import { PantryItem } from "../../models";
import { newId } from "../../utils/id";
import { compareNames } from "../../utils/sort";
import { alreadyKnownAs, findByNameOrAlias, itemMatchKey, normalizeItemName } from "../../utils/itemNames";

export async function listPantryItems() {
  // Sorted in memory rather than with orderBy("name"): the index is case-sensitive, so it
  // would list every capitalised item before every lowercase one.
  const items = await db.pantryItems.toArray();
  return items.sort((a, b) => compareNames(a.name, b.name));
}

export async function getPantryItem(id: string) {
  return db.pantryItems.get(id);
}

/** Existing item meaning the same thing as `name`, ignoring case, accents and plurals. */
export async function findMatchingPantryItem(name: string): Promise<PantryItem | undefined> {
  const key = itemMatchKey(name);
  if (!key) return undefined;
  const existing = await db.pantryItems.toArray();
  return existing.find((item) => itemMatchKey(item.name) === key);
}

/** Existing item matching `text` by its name or by one of its aliases. */
export async function findPantryItemByNameOrAlias(text: string): Promise<PantryItem | undefined> {
  return findByNameOrAlias(await db.pantryItems.toArray(), text);
}

/**
 * Teach an item another name for itself, so the next time a shop calls it that, the
 * price lands on the history you already have rather than starting a new one.
 */
export async function addPantryItemAlias(id: string, alias: string) {
  const name = normalizeItemName(alias);
  if (!name) return;
  const item = await db.pantryItems.get(id);
  if (!item || alreadyKnownAs(item, name)) return;
  await db.pantryItems.update(id, {
    aliases: [...(item.aliases ?? []), name],
    updatedAt: new Date().toISOString()
  });
}

export async function createPantryItem(input: Omit<PantryItem, "id" | "createdAt" | "updatedAt">) {
  const name = normalizeItemName(input.name);
  if (!name) throw new Error("Pantry item needs a name.");

  // Matches on meaning rather than exact text, so "Onions" no longer sits beside "onion".
  const clash = await findMatchingPantryItem(name);
  if (clash) {
    throw new Error(
      clash.name === name
        ? "Pantry item with that name already exists"
        : `"${clash.name}" is already in your pantry — use that instead of adding "${name}".`
    );
  }

  const now = new Date().toISOString();
  const item: PantryItem = {
    ...input,
    name,
    id: newId(),
    createdAt: now,
    updatedAt: now
  };
  await db.pantryItems.add(item);
  return item;
}

export async function updatePantryItem(id: string, changes: Partial<PantryItem>) {
  const now = new Date().toISOString();
  if (typeof changes.name === "string") {
    changes = { ...changes, name: normalizeItemName(changes.name) };
  }
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