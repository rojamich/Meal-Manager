import { db } from "../db";
import { CookedPortion } from "../../models";
import { newId } from "../../utils/id";

export const COOKED_PORTIONS_UPDATED_EVENT = "cooked-portions-updated";

function emitCookedPortionsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COOKED_PORTIONS_UPDATED_EVENT));
}

export async function listActiveCookedPortions(locationId?: string) {
  const all = await db.cookedPortions.toArray();
  return all.filter(
    (portion) => !portion.archivedAt && (!locationId || portion.locationId === locationId)
  );
}

export async function createCookedPortion(input: Omit<CookedPortion, "id" | "createdAt" | "updatedAt">) {
  const now = new Date().toISOString();
  const portion: CookedPortion = {
    ...input,
    id: newId(),
    createdAt: now,
    updatedAt: now
  };
  await db.cookedPortions.add(portion);
  emitCookedPortionsUpdated();
  return portion;
}

export async function updateCookedPortion(id: string, changes: Partial<CookedPortion>) {
  const now = new Date().toISOString();
  await db.cookedPortions.update(id, { ...changes, updatedAt: now });
  emitCookedPortionsUpdated();
}

export async function findCookedPortionBySourceMealId(
  sourceMealId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {}
) {
  const matches = await db.cookedPortions
    .where("sourcePlannedMealId")
    .equals(sourceMealId)
    .toArray();
  const active = matches.find((portion) => !portion.archivedAt);
  if (active) return active;
  return includeArchived ? matches[0] : undefined;
}

export async function restoreCookedPortionServings(id: string, servings: number) {
  if (!servings || servings <= 0) return;
  const now = new Date().toISOString();
  await db.transaction("rw", db.cookedPortions, async () => {
    const portion = await db.cookedPortions.get(id);
    if (!portion) return;
    const nextRemaining = Math.min(portion.servingsRemaining + servings, portion.servingsTotal);
    await db.cookedPortions.update(id, {
      servingsRemaining: nextRemaining,
      archivedAt: undefined,
      updatedAt: now
    });
  });
  emitCookedPortionsUpdated();
}

export async function consumeCookedPortion(id: string, servings: number) {
  if (!servings || servings <= 0) return;
  const now = new Date().toISOString();
  await db.transaction("rw", db.cookedPortions, async () => {
    const portion = await db.cookedPortions.get(id);
    if (!portion) return;
    const nextRemaining = Math.max(portion.servingsRemaining - servings, 0);
    const changes: Partial<CookedPortion> = { servingsRemaining: nextRemaining, updatedAt: now };
    if (nextRemaining <= 0) changes.archivedAt = now;
    await db.cookedPortions.update(id, changes);
  });
  emitCookedPortionsUpdated();
}

export async function archiveCookedPortion(id: string) {
  const now = new Date().toISOString();
  await db.cookedPortions.update(id, { archivedAt: now, updatedAt: now });
  emitCookedPortionsUpdated();
}

export async function deleteCookedPortion(id: string) {
  await db.cookedPortions.delete(id);
  emitCookedPortionsUpdated();
}
