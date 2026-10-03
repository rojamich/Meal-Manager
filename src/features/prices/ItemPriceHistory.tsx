import { useCallback, useEffect, useMemo, useState } from "react";
import { LocationProfile, PantryItem, PurchaseEntry } from "../../models";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { listPurchaseEntries } from "../../db/repositories/purchaseRepo";
import { listLocations } from "../../db/repositories/locationRepo";
import { formatMoney, formatUsd, unitPrice, usdOf } from "../../utils/price";
import { formatDateLabel } from "../../utils/date";

/**
 * Every price recorded for one ingredient, oldest to newest.
 *
 * The flat list of all prices answers "what have I recorded"; it cannot answer "is beef
 * dearer here than it was in Buenos Aires", which is the question the whole exercise
 * exists for. One item at a time, in date order, with the store and the country beside
 * each figure, is what makes that readable.
 *
 * Movement is measured in dollars rather than in the local currency. Two peso prices six
 * months apart differ partly because the peso moved, and reading that as the beef getting
 * dearer is exactly the mistake this is meant to prevent.
 */

interface HistoryRow {
  entry: PurchaseEntry;
  /** Price per base unit in the currency it was paid in. */
  perUnit: number;
  /** The same per-unit price in dollars, at the rate frozen on the purchase. */
  perUnitUsd?: number;
  /** Change against the previous dollar-priced record, as a fraction. */
  changeFromPrevious?: number;
}

export default function ItemPriceHistory({ embedded = false }: { embedded?: boolean } = {}) {
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [locations, setLocations] = useState<LocationProfile[]>([]);
  const [itemId, setItemId] = useState("");

  const refresh = useCallback(async () => {
    const [items, purchaseRows, locationRows] = await Promise.all([
      listPantryItems(),
      listPurchaseEntries(),
      listLocations()
    ]);
    setPantryItems([...items]);
    setPurchases([...purchaseRows]);
    setLocations([...locationRows]);
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => void refresh();
    window.addEventListener("purchases-updated", handler);
    window.addEventListener("pantry-items-updated", handler);
    return () => {
      window.removeEventListener("purchases-updated", handler);
      window.removeEventListener("pantry-items-updated", handler);
    };
  }, [refresh]);

  const locationName = useCallback(
    (id?: string) => (id ? locations.find((loc) => loc.id === id)?.name : undefined),
    [locations]
  );

  /** Items you have actually bought — the rest have no history to show. */
  const itemsWithHistory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of purchases) {
      counts.set(entry.pantryItemId, (counts.get(entry.pantryItemId) ?? 0) + 1);
    }
    return pantryItems
      .filter((item) => counts.has(item.id))
      .map((item) => ({ item, count: counts.get(item.id) ?? 0 }));
  }, [pantryItems, purchases]);

  const selected = pantryItems.find((item) => item.id === itemId);

  const history = useMemo(() => {
    if (!itemId) return { rows: [] as HistoryRow[] };
    const rows: HistoryRow[] = purchases
      .filter((entry) => entry.pantryItemId === itemId)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((entry) => ({ entry, perUnit: unitPrice(entry), perUnitUsd: usdOf(entry) }));

    // Compared against the last record that also had a dollar figure, so a purchase
    // with no rate breaks the chain rather than silently inventing a jump.
    let previousUsd: number | undefined;
    for (const row of rows) {
      if (row.perUnitUsd !== undefined) {
        if (previousUsd !== undefined && previousUsd > 0) {
          row.changeFromPrevious = (row.perUnitUsd - previousUsd) / previousUsd;
        }
        previousUsd = row.perUnitUsd;
      }
    }
    return { rows };
  }, [itemId, purchases]);

  const summary = useMemo(() => {
    const priced = history.rows.filter((row) => row.perUnitUsd !== undefined);
    if (!priced.length) return undefined;
    const values = priced.map((row) => row.perUnitUsd as number);
    const cheapest = priced[values.indexOf(Math.min(...values))];
    const dearest = priced[values.indexOf(Math.max(...values))];
    return { cheapest, dearest, latest: priced[priced.length - 1], count: priced.length };
  }, [history.rows]);

  const percent = (value: number) => `${value > 0 ? "+" : ""}${(value * 100).toFixed(0)}%`;

  const body = (
    <>
      {!embedded && <h3>Price history</h3>}
      {itemsWithHistory.length === 0 ? (
        <p className="muted">
          No prices recorded yet. Enter a shopping trip above and its items will have a
          history here.
        </p>
      ) : (
        <>
          <label className="field-stack">
            <span>Ingredient</span>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">Select an ingredient</option>
              {itemsWithHistory.map(({ item, count }) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({count})
                </option>
              ))}
            </select>
          </label>

          {selected && summary && (
            <p className="muted" style={{ fontSize: 12 }}>
              {summary.count} price{summary.count === 1 ? "" : "s"} in dollars · cheapest{" "}
              <strong>{formatUsd(summary.cheapest.perUnitUsd as number)}</strong>/
              {selected.baseUnit} at {summary.cheapest.entry.store || "an unnamed shop"}
              {locationName(summary.cheapest.entry.locationId)
                ? ` in ${locationName(summary.cheapest.entry.locationId)}`
                : ""}{" "}
              · dearest <strong>{formatUsd(summary.dearest.perUnitUsd as number)}</strong>/
              {selected.baseUnit} · latest{" "}
              <strong>{formatUsd(summary.latest.perUnitUsd as number)}</strong>/
              {selected.baseUnit}
            </p>
          )}

          {selected && history.rows.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Store</th>
                    <th>Where</th>
                    <th>Bought</th>
                    <th>Per {selected.baseUnit}</th>
                    <th>In USD</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {history.rows.map((row) => (
                    <tr key={row.entry.id}>
                      <td data-label="Date">{formatDateLabel(row.entry.date)}</td>
                      <td data-label="Store">{row.entry.store || <span className="muted">—</span>}</td>
                      <td data-label="Where">
                        {locationName(row.entry.locationId) || <span className="muted">—</span>}
                      </td>
                      <td data-label="Bought">
                        {row.entry.packSize !== undefined ? (
                          <>
                            {row.entry.packCount ?? 1} × {row.entry.packSize}
                            {row.entry.packUnit ?? selected.baseUnit}
                          </>
                        ) : (
                          <>
                            {Math.round(row.entry.quantity * 100) / 100} {selected.baseUnit}
                          </>
                        )}
                      </td>
                      <td data-label={`Per ${selected.baseUnit}`}>
                        {formatMoney(row.perUnit, row.entry.currencyCode)}
                      </td>
                      <td data-label="In USD">
                        {row.perUnitUsd !== undefined ? (
                          formatUsd(row.perUnitUsd)
                        ) : (
                          <span
                            className="muted"
                            title="No exchange rate was recorded with this purchase"
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td data-label="Change">
                        {row.changeFromPrevious === undefined ? (
                          <span className="muted">—</span>
                        ) : (
                          <span
                            style={{ fontWeight: Math.abs(row.changeFromPrevious) >= 0.1 ? 600 : 400 }}
                            title="Against the previous price in dollars, so a currency move is not read as the item getting dearer"
                          >
                            {row.changeFromPrevious > 0 ? "▲" : row.changeFromPrevious < 0 ? "▼" : ""}{" "}
                            {percent(row.changeFromPrevious)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selected && summary === undefined && history.rows.length > 0 && (
            <p className="muted" style={{ fontSize: 12 }}>
              None of these purchases recorded an exchange rate, so they can be listed but not
              compared across countries. Prices entered from now on carry one.
            </p>
          )}
        </>
      )}
    </>
  );

  return embedded ? <div>{body}</div> : <div className="panel">{body}</div>;
}
