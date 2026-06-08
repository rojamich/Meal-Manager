// Lightweight unit conversion helpers for the grocery list.
// We only convert within the same physical kind: mass ↔ mass, volume ↔ volume.
// We intentionally do NOT convert mass ↔ volume because that requires per-substance
// density and is misleading without it (1 ml of water = 1 g but 1 ml of oil = ~0.91 g).

const GRAMS_PER_OUNCE = 28.3495;
const GRAMS_PER_POUND = 453.592;
const ML_PER_FL_OZ = 29.5735;
const ML_PER_US_CUP = 240;

export type UnitDisplayMode = "metric" | "metric-plus-imperial";

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 100) return String(Math.round(value));
  if (value >= 10) return roundTo(value, 1).toString();
  return roundTo(value, 2).toString();
}

/**
 * Imperial alternate for a grocery quantity, returned as a short human string.
 * Returns empty string when no useful conversion exists (e.g. unit is "count").
 */
export function imperialAlternate(qty: number, unit: string): string {
  if (!Number.isFinite(qty) || qty <= 0) return "";
  if (unit === "g") {
    if (qty >= GRAMS_PER_POUND) {
      const pounds = qty / GRAMS_PER_POUND;
      // Show lb + oz for amounts >= 1 lb
      const wholePounds = Math.floor(pounds);
      const remainderOz = (pounds - wholePounds) * 16;
      if (wholePounds >= 1 && remainderOz >= 0.5) {
        return `${wholePounds} lb ${roundTo(remainderOz, 0)} oz`;
      }
      return `${formatNumber(pounds)} lb`;
    }
    const ounces = qty / GRAMS_PER_OUNCE;
    return `${formatNumber(ounces)} oz`;
  }
  if (unit === "ml") {
    if (qty >= ML_PER_US_CUP) {
      const cups = qty / ML_PER_US_CUP;
      const flOz = qty / ML_PER_FL_OZ;
      return `${formatNumber(cups)} cup · ${formatNumber(flOz)} fl oz`;
    }
    const flOz = qty / ML_PER_FL_OZ;
    return `${formatNumber(flOz)} fl oz`;
  }
  return "";
}
