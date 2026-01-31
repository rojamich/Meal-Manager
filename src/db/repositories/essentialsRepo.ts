import { db } from "../db";
import { EssentialItem } from "../../models";
import { newId } from "../../utils/id";

export async function listEssentialItems() {
  return db.essentialItems.toArray();
}

export async function createEssentialItem(input: Omit<EssentialItem, "id" | "createdAt" | "updatedAt">) {
  const now = new Date().toISOString();
  const item: EssentialItem = {
    ...input,
    id: newId(),
    createdAt: now,
    updatedAt: now
  };
  await db.essentialItems.add(item);
  return item;
}

export async function updateEssentialItem(id: string, changes: Partial<EssentialItem>) {
  const now = new Date().toISOString();
  await db.essentialItems.update(id, { ...changes, updatedAt: now });
}

export async function deleteEssentialItem(id: string) {
  await db.essentialItems.delete(id);
}