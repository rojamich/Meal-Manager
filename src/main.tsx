import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./app/App";
import "./index.css";
import { initDb } from "./db/db";

const SYNC_HOUSEHOLD_STORAGE_KEY = "active-household-id";

async function boot() {
  await initDb();
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
void boot();
registerSW({
  immediate: true
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);