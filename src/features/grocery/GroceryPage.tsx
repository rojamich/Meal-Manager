import { useCallback, useEffect, useMemo, useState } from "react";
import { GroceryLine, GroceryList, PantryItem, PurchaseEntry } from "../../models";
import { buildGroceryLines, generateGroceryList, GrocerySettings } from "./generate";
import { listGroceryLists, listGroceryLines, updateGroceryLine, deleteGroceryList, replaceGroceryLines, updateGroceryList } from "../../db/repositories/groceryRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { listLocations } from "../../db/repositories/locationRepo";
import { listPurchaseEntries } from "../../db/repositories/purchaseRepo";
import { createInventoryLot } from "../../db/repositories/inventoryRepo";
import { copyText } from "../../utils/clipboard";
import { addDays, toISODate } from "../../utils/date";
import { average, unitPrice } from "../../utils/price";

export default function GroceryPage() {
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [lines, setLines] = useState<GroceryLine[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [addedLotsCount, setAddedLotsCount] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );

  const [settings, setSettings] = useState<GrocerySettings>({
    startDate: toISODate(new Date()),
    endDate: toISODate(addDays(new Date(), 7)),
    expiryBufferDays: 2,
    includeEssentials: true,
    treatPantryAsEmpty: false,
    locationId: "",
    stayDays: 0
  });

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
    } else {
      setSelectedListId("");
      setLines([]);
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
    listGroceryLines(selectedListId).then(setLines);
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
    setLines(await listGroceryLines(selectedListId));
  }

  async function handleDeleteList() {
    if (!selectedListId) return;
    if (!confirm("Delete this grocery list?")) return;
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

  const titleCase = useCallback((value: string) => (value ? value.replace(/\b\w/g, (c) => c.toUpperCase()) : value), []);

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
        const qtyText = line.toBuyQty > 0 ? `${line.toBuyQty} ${line.unit}` : "-";
        return `${name} - ${qtyText}`;
      })
      .join("\n");
    await copyText(text);
    alert("Copied to clipboard");
  }

  async function handleAddCheckedToPantry() {
    if (!selectedListId) return;
    const today = new Date();
    const purchasedAt = toISODate(today);
    const selectedList = lists.find((list) => list.id === selectedListId);
    const note = selectedList ? `From grocery list ${selectedList.startDate}-${selectedList.endDate}` : "From grocery list";
    const locationId = settings.locationId || undefined;

    const toAdd = lines.filter(
      (line) => line.checked && line.pantryItemId && line.toBuyQty > 0
    );
    if (!toAdd.length) return;

    await Promise.all(
      toAdd.map(async (line) => {
        const item = pantryItems.find((p) => p.id === line.pantryItemId);
        if (!item || !line.pantryItemId) return;
        const expiresAt = item.defaultShelfLifeDays
          ? toISODate(addDays(today, item.defaultShelfLifeDays))
          : undefined;
        await createInventoryLot({
          pantryItemId: line.pantryItemId,
          quantity: line.toBuyQty,
          purchasedAt,
          expiresAt,
          locationId,
          notes: note
        });
        await updateGroceryLine(line.id, { checked: false });
      })
    );
    setAddedLotsCount(toAdd.length);
    await refresh(selectedListId);
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
        <div className="grid grid-2">
          <label>
            Start date
            <input type="date" value={settings.startDate} onChange={(e) => setSettings({ ...settings, startDate: e.target.value })} />
          </label>
          <label>
            End date
            <input type="date" value={settings.endDate} onChange={(e) => setSettings({ ...settings, endDate: e.target.value })} />
          </label>
        </div>
        <div className={`grid grid-2 ${showAdvanced ? "" : "hide-on-mobile"}`}>
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
        <div className="row">
          <button onClick={handleGenerate}>Generate</button>
        </div>
      </section>

      <section className="panel">
        <div className="row">
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
        <p>Estimated total: {estimate.total.toFixed(2)} ({estimate.known}/{estimate.totalLines} items priced)</p>
        {grouped.map(([category, items]) => (
          <div key={category} className="panel">
            <h3>{titleCase(category)}</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>To Buy</th>
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
                    const usedFor = JSON.parse(line.usedForJson || "{}");
                    const usedText = (Object.entries(usedFor) as [string, number][])
                      .map(([title, count]) => (count > 1 ? `${title} x${count}` : title))
                      .join(", ") || "-";
                    return (
                      <tr key={line.id} className={line.freeformLabel && line.toBuyQty === 0 ? "note-row" : undefined}>
                        <td data-label="Item">{line.freeformLabel || item?.name}</td>
                        <td data-label="To buy">
                          {line.toBuyQty > 0 ? `${line.toBuyQty} ${line.unit}` : "-"}
                        </td>
                        <td data-label="Used for">{usedText}</td>
                        <td data-label="Check">
                          <input type="checkbox" checked={line.checked} onChange={() => toggleChecked(line)} />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </div>
  );
}
