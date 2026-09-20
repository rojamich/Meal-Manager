import { useCallback, useEffect, useMemo, useState } from "react";
import { PantryItem, PurchaseEntry, Receipt } from "../../models";
import { deleteReceipt, listReceipts, reconcile } from "../../db/repositories/receiptRepo";
import { listPurchaseEntries } from "../../db/repositories/purchaseRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { useConfirmChoiceModal } from "../../components/useConfirmChoiceModal";
import { useToast } from "../../components/useToast";
import { formatDateLabel } from "../../utils/date";

/**
 * The shopping trips you have entered, and a way to undo one.
 *
 * A trip is the unit you actually make mistakes in — a mistyped price, a line entered
 * twice, the wrong currency picked at the top — and the unit you can still check against
 * a paper receipt weeks later. Without this the only way back was deleting twenty
 * individual prices one at a time, which also left the trip itself behind as a row
 * nothing pointed at.
 */

interface TripRow {
  receipt: Receipt;
  lines: PurchaseEntry[];
  linesTotal: number;
}

export default function ReceiptsSection({ embedded = false }: { embedded?: boolean } = {}) {
  const { requestChoice, modal } = useConfirmChoiceModal();
  const { notify, toast } = useToast();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [receiptRows, purchaseRows, items] = await Promise.all([
      listReceipts(),
      listPurchaseEntries(),
      listPantryItems()
    ]);
    setReceipts([...receiptRows]);
    setPurchases([...purchaseRows]);
    setPantryItems([...items]);
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => void refresh();
    window.addEventListener("receipts-updated", handler);
    window.addEventListener("purchases-updated", handler);
    return () => {
      window.removeEventListener("receipts-updated", handler);
      window.removeEventListener("purchases-updated", handler);
    };
  }, [refresh]);

  const itemName = useCallback(
    (id: string) => pantryItems.find((item) => item.id === id)?.name ?? "Unknown item",
    [pantryItems]
  );

  const trips = useMemo<TripRow[]>(() => {
    const byReceipt = new Map<string, PurchaseEntry[]>();
    for (const entry of purchases) {
      if (!entry.receiptId) continue;
      byReceipt.set(entry.receiptId, [...(byReceipt.get(entry.receiptId) ?? []), entry]);
    }
    return receipts.map((receipt) => {
      const lines = byReceipt.get(receipt.id) ?? [];
      return {
        receipt,
        lines,
        linesTotal: lines.reduce((sum, line) => sum + line.totalPrice, 0)
      };
    });
  }, [purchases, receipts]);

  /** Prices recorded outside a trip, e.g. typed straight into the price list. */
  const looseCount = useMemo(
    () => purchases.filter((entry) => !entry.receiptId).length,
    [purchases]
  );

  async function remove(trip: TripRow) {
    const label = [trip.receipt.store, formatDateLabel(trip.receipt.date)]
      .filter(Boolean)
      .join(" · ");
    const choice = await requestChoice({
      title: "Delete this shopping trip?",
      message: `${label} — ${trip.lines.length} price${trip.lines.length === 1 ? "" : "s"} will be removed.`,
      detail:
        "The prices recorded on this trip disappear with it, so any meal cost relying on them falls back to an older purchase or to nothing. Pantry stock added at the time is left alone.",
      choices: [{ label: "Delete trip", value: "delete", tone: "danger" }]
    });
    if (choice !== "delete") return;
    await deleteReceipt(trip.receipt.id);
    notify("Trip deleted", "success");
    await refresh();
  }

  const body = (
    <>
      {!embedded && <h3>Shopping trips</h3>}
      {trips.length === 0 ? (
        <p className="muted">
          No trips recorded yet. Adding one above, or ticking items off a grocery list, will
          put it here.
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Store</th>
              <th>Lines</th>
              <th>Total entered</th>
              <th>Receipt said</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {trips.map((trip) => {
              const check = reconcile(trip.receipt.total, trip.linesTotal);
              const isOpen = expanded === trip.receipt.id;
              return (
                <tr key={trip.receipt.id}>
                  <td data-label="Date">{formatDateLabel(trip.receipt.date)}</td>
                  <td data-label="Store">{trip.receipt.store || "—"}</td>
                  <td data-label="Lines">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setExpanded(isOpen ? null : trip.receipt.id)}
                    >
                      {trip.lines.length} {isOpen ? "▲" : "▼"}
                    </button>
                    {isOpen && (
                      <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 12 }}>
                        {trip.lines.map((line) => (
                          <li key={line.id}>
                            {itemName(line.pantryItemId)} — {line.quantity}
                            {line.packSize
                              ? ` (${line.packCount ?? 1} × ${line.packSize}${line.packUnit ?? ""})`
                              : ""}{" "}
                            · {line.totalPrice.toFixed(2)}
                            {line.discount ? (
                              <span className="muted"> · {line.discount.toFixed(2)} off</span>
                            ) : null}
                          </li>
                        ))}
                        {trip.lines.length === 0 && (
                          <li className="muted">
                            No prices left on this trip — safe to delete.
                          </li>
                        )}
                      </ul>
                    )}
                  </td>
                  <td data-label="Total entered">
                    {trip.linesTotal.toFixed(2)} {trip.receipt.currencyCode}
                  </td>
                  <td data-label="Receipt said">
                    {check.known ? (
                      <>
                        {check.printedTotal.toFixed(2)}
                        {!check.matches && (
                          <span className="muted" style={{ fontSize: 11 }}>
                            {" "}
                            · off by {check.difference > 0 ? "+" : ""}
                            {check.difference.toFixed(2)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td data-label="Actions">
                    <button type="button" className="danger" onClick={() => remove(trip)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {looseCount > 0 && (
        <p className="muted" style={{ fontSize: 12 }}>
          {looseCount} price{looseCount === 1 ? " was" : "s were"} recorded outside a trip and
          so cannot be undone here. They are listed individually under “All recorded prices”.
        </p>
      )}
      {modal}
      {toast}
    </>
  );

  return embedded ? <div>{body}</div> : <div className="panel">{body}</div>;
}
