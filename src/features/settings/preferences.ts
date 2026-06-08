import { getLocal, setLocal } from "../../utils/storage";
import type { UnitDisplayMode } from "../../utils/unitConversion";

const HOUSEHOLD_SIZE_KEY = "settings.householdSize";
const UNIT_DISPLAY_MODE_KEY = "settings.unitDisplayMode";

export function getHouseholdSize() {
  const value = Number(getLocal<number>(HOUSEHOLD_SIZE_KEY, 2));
  if (!Number.isFinite(value)) return 2;
  return Math.max(Math.floor(value), 1);
}

export function setHouseholdSize(value: number) {
  setLocal(HOUSEHOLD_SIZE_KEY, Math.max(Math.floor(value), 1));
}

export function getUnitDisplayMode(): UnitDisplayMode {
  const raw = getLocal<UnitDisplayMode>(UNIT_DISPLAY_MODE_KEY, "metric-plus-imperial");
  return raw === "metric" ? "metric" : "metric-plus-imperial";
}

export function setUnitDisplayMode(mode: UnitDisplayMode) {
  setLocal(UNIT_DISPLAY_MODE_KEY, mode);
}

