import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { LocationProfile } from "../../models";
import { createLocation, deleteLocation, listLocations, updateLocation } from "../../db/repositories/locationRepo";

export default function LocationsSection({ embedded = false }: { embedded?: boolean } = {}) {
  const [locations, setLocations] = useState<LocationProfile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLocations([...(await listLocations())]);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addLocation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") || "").trim();
    const currencyCode = String(form.get("currencyCode") || "").trim();
    const rateRaw = String(form.get("exchangeRateToUSD") || "").trim();
    const rateValue = rateRaw ? Number(rateRaw) : undefined;
    if (!name || !currencyCode) {
      setError("Name and currency are required.");
      return;
    }
    if (rateRaw && (!Number.isFinite(rateValue) || (rateValue ?? 0) <= 0)) {
      setError("Exchange rate must be greater than 0.");
      return;
    }
    if (locations.some((loc) => loc.name.toLowerCase() === name.toLowerCase())) {
      setError("Location name already exists.");
      return;
    }
    await createLocation({
      name,
      currencyCode,
      exchangeRateToUSD: rateValue
    });
    const formEl = e.currentTarget as HTMLFormElement | null;
    formEl?.reset();
    setError(null);
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
        <input name="exchangeRateToUSD" type="number" step="any" placeholder="Rate to USD" />
        <button type="submit">Add</button>
      </form>
      {error && <p className="muted">{error}</p>}
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
                <input
                  type="number"
                  step="any"
                  value={loc.exchangeRateToUSD || ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const next = raw === "" ? undefined : Number(raw);
                    if (raw !== "" && !Number.isFinite(next)) return;
                    updateField(loc.id, "exchangeRateToUSD", next);
                  }}
                />
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
