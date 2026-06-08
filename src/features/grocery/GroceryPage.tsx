import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { GroceryLine, GroceryList, PantryItem, PurchaseEntry } from "../../models";
import {
  buildGroceryLines,
  generateGroceryList,
  GrocerySettings,
  parseGroceryUsageEntries
} from "./generate";
import { listGroceryLists, listGroceryLines, updateGroceryLine, deleteGroceryList, replaceGroceryLines, updateGroceryList } from "../../db/repositories/groceryRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { listLocations } from "../../db/repositories/locationRepo";
import { listPurchaseEntries } from "../../db/repositories/purchaseRepo";
import { createInventoryLot } from "../../db/repositories/inventoryRepo";
import { copyText } from "../../utils/clipboard";
import { addDays, dateKey } from "../../utils/date";
import { average, unitPrice } from "../../utils/price";
import { pantryCategoryLabel } from "../../utils/pantryCategories";
import { useConfirmChoiceModal } from "../../components/useConfirmChoiceModal";
import { useToast } from "../../components/useToast";
import { getActiveLocationId } from "../locations/activeLocation";
import { getUnitDisplayMode } from "../settings/preferences";
import { imperialAlternate } from "../../utils/unitConversion";

export default function GroceryPage() {
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [lines, setLines] = useState<GroceryLine[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [addedLotsCount, setAddedLotsCount] = useState(0);
  const [purchaseOverrides, setPurchaseOverrides] = useState<Record<string, string>>({});
  const [altPickerOpen, setAltPickerOpen] = useState(false);
  const [altSelections, setAltSelections] = useState<Record<string, string>>({});
  const [expandedLineIds, setExpandedLineIds] = useState<Record<string, boolean>>({});
  const [showAdvanced, setShowAdvanced] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const { requestChoice, modal } = useConfirmChoiceModal();
  const { notify, toast } = useToast();
  const [unitDisplayMode, setUnitDisplayModeState] = useState(() => getUnitDisplayMode());

  useEffect(() => {
    const handler = () => setUnitDisplayModeState(getUnitDisplayMode());
    window.addEventListener("unit-display-mode-changed", handler);
    return () => window.removeEventListener("unit-display-mode-changed", handler);
  }, []);

  const formatQty = useCallback(
    (qty: number, unit: string) => {
      if (!(qty > 0)) return "-";
      const base = `${qty} ${unit}`;
      if (unitDisplayMode !== "metric-plus-imperial") return base;
      const alt = imperialAlternate(qty, unit);
      return alt ? `${base} · ≈ ${alt}` : base;
    },
    [unitDisplayMode]
  );

  const [settings, setSettings] = useState<GrocerySettings>(() => ({
    startDate: dateKey(new Date()),
    endDate: dateKey(addDays(new Date(), 7)),
    expiryBufferDays: 2,
    includeEssentials: true,
    treatPantryAsEmpty: false,
    locationId: getActiveLocationId(),
    stayDays: 0
  }));

  const refresh = useCallback(async (preferredListId?: string) => {
    const listsData = await listGroceryLists();
    setLists([...listsData]);
    setPantryItems(await listPantryItems());
    setLocations(await listLocations());
    setPurchases(await listPurchaseEntries());
    const nextId =
      preferredListId ??
      listsData.find((list) => list.id === selectedListId)?.id ??
      listsData[0]?.id ??
      "";
    if (nextId) {
      setSelectedListId(nextId);
      setLines(await listGroceryLines(nextId));
      setExpandedLineIds({});
    } else {
      setSelectedListId("");
      setLines([]);
      setExpandedLineIds({});
    }
  }, [selectedListId]);

  const regenerateSelectedList = useCallback(async () => {
    if (!selectedListId) return;
    const { lines } = await buildGroceryLines({
      ...settings,
      locationId: settings.locationId || undefined
    });
    await updateGroceryList(selectedListId, {
      startDate: settings.startDate,
      endDate: settings.endDate,
      locationId: settings.locationId || undefined,
      settingsJson: JSON.stringify(settings)
    });
    await replaceGroceryLines(selectedListId, lines);
    await refresh(selectedListId);
  }, [refresh, selectedListId, settings]);

  useEffect(() => {
    refresh();
    const onRefresh = () => refresh();
    window.addEventListener("grocery-lists-updated", onRefresh);
    window.addEventListener("pantry-items-updated", onRefresh);
    window.addEventListener("locations-updated", onRefresh);
    window.addEventListener("purchases-updated", onRefresh);
    return () => {
      window.removeEventListener("grocery-lists-updated", onRefresh);
      window.removeEventListener("pantry-items-updated", onRefresh);
      window.removeEventListener("locations-updated", onRefresh);
      window.removeEventListener("purchases-updated", onRefresh);
    };
  }, [refresh]);

  useEffect(() => {
    const onEssentialsUpdated = () => {
      void regenerateSelectedList();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "essentialsUpdatedAt") void regenerateSelectedList();
    };
    window.addEventListener("essentials-updated", onEssentialsUpdated);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("essentials-updated", onEssentialsUpdated);
      window.removeEventListener("storage", onStorage);
    };
  }, [regenerateSelectedList]);

  useEffect(() => {
    if (!selectedListId) return;
    const reloadLines = () => listGroceryLines(selectedListId).then(setLines);
    reloadLines();
    window.addEventListener("grocery-lines-updated", reloadLines);
    return () => window.removeEventListener("grocery-lines-updated", reloadLines);
  }, [selectedListId]);

  async function handleGenerate() {
    const result = await generateGroceryList({
      ...settings,
      locationId: settings.locationId || undefined
    });
    setSelectedListId(result.list.id);
    setLines(result.lines);
    await refresh(result.list.id);
  }

  async function toggleChecked(line: GroceryLine) {
    await updateGroceryLine(line.id, { checked: !line.checked });
    setPurchaseOverrides((prev) => {
      if (line.checked) {
        const next = { ...prev };
        delete next[line.id];
        return next;
      }
      return { ...prev, [line.id]: normalizePurchaseOverride(String(line.toBuyQty || ""), line.unit) };
    });
    setLines(await listGroceryLines(selectedListId));
  }

  async function handleDeleteList() {
    if (!selectedListId) return;
    const choice = await requestChoice({
      title: "Delete Grocery List?",
      message: "This will remove the selected grocery list.",
      choices: [
        { label: "Delete", value: "confirm-delete", tone: "danger" },
        { label: "Cancel", value: "cancel", tone: "neutral" }
      ]
    });
    if (choice !== "confirm-delete") return;
    await deleteGroceryList(selectedListId);
    setSelectedListId("");
    setLines([]);
    await refresh();
  }

  const grouped = useMemo(() => {
    const map = new Map<string, GroceryLine[]>();
    for (const line of lines) {
      const item = line.pantryItemId ? pantryItems.find((p) => p.id === line.pantryItemId) : undefined;
      const category = line.category || item?.category || "other";
      const list = map.get(category) ?? [];
      list.push(line);
      map.set(category, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [lines, pantryItems]);

  const toggleExpanded = useCallback((lineId: string) => {
    setExpandedLineIds((prev) => ({ ...prev, [lineId]: !prev[lineId] }));
  }, []);

  const isCountUnit = useCallback((unit?: string) => unit === "count", []);
  const normalizePurchaseOverride = useCallback(
    (raw: string, unit?: string) => {
      if (raw === "") return "";
      const num = Number(raw);
      if (!Number.isFinite(num)) return "";
      if (isCountUnit(unit)) return String(Math.max(0, Math.round(num)));
      return String(num);
    },
    [isCountUnit]
  );

  const estimate = useMemo(() => {
    let total = 0;
    let known = 0;
    for (const line of lines) {
      if (!line.pantryItemId) continue;
      const itemPurchases = purchases.filter((p) => p.pantryItemId === line.pantryItemId);
      const byLocation = settings.locationId
        ? itemPurchases.filter((p) => p.locationId === settings.locationId)
        : [];
      const last = byLocation.length ? byLocation.sort((a, b) => b.date.localeCompare(a.date))[0] : undefined;
      let price = 0;
      if (last) {
        price = unitPrice(last);
      } else if (byLocation.length) {
        price = average(byLocation.map(unitPrice));
      } else if (itemPurchases.length) {
        price = average(itemPurchases.map(unitPrice));
      }
      if (price) {
        total += price * line.toBuyQty;
        known += 1;
      }
    }
    return { total, known, totalLines: lines.length };
  }, [lines, purchases, settings.locationId]);

  async function handleCopy() {
    const text = lines
      .map((line) => {
        const item = line.pantryItemId ? pantryItems.find((p) => p.id === line.pantryItemId) : undefined;
        const name = line.freeformLabel || item?.name || "Item";
        const qtyText = formatQty(line.toBuyQty, line.unit);
        return `${name} - ${qtyText}`;
      })
      .join("\n");
    await copyText(text);
    notify("Copied to clipboard", "success");
  }

  function parseAltOptions(line: GroceryLine) {
    if (!line.altOptionsJson) return [];
    try {
      return JSON.parse(line.altOptionsJson) as string[];
    } catch {
      return [];
    }
  }

  async function performAddChecked(selectionMap: Record<string, string>) {
    if (!selectedListId) return;
    const today = new Date();
    const purchasedAt = dateKey(today);
    const selectedList = lists.find((list) => list.id === selectedListId);
    const note = selectedList ? `From grocery list ${selectedList.startDate}-${selectedList.endDate}` : "From grocery list";
    const locationId = settings.locationId || undefined;

    const toAdd = lines.filter(
      (line) =>
        line.checked &&
        line.toBuyQty > 0 &&
        (line.pantryItemId || parseAltOptions(line).length > 0)
    );
    if (!toAdd.length) return;

    await Promise.all(
      toAdd.map(async (line) => {
        const chosenId = line.pantryItemId || selectionMap[line.id];
        if (!chosenId) return;
        const item = pantryItems.find((p) => p.id === chosenId);
        if (!item) return;
        const override = purchaseOverrides[line.id];
        let quantity = override !== undefined && override !== "" ? Number(override) : line.toBuyQty;
        if (isCountUnit(item.baseUnit)) quantity = Math.round(quantity);
        if (!quantity || quantity <= 0) return;
        const expiresAt = item.defaultShelfLifeDays
          ? dateKey(addDays(today, item.defaultShelfLifeDays))
          : undefined;
        await createInventoryLot({
          pantryItemId: chosenId,
          quantity,
          purchasedAt,
          expiresAt,
          locationId,
          notes: note
        });
        await updateGroceryLine(line.id, { checked: false });
      })
    );
    setAddedLotsCount(toAdd.length);
    setPurchaseOverrides((prev) => {
      const next = { ...prev };
      toAdd.forEach((line) => delete next[line.id]);
      return next;
    });
    await refresh(selectedListId);
  }

  async function handleAddCheckedToPantry() {
    if (!selectedListId) return;
    const altRows = lines.filter(
      (line) => line.checked && !line.pantryItemId && parseAltOptions(line).length > 0
    );
    if (altRows.length) {
      setAltPickerOpen(true);
      setAltSelections((prev) => {
        const next = { ...prev };
        altRows.forEach((line) => {
          const options = parseAltOptions(line);
          if (!next[line.id] && options[0]) next[line.id] = options[0];
        });
        return next;
      });
      return;
    }
    await performAddChecked({});
  }

  return (
    <div className="grid">
      <section className="panel">
        <h2>Generate Grocery List</h2>
        <div className="row mobile-only">
          <button className="secondary" onClick={() => setShowAdvanced((prev) => !prev)}>
            Advanced {showAdvanced ? "^" : "v"}
          </button>
        </div>
        <div className="grid grid-2 grocery-settings-grid">
          <label>
            Start date
            <input type="date" value={settings.startDate} onChange={(e) => setSettings({ ...settings, startDate: e.target.value })} />
          </label>
          <label>
            End date
            <input type="date" value={settings.endDate} onChange={(e) => setSettings({ ...settings, endDate: e.target.value })} />
          </label>
        </div>
        <div className={`grid grid-2 grocery-settings-grid ${showAdvanced ? "" : "hide-on-mobile"}`}>
          <label>
            Expiry buffer days
            <input type="number" value={settings.expiryBufferDays} onChange={(e) => setSettings({ ...settings, expiryBufferDays: Number(e.target.value) })} />
          </label>
          <label>
            Stay days (optional)
            <input type="number" value={settings.stayDays || 0} onChange={(e) => setSettings({ ...settings, stayDays: Number(e.target.value) })} />
          </label>
          <label>
            Location
            <select value={settings.locationId} onChange={(e) => setSettings({ ...settings, locationId: e.target.value })}>
              <option value="">All locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.includeEssentials}
              onChange={(e) => setSettings({ ...settings, includeEssentials: e.target.checked })}
            />
            Include essentials
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.treatPantryAsEmpty}
              onChange={(e) => setSettings({ ...settings, treatPantryAsEmpty: e.target.checked })}
            />
            Treat pantry as empty
          </label>
        </div>
        <div className="row resource-toolbar">
          <button onClick={handleGenerate}>Generate</button>
        </div>
      </section>

      <section className="panel">
        <div className="row resource-toolbar">
          <select value={selectedListId} onChange={(e) => setSelectedListId(e.target.value)}>
            <option value="">Select grocery list</option>
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.startDate} - {list.endDate}
              </option>
            ))}
          </select>
          <button className="danger" onClick={handleDeleteList}>Delete list</button>
          <button className="secondary" onClick={handleAddCheckedToPantry}>Add checked to pantry</button>
          {addedLotsCount > 0 && <span className="muted">Added {addedLotsCount} lots</span>}
          <button className="secondary" onClick={handleCopy}>Copy list</button>
          <button className="secondary" onClick={() => window.print()}>Print</button>
        </div>
        {altPickerOpen && (
          <div className="panel" style={{ marginTop: 12 }}>
            <h4>Select options for alternatives</h4>
            {lines
              .filter((line) => line.checked && !line.pantryItemId && parseAltOptions(line).length > 0)
              .map((line) => {
                const options = parseAltOptions(line);
                return (
                  <div key={line.id} className="row resource-toolbar grocery-alt-row">
                    <span>{line.freeformLabel}</span>
                    <select
                      value={altSelections[line.id] || ""}
                      onChange={(e) => setAltSelections((prev) => ({ ...prev, [line.id]: e.target.value }))}
                    >
                      <option value="">Select option</option>
                      {options.map((optId) => (
                        <option key={optId} value={optId}>
                          {pantryItems.find((p) => p.id === optId)?.name || "Option"}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            <div className="row resource-toolbar">
              <button
                onClick={async () => {
                  const pending = lines.filter(
                    (line) => line.checked && !line.pantryItemId && parseAltOptions(line).length > 0
                  );
                  const missing = pending.some((line) => !altSelections[line.id]);
                  if (missing) return;
                  setAltPickerOpen(false);
                  await performAddChecked(altSelections);
                }}
              >
                Confirm
              </button>
              <button className="secondary" onClick={() => setAltPickerOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        <p>Estimated total: {estimate.total.toFixed(2)} ({estimate.known}/{estimate.totalLines} items priced)</p>
        {grouped.map(([category, items]) => (
          <div key={category} className="panel">
            <h3>{pantryCategoryLabel(category)}</h3>
            <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>To Buy</th>
                  <th>Purchased</th>
                  <th>Used For</th>
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {items
                  .sort((a, b) => {
                    const nameA =
                      a.freeformLabel ||
                      pantryItems.find((p) => p.id === a.pantryItemId)?.name ||
                      "";
                    const nameB =
                      b.freeformLabel ||
                      pantryItems.find((p) => p.id === b.pantryItemId)?.name ||
                      "";
                    return nameA.localeCompare(nameB);
                  })
                  .map((line) => {
                    const item = line.pantryItemId ? pantryItems.find((p) => p.id === line.pantryItemId) : undefined;
                    const usedFor = parseGroceryUsageEntries(line.usedForJson);
                    const isExpanded = Boolean(expandedLineIds[line.id]);
                    const summary = usedFor.length > 0 ? `${usedFor.length} contributor${usedFor.length === 1 ? "" : "s"}` : "-";
                    return (
                      <Fragment key={line.id}>
                      <tr key={line.id} className={line.freeformLabel && line.toBuyQty === 0 ? "note-row" : undefined}>
                        <td data-label="Item">
                          {line.freeformLabel || item?.name}
                          {item?.notes && (
                            <div className="muted" style={{ fontSize: 12, marginTop: 2, fontWeight: 400 }}>
                              {item.notes}
                            </div>
                          )}
                        </td>
                        <td data-label="To buy">{formatQty(line.toBuyQty, line.unit)}</td>
                        <td data-label="Purchased">
                          {line.checked && line.toBuyQty > 0 && (line.pantryItemId || line.altOptionsJson) ? (
                            <input
                              type="number"
                              min="0"
                              step={isCountUnit(line.unit) ? 1 : 0.01}
                              value={purchaseOverrides[line.id] ?? String(line.toBuyQty)}
                              onChange={(e) =>
                                setPurchaseOverrides((prev) => ({
                                  ...prev,
                                  [line.id]: normalizePurchaseOverride(e.target.value, line.unit)
                                }))
                              }
                            />
                          ) : (
                            "-"
                          )}
                        </td>
                        <td data-label="Used for">
                          <div className="grocery-usage-summary">
                            <span>{summary}</span>
                            {usedFor.length > 0 && (
                              <button
                                type="button"
                                className="secondary grocery-expand-toggle"
                                onClick={() => toggleExpanded(line.id)}
                              >
                                {isExpanded ? "Hide" : "Show"}
                              </button>
                            )}
                          </div>
                        </td>
                        <td data-label="Check">
                          <input type="checkbox" checked={line.checked} onChange={() => toggleChecked(line)} />
                        </td>
                      </tr>
                      {isExpanded && usedFor.length > 0 && (
                        <tr key={`${line.id}-details`} className="grocery-usage-row">
                          <td colSpan={5}>
                            <div className="grocery-usage-details">
                              {usedFor.map((entry, index) => (
                                <div key={`${line.id}-entry-${index}`} className="grocery-usage-entry">
                                  <strong>{entry.label}</strong>
                                  <span className="muted">
                                    {entry.date || "No date"}
                                    {typeof entry.qty === "number" && entry.unit ? ` - ${entry.qty} ${entry.unit}` : ""}
                                    {entry.count && entry.count > 1 ? ` - x${entry.count}` : ""}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
              </tbody>
            </table>
            </div>
          </div>
        ))}
      </section>
      {modal}
      {toast}
    </div>
  );
}
