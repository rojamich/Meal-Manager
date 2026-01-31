import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { PantryItem, PurchaseEntry } from "../../models";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { listLocations } from "../../db/repositories/locationRepo";
import { createPurchaseEntry, deletePurchaseEntry, listPurchaseEntries } from "../../db/repositories/purchaseRepo";
import { toISODate } from "../../utils/date";

export default function PricesSection() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [entries, setEntries] = useState<PurchaseEntry[]>([]);

  const refresh = useCallback(async () => {
    setItems([...(await listPantryItems())]);
    setLocations([...(await listLocations())]);
    setEntries([...(await listPurchaseEntries())]);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addEntry(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await createPurchaseEntry({
      pantryItemId: String(form.get("pantryItemId")),
      quantity: Number(form.get("quantity") || 0),
      totalPrice: Number(form.get("totalPrice") || 0),
      currencyCode: String(form.get("currencyCode")),
      locationId: String(form.get("locationId") || "") || undefined,
      store: String(form.get("store") || "") || undefined,
      date: String(form.get("date"))
    });
    e.currentTarget.reset();
    await refresh();
  }

  async function remove(id: string) {
    await deletePurchaseEntry(id);
    await refresh();
  }

  return (
    <div className="panel">
      <h3>Price History</h3>
      <form className="row" onSubmit={addEntry}>
        <select name="pantryItemId" required defaultValue="">
          <option value="" disabled>Select item</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <input name="quantity" type="number" step="0.01" placeholder="Quantity" required />
        <input name="totalPrice" type="number" step="0.01" placeholder="Total price" required />
        <input name="currencyCode" placeholder="Currency" required />
        <select name="locationId" defaultValue="">
          <option value="">No location</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>
        <input name="store" placeholder="Store" />
        <input name="date" type="date" defaultValue={toISODate(new Date())} />
        <button type="submit">Add</button>
      </form>
      <table className="table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Total</th>
            <th>Currency</th>
            <th>Date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{items.find((i) => i.id === entry.pantryItemId)?.name}</td>
              <td>{entry.quantity}</td>
              <td>{entry.totalPrice}</td>
              <td>{entry.currencyCode}</td>
              <td>{entry.date}</td>
              <td>
                <button className="secondary" onClick={() => remove(entry.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
