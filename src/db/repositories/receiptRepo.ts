import { db } from "../db";
import { BaseUnit, PackUnit, PurchaseEntry, Receipt } from "../../models";
import { newId } from "../../utils/id";
import { emitDomainEvent } from "../domainEvents";
import { toBaseUnits } from "../../utils/packUnits";

export const RECEIPTS_UPDATED_EVENT = "receipts-updated";
export const PURCHASES_UPDATED_EVENT = "purchases-updated";

export async function listReceipts() {
  const rows = await db.receipts.toArray();
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getReceipt(id: string) {
  return db.receipts.get(id);
}

export async function listPurchasesForReceipt(receiptId: string) {
  return db.purchaseEntries.where("receiptId").equals(receiptId).toArray();
}

/**
 * One line as the person entering a shopping trip sees it, before it becomes a
 * `PurchaseEntry`. Quantity is given the way the packet states it — "2 packs of 400 g",
 * "0.744 kg" — and converted here rather than in anyone's head.
 */
export interface ReceiptLineInput {
  pantryItemId: string;
  /** Needed to convert the pack into the units the item is stored in. */
  baseUnit: BaseUnit;
  packCount?: number;
  packSize: number;
  packUnit?: PackUnit;
  /** Price as printed, before any discount. */
  grossPrice: number;
  /** Discount on this line, as a positive number. */
  discount?: number;
  /**
   * Whether `packSize` is the size the thing is *sold in*, worth remembering on the
   * pantry item so recipes can be charged whole packets.
   *
   * Off unless the caller knows. Capturing a price from the grocery list passes the
   * quantity the recipe needed, which is emphatically not a pack size — learning 200 g
   * as "the size passata comes in" would quietly corrupt every cost that uses it.
   */
  learnPackSize?: boolean;
}

export interface ReceiptInput {
  store?: string;
  locationId?: string;
  currencyCode: string;
  date: string;
  /** The total printed on the paper, kept so the lines can be checked against it. */
  total?: number;
  subtotal?: number;
  notes?: string;
  /**
   * USD per 1 unit of `currencyCode` on this date, stamped onto every line. Frozen at
   * entry so editing a location's rate later never silently reprices past trips.
   */
  exchangeRateToUSD?: number;
}

export interface SaveReceiptResult {
  receipt: Receipt;
  entries: PurchaseEntry[];
  /** Lines whose pack could not be expressed in the item's base unit, so were skipped. */
  skipped: ReceiptLineInput[];
}

/**
 * Write a shopping trip and its price history together.
 *
 * Done in one transaction on purpose: a half-written trip is worse than none, because
 * the lines that did land would quietly drag every meal cost that uses them toward a
 * number nobody can reconcile against the paper.
 */
export async function saveReceipt(
  input: ReceiptInput,
  lines: ReceiptLineInput[]
): Promise<SaveReceiptResult> {
  const now = new Date().toISOString();
  const receipt: Receipt = {
    ...input,
    id: newId(),
    createdAt: now,
    updatedAt: now
  };

  const entries: PurchaseEntry[] = [];
  const skipped: ReceiptLineInput[] = [];

  for (const line of lines) {
    const quantity = toBaseUnits({
      packCount: line.packCount,
      packSize: line.packSize,
      packUnit: line.packUnit,
      baseUnit: line.baseUnit
    });
    // A litre of something measured in grams has no honest conversion, so the line is
    // reported back rather than stored at a guessed quantity.
    if (quantity === undefined || quantity <= 0) {
      skipped.push(line);
      continue;
    }
    const discount = Math.max(line.discount ?? 0, 0);
    entries.push({
      id: newId(),
      pantryItemId: line.pantryItemId,
      quantity,
      totalPrice: Math.max(line.grossPrice - discount, 0),
      grossPrice: line.grossPrice,
      discount,
      packCount: line.packCount,
      packSize: line.packSize,
      packUnit: line.packUnit,
      currencyCode: input.currencyCode,
      locationId: input.locationId,
      store: input.store,
      date: input.date,
      receiptId: receipt.id,
      exchangeRateToUSD: input.exchangeRateToUSD,
      createdAt: now,
      updatedAt: now
    });
  }

  await db.transaction("rw", [db.receipts, db.purchaseEntries], async () => {
    await db.receipts.add(receipt);
    if (entries.length) await db.purchaseEntries.bulkAdd(entries);
  });

  await learnPackSizes(lines);

  emitDomainEvent(RECEIPTS_UPDATED_EVENT, PURCHASES_UPDATED_EVENT);
  return { receipt, entries, skipped };
}

/**
 * Record the size an item is sold in, the first time a trip states one.
 *
 * Only ever fills a blank. Overwriting would mean the last tin you happened to buy
 * silently redefined the cost of every recipe using it, and a one-off larger jar should
 * not do that. Correcting it is a deliberate edit on the pantry item.
 */
async function learnPackSizes(lines: ReceiptLineInput[]) {
  const candidates = lines.filter((line) => line.learnPackSize && line.packSize > 0);
  if (!candidates.length) return;
  const now = new Date().toISOString();
  await Promise.all(
    candidates.map(async (line) => {
      const item = await db.pantryItems.get(line.pantryItemId);
      if (!item || item.packSize) return;
      await db.pantryItems.update(line.pantryItemId, {
        packSize: line.packSize,
        packUnit: line.packUnit,
        updatedAt: now
      });
    })
  );
  emitDomainEvent("pantry-items-updated");
}

export async function updateReceipt(id: string, changes: Partial<Receipt>) {
  await db.receipts.update(id, { ...changes, updatedAt: new Date().toISOString() });
  emitDomainEvent(RECEIPTS_UPDATED_EVENT);
}

/** Deletes a trip together with its lines, so no price outlives the trip it came from. */
export async function deleteReceipt(id: string) {
  await db.transaction("rw", [db.receipts, db.purchaseEntries], async () => {
    await db.purchaseEntries.where("receiptId").equals(id).delete();
    await db.receipts.delete(id);
  });
  emitDomainEvent(RECEIPTS_UPDATED_EVENT, PURCHASES_UPDATED_EVENT);
}

/**
 * How far the entered lines are from the total printed on the paper.
 *
 * This is the one check that catches a mistyped price or a forgotten line. Without it,
 * a trip entered by hand is a set of numbers with nothing to test them against.
 */
export function reconcile(printedTotal: number | undefined, lineNetTotal: number) {
  if (printedTotal === undefined || !Number.isFinite(printedTotal) || printedTotal <= 0) {
    return { known: false as const };
  }
  const difference = lineNetTotal - printedTotal;
  return {
    known: true as const,
    printedTotal,
    lineNetTotal,
    difference,
    /** Rounding on a long receipt is normal; a real mistake is bigger than this. */
    matches: Math.abs(difference) <= Math.max(printedTotal * 0.005, 1)
  };
}
