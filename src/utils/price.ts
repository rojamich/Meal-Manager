import { PurchaseEntry } from "../models";

export function unitPrice(entry: PurchaseEntry) {
  if (entry.quantity <= 0) return 0;
  return entry.totalPrice / entry.quantity;
}

export function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Best-known price per base unit for a pantry item: the most recent purchase
 * at the given location, else the average across all recorded purchases.
 * Returns undefined when there is no usable price history.
 */
export function bestUnitPrice(
  purchases: PurchaseEntry[],
  pantryItemId: string,
  locationId?: string
): number | undefined {
  const itemPurchases = purchases.filter((p) => p.pantryItemId === pantryItemId);
  if (!itemPurchases.length) return undefined;
  const byLocation = locationId
    ? itemPurchases.filter((p) => p.locationId === locationId)
    : [];
  if (byLocation.length) {
    const last = [...byLocation].sort((a, b) => b.date.localeCompare(a.date))[0];
    const price = unitPrice(last);
    if (price > 0) return price;
  }
  const avg = average(itemPurchases.map(unitPrice).filter((p) => p > 0));
  return avg > 0 ? avg : undefined;
}
