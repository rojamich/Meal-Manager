import { lazy, Suspense, useState } from "react";
import type { ChangeEvent } from "react";
import EssentialsSection from "../essentials/EssentialsSection";
import PeopleSection from "../people/PeopleSection";
import PricesSection from "../prices/PricesSection";

const SyncSection = lazy(() => import("../sync/SyncSection"));
import { exportAll, importAll } from "../../db/db";
import { seedExampleData } from "../../db/seedExamples";
import { getHouseholdSize, getUnitDisplayMode, setHouseholdSize, setUnitDisplayMode } from "./preferences";
import type { UnitDisplayMode } from "../../utils/unitConversion";
import { useToast } from "../../components/useToast";

export default function SettingsPage() {
  const [importError, setImportError] = useState<string | null>(null);
  const [householdSize, setHouseholdSizeState] = useState<number>(getHouseholdSize());
  const [unitDisplayMode, setUnitDisplayModeState] = useState<UnitDisplayMode>(getUnitDisplayMode());
  const [seedingBusy, setSeedingBusy] = useState(false);
  const { notify, toast } = useToast();

  async function handleSeedExamples() {
    setSeedingBusy(true);
    try {
      const summary = await seedExampleData();
      const parts = [
        `${summary.pantryItemsCreated} pantry items added`,
        `${summary.recipesCreated} recipes added`,
        `${summary.essentialsCreated} essentials added`
      ];
      notify(parts.join(", ") + ".", "success");
    } catch (err: any) {
      notify(err?.message || "Seeding failed.", "error");
    } finally {
      setSeedingBusy(false);
    }
  }

  async function handleExport() {
    const bundle = await exportAll();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meal-manager-backup-${bundle.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importAll(data, true);
      setImportError(null);
      notify("Import complete. Reload the app.", "success");
    } catch (err: any) {
      setImportError(err.message || "Import failed");
    }
  }

  return (
    <div className="grid">
      <details className="panel" open>
        <summary>Sync</summary>
        <Suspense fallback={<p className="muted">Loading sync…</p>}>
          <SyncSection embedded />
        </Suspense>
      </details>

      <details className="panel" open>
        <summary>Planner Defaults</summary>
        <label>
          Household size
          <input
            type="number"
            min="1"
            step="1"
            value={householdSize}
            onChange={(e) => {
              const next = Math.max(Number(e.target.value || 2), 1);
              setHouseholdSizeState(next);
              setHouseholdSize(next);
            }}
          />
        </label>
        <p className="muted">Used for default planned servings and leftover calculations.</p>
        <hr style={{ margin: "12px 0" }} />
        <label>
          <input
            type="checkbox"
            checked={unitDisplayMode === "metric-plus-imperial"}
            onChange={(e) => {
              const next: UnitDisplayMode = e.target.checked ? "metric-plus-imperial" : "metric";
              setUnitDisplayModeState(next);
              setUnitDisplayMode(next);
              window.dispatchEvent(new CustomEvent("unit-display-mode-changed"));
            }}
          />
          {" "}Show imperial alongside metric on the grocery list
        </label>
        <p className="muted" style={{ fontSize: 12 }}>
          Displays oz/lb next to grams and fl oz/cups next to ml. Helpful when shopping in countries that use imperial.
        </p>
      </details>

      <details className="panel" open>
        <summary>Starter data</summary>
        <p className="muted">
          Adds Mike + Jen's typical pantry items, essentials (with sensible bulk thresholds), and a starter
          rotation of recipes. Safe to click repeatedly — items already present are kept as-is.
        </p>
        <div className="row">
          <button onClick={() => void handleSeedExamples()} disabled={seedingBusy}>
            {seedingBusy ? "Adding…" : "Add example recipes & essentials"}
          </button>
        </div>
      </details>

      <details className="panel" open>
        <summary>Backup</summary>
        <div className="row">
          <button onClick={handleExport}>Export JSON</button>
          <label>
            Import JSON
            <input type="file" accept="application/json" onChange={handleImport} />
          </label>
        </div>
        {importError && <p style={{ color: "#dc2626" }}>{importError}</p>}
      </details>

      <details className="panel" open>
        <summary>People</summary>
        <PeopleSection embedded />
      </details>
      <details className="panel">
        <summary>Essentials</summary>
        <EssentialsSection embedded />
      </details>
      <details className="panel">
        <summary>Price History</summary>
        <PricesSection embedded />
      </details>
      {toast}
    </div>
  );
}
