import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { EssentialItem, PantryItem } from "../../models";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { createEssentialItem, deleteEssentialItem, listEssentialItems, updateEssentialItem } from "../../db/repositories/essentialsRepo";

export default function EssentialsSection({ embedded = false }: { embedded?: boolean } = {}) {
  const [items, setItems] = useState<EssentialItem[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);

  const refresh = useCallback(async () => {
    setItems([...(await listEssentialItems())]);
    setPantryItems([...(await listPantryItems())]);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addEssential(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const pantryItemId = String(form.get("pantryItemId") || "") || undefined;
    const freeformLabel = String(form.get("freeformLabel") || "") || undefined;
    await createEssentialItem({
      pantryItemId,
      freeformLabel,
      defaultQty: Number(form.get("defaultQty") || 0) || undefined,
      category: String(form.get("category") || "") || undefined,
      includeWhenPantryEmpty: Boolean(form.get("includeWhenPantryEmpty")),
      alwaysInclude: Boolean(form.get("alwaysInclude")),
      minStayDays: Number(form.get("minStayDays") || 0) || undefined
    });
    e.currentTarget.reset();
    await refresh();
  }

  async function toggle(id: string, key: "includeWhenPantryEmpty" | "alwaysInclude") {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    await updateEssentialItem(id, { [key]: !item[key] });
    await refresh();
  }

  async function remove(id: string) {
    await deleteEssentialItem(id);
    await refresh();
  }

  const body = (
    <>
      {!embedded && <h3>Essentials</h3>}
      <form className="row" onSubmit={addEssential}>
        <select name="pantryItemId" defaultValue="">
          <option value="">Select pantry item</option>
          {pantryItems.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <input name="freeformLabel" placeholder="Freeform label" />
        <input name="defaultQty" type="number" step="0.01" placeholder="Default qty" />
        <input name="category" placeholder="Category" />
        <input name="minStayDays" type="number" placeholder="Min stay days" />
        <label>
          <input type="checkbox" name="includeWhenPantryEmpty" /> Pantry empty
        </label>
        <label>
          <input type="checkbox" name="alwaysInclude" /> Always include
        </label>
        <button type="submit">Add</button>
      </form>
      <table className="table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Rules</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td data-label="Item">
                {item.pantryItemId ? pantryItems.find((p) => p.id === item.pantryItemId)?.name : item.freeformLabel}
              </td>
              <td data-label="Qty">{item.defaultQty}</td>
              <td data-label="Rules">
                <label>
                  <input type="checkbox" checked={item.includeWhenPantryEmpty} onChange={() => toggle(item.id, "includeWhenPantryEmpty")} /> Pantry empty
                </label>
                <label>
                  <input type="checkbox" checked={item.alwaysInclude} onChange={() => toggle(item.id, "alwaysInclude")} /> Always
                </label>
              </td>
              <td data-label="Actions">
                <button className="danger" onClick={() => remove(item.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Note: Freeform essentials are stored but not included in generator yet.</p>
    </>
  );

  return embedded ? <div>{body}</div> : <div className="panel">{body}</div>;
}
