import { getLocal, setLocal } from "../../utils/storage";

const HOUSEHOLD_SIZE_KEY = "settings.householdSize";

export function getHouseholdSize() {
  const value = Number(getLocal<number>(HOUSEHOLD_SIZE_KEY, 2));
  if (!Number.isFinite(value)) return 2;
  return Math.max(Math.floor(value), 1);
}

export function setHouseholdSize(value: number) {
  setLocal(HOUSEHOLD_SIZE_KEY, Math.max(Math.floor(value), 1));
}

