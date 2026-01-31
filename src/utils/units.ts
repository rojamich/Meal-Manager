import { BaseUnit } from "../models";

export function unitLabel(unit: BaseUnit) {
  if (unit === "count") return "count";
  if (unit === "g") return "g";
  return "ml";
}