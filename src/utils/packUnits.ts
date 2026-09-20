import { BaseUnit, PackUnit } from "../models";

/**
 * Turning what a receipt prints into what the database stores.
 *
 * `unitConversion.ts` goes the other way — base units out to a readable "1 lb 4 oz" for
 * display. This module is the input direction: a receipt says "400 GRS", "1 KGM",
 * "750 CC", "1,5 LTR" or "0.744 kg", and the pantry item stores grams or millilitres.
 * Without this, recording a price means doing the conversion in your head thirty times
 * per trip, which is the kind of chore that gets abandoned in a fortnight.
 *
 * Mass and volume are deliberately kept apart, matching `unitConversion.ts`: converting
 * between them needs a per-substance density, and guessing one silently corrupts a price.
 */

export type UnitKind = "mass" | "volume" | "count";

/** Factor to the base unit of each kind: grams for mass, millilitres for volume. */
const PACK_UNITS: Record<PackUnit, { kind: UnitKind; factor: number }> = {
  count: { kind: "count", factor: 1 },
  mg: { kind: "mass", factor: 0.001 },
  g: { kind: "mass", factor: 1 },
  kg: { kind: "mass", factor: 1000 },
  oz: { kind: "mass", factor: 28.3495 },
  lb: { kind: "mass", factor: 453.592 },
  ml: { kind: "volume", factor: 1 },
  cl: { kind: "volume", factor: 10 },
  l: { kind: "volume", factor: 1000 },
  floz: { kind: "volume", factor: 29.5735 },
  cup: { kind: "volume", factor: 240 }
};

export const PACK_UNIT_OPTIONS: { value: PackUnit; label: string }[] = [
  { value: "count", label: "count / units" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "mg", label: "mg" },
  { value: "oz", label: "oz" },
  { value: "lb", label: "lb" },
  { value: "ml", label: "ml" },
  { value: "cl", label: "cl" },
  { value: "l", label: "L" },
  { value: "floz", label: "fl oz" },
  { value: "cup", label: "cup" }
];

export function packUnitKind(unit: PackUnit): UnitKind {
  return PACK_UNITS[unit].kind;
}

export function baseUnitKind(unit: BaseUnit): UnitKind {
  if (unit === "g") return "mass";
  if (unit === "ml") return "volume";
  return "count";
}

/**
 * Spanish and English unit words as they appear on receipts.
 *
 * Argentine receipts write grams as GRS, GRM or GR, kilos as KG or KGM, and millilitres
 * as CC — "750 CC" for a wine bottle. Typing the unit the way the receipt prints it
 * should just work, so all the spellings map to one canonical unit.
 */
const UNIT_WORDS: Record<string, PackUnit> = {
  mg: "mg",
  g: "g",
  gr: "g",
  grs: "g",
  grm: "g",
  gra: "g",
  gram: "g",
  grams: "g",
  gramo: "g",
  gramos: "g",
  kg: "kg",
  kgm: "kg",
  kgs: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogramo: "kg",
  oz: "oz",
  onz: "oz",
  lb: "lb",
  lbs: "lb",
  libra: "lb",
  libras: "lb",
  ml: "ml",
  mls: "ml",
  cc: "ml",
  cm3: "ml",
  cl: "cl",
  l: "l",
  lt: "l",
  lts: "l",
  ltr: "l",
  litro: "l",
  litros: "l",
  liter: "l",
  litre: "l",
  floz: "floz",
  cup: "cup",
  cups: "cup",
  taza: "cup",
  u: "count",
  un: "count",
  uni: "count",
  unid: "count",
  unids: "count",
  unidad: "count",
  unidades: "count",
  uds: "count",
  ud: "count",
  unit: "count",
  units: "count",
  pcs: "count",
  ct: "count"
};

/**
 * Packaging words that carry no measurement. "SOBRE X 50 GRS" is a sachet holding 50 g:
 * the sachet is not the unit. Kept so these are never mistaken for a unit on input.
 */
export const CONTAINER_WORDS = new Set([
  "sobre",
  "bolsa",
  "bol",
  "bsa",
  "botella",
  "bot",
  "maple",
  "caja",
  "cja",
  "paq",
  "paquete",
  "pack",
  "pak",
  "pot",
  "lata",
  "lat",
  "frasco",
  "atado",
  "bandeja",
  "sachet",
  "pote",
  "tetra",
  "doypack"
]);

/** Parse a unit word as printed on a receipt. Returns undefined when it is not a unit. */
export function parsePackUnit(raw: string): PackUnit | undefined {
  const key = (raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!key) return undefined;
  return UNIT_WORDS[key];
}

/**
 * Quantity in base units for a purchase, or undefined when the pack cannot be expressed
 * in the item's base unit (a litre of something measured in grams).
 *
 * `packUnit` may be omitted, which means a bare number was given — a receipt line like
 * "tomate triturado botella x 970" never says whether that is grams or millilitres. In
 * that case the number is read in whatever the pantry item uses, which is the only
 * available interpretation and the one the shop intended.
 */
export function toBaseUnits({
  packCount = 1,
  packSize,
  packUnit,
  baseUnit
}: {
  packCount?: number;
  packSize: number;
  packUnit?: PackUnit;
  baseUnit: BaseUnit;
}): number | undefined {
  if (!Number.isFinite(packSize) || packSize <= 0) return undefined;
  const count = Number.isFinite(packCount) && packCount > 0 ? packCount : 1;

  if (!packUnit) return count * packSize;

  const pack = PACK_UNITS[packUnit];
  if (!pack) return undefined;

  const target = baseUnitKind(baseUnit);
  if (pack.kind !== target) return undefined;

  return count * packSize * pack.factor;
}

/**
 * Whether a pack unit can express a quantity of an item measured in `baseUnit`.
 * Used to grey out impossible choices rather than let a wrong number through.
 */
export function packUnitFitsBaseUnit(packUnit: PackUnit, baseUnit: BaseUnit): boolean {
  return packUnitKind(packUnit) === baseUnitKind(baseUnit);
}

/** Pack units that make sense for an item, for building a dropdown. */
export function packUnitsForBaseUnit(baseUnit: BaseUnit): PackUnit[] {
  return PACK_UNIT_OPTIONS.map((o) => o.value).filter((u) => packUnitFitsBaseUnit(u, baseUnit));
}

/** The pack unit to offer first for an item: the one its base unit is already in. */
export function defaultPackUnit(baseUnit: BaseUnit): PackUnit {
  if (baseUnit === "g") return "g";
  if (baseUnit === "ml") return "ml";
  return "count";
}
