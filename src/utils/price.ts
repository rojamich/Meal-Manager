import { LocationProfile, PurchaseEntry } from "../models";

export function unitPrice(entry: PurchaseEntry) {
  if (entry.quantity <= 0) return 0;
  return entry.totalPrice / entry.quantity;
}

export function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Conversion table built from the location profiles.
 *
 * `LocationProfile.exchangeRateToUSD` is USD per one unit of that currency — the rate that
 * takes an amount *to* USD. For yen that is roughly 0.0067, not 150.
 */
export interface CurrencyRates {
  /** currencyCode → USD per 1 unit. */
  toUsd: Map<string, number>;
  /** Currency that prices should be reported in. */
  target?: string;
}

export function buildCurrencyRates(
  locations: LocationProfile[],
  activeLocationId?: string
): CurrencyRates {
  const toUsd = new Map<string, number>();
  for (const loc of locations) {
    const code = (loc.currencyCode || "").trim().toUpperCase();
    if (!code) continue;
    const rate = Number(loc.exchangeRateToUSD);
    if (Number.isFinite(rate) && rate > 0) toUsd.set(code, rate);
  }
  // USD is its own reference even when no location declares it.
  if (!toUsd.has("USD")) toUsd.set("USD", 1);

  const active = locations.find((loc) => loc.id === activeLocationId);
  const target = (active?.currencyCode || "").trim().toUpperCase() || undefined;
  return { toUsd, target };
}

function normalizeCode(code: string | undefined): string {
  return (code || "").trim().toUpperCase();
}

/**
 * Convert an amount between currencies. Returns undefined when the pair can't be
 * converted, so callers can leave the price out rather than mixing units.
 */
export function convertAmount(
  amount: number,
  from: string | undefined,
  to: string | undefined,
  rates?: CurrencyRates
): number | undefined {
  const fromCode = normalizeCode(from);
  const toCode = normalizeCode(to);
  if (!toCode || fromCode === toCode) return amount;
  if (!fromCode || !rates) return undefined;
  const fromRate = rates.toUsd.get(fromCode);
  const toRate = rates.toUsd.get(toCode);
  if (!fromRate || !toRate) return undefined;
  return (amount * fromRate) / toRate;
}

/**
 * Best-known price per base unit for a pantry item: the most recent purchase at the given
 * location, else the average across all purchases that can be expressed in the same
 * currency.
 *
 * Prices are only ever averaged within a single currency. Without `rates`, purchases in
 * other currencies are skipped rather than folded in — averaging 320 JPY with $2.10 used
 * to produce a number that meant nothing.
 *
 * Returns undefined when there is no usable price history.
 */
export function bestUnitPrice(
  purchases: PurchaseEntry[],
  pantryItemId: string,
  locationId?: string,
  rates?: CurrencyRates
): number | undefined {
  const itemPurchases = purchases.filter((p) => p.pantryItemId === pantryItemId);
  if (!itemPurchases.length) return undefined;

  const byDateDesc = (a: PurchaseEntry, b: PurchaseEntry) => b.date.localeCompare(a.date);
  const byLocation = locationId
    ? itemPurchases.filter((p) => p.locationId === locationId)
    : [];

  // Report in the active location's currency when known, else in whatever the most
  // relevant purchase used, so the fallback average has something to convert toward.
  const target =
    rates?.target ||
    normalizeCode([...byLocation].sort(byDateDesc)[0]?.currencyCode) ||
    normalizeCode([...itemPurchases].sort(byDateDesc)[0]?.currencyCode);

  if (byLocation.length) {
    const last = [...byLocation].sort(byDateDesc)[0];
    const price = convertAmount(unitPrice(last), last.currencyCode, target, rates);
    if (price !== undefined && price > 0) return price;
  }

  const comparable = itemPurchases
    .map((p) => convertAmount(unitPrice(p), p.currencyCode, target, rates))
    .filter((p): p is number => p !== undefined && p > 0);

  const avg = average(comparable);
  return avg > 0 ? avg : undefined;
}
