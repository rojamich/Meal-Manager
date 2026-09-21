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

/** Whole days between two ISO day strings, ignoring time of day. */
function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`).getTime();
  const to = new Date(`${toISO}T00:00:00`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/**
 * Carry an old price forward at a stated annual inflation rate.
 *
 * Somewhere with mild inflation this barely moves a number and can be left off. Somewhere
 * like Buenos Aires it is the difference between a useful estimate and a fiction: a price
 * recorded in pesos six months ago is not what the same item costs today, and showing it
 * unchanged would quietly make every older ingredient look cheap.
 */
export function ageAdjust(
  price: number,
  fromISO: string,
  toISO: string,
  annualInflationPct?: number
): number {
  if (!annualInflationPct || !Number.isFinite(annualInflationPct) || annualInflationPct <= 0) {
    return price;
  }
  const days = daysBetween(fromISO, toISO);
  if (days <= 0) return price;
  return price * (1 + annualInflationPct / 100) ** (days / 365);
}

/**
 * What one base unit of a purchase cost in US dollars, using the rate frozen on it.
 *
 * Returns undefined rather than guessing when the purchase carries no rate — a dollar
 * figure invented from today's rate would misrepresent what was actually paid.
 */
export function usdOf(entry: PurchaseEntry): number | undefined {
  const rate = entry.exchangeRateToUSD;
  if (!rate || !Number.isFinite(rate) || rate <= 0) return undefined;
  const per = unitPrice(entry);
  return per > 0 ? per * rate : undefined;
}

export interface UnitPriceInfo {
  /** Price per base unit in the target currency, after any inflation adjustment. */
  price: number;
  /** The same price before adjustment, so the UI can show what was actually paid. */
  rawPrice: number;
  /** Date of the purchase behind this price; the most recent one when averaging. */
  asOf: string;
  /** Days between `asOf` and the date the price was asked for. */
  ageDays: number;
  currency?: string;
  /** How many purchases went into it. One means a single recent purchase. */
  sampleCount: number;
  /** Whether this came from the active location or from averaging across locations. */
  source: "location" | "average";
  inflationAdjusted: boolean;
  /**
   * The same price per base unit in US dollars, at the rate frozen on the purchase.
   *
   * Deliberately *not* inflation-adjusted, unlike `price`. In a high-inflation economy
   * the local price rising and the currency falling are largely the same event, so
   * carrying an old peso price forward and then converting it at the old rate would
   * count that once in each direction. The dollar figure is what the purchase actually
   * cost in dollars on the day, which is the number that stays comparable across
   * countries and years.
   *
   * Undefined when no exchange rate was recorded with the purchase.
   */
  priceUsd?: number;
}

export interface BestPriceOptions {
  locationId?: string;
  rates?: CurrencyRates;
  /** Day to price as of. Defaults to today. */
  asOfDate?: string;
  /** Annual inflation for the active location, used to carry old prices forward. */
  annualInflationPct?: number;
}

/**
 * Best-known price per base unit for a pantry item, with enough context to judge it.
 *
 * The most recent purchase at the given location wins; failing that, the average across
 * every purchase that can be expressed in the same currency. Prices are only ever
 * averaged within a single currency — without `rates`, purchases in other currencies are
 * skipped rather than folded in, because averaging 320 JPY with $2.10 produces a number
 * that means nothing.
 *
 * The age comes back with the price deliberately. A bare number gives a four-month-old
 * price and this morning's exactly the same authority, and the whole point of tracking
 * cost across places and times is knowing which one you are looking at.
 */
export function bestUnitPriceInfo(
  purchases: PurchaseEntry[],
  pantryItemId: string,
  options: BestPriceOptions = {}
): UnitPriceInfo | undefined {
  const { locationId, rates, annualInflationPct } = options;
  const asOfDate = options.asOfDate || new Date().toISOString().slice(0, 10);

  const itemPurchases = purchases.filter((p) => p.pantryItemId === pantryItemId);
  if (!itemPurchases.length) return undefined;

  const byDateDesc = (a: PurchaseEntry, b: PurchaseEntry) => b.date.localeCompare(a.date);
  const byLocation = locationId ? itemPurchases.filter((p) => p.locationId === locationId) : [];

  // Report in the active location's currency when known, else in whatever the most
  // relevant purchase used, so the fallback average has something to convert toward.
  const target =
    rates?.target ||
    normalizeCode([...byLocation].sort(byDateDesc)[0]?.currencyCode) ||
    normalizeCode([...itemPurchases].sort(byDateDesc)[0]?.currencyCode);

  const finish = (
    rawPrice: number,
    asOf: string,
    sampleCount: number,
    source: "location" | "average",
    priceUsd?: number
  ): UnitPriceInfo => {
    const adjusted = ageAdjust(rawPrice, asOf, asOfDate, annualInflationPct);
    return {
      price: adjusted,
      rawPrice,
      asOf,
      ageDays: Math.max(daysBetween(asOf, asOfDate), 0),
      currency: target || undefined,
      sampleCount,
      source,
      inflationAdjusted: adjusted !== rawPrice,
      priceUsd
    };
  };

  if (byLocation.length) {
    const last = [...byLocation].sort(byDateDesc)[0];
    const price = convertAmount(unitPrice(last), last.currencyCode, target, rates);
    if (price !== undefined && price > 0) return finish(price, last.date, 1, "location", usdOf(last));
  }

  const comparable = itemPurchases
    .map((p) => ({
      price: convertAmount(unitPrice(p), p.currencyCode, target, rates),
      usd: usdOf(p),
      date: p.date
    }))
    .filter((row) => row.price !== undefined && row.price > 0)
    .map((row) => ({ price: row.price as number, usd: row.usd, date: row.date }));

  if (!comparable.length) return undefined;

  const avg = average(comparable.map((row) => row.price));
  if (avg <= 0) return undefined;

  // Averaged over only the purchases that recorded a rate, so one unconverted trip does
  // not drag the dollar figure toward zero.
  const usdSamples = comparable
    .map((row) => row.usd)
    .filter((value): value is number => value !== undefined && value > 0);
  const avgUsd = usdSamples.length ? average(usdSamples) : undefined;

  // Date the average by its most recent contributor: that is the freshest evidence in it,
  // and dating it any older would overstate how stale the estimate is.
  const newest = comparable.reduce((a, b) => (b.date > a.date ? b : a)).date;
  return finish(avg, newest, comparable.length, "average", avgUsd);
}

/**
 * Price per base unit as a bare number, for callers that only need the figure.
 * Prefer `bestUnitPriceInfo` where the age or the source is worth showing.
 */
export function bestUnitPrice(
  purchases: PurchaseEntry[],
  pantryItemId: string,
  locationId?: string,
  rates?: CurrencyRates
): number | undefined {
  return bestUnitPriceInfo(purchases, pantryItemId, { locationId, rates })?.price;
}

/** How old a price is, phrased the way you would think about whether to trust it. */
export function formatPriceAge(ageDays: number): string {
  if (ageDays <= 0) return "today";
  if (ageDays === 1) return "yesterday";
  if (ageDays < 14) return `${ageDays}d old`;
  if (ageDays < 60) return `${Math.floor(ageDays / 7)}w old`;
  if (ageDays < 365) return `${Math.floor(ageDays / 30)}mo old`;
  const years = Math.floor(ageDays / 365);
  return years === 1 ? "1yr old" : `${years}yr old`;
}

/** Prices older than this are worth flagging rather than quietly presenting as current. */
export const STALE_PRICE_DAYS = 120;
