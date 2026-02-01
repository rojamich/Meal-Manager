import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { LocationProfile } from "../../models";
import { createLocation, deleteLocation, listLocations, updateLocation } from "../../db/repositories/locationRepo";

export default function LocationsSection({ embedded = false }: { embedded?: boolean } = {}) {
  const [locations, setLocations] = useState<LocationProfile[]>([]);

  const refresh = useCallback(async () => {
    setLocations([...(await listLocations())]);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addLocation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await createLocation({
      name: String(form.get("name")),
      currencyCode: String(form.get("currencyCode")),
      exchangeRateToUSD: Number(form.get("exchangeRateToUSD") || 0) || undefined
    });
    e.currentTarget.reset();
    await refresh();
  }

  async function updateField(id: string, key: keyof LocationProfile, value: any) {
    await updateLocation(id, { [key]: value });
    await refresh();
  }

  async function remove(id: string) {
    await deleteLocation(id);
    await refresh();
  }

  const body = (
    <>
      {!embedded && <h3>Locations</h3>}
      <form className="row" onSubmit={addLocation}>
        <input name="name" placeholder="Name" required />
        <input name="currencyCode" placeholder="Currency" required />
        <input name="exchangeRateToUSD" type="number" step="0.0001" placeholder="Rate to USD" />
        <button type="submit">Add</button>
      </form>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Currency</th>
            <th>Rate to USD</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {locations.map((loc) => (
            <tr key={loc.id}>
              <td data-label="Name">
                <input value={loc.name} onChange={(e) => updateField(loc.id, "name", e.target.value)} />
              </td>
              <td data-label="Currency">
                <input value={loc.currencyCode} onChange={(e) => updateField(loc.id, "currencyCode", e.target.value)} />
              </td>
              <td data-label="Rate to USD">
                <input type="number" step="0.0001" value={loc.exchangeRateToUSD || ""} onChange={(e) => updateField(loc.id, "exchangeRateToUSD", Number(e.target.value) || undefined)} />
              </td>
              <td data-label="Actions">
                <button className="danger" onClick={() => remove(loc.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );

  return embedded ? <div>{body}</div> : <div className="panel">{body}</div>;
}
