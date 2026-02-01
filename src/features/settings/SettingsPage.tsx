import { useState } from "react";
import type { ChangeEvent } from "react";
import EssentialsSection from "../essentials/EssentialsSection";
import LocationsSection from "../locations/LocationsSection";
import PricesSection from "../prices/PricesSection";
import { exportAll, importAll } from "../../db/db";

export default function SettingsPage() {
  const [importError, setImportError] = useState<string | null>(null);

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
      alert("Import complete. Reload the app.");
    } catch (err: any) {
      setImportError(err.message || "Import failed");
    }
  }

  return (
    <div className="grid">
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

      <details className="panel">
        <summary>Essentials</summary>
        <EssentialsSection embedded />
      </details>
      <details className="panel">
        <summary>Locations</summary>
        <LocationsSection embedded />
      </details>
      <details className="panel">
        <summary>Price History</summary>
        <PricesSection embedded />
      </details>

      <details className="panel">
        <summary>Sync (optional scaffold)</summary>
        <p>Firebase sync is disabled by default. Set VITE_ENABLE_FIREBASE_SYNC=true to enable the stub.</p>
      </details>
    </div>
  );
}
