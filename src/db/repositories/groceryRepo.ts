import { db } from "../db";
import { GroceryList, GroceryLine } from "../../models";
import { newId } from "../../utils/id";

export async function listGroceryLists() {
  try {
    return await db.groceryLists.orderBy("createdAt").reverse().toArray();
  } catch {
    const lists = await db.groceryLists.toArray();
    return lists.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }
}

export async function getGroceryList(id: string) {
  return db.groceryLists.get(id);
}

export async function listGroceryLines(groceryListId: string) {
  return db.groceryLines.where("groceryListId").equals(groceryListId).toArray();
}

export async function createGroceryList(input: Omit<GroceryList, "id" | "createdAt">) {
  const now = new Date().toISOString();
  const list: GroceryList = {
    ...input,
    id: newId(),
    createdAt: now
  };
  await db.groceryLists.add(list);
  return list;
}

export async function createGroceryLines(lines: Omit<GroceryLine, "id">[]) {
  const withIds = lines.map((line) => ({ ...line, id: newId() }));
  await db.groceryLines.bulkAdd(withIds);
  return withIds;
}

export async function replaceGroceryLines(groceryListId: string, lines: Omit<GroceryLine, "id">[]) {
  await db.groceryLines.where("groceryListId").equals(groceryListId).delete();
  const withIds = lines.map((line) => ({ ...line, id: newId(), groceryListId }));
  await db.groceryLines.bulkAdd(withIds);
  return withIds;
}

export async function updateGroceryList(id: string, changes: Partial<GroceryList>) {
  await db.groceryLists.update(id, changes);
}

export async function updateGroceryLine(id: string, changes: Partial<GroceryLine>) {
  await db.groceryLines.update(id, changes);
}

export async function deleteGroceryList(id: string) {
  await db.groceryLines.where("groceryListId").equals(id).delete();
  await db.groceryLists.delete(id);
}
