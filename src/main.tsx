import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./app/App";
import "./index.css";
import { initDb } from "./db/db";

const SYNC_HOUSEHOLD_STORAGE_KEY = "active-household-id";

const root = ReactDOM.createRoot(document.getElementById("root")!);

/**
 * The database is the whole app — without it every screen would render as if the user
 * had no data. Say so plainly instead.
 */
function renderStorageFailure(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  root.render(
    <div className="container">
      <div className="panel">
        <h2>Can't open this device's storage</h2>
        <p className="muted">
          Meal Manager keeps your recipes, pantry, and plans in this browser. It couldn't
          open that storage, which usually means private browsing is on, the disk is full,
          or another tab is still running an older version of the app.
        </p>
        <p className="info-box" style={{ overflowWrap: "anywhere" }}>{message}</p>
        <div className="row">
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}

async function startSync() {
  const hasFirebaseConfig = Boolean(import.meta.env.VITE_FIREBASE_PROJECT_ID);
  if (!hasFirebaseConfig) return;
  const hasHousehold = (() => {
    try {
      return Boolean(window.localStorage.getItem(SYNC_HOUSEHOLD_STORAGE_KEY));
    } catch {
      return false;
    }
  })();
  if (!hasHousehold) return;
  try {
    const [{ ensureSignedIn }, { getActiveHouseholdId }, { syncEngine }] = await Promise.all([
      import("./sync/auth"),
      import("./sync/householdRepo"),
      import("./sync/syncEngine")
    ]);
    const uid = await ensureSignedIn();
    if (uid && getActiveHouseholdId()) {
      await syncEngine.start(getActiveHouseholdId(), "reconnect");
    }
  } catch (err) {
    console.warn("[sync] startup failed", err);
  }
}

async function boot() {
  // Open (and migrate) the database before the first render, so pages never query a
  // database that is still opening and read the result as "empty".
  try {
    await initDb();
  } catch (err) {
    console.error("[app] could not open the local database", err);
    renderStorageFailure(err);
    return;
  }

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  void startSync();
}

void boot();

// A new build used to swap in and reload without warning, discarding whatever was typed
// into a form at the time. Ask instead.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(
      new CustomEvent("app-update-ready", { detail: { apply: () => void updateSW(true) } })
    );
  }
});
