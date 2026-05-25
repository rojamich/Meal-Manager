import { db } from "../db";
import { LocationProfile } from "../../models";
import { newId } from "../../utils/id";

export const LOCATIONS_UPDATED_EVENT = "locations-updated";

function emitLocationsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LOCATIONS_UPDATED_EVENT));
}

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
  emitLocationsUpdated();
  return item;
}

export async function updateLocation(id: string, changes: Partial<LocationProfile>) {
  const now = new Date().toISOString();
  await db.locationProfiles.update(id, { ...changes, updatedAt: now });
  emitLocationsUpdated();
}

export async function deleteLocation(id: string) {
  await db.locationProfiles.delete(id);
  emitLocationsUpdated();
}
