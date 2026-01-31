import { PurchaseEntry } from "../models";

export function unitPrice(entry: PurchaseEntry) {
  if (entry.quantity <= 0) return 0;
  return entry.totalPrice / entry.quantity;
}

export function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}