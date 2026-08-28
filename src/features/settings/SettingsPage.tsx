import { lazy, Suspense, useState } from "react";
import type { ChangeEvent } from "react";
import EssentialsSection from "../essentials/EssentialsSection";
import PeopleSection from "../people/PeopleSection";
import PricesSection from "../prices/PricesSection";

const SyncSection = lazy(() => import("../sync/SyncSection"));
import { describeBundle, exportAll, importAll } from "../../db/db";
import { getActiveHouseholdId } from "../../sync/householdRepo";
import { seedExampleData } from "../../db/seedExamples";
import {
  getAutoEatLeftovers,
  getHouseholdSize,
  getUnitDisplayMode,
  setAutoEatLeftovers,
  setHouseholdSize,
  setUnitDisplayMode
} from "./preferences";
import type { UnitDisplayMode } from "../../utils/unitConversion";
import { useToast } from "../../components/useToast";
import { useConfirmChoiceModal } from "../../components/useConfirmChoiceModal";

export default function SettingsPage() {
  const [importError, setImportError] = useState<string | null>(null);
  const [householdSize, setHouseholdSizeState] = useState<number>(getHouseholdSize());
  const [unitDisplayMode, setUnitDisplayModeState] = useState<UnitDisplayMode>(getUnitDisplayMode());
  const [autoEatLeftovers, setAutoEatLeftoversState] = useState<boolean>(getAutoEatLeftovers());
  const [seedingBusy, setSeedingBusy] = useState(false);
  const { notify, toast } = useToast();
  const { requestChoice, modal } = useConfirmChoiceModal();

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
    const input = e.target;
    const file = input.files?.[0];
    // Reset immediately so picking the same file twice still fires a change event.
    input.value = "";
    if (!file) return;

    setImportError(null);
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setImportError("That file isn't valid JSON. Pick a Meal Manager backup file.");
      return;
    }

    // Parse before asking, so the prompt can say what's actually in the file.
    let summary: string;
    try {
      summary = describeBundle(data);
    } catch (err: any) {
      setImportError(err?.message || "That file isn't a Meal Manager backup.");
      return;
    }

    const connected = Boolean(getActiveHouseholdId());
    const choice = await requestChoice({
      title: "Replace everything with this backup?",
      message: `${summary} This erases all data currently on this device and cannot be undone.`,
      detail: connected
        ? "This device is connected to a household, so the replacement syncs to everyone else in it too. Export a backup first if you're not certain."
        : "Export a backup first if anything on this device matters.",
      choices: [
        { label: "Replace all data", value: "confirm-import", tone: "danger" },
        { label: "Cancel", value: "cancel", tone: "neutral" }
      ]
    });
    if (choice !== "confirm-import") return;

    try {
      await importAll(data, true);
      notify("Import complete — reloading…", "success");
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (err: any) {
      setImportError(err?.message || "Import failed");
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
        <hr style={{ margin: "12px 0" }} />
        <label>
          <input
            type="checkbox"
            checked={autoEatLeftovers}
            onChange={(e) => {
              setAutoEatLeftoversState(e.target.checked);
              setAutoEatLeftovers(e.target.checked);
            }}
          />
          {" "}Auto-eat past leftover meals
        </label>
        <p className="muted" style={{ fontSize: 12 }}>
          When a planned leftover meal's day has passed, mark it eaten and deduct its servings from the
          cooked portion in the fridge automatically. You can always undo from the meal chip.
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
      {modal}
      {toast}
    </div>
  );
}
