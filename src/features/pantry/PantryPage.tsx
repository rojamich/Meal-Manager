import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { BaseUnit, InventoryLot, PantryItem, StorageType } from "../../models";
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
  listActiveLots,
  listInventoryLots
} from "../../db/repositories/inventoryRepo";
import { listLocations } from "../../db/repositories/locationRepo";
import { dateKey, parseISODate, toISODate } from "../../utils/date";
import { PANTRY_CATEGORY_OPTIONS, normalizePantryCategoryKey, pantryCategoryLabel } from "../../utils/pantryCategories";

const categories = PANTRY_CATEGORY_OPTIONS.map((option) => option.key);
const STORAGE_TYPE_OPTIONS: StorageType[] = ["pantry", "fridge", "freezer"];

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editing, setEditing] = useState<PantryItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [lotError, setLotError] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string>("__ALL__");
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
    const all =
      itemId === "__ALL__"
        ? await listActiveLots(locationId)
        : await listInventoryLots(itemId);
    const today = dateKey(new Date());
    const active = all.filter((lot) => {
      if (lot.archivedAt) return false;
      if (locationId && lot.locationId !== locationId) return false;
      if (!lot.expiresAt) return true;
      return dateKey(lot.expiresAt) >= today;
    });
    setLots([...active]);
  }

  async function reloadLotsForCurrentView() {
    if (!selectedItemId) {
      setLots([]);
      return;
    }
    await loadLots(selectedItemId, emptyLocationId || undefined);
  }

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    reloadLotsForCurrentView();
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
    setLotError(null);
    if (!selectedItemId || selectedItemId === "__ALL__") {
      setLotError("Select a pantry item to add a lot.");
      return;
    }
    const form = new FormData(e.currentTarget);
    const quantity = Number(form.get("quantity") || 0);
    if (!quantity || quantity <= 0) {
      setLotError("Enter a quantity greater than 0.");
      return;
    }
    await createInventoryLot({
      pantryItemId: selectedItemId,
      quantity,
      purchasedAt: String(form.get("purchasedAt")),
      expiresAt: String(form.get("expiresAt") || "") || undefined,
      locationId: String(form.get("locationId") || "") || undefined,
      notes: String(form.get("notes") || "") || undefined
    });
    const formEl = e.currentTarget as HTMLFormElement | null;
    formEl?.reset();
    const purchasedInput = formEl?.querySelector<HTMLInputElement>('input[name="purchasedAt"]');
    if (purchasedInput) purchasedInput.value = toISODate(new Date());
    await reloadLotsForCurrentView();
  }

  async function archiveLot(id: string) {
    await archiveInventoryLot(id);
    await reloadLotsForCurrentView();
  }

  async function handleEmptyPantry() {
    if (!confirm("Archive all active lots for this location?")) return;
    await emptyPantry(emptyLocationId || undefined);
    await reloadLotsForCurrentView();
  }

  return (
    <div className="grid grid-2 resource-two-panel">
      <section className="panel">
        <div className="row resource-toolbar">
          <input
            placeholder="Search pantry items"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All categories</option>
            {PANTRY_CATEGORY_OPTIONS.map((cat) => (
              <option key={cat.key} value={cat.key}>
                {cat.label}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              setEditing({
                id: "",
                name: "",
                category: "produce",
                storageType: "pantry",
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
        <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Storage Type</th>
              <th>Unit</th>
              <th>Shelf life</th>
              <th>After Opening</th>
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
                <td data-label="Category">{pantryCategoryLabel(item.category)}</td>
                <td data-label="Storage Type">{item.storageType || "pantry"}</td>
                <td data-label="Unit">{item.baseUnit}</td>
                <td data-label="Shelf life">
                  {item.defaultShelfLifeDays == null ? "—" : `${item.defaultShelfLifeDays}d`}
                </td>
                <td data-label="After opening">{item.defaultAfterOpeningDays == null ? "-" : `${item.defaultAfterOpeningDays}d`}</td>
                <td data-label="Actions" className="table-actions">
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
        </div>
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
        <div className="row resource-toolbar">
          <select value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)}>
            <option value="__ALL__">All pantry items</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <div className="row resource-toolbar pantry-lot-actions">
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
          {selectedItemId && selectedItemId !== "__ALL__" && (
            <form className="grid" onSubmit={addLot}>
              <div className="row resource-toolbar lot-form-row">
                <input name="quantity" type="number" step="0.01" placeholder="Quantity" required />
                {selectedItem && <span className="muted">{selectedItem.baseUnit}</span>}
                <input name="purchasedAt" type="date" defaultValue={toISODate(new Date())} />
                <input name="expiresAt" type="date" />
              </div>
              <div className="row resource-toolbar lot-form-row">
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
              {lotError && <p className="muted">{lotError}</p>}
            </form>
          )}
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {selectedItemId === "__ALL__" && <th>Item</th>}
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
                  {selectedItemId === "__ALL__" && (
                    <td data-label="Item">
                      {items.find((i) => i.id === lot.pantryItemId)?.name || "Item"}
                    </td>
                  )}
                  <td data-label="Qty">{lot.quantity}</td>
                  <td data-label="Purchased">{lot.purchasedAt}</td>
                  <td data-label="Expires">{lot.expiresAt || "-"}</td>
                  <td data-label="Location">{locations.find((l) => l.id === lot.locationId)?.name || "-"}</td>
                  <td data-label="Actions" className="table-actions">
                    {!lot.archivedAt && (
                      <button className="secondary" onClick={() => archiveLot(lot.id)}>
                        Archive
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {selectedItemId && lots.length === 0 && (
                <tr>
                  <td colSpan={selectedItemId === "__ALL__" ? 6 : 5} className="muted">No active lots.</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
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
    category: normalizePantryCategoryKey(item.category || "produce"),
    storageType: item.storageType || "pantry",
    baseUnit: item.baseUnit || "count",
    defaultShelfLifeDays: item.defaultShelfLifeDays || "",
    defaultAfterOpeningDays: item.defaultAfterOpeningDays || "",
    notes: item.notes || ""
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      category: form.category,
      storageType: form.storageType as StorageType,
      baseUnit: form.baseUnit as PantryItem["baseUnit"],
      defaultShelfLifeDays: form.defaultShelfLifeDays ? Number(form.defaultShelfLifeDays) : undefined,
      defaultAfterOpeningDays: form.defaultAfterOpeningDays ? Number(form.defaultAfterOpeningDays) : undefined,
      notes: form.notes || undefined
    };
    if (item.id) {
      onSave({ ...item, ...payload });
    } else {
      onSave(payload);
    }
  }

  return (
    <form className="grid resource-form" onSubmit={submit}>
      <input
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="Name"
        required
      />
      <div className="row resource-toolbar form-row-grid">
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {PANTRY_CATEGORY_OPTIONS.map((cat) => (
            <option key={cat.key} value={cat.key}>
              {cat.label}
            </option>
          ))}
        </select>
        <select
          value={form.storageType}
          onChange={(e) => setForm({ ...form, storageType: e.target.value as StorageType })}
        >
          {STORAGE_TYPE_OPTIONS.map((storageType) => (
            <option key={storageType} value={storageType}>
              {storageType}
            </option>
          ))}
        </select>
        <select value={form.baseUnit} onChange={(e) => setForm({ ...form, baseUnit: e.target.value as BaseUnit })}>
          <option value="count">count</option>
          <option value="g">g</option>
          <option value="ml">ml</option>
        </select>
      </div>
      <div className="row resource-toolbar form-row-grid">
        <input
          type="number"
          value={form.defaultShelfLifeDays}
          onChange={(e) => setForm({ ...form, defaultShelfLifeDays: e.target.value })}
          placeholder="Default shelf life days"
        />
        <input
          type="number"
          value={form.defaultAfterOpeningDays}
          onChange={(e) => setForm({ ...form, defaultAfterOpeningDays: e.target.value })}
          placeholder="After opening days"
        />
      </div>
      <textarea
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
        placeholder="Notes"
      />
      <div className="row resource-toolbar">
        <button type="submit">Save</button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
