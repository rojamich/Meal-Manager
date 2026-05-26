import { useState } from "react";
import type { ChangeEvent } from "react";
import EssentialsSection from "../essentials/EssentialsSection";
import PeopleSection from "../people/PeopleSection";
import PricesSection from "../prices/PricesSection";
import SyncSection from "../sync/SyncSection";
import { exportAll, importAll } from "../../db/db";
import { getHouseholdSize, setHouseholdSize } from "./preferences";
import { useToast } from "../../components/useToast";

export default function SettingsPage() {
  const [importError, setImportError] = useState<string | null>(null);
  const [householdSize, setHouseholdSizeState] = useState<number>(getHouseholdSize());
  const { notify, toast } = useToast();

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
        <SyncSection embedded />
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
