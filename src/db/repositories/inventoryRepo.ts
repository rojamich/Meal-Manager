import { db } from "../db";
import { InventoryLot } from "../../models";
import { newId } from "../../utils/id";
import { addDays, parseISODate } from "../../utils/date";

export const INVENTORY_UPDATED_EVENT = "inventory-updated";

function emitInventoryUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(INVENTORY_UPDATED_EVENT));
}

export async function listInventoryLots(pantryItemId: string) {
  return db.inventoryLots.where("pantryItemId").equals(pantryItemId).toArray();
}

export async function listActiveLots(locationId?: string) {
  const all = await db.inventoryLots.toArray();
  return all.filter((lot) => !lot.archivedAt && (!locationId || lot.locationId === locationId));
}

export async function createInventoryLot(input: Omit<InventoryLot, "id" | "createdAt" | "updatedAt">) {
  const now = new Date().toISOString();
  const lot: InventoryLot = {
    ...input,
    id: newId(),
    createdAt: now,
    updatedAt: now
  };
  await db.inventoryLots.add(lot);
  emitInventoryUpdated();
  return lot;
}

export async function updateInventoryLot(id: string, changes: Partial<InventoryLot>) {
  const now = new Date().toISOString();
  await db.inventoryLots.update(id, { ...changes, updatedAt: now });
  emitInventoryUpdated();
}

export async function archiveInventoryLot(id: string) {
  const now = new Date().toISOString();
  await db.inventoryLots.update(id, { archivedAt: now, updatedAt: now });
  emitInventoryUpdated();
}

export async function emptyPantry(locationId?: string) {
  const now = new Date().toISOString();
  const all = await db.inventoryLots.toArray();
  const toArchive = all.filter((lot) => !lot.archivedAt && (!locationId || lot.locationId === locationId));
  await Promise.all(toArchive.map((lot) => db.inventoryLots.update(lot.id, { archivedAt: now, updatedAt: now })));
  emitInventoryUpdated();
}

export async function applyLotConsumption(
  consumptions: Array<{ lotId: string; qtyConsumed: number }>
) {
  const now = new Date().toISOString();
  await db.transaction("rw", db.inventoryLots, async () => {
    for (const { lotId, qtyConsumed } of consumptions) {
      if (!qtyConsumed || qtyConsumed <= 0) continue;
      const lot = await db.inventoryLots.get(lotId);
      if (!lot) continue;
      const nextQty = Math.max(lot.quantity - qtyConsumed, 0);
      const changes: Partial<InventoryLot> = { quantity: nextQty, updatedAt: now };
      if (nextQty <= 0) changes.archivedAt = now;
      await db.inventoryLots.update(lotId, changes);
    }
  });
  emitInventoryUpdated();
}

export async function usableInventory(pantryItemId: string, bufferDays: number, now: Date, locationId?: string) {
  const lots = await listActiveLots(locationId);
  const cutoff = addDays(now, bufferDays);
  return lots
    .filter((lot) => lot.pantryItemId === pantryItemId)
    .filter((lot) => {
      if (!lot.expiresAt) return true;
      return parseISODate(lot.expiresAt) >= cutoff;
    })
    .reduce((sum, lot) => sum + lot.quantity, 0);
}