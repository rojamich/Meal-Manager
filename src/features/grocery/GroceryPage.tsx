import { useCallback, useEffect, useMemo, useState } from "react";
import { GroceryLine, GroceryList, PantryItem, PurchaseEntry } from "../../models";
import { generateGroceryList, GrocerySettings } from "./generate";
import { listGroceryLists, listGroceryLines, updateGroceryLine, deleteGroceryList } from "../../db/repositories/groceryRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { listLocations } from "../../db/repositories/locationRepo";
import { listPurchaseEntries } from "../../db/repositories/purchaseRepo";
import { copyText } from "../../utils/clipboard";
import { toISODate } from "../../utils/date";
import { average, unitPrice } from "../../utils/price";

export default function GroceryPage() {
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [lines, setLines] = useState<GroceryLine[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("");

  const [settings, setSettings] = useState<GrocerySettings>({
    startDate: toISODate(new Date()),
    endDate: toISODate(new Date()),
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

  useEffect(() => {
    refresh();
  }, [refresh]);

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
      const item = pantryItems.find((p) => p.id === line.pantryItemId);
      const category = item?.category || "other";
      const list = map.get(category) ?? [];
      list.push(line);
      map.set(category, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [lines, pantryItems]);

  const estimate = useMemo(() => {
    let total = 0;
    let known = 0;
    for (const line of lines) {
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
        const item = pantryItems.find((p) => p.id === line.pantryItemId);
        return `${item?.name} - ${line.toBuyQty} ${line.unit}`;
      })
      .join("\n");
    await copyText(text);
    alert("Copied to clipboard");
  }

  return (
    <div className="grid">
      <section className="panel">
        <h2>Generate Grocery List</h2>
        <div className="grid grid-2">
          <label>
            Start date
            <input type="date" value={settings.startDate} onChange={(e) => setSettings({ ...settings, startDate: e.target.value })} />
          </label>
          <label>
            End date
            <input type="date" value={settings.endDate} onChange={(e) => setSettings({ ...settings, endDate: e.target.value })} />
          </label>
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
          <button className="secondary" onClick={handleDeleteList}>Delete list</button>
          <button className="secondary" onClick={handleCopy}>Copy list</button>
          <button className="secondary" onClick={() => window.print()}>Print</button>
        </div>
        <p>Estimated total: {estimate.total.toFixed(2)} ({estimate.known}/{estimate.totalLines} items priced)</p>
        {grouped.map(([category, items]) => (
          <div key={category} className="panel">
            <h3>{category}</h3>
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
                    const nameA = pantryItems.find((p) => p.id === a.pantryItemId)?.name || "";
                    const nameB = pantryItems.find((p) => p.id === b.pantryItemId)?.name || "";
                    return nameA.localeCompare(nameB);
                  })
                  .map((line) => {
                    const item = pantryItems.find((p) => p.id === line.pantryItemId);
                    const usedFor = JSON.parse(line.usedForJson || "{}");
                    const usedText = Object.entries(usedFor)
                      .map(([title, count]) => `${title} (${count})`)
                      .join(", ");
                    return (
                      <tr key={line.id}>
                        <td>{item?.name}</td>
                        <td>
                          {line.toBuyQty} {line.unit}
                        </td>
                        <td>{usedText}</td>
                        <td>
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
