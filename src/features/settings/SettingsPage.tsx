import { useState } from "react";
import type { ChangeEvent } from "react";
import EssentialsSection from "../essentials/EssentialsSection";
import LocationsSection from "../locations/LocationsSection";
import PricesSection from "../prices/PricesSection";
import { exportAll, importAll } from "../../db/db";
import { getHouseholdSize, setHouseholdSize } from "./preferences";
import { createAiWeekTemplate } from "./aiWeekTemplate";
import { analyzeAiImportConflicts, importAiWeekPlanWithOptions } from "./aiImport";
import { useConfirmChoiceModal } from "../../components/useConfirmChoiceModal";

export default function SettingsPage() {
  const [importError, setImportError] = useState<string | null>(null);
  const [aiImportError, setAiImportError] = useState<string | null>(null);
  const [aiImportSuccess, setAiImportSuccess] = useState<string | null>(null);
  const [householdSize, setHouseholdSizeState] = useState<number>(getHouseholdSize());
  const { requestChoice, modal } = useConfirmChoiceModal();

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

  function handleExportAiTemplate() {
    const template = createAiWeekTemplate();
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meal-manager-ai-week-template-${template.weekOf}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleAiImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const conflicts = await analyzeAiImportConflicts(text);
      let recipeConflictStrategy: "reuse" | "update" = "reuse";
      if (conflicts.duplicateRecipeTitles.length > 0) {
        const recipeChoice = await requestChoice({
          title: "Recipe Conflicts Detected",
          message: "The AI import contains recipes that already exist in your database.",
          detail:
            `${conflicts.duplicateRecipeTitles.length} matching recipes were found. How should these be handled?` +
            (conflicts.duplicateRecipeTitles.length
              ? `\nExamples: ${conflicts.duplicateRecipeTitles.slice(0, 5).join(", ")}${conflicts.duplicateRecipeTitles.length > 5 ? "..." : ""}`
              : ""),
          choices: [
            { label: "Make All Changes", value: "update-all", tone: "primary" },
            { label: "Refuse All Changes", value: "reuse-all", tone: "neutral" },
            { label: "Cancel Import", value: "cancel-import", tone: "danger" }
          ]
        });
        if (!recipeChoice || recipeChoice === "cancel-import") {
          setAiImportSuccess(null);
          setAiImportError("AI import canceled.");
          return;
        }
        recipeConflictStrategy = recipeChoice === "update-all" ? "update" : "reuse";
      }

      let pantryConflictStrategy: "keep" | "update" = "keep";
      if (conflicts.duplicatePantryItemNames.length > 0) {
        const pantryChoice = await requestChoice({
          title: "Pantry Item Conflicts Detected",
          message: "The AI import includes pantry items that already exist.",
          detail:
            `${conflicts.duplicatePantryItemNames.length} matching pantry items were found. How should these be handled?` +
            (conflicts.duplicatePantryItemNames.length
              ? `\nExamples: ${conflicts.duplicatePantryItemNames.slice(0, 5).join(", ")}${conflicts.duplicatePantryItemNames.length > 5 ? "..." : ""}`
              : ""),
          choices: [
            { label: "Make All Changes", value: "update-all", tone: "primary" },
            { label: "Refuse All Changes", value: "keep-all", tone: "neutral" },
            { label: "Cancel Import", value: "cancel-import", tone: "danger" }
          ]
        });
        if (!pantryChoice || pantryChoice === "cancel-import") {
          setAiImportSuccess(null);
          setAiImportError("AI import canceled.");
          return;
        }
        pantryConflictStrategy = pantryChoice === "update-all" ? "update" : "keep";
      }

      const result = await importAiWeekPlanWithOptions(text, {
        recipeConflictStrategy,
        pantryConflictStrategy
      });
      setAiImportError(null);
      setAiImportSuccess(
        [
          `Recipes created: ${result.recipesCreated}`,
          `Recipes reused: ${result.recipesReused}`,
          `Recipes updated: ${result.recipesUpdated}`,
          `Pantry items created: ${result.pantryItemsCreated}`,
          `Pantry items kept: ${result.pantryItemsReused}`,
          `Pantry items updated: ${result.pantryItemsUpdated}`,
          `Planned meals created: ${result.plannedMealsCreated}`,
          `Leftovers downgraded to freeform: ${result.leftoverDowngradedToFreeform}`,
          `Replaced dates: ${result.replacedDates.join(", ")}`
        ].join(" | ")
      );
      if (result.warnings.length) {
        setAiImportSuccess(
          [
            `Recipes created: ${result.recipesCreated}`,
            `Recipes reused: ${result.recipesReused}`,
            `Recipes updated: ${result.recipesUpdated}`,
            `Pantry items created: ${result.pantryItemsCreated}`,
            `Pantry items kept: ${result.pantryItemsReused}`,
            `Pantry items updated: ${result.pantryItemsUpdated}`,
            `Planned meals created: ${result.plannedMealsCreated}`,
            `Leftovers downgraded to freeform: ${result.leftoverDowngradedToFreeform}`,
            `Replaced dates: ${result.replacedDates.join(", ")}`,
            `Warnings: ${result.warnings.join(" ")}`
          ].join(" | ")
        );
      }
    } catch (err: any) {
      setAiImportSuccess(null);
      setAiImportError(err.message || "AI import failed");
    } finally {
      e.target.value = "";
    }
  }

  return (
    <div className="grid">
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
        <summary>AI Week Planning</summary>
        <p className="muted">
          Export a blank week-planning JSON template, have AI fill it, then import it. weekOf is a reference date; startDate/endDate define the allowed planner range. Import replaces planned meals only on the exact dates included in the AI file.
        </p>
        <div className="row">
          <button onClick={handleExportAiTemplate}>Export AI Week Template</button>
          <label>
            Import from AI
            <input type="file" accept="application/json" onChange={handleAiImport} />
          </label>
        </div>
        {aiImportSuccess && <p style={{ color: "#166534" }}>{aiImportSuccess}</p>}
        {aiImportError && (
          <pre style={{ color: "#dc2626", whiteSpace: "pre-wrap", margin: 0 }}>{aiImportError}</pre>
        )}
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
      {modal}
    </div>
  );
}
