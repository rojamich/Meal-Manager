import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BaseUnit, LocationProfile, PackUnit, PantryItem, StorageType } from "../../models";
import { listPantryItems, addPantryItemAlias, createPantryItem } from "../../db/repositories/pantryRepo";
import { listPurchaseEntries } from "../../db/repositories/purchaseRepo";
import { listLocations } from "../../db/repositories/locationRepo";
import { createInventoryLot } from "../../db/repositories/inventoryRepo";
import { ReceiptLineInput, reconcile, saveReceipt } from "../../db/repositories/receiptRepo";
import { PANTRY_CATEGORY_OPTIONS } from "../../utils/pantryCategories";
import { defaultPackUnit, packUnitsForBaseUnit, toBaseUnits } from "../../utils/packUnits";
import { PACK_UNIT_OPTIONS } from "../../utils/packUnits";
import { alreadyKnownAs, findByNameOrAlias } from "../../utils/itemNames";
import { dateKey, addDays } from "../../utils/date";
import { useActiveLocationId } from "../locations/activeLocation";
import { useToast } from "../../components/useToast";
import { newId } from "../../utils/id";

/**
 * Entering a shopping trip by hand.
 *
 * Two things make this worth a page of its own rather than a row in a settings list.
 *
 * The first is units. A receipt states what it states — "400 g", "1 kg", "750 cc",
 * "0.744 kg" — while the pantry stores grams and millilitres. Typing the pack the way it
 * is printed and letting the app do the arithmetic is the difference between a habit
 * that lasts and thirty mental conversions per trip.
 *
 * The second is the total. A hand-entered trip is a column of numbers with nothing to
 * check it against, and a single fat-fingered price quietly biases every meal that uses
 * that ingredient. Typing the printed total gives the whole thing something to fail
 * against, and the running difference says whether it did.
 */

interface DraftLine {
  key: string;
  /** What you typed; may be the shop's name rather than yours. */
  text: string;
  pantryItemId?: string;
  packCount: string;
  packSize: string;
  packUnit: PackUnit | "";
  grossPrice: string;
  discount: string;
  /** Record the typed text as another name for the matched item. */
  rememberAlias: boolean;
  /**
   * Whether this pack size is how the thing is sold, rather than a weight off the
   * counter. Drives whether recipes get charged whole packets of it.
   */
  soldInThisPack: boolean;
  /** Fields for creating an item inline when nothing matched. */
  newBaseUnit: BaseUnit;
  newCategory: string;
  newStorage: StorageType;
}

function blankLine(): DraftLine {
  return {
    key: newId(),
    text: "",
    packCount: "1",
    packSize: "",
    packUnit: "",
    grossPrice: "",
    discount: "",
    rememberAlias: true,
    soldInThisPack: true,
    newBaseUnit: "g",
    newCategory: "other",
    newStorage: "pantry"
  };
}

const num = (raw: string): number | undefined => {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return undefined;
  // Accept a comma decimal, because that is how the receipt in your hand prints it.
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
};

export default function ReceiptEntryPage() {
  const { notify, toast } = useToast();
  const [activeLocationId] = useActiveLocationId();
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [locations, setLocations] = useState<LocationProfile[]>([]);

  const [store, setStore] = useState("");
  const [date, setDate] = useState(dateKey(new Date()));
  const [locationId, setLocationId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [lastUsedCurrency, setLastUsedCurrency] = useState("");
  const [printedTotal, setPrintedTotal] = useState("");
  const [addToPantry, setAddToPantry] = useState(true);
  const [lines, setLines] = useState<DraftLine[]>(() => [blankLine()]);
  const [saving, setSaving] = useState(false);
  const lastRowRef = useRef<HTMLInputElement | null>(null);
  const focusLast = useRef(false);

  const refresh = useCallback(async () => {
    const [items, locs, purchases] = await Promise.all([
      listPantryItems(),
      listLocations(),
      listPurchaseEntries()
    ]);
    setPantryItems([...items]);
    setLocations([...locs]);
    // Whatever you last paid in is the best guess for what you are paying in now, and it
    // saves retyping the currency on every trip when no location is set.
    setLastUsedCurrency(purchases[0]?.currencyCode ?? "");
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Default to wherever you are, which is almost always where you just shopped.
  useEffect(() => {
    if (!locationId && activeLocationId) setLocationId(activeLocationId);
  }, [activeLocationId, locationId]);

  const location = useMemo(
    () => locations.find((loc) => loc.id === locationId),
    [locationId, locations]
  );

  // The currency follows the location when there is one, and otherwise falls back to
  // whatever the last trip used, so it is almost never typed by hand.
  useEffect(() => {
    if (location?.currencyCode) setCurrencyCode(location.currencyCode);
  }, [location?.currencyCode]);

  useEffect(() => {
    setCurrencyCode((prev) => prev || lastUsedCurrency);
  }, [lastUsedCurrency]);

  useEffect(() => {
    if (focusLast.current) {
      focusLast.current = false;
      lastRowRef.current?.focus();
    }
  });

  const itemById = useMemo(
    () => new Map(pantryItems.map((item) => [item.id, item])),
    [pantryItems]
  );

  function patch(key: string, changes: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...changes } : line)));
  }

  /** Resolve typed text to an item, defaulting the unit to whatever that item uses. */
  function onTextChange(key: string, text: string) {
    const match = findByNameOrAlias(pantryItems, text);
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        if (!match) return { ...line, text, pantryItemId: undefined };
        return {
          ...line,
          text,
          pantryItemId: match.id,
          packUnit: line.packUnit || defaultPackUnit(match.baseUnit)
        };
      })
    );
  }

  async function createInline(line: DraftLine) {
    const name = line.text.trim();
    if (!name) return;
    try {
      const created = await createPantryItem({
        name,
        category: line.newCategory,
        storageType: line.newStorage,
        baseUnit: line.newBaseUnit
      });
      setPantryItems((prev) => [...prev, created]);
      patch(line.key, {
        pantryItemId: created.id,
        packUnit: line.packUnit || defaultPackUnit(created.baseUnit),
        rememberAlias: false
      });
    } catch (err) {
      // createPantryItem refuses near-duplicates; if one exists, use it rather than
      // making a second row for the same ingredient.
      const existing = findByNameOrAlias(await listPantryItems(), name);
      if (existing) {
        patch(line.key, { pantryItemId: existing.id });
        notify(`Using existing "${existing.name}"`, "info");
      } else {
        notify(err instanceof Error ? err.message : "Could not create item", "error");
      }
    }
  }

  function addRow() {
    focusLast.current = true;
    setLines((prev) => [...prev, blankLine()]);
  }

  function removeRow(key: string) {
    setLines((prev) => (prev.length === 1 ? [blankLine()] : prev.filter((l) => l.key !== key)));
  }

  /** Per-row derived figures: quantity in base units, what was paid, price per unit. */
  const computed = useMemo(() => {
    const map = new Map<
      string,
      { baseQty?: number; net?: number; unitPrice?: number; unitLabel?: string; problem?: string }
    >();
    for (const line of lines) {
      const item = line.pantryItemId ? itemById.get(line.pantryItemId) : undefined;
      const packSize = num(line.packSize);
      const gross = num(line.grossPrice);
      const discount = num(line.discount) ?? 0;
      const net = gross !== undefined ? Math.max(gross - discount, 0) : undefined;

      if (!item || packSize === undefined) {
        map.set(line.key, { net });
        continue;
      }
      const baseQty = toBaseUnits({
        packCount: num(line.packCount) ?? 1,
        packSize,
        packUnit: line.packUnit || undefined,
        baseUnit: item.baseUnit
      });
      if (baseQty === undefined) {
        map.set(line.key, {
          net,
          problem: `${line.packUnit} cannot measure ${item.name}, which is kept in ${item.baseUnit}`
        });
        continue;
      }
      map.set(line.key, {
        baseQty,
        net,
        unitPrice: net !== undefined && baseQty > 0 ? net / baseQty : undefined,
        unitLabel: item.baseUnit
      });
    }
    return map;
  }, [itemById, lines]);

  const lineNetTotal = useMemo(
    () => lines.reduce((sum, line) => sum + (computed.get(line.key)?.net ?? 0), 0),
    [computed, lines]
  );

  const check = reconcile(num(printedTotal), lineNetTotal);

  const readyCount = lines.filter((line) => {
    const c = computed.get(line.key);
    return line.pantryItemId && c?.baseQty !== undefined && c.net !== undefined;
  }).length;

  // Said in the page rather than only in a toast. A disabled button with no visible
  // reason reads as the app being broken, which is exactly what it looked like.
  const blockedReason = !currencyCode.trim()
    ? "Set a currency for this trip before saving."
    : readyCount === 0
      ? "Each line needs an item, a pack size and a price before it can be saved."
      : undefined;

  async function save() {
    const payload: ReceiptLineInput[] = [];
    const aliasWork: { id: string; alias: string }[] = [];

    for (const line of lines) {
      const item = line.pantryItemId ? itemById.get(line.pantryItemId) : undefined;
      const packSize = num(line.packSize);
      const gross = num(line.grossPrice);
      if (!item || packSize === undefined || gross === undefined) continue;
      payload.push({
        pantryItemId: item.id,
        baseUnit: item.baseUnit,
        packCount: num(line.packCount) ?? 1,
        packSize,
        packUnit: line.packUnit || undefined,
        grossPrice: gross,
        discount: num(line.discount) ?? 0,
        learnPackSize: line.soldInThisPack
      });
      if (line.rememberAlias && line.text.trim() && !alreadyKnownAs(item, line.text)) {
        aliasWork.push({ id: item.id, alias: line.text.trim() });
      }
    }

    if (!payload.length) {
      notify("Nothing to save yet — each line needs an item, a pack size and a price.", "error");
      return;
    }
    if (!currencyCode.trim()) {
      notify("Set a currency for this trip.", "error");
      return;
    }

    setSaving(true);
    try {
      const result = await saveReceipt(
        {
          store: store.trim() || undefined,
          locationId: locationId || undefined,
          currencyCode: currencyCode.trim().toUpperCase(),
          date,
          total: num(printedTotal),
          // Frozen now so a later edit to the location's rate cannot rewrite this trip.
          exchangeRateToUSD: location?.exchangeRateToUSD
        },
        payload
      );

      await Promise.all(aliasWork.map((work) => addPantryItemAlias(work.id, work.alias)));

      if (addToPantry) {
        await Promise.all(
          result.entries.map((entry) => {
            const item = itemById.get(entry.pantryItemId);
            const expiresAt = item?.defaultShelfLifeDays
              ? dateKey(addDays(new Date(date), item.defaultShelfLifeDays))
              : undefined;
            return createInventoryLot({
              pantryItemId: entry.pantryItemId,
              quantity: entry.quantity,
              purchasedAt: date,
              expiresAt,
              locationId: locationId || undefined,
              notes: store.trim() ? `Bought at ${store.trim()}` : "From a shopping trip"
            });
          })
        );
      }

      const skippedNote = result.skipped.length
        ? ` ${result.skipped.length} line(s) skipped — unit did not match the item.`
        : "";
      notify(`Saved ${result.entries.length} price(s).${skippedNote}`, "success");

      setLines([blankLine()]);
      setPrintedTotal("");
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not save this trip", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid">
      <section className="panel">
        <h2>Add a shopping trip</h2>
        <p className="muted" style={{ fontSize: 12 }}>
          Enter each line the way the receipt prints it — the pack size in its own units, the
          price you were charged, and any discount on its own. Everything else is worked out.
          Recipes are charged whole packets of anything sold in a fixed size, so untick
          &ldquo;sold in this size&rdquo; for things weighed at the counter.
        </p>
        <div className="row resource-toolbar form-row-grid">
          <label className="field-stack">
            <span>Store</span>
            <input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Carrefour" />
          </label>
          <label className="field-stack">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field-stack">
            <span>Location</span>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">No location</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </label>
          <label className="field-stack">
            <span>Currency *</span>
            <input
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
              placeholder="ARS"
              required
            />
          </label>
          <label className="field-stack">
            <span>Printed total</span>
            <input
              value={printedTotal}
              onChange={(e) => setPrintedTotal(e.target.value)}
              placeholder="optional"
              inputMode="decimal"
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <datalist id="pantry-item-names">
          {pantryItems.map((item) => (
            <option key={item.id} value={item.name} />
          ))}
        </datalist>

        <table className="table">
          <thead>
            <tr>
              <th style={{ minWidth: 180 }}>Item</th>
              <th>Packs</th>
              <th>Pack size</th>
              <th>Unit</th>
              <th>Price</th>
              <th>Discount</th>
              <th>Works out to</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const item = line.pantryItemId ? itemById.get(line.pantryItemId) : undefined;
              const c = computed.get(line.key);
              const unresolved = !item && line.text.trim().length > 0;
              const unitChoices = item ? packUnitsForBaseUnit(item.baseUnit) : [];
              const showAlias =
                item && line.text.trim().length > 0 && !alreadyKnownAs(item, line.text);

              return (
                <tr key={line.key}>
                  <td data-label="Item">
                    <input
                      ref={index === lines.length - 1 ? lastRowRef : undefined}
                      list="pantry-item-names"
                      value={line.text}
                      placeholder="Chicken breast"
                      onChange={(e) => onTextChange(line.key, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && index === lines.length - 1) {
                          e.preventDefault();
                          addRow();
                        }
                      }}
                    />
                    {item && (
                      <div className="muted" style={{ fontSize: 11 }}>
                        → {item.name} ({item.baseUnit})
                      </div>
                    )}
                    {showAlias && (
                      <label className="muted" style={{ fontSize: 11, display: "block" }}>
                        <input
                          type="checkbox"
                          checked={line.rememberAlias}
                          onChange={(e) => patch(line.key, { rememberAlias: e.target.checked })}
                        />{" "}
                        remember &ldquo;{line.text.trim()}&rdquo; as another name for it
                      </label>
                    )}
                    {item && !item.packSize && (
                      <label className="muted" style={{ fontSize: 11, display: "block" }}>
                        <input
                          type="checkbox"
                          checked={line.soldInThisPack}
                          onChange={(e) => patch(line.key, { soldInThisPack: e.target.checked })}
                        />{" "}
                        sold in this size (untick if weighed at the counter)
                      </label>
                    )}
                    {item?.packSize && (
                      <div className="muted" style={{ fontSize: 11 }}>
                        sold in {item.packSize} {item.packUnit ?? item.baseUnit}
                        {item.sharedAcrossMeals ? " · shared across meals" : ""}
                      </div>
                    )}
                    {unresolved && (
                      <div className="row" style={{ gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                        <select
                          value={line.newBaseUnit}
                          onChange={(e) =>
                            patch(line.key, { newBaseUnit: e.target.value as BaseUnit })
                          }
                        >
                          <option value="g">g</option>
                          <option value="ml">ml</option>
                          <option value="count">count</option>
                        </select>
                        <select
                          value={line.newCategory}
                          onChange={(e) => patch(line.key, { newCategory: e.target.value })}
                        >
                          {PANTRY_CATEGORY_OPTIONS.map((opt) => (
                            <option key={opt.key} value={opt.key}>{opt.label}</option>
                          ))}
                        </select>
                        <select
                          value={line.newStorage}
                          onChange={(e) =>
                            patch(line.key, { newStorage: e.target.value as StorageType })
                          }
                        >
                          <option value="pantry">pantry</option>
                          <option value="fridge">fridge</option>
                          <option value="freezer">freezer</option>
                        </select>
                        <button type="button" className="secondary" onClick={() => createInline(line)}>
                          Create
                        </button>
                      </div>
                    )}
                  </td>
                  <td data-label="Packs">
                    <input
                      style={{ width: 60 }}
                      inputMode="decimal"
                      value={line.packCount}
                      onChange={(e) => patch(line.key, { packCount: e.target.value })}
                    />
                  </td>
                  <td data-label="Pack size">
                    <input
                      style={{ width: 80 }}
                      inputMode="decimal"
                      placeholder="400"
                      value={line.packSize}
                      onChange={(e) => patch(line.key, { packSize: e.target.value })}
                    />
                  </td>
                  <td data-label="Unit">
                    <select
                      value={line.packUnit}
                      onChange={(e) => patch(line.key, { packUnit: e.target.value as PackUnit })}
                    >
                      <option value="">same as item</option>
                      {(item ? unitChoices : PACK_UNIT_OPTIONS.map((o) => o.value)).map((u) => (
                        <option key={u} value={u}>
                          {PACK_UNIT_OPTIONS.find((o) => o.value === u)?.label ?? u}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Price">
                    <input
                      style={{ width: 90 }}
                      inputMode="decimal"
                      placeholder="5000"
                      value={line.grossPrice}
                      onChange={(e) => patch(line.key, { grossPrice: e.target.value })}
                    />
                  </td>
                  <td data-label="Discount">
                    <input
                      style={{ width: 80 }}
                      inputMode="decimal"
                      placeholder="0"
                      value={line.discount}
                      onChange={(e) => patch(line.key, { discount: e.target.value })}
                    />
                  </td>
                  <td data-label="Works out to">
                    {c?.problem ? (
                      <span className="muted" style={{ fontSize: 11 }}>{c.problem}</span>
                    ) : c?.baseQty !== undefined ? (
                      <span style={{ fontSize: 12 }}>
                        {Math.round(c.baseQty * 100) / 100} {c.unitLabel}
                        {c.unitPrice !== undefined && (
                          <>
                            {" · "}
                            <strong>
                              {c.unitPrice < 1 ? c.unitPrice.toFixed(4) : c.unitPrice.toFixed(2)}
                            </strong>
                            /{c.unitLabel}
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="muted" style={{ fontSize: 11 }}>—</span>
                    )}
                  </td>
                  <td data-label="Actions">
                    <button type="button" className="danger" onClick={() => removeRow(line.key)}>
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="row resource-toolbar" style={{ marginTop: 8 }}>
          <button type="button" className="secondary" onClick={addRow}>
            Add line
          </button>
          <label className="muted" style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={addToPantry}
              onChange={(e) => setAddToPantry(e.target.checked)}
            />{" "}
            also add these to pantry stock
          </label>
          <button type="button" onClick={save} disabled={saving || Boolean(blockedReason)}>
            {saving ? "Saving…" : `Save ${readyCount} line(s)`}
          </button>
          {blockedReason && (
            <span className="muted" style={{ fontSize: 12 }}>{blockedReason}</span>
          )}
        </div>

        <div className="row" style={{ marginTop: 8, gap: 16, flexWrap: "wrap" }}>
          <span>
            Lines total: <strong>{lineNetTotal.toFixed(2)}</strong> {currencyCode}
          </span>
          {check.known && (
            <span className={check.matches ? "" : "muted"}>
              Receipt says <strong>{check.printedTotal.toFixed(2)}</strong> —{" "}
              {check.matches ? (
                <strong>matches</strong>
              ) : (
                <>
                  off by <strong>{check.difference > 0 ? "+" : ""}{check.difference.toFixed(2)}</strong>
                </>
              )}
            </span>
          )}
        </div>
        {check.known && !check.matches && (
          <p className="muted" style={{ fontSize: 12 }}>
            A gap usually means a mistyped price, a missing line, or a discount recorded on the
            wrong row. It is fine to save anyway — the prices still work — but the difference is
            worth a look first.
          </p>
        )}
      </section>
      {toast}
    </div>
  );
}
