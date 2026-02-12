import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { BaseUnit, InventoryLot, PantryItem } from "../../models";
import {
  createPantryItem,
  deletePantryItem,
  listPantryItems,
  updatePantryItem
} from "../../db/repositories/pantryRepo";
import {
  archiveInventoryLot,
  createInventoryLot,
  emptyPantry,
  listInventoryLots
} from "../../db/repositories/inventoryRepo";
import { listLocations } from "../../db/repositories/locationRepo";
import { parseISODate, toISODate } from "../../utils/date";

const categories = ["produce", "dairy", "pantry", "freezer", "spices", "bakery", "protein", "other"];
const titleCase = (value: string) => value ? value.replace(/\b\w/g, (c) => c.toUpperCase()) : value;

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editing, setEditing] = useState<PantryItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [emptyLocationId, setEmptyLocationId] = useState<string>("");
  const selectedItem = items.find((item) => item.id === selectedItemId);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !q || item.name.toLowerCase().includes(q);
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [items, search, categoryFilter]);

  const refresh = useCallback(async () => {
    setItems([...(await listPantryItems())]);
    setLocations([...(await listLocations())]);
  }, []);

  async function loadLots(itemId: string, locationId?: string) {
    const all = await listInventoryLots(itemId);
    const today = parseISODate(toISODate(new Date()));
    const active = all.filter((lot) => {
      if (lot.archivedAt) return false;
      if (locationId && lot.locationId !== locationId) return false;
      if (!lot.expiresAt) return true;
      return parseISODate(lot.expiresAt) >= today;
    });
    setLots([...active]);
  }

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (selectedItemId) {
      loadLots(selectedItemId, emptyLocationId || undefined);
    } else {
      setLots([]);
    }
  }, [selectedItemId, emptyLocationId]);

  async function saveItem(form: PantryItem | Omit<PantryItem, "id" | "createdAt" | "updatedAt">) {
    setError(null);
    try {
      if ("id" in form && form.id) {
        await updatePantryItem(form.id, form);
      } else {
        await createPantryItem(form);
      }
      setEditing(null);
      await refresh();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    }
  }

  async function removeItem(id: string) {
    if (!confirm("Delete this pantry item?")) return;
    await deletePantryItem(id);
    if (selectedItemId === id) setSelectedItemId("");
    await refresh();
  }

  async function addLot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedItemId) return;
    const form = new FormData(e.currentTarget);
    const quantity = Number(form.get("quantity") || 0);
    if (!quantity) return;
    await createInventoryLot({
      pantryItemId: selectedItemId,
      quantity,
      purchasedAt: String(form.get("purchasedAt")),
      expiresAt: String(form.get("expiresAt") || "") || undefined,
      locationId: String(form.get("locationId") || "") || undefined,
      notes: String(form.get("notes") || "") || undefined
    });
    e.currentTarget.reset();
    await loadLots(selectedItemId, emptyLocationId || undefined);
  }

  async function archiveLot(id: string) {
    await archiveInventoryLot(id);
    await loadLots(selectedItemId, emptyLocationId || undefined);
  }

  async function handleEmptyPantry() {
    if (!confirm("Archive all active lots for this location?")) return;
    await emptyPantry(emptyLocationId || undefined);
    if (selectedItemId) {
      await loadLots(selectedItemId, emptyLocationId || undefined);
    }
  }

  return (
    <div className="grid grid-2">
      <section className="panel">
        <div className="row">
          <input
            placeholder="Search pantry items"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {titleCase(cat)}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              setEditing({
                id: "",
                name: "",
                category: "produce",
                baseUnit: "count",
                notes: "",
                createdAt: "",
                updatedAt: ""
              })
            }
          >
            Add Item
          </button>
        </div>
        {error && <p style={{ color: "#dc2626" }}>{error}</p>}
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Unit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td data-label="Name">
                  <button className="ghost" onClick={() => setSelectedItemId(item.id)}>
                    {item.name}
                  </button>
                </td>
                <td data-label="Category">{titleCase(item.category)}</td>
                <td data-label="Unit">{item.baseUnit}</td>
                <td data-label="Actions">
                  <button className="secondary" onClick={() => setEditing(item)}>
                    Edit
                  </button>
                  <button className="danger" onClick={() => removeItem(item.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Pantry Item</h2>
        {editing ? (
          <PantryForm item={editing} onCancel={() => setEditing(null)} onSave={saveItem} />
        ) : (
          <p>Select an item to manage lots or click Add Item.</p>
        )}

        <hr />
        <h3>Inventory Lots</h3>
        <div className="row">
          <select value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)}>
            <option value="">Select pantry item</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <div className="row">
            <select value={emptyLocationId} onChange={(e) => setEmptyLocationId(e.target.value)}>
              <option value="">All locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
            <button className="danger" onClick={handleEmptyPantry}>
              Empty Pantry
            </button>
          </div>
        </div>
        <div className={selectedItemId ? "" : "mobile-hide"}>
          {selectedItemId && (
            <form className="grid" onSubmit={addLot}>
              <div className="row">
                <input name="quantity" type="number" step="0.01" placeholder="Quantity" required />
                {selectedItem && <span className="muted">{selectedItem.baseUnit}</span>}
                <input name="purchasedAt" type="date" defaultValue={toISODate(new Date())} />
                <input name="expiresAt" type="date" />
              </div>
              <div className="row">
                <select name="locationId" defaultValue="">
                  <option value="">No location</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
                <input name="notes" placeholder="Notes" />
                <button type="submit">Add Lot</button>
              </div>
            </form>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>Qty</th>
                <th>Purchased</th>
                <th>Expires</th>
                <th>Location</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr key={lot.id}>
                  <td data-label="Qty">{lot.quantity}</td>
                  <td data-label="Purchased">{lot.purchasedAt}</td>
                  <td data-label="Expires">{lot.expiresAt || "-"}</td>
                  <td data-label="Location">{locations.find((l) => l.id === lot.locationId)?.name || "-"}</td>
                  <td data-label="Actions">
                    {!lot.archivedAt && (
                      <button className="secondary" onClick={() => archiveLot(lot.id)}>
                        Archive
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PantryForm({
  item,
  onSave,
  onCancel
}: {
  item: PantryItem;
  onSave: (input: any) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: item.name,
    category: item.category || "produce",
    baseUnit: item.baseUnit || "count",
    defaultShelfLifeDays: item.defaultShelfLifeDays || "",
    notes: item.notes || ""
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      category: form.category,
      baseUnit: form.baseUnit as PantryItem["baseUnit"],
      defaultShelfLifeDays: form.defaultShelfLifeDays ? Number(form.defaultShelfLifeDays) : undefined,
      notes: form.notes || undefined
    };
    if (item.id) {
      onSave({ ...item, ...payload });
    } else {
      onSave(payload);
    }
  }

  return (
    <form className="grid" onSubmit={submit}>
      <input
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="Name"
        required
      />
      <div className="row">
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {titleCase(cat)}
            </option>
          ))}
        </select>
        <select value={form.baseUnit} onChange={(e) => setForm({ ...form, baseUnit: e.target.value as BaseUnit })}>
          <option value="count">count</option>
          <option value="g">g</option>
          <option value="ml">ml</option>
        </select>
      </div>
      <input
        type="number"
        value={form.defaultShelfLifeDays}
        onChange={(e) => setForm({ ...form, defaultShelfLifeDays: e.target.value })}
        placeholder="Default shelf life days"
      />
      <textarea
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
        placeholder="Notes"
      />
      <div className="row">
        <button type="submit">Save</button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
