import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { PantryItem, PurchaseEntry, Receipt } from "../../models";
import { deleteReceipt, listReceipts, reconcile } from "../../db/repositories/receiptRepo";
import { listPurchaseEntries } from "../../db/repositories/purchaseRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { useConfirmChoiceModal } from "../../components/useConfirmChoiceModal";
import { useToast } from "../../components/useToast";
import { formatDateLabel } from "../../utils/date";
import { formatMoney, formatUsd, unitPrice, usdOf } from "../../utils/price";
import { LocationProfile } from "../../models";
import { listLocations } from "../../db/repositories/locationRepo";

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
  /**
   * The trip in dollars, at the rates frozen on its own lines.
   *
   * Summed per line rather than taken from the trip, because the rate is recorded
   * against each purchase — and left undefined unless every line carries one, so a
   * partial total never passes for the whole shop.
   */
  linesTotalUsd?: number;
  /** The rate snapshot for this trip, from the receipt or from the lines it holds. */
  rate?: number;
}

export default function ReceiptsSection({ embedded = false }: { embedded?: boolean } = {}) {
  const { requestChoice, modal } = useConfirmChoiceModal();
  const { notify, toast } = useToast();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [locations, setLocations] = useState<LocationProfile[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [receiptRows, purchaseRows, items, locationRows] = await Promise.all([
      listReceipts(),
      listPurchaseEntries(),
      listPantryItems(),
      listLocations()
    ]);
    setReceipts([...receiptRows]);
    setPurchases([...purchaseRows]);
    setPantryItems([...items]);
    setLocations([...locationRows]);
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
  const itemUnit = useCallback(
    (id: string) => pantryItems.find((item) => item.id === id)?.baseUnit ?? "",
    [pantryItems]
  );
  const locationName = useCallback(
    (id?: string) => (id ? locations.find((loc) => loc.id === id)?.name : undefined),
    [locations]
  );

  const trips = useMemo<TripRow[]>(() => {
    const byReceipt = new Map<string, PurchaseEntry[]>();
    for (const entry of purchases) {
      if (!entry.receiptId) continue;
      byReceipt.set(entry.receiptId, [...(byReceipt.get(entry.receiptId) ?? []), entry]);
    }
    return receipts.map((receipt) => {
      const lines = byReceipt.get(receipt.id) ?? [];
      const allConvertible = lines.length > 0 && lines.every((line) => line.exchangeRateToUSD);
      return {
        receipt,
        lines,
        linesTotal: lines.reduce((sum, line) => sum + line.totalPrice, 0),
        linesTotalUsd: allConvertible
          ? lines.reduce((sum, line) => sum + line.totalPrice * (line.exchangeRateToUSD ?? 0), 0)
          : undefined,
        // Prefer the trip's own snapshot; fall back to a line's for trips recorded
        // before the receipt carried one.
        rate: receipt.exchangeRateToUSD ?? lines.find((line) => line.exchangeRateToUSD)?.exchangeRateToUSD
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
              <th>Where</th>
              <th>Lines</th>
              <th>Total entered</th>
              <th>Rate that day</th>
              <th>Receipt said</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {trips.map((trip) => {
              const check = reconcile(trip.receipt.total, trip.linesTotal);
              const isOpen = expanded === trip.receipt.id;
              return (
                <Fragment key={trip.receipt.id}>
                <tr
                  onClick={() => setExpanded(isOpen ? null : trip.receipt.id)}
                  style={{ cursor: "pointer" }}
                  title={isOpen ? "Hide what was bought" : "Show what was bought"}
                >
                  <td data-label="Date">{formatDateLabel(trip.receipt.date)}</td>
                  <td data-label="Store">{trip.receipt.store || "—"}</td>
                  <td data-label="Where">
                    {locationName(trip.receipt.locationId) || (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td data-label="Lines">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setExpanded(isOpen ? null : trip.receipt.id)}
                    >
                      {trip.lines.length} {isOpen ? "▲" : "▼"}
                    </button>
                  </td>
                  <td data-label="Total entered">
                    {formatMoney(trip.linesTotal, trip.receipt.currencyCode)}
                    {trip.linesTotalUsd !== undefined ? (
                      <div className="muted" style={{ fontSize: 11 }}>
                        {formatUsd(trip.linesTotalUsd)}
                      </div>
                    ) : null}
                  </td>
                  <td data-label="Rate that day">
                    {trip.rate !== undefined ? (
                      <span
                        style={{ fontSize: 12 }}
                        title="Frozen when the trip was entered, and never recalculated"
                      >
                        {trip.rate} USD per {trip.receipt.currencyCode}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
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
                    <button
                      type="button"
                      className="danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(trip);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={8}>
                    {isOpen && trip.lines.length === 0 && (
                        <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
                          No prices left on this trip — safe to delete.
                        </p>
                      )}
                      {isOpen && trip.lines.length > 0 && (
                        <div className="table-wrap" style={{ marginTop: 6 }}>
                          <table className="table">
                            <thead>
                              <tr>
                                <th>Item</th>
                                <th>Bought</th>
                                <th>Quantity</th>
                                <th>Per unit</th>
                                <th>Discount</th>
                                <th>Paid</th>
                                <th>In USD</th>
                              </tr>
                            </thead>
                            <tbody>
                              {trip.lines.map((line) => {
                                const unit = itemUnit(line.pantryItemId);
                                const per = unitPrice(line);
                                const perUsd = usdOf(line);
                                return (
                                  <tr key={line.id}>
                                    <td data-label="Item">{itemName(line.pantryItemId)}</td>
                                    <td data-label="Bought">
                                      {line.packSize !== undefined ? (
                                        <>
                                          {line.packCount ?? 1} × {line.packSize}
                                          {line.packUnit ?? unit}
                                        </>
                                      ) : (
                                        <span className="muted">—</span>
                                      )}
                                    </td>
                                    <td data-label="Quantity">
                                      {Math.round(line.quantity * 100) / 100} {unit}
                                    </td>
                                    <td data-label="Per unit">
                                      {per > 0 ? (
                                        <>
                                          {per < 1 ? per.toFixed(4) : per.toFixed(2)}
                                          <span className="muted">/{unit}</span>
                                          {perUsd !== undefined && (
                                            <div className="muted" style={{ fontSize: 11 }}>
                                              {formatUsd(perUsd)}/{unit}
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        <span className="muted">—</span>
                                      )}
                                    </td>
                                    <td data-label="Discount">
                                      {line.discount ? (
                                        <>−{line.discount.toFixed(2)}</>
                                      ) : (
                                        <span className="muted">—</span>
                                      )}
                                    </td>
                                    <td data-label="Paid">
                                      <strong>{line.totalPrice.toFixed(2)}</strong>
                                    </td>
                                    <td data-label="In USD">
                                      {line.exchangeRateToUSD ? (
                                        <>{formatUsd(line.totalPrice * line.exchangeRateToUSD)}</>
                                      ) : (
                                        <span
                                          className="muted"
                                          title="No exchange rate was recorded with this purchase"
                                        >
                                          —
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
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
