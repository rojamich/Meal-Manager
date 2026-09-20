import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { LocationProfile } from "../../models";
import { createLocation, deleteLocation, listLocations, updateLocation } from "../../db/repositories/locationRepo";
import { dateKey } from "../../utils/date";
import { formatPriceAge } from "../../utils/price";

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
      exchangeRateToUSD: rateValue,
      rateAsOf: rateValue !== undefined ? dateKey(new Date()) : undefined
    });
    const formEl = e.currentTarget as HTMLFormElement | null;
    formEl?.reset();
    setError(null);
    await refresh();
  }

  async function updateField(id: string, key: keyof LocationProfile, value: any) {
    // A rate edit restamps its own date. Otherwise a rate typed a year ago and corrected
    // today would still claim to be a year old, and the staleness warning would be noise.
    const extra = key === "exchangeRateToUSD" ? { rateAsOf: dateKey(new Date()) } : undefined;
    await updateLocation(id, { [key]: value, ...extra });
    await refresh();
  }

  /** Reads a number field, leaving the value alone while it is mid-typing. */
  function numericUpdate(id: string, key: keyof LocationProfile, raw: string) {
    const next = raw === "" ? undefined : Number(raw);
    if (raw !== "" && !Number.isFinite(next)) return;
    updateField(id, key, next);
  }

  function rateAge(loc: LocationProfile) {
    if (!loc.exchangeRateToUSD || !loc.rateAsOf) return null;
    const days = Math.max(
      Math.round((Date.now() - new Date(`${loc.rateAsOf}T00:00:00`).getTime()) / 86_400_000),
      0
    );
    if (days < 45) return null;
    return <span className="muted" style={{ fontSize: 11 }}> rate {formatPriceAge(days)}</span>;
  }

  async function remove(id: string) {
    await deleteLocation(id);
    await refresh();
  }

  const body = (
    <>
      {!embedded && <h3>Locations</h3>}
      <form className="row resource-toolbar" onSubmit={addLocation}>
        <label className="field-stack">
          <span>Name</span>
          <input name="name" placeholder="Home" required />
        </label>
        <label className="field-stack">
          <span>Currency</span>
          <input name="currencyCode" placeholder="USD" required />
        </label>
        <label className="field-stack">
          <span>USD per 1 unit</span>
          <input name="exchangeRateToUSD" type="number" step="any" placeholder="1" />
        </label>
        <button type="submit">Add</button>
      </form>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        The rate is how many US dollars one unit of that currency is worth — 1 for USD, about
        0.0067 for yen, about 1.08 for euro. Costs are only compared between purchases that can
        be converted, so a location with no rate keeps its prices to itself.
      </p>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        <strong>Eating out, per person</strong> is what a normal meal out costs here, in this
        location&rsquo;s currency. Planned meals are compared against it, so you can see when
        cooking has stopped being the cheaper option.{" "}
        <strong>Inflation</strong> is optional and only matters where prices move fast: set it
        and an older price gets carried forward instead of being shown as if it were today&rsquo;s.
      </p>
      {error && <p className="muted">{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Currency</th>
            <th>USD per 1 unit</th>
            <th>Eating out, per person</th>
            <th>Inflation %/yr</th>
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
              <td data-label="USD per 1 unit">
                <input
                  type="number"
                  step="any"
                  value={loc.exchangeRateToUSD || ""}
                  onChange={(e) => numericUpdate(loc.id, "exchangeRateToUSD", e.target.value)}
                />
                {rateAge(loc)}
              </td>
              <td data-label="Eating out, per person">
                <input
                  type="number"
                  step="any"
                  placeholder="—"
                  value={loc.eatOutCostPerPerson ?? ""}
                  onChange={(e) => numericUpdate(loc.id, "eatOutCostPerPerson", e.target.value)}
                />
              </td>
              <td data-label="Inflation %/yr">
                <input
                  type="number"
                  step="any"
                  placeholder="0"
                  value={loc.annualInflationPct ?? ""}
                  onChange={(e) => numericUpdate(loc.id, "annualInflationPct", e.target.value)}
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
