import { db } from "../db";
import { PurchaseEntry } from "../../models";
import { newId } from "../../utils/id";

export async function listPurchaseEntries() {
  return db.purchaseEntries.orderBy("date").reverse().toArray();
}

export async function listPurchasesForItem(pantryItemId: string) {
  return db.purchaseEntries.where("pantryItemId").equals(pantryItemId).toArray();
}

export async function createPurchaseEntry(input: Omit<PurchaseEntry, "id" | "createdAt" | "updatedAt">) {
  const now = new Date().toISOString();
  const entry: PurchaseEntry = {
    ...input,
    id: newId(),
    createdAt: now,
    updatedAt: now
  };
  await db.purchaseEntries.add(entry);
  return entry;
}

export async function updatePurchaseEntry(id: string, changes: Partial<PurchaseEntry>) {
  const now = new Date().toISOString();
  await db.purchaseEntries.update(id, { ...changes, updatedAt: now });
}

export async function deletePurchaseEntry(id: string) {
  await db.purchaseEntries.delete(id);
}