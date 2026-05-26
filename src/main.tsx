import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./app/App";
import "./index.css";
import { initDb } from "./db/db";
import { ensureSignedIn } from "./sync/auth";
import { getActiveHouseholdId } from "./sync/householdRepo";
import { syncEngine } from "./sync/syncEngine";

async function boot() {
  await initDb();
  try {
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