import { db } from "../db";
import { LocationProfile } from "../../models";
import { newId } from "../../utils/id";

export async function listLocations() {
  return db.locationProfiles.orderBy("name").toArray();
}

export async function createLocation(input: Omit<LocationProfile, "id" | "createdAt" | "updatedAt">) {
  const now = new Date().toISOString();
  const item: LocationProfile = {
    ...input,
    id: newId(),
    createdAt: now,
    updatedAt: now
  };
  await db.locationProfiles.add(item);
  return item;
}

export async function updateLocation(id: string, changes: Partial<LocationProfile>) {
  const now = new Date().toISOString();
  await db.locationProfiles.update(id, { ...changes, updatedAt: now });
}

export async function deleteLocation(id: string) {
  await db.locationProfiles.delete(id);
}