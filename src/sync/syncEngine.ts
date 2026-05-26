import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  Unsubscribe
} from "firebase/firestore";
import { Table } from "dexie";
import { db as appDb } from "../db/db";
import { getFirebaseDb } from "./firebase";

export type SyncMode = "create" | "join" | "reconnect";
export type SyncStatus = "off" | "starting" | "syncing" | "synced" | "error";

export const SYNC_REMOTE_APPLIED_EVENT = "sync-remote-applied";

export interface SyncRemoteAppliedDetail {
  tableName: string;
  docId: string;
  type: "added" | "modified" | "removed";
  data: any | null;
  previous: any | null;
}

const ECHO_GUARD_MS = 4000;

interface SyncListener {
  (status: SyncStatus, error?: string): void;
}

interface TableSpec {
  name: string;
  table: () => Table<any, string>;
}

const TABLE_SPECS: TableSpec[] = [
  { name: "pantryItems", table: () => appDb.pantryItems },
  { name: "inventoryLots", table: () => appDb.inventoryLots },
  { name: "recipes", table: () => appDb.recipes },
  { name: "recipeIngredients", table: () => appDb.recipeIngredients },
  { name: "mealSlots", table: () => appDb.mealSlots },
  { name: "plannedMeals", table: () => appDb.plannedMeals },
  { name: "essentialItems", table: () => appDb.essentialItems },
  { name: "locationProfiles", table: () => appDb.locationProfiles },
  { name: "purchaseEntries", table: () => appDb.purchaseEntries },
  { name: "groceryLists", table: () => appDb.groceryLists },
  { name: "groceryLines", table: () => appDb.groceryLines },
  { name: "weekTemplates", table: () => appDb.weekTemplates },
  { name: "people", table: () => appDb.people },
  { name: "cookedPortions", table: () => appDb.cookedPortions }
];

function stripUndefined(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  const out: any = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

class SyncEngine {
  private householdId: string | null = null;
  private status: SyncStatus = "off";
  private error: string | null = null;
  private listeners = new Set<SyncListener>();
  private unsubscribers: Unsubscribe[] = [];
  private hookHandlers: Array<{ table: Table<any, string>; event: string; fn: any }> = [];
  private inflight = new Set<string>(); // `${table}:${id}` currently being applied from cloud
  private pendingPushes = new Map<string, any | null>(); // `${table}:${id}` → data or null for delete
  private recentLocalPushes = new Map<string, number>(); // `${table}:${id}` → ts of last outgoing push
  private flushHandle: number | null = null;
  private lastIncomingAt: number | null = null;

  getStatus(): { status: SyncStatus; householdId: string | null; error: string | null } {
    return { status: this.status, householdId: this.householdId, error: this.error };
  }

  getLastIncomingAt(): number | null {
    return this.lastIncomingAt;
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.status, this.error || undefined);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setStatus(status: SyncStatus, error?: string) {
    this.status = status;
    this.error = error || null;
    this.listeners.forEach((l) => l(status, error));
  }

  async start(householdId: string, mode: SyncMode): Promise<void> {
    if (this.status !== "off" && this.householdId === householdId) return;
    if (this.status !== "off") await this.stop();

    const fdb = getFirebaseDb();
    if (!fdb) {
      this.setStatus("error", "Firebase not configured.");
      return;
    }
    this.householdId = householdId;
    this.setStatus("starting");

    try {
      if (mode === "join") {
        await this.wipeLocal();
      }

      // Pull everything once before attaching live listeners so the initial state is consistent.
      await this.initialPull(householdId);

      if (mode === "create" || mode === "reconnect") {
        await this.pushAllLocal(householdId);
      }

      this.attachListeners(householdId);
      this.attachHooks(householdId);
      this.setStatus("synced");
    } catch (err: any) {
      console.error("[sync] start failed", err);
      this.setStatus("error", err?.message || "Sync failed.");
    }
  }

  async stop(): Promise<void> {
    this.unsubscribers.forEach((u) => {
      try {
        u();
      } catch {
        /* ignore */
      }
    });
    this.unsubscribers = [];
    this.hookHandlers.forEach(({ table, event, fn }) => {
      try {
        (table.hook as any)(event).unsubscribe(fn);
      } catch {
        /* ignore */
      }
    });
    this.hookHandlers = [];
    if (this.flushHandle != null) {
      window.clearTimeout(this.flushHandle);
      this.flushHandle = null;
    }
    this.pendingPushes.clear();
    this.inflight.clear();
    this.recentLocalPushes.clear();
    this.lastIncomingAt = null;
    this.householdId = null;
    this.setStatus("off");
  }

  private async wipeLocal(): Promise<void> {
    // Capture current inflight set to avoid re-pushing cleared rows.
    const sentinel = "__wipe__";
    this.inflight.add(sentinel);
    try {
      for (const spec of TABLE_SPECS) {
        const tbl = spec.table();
        const all = await tbl.toArray();
        all.forEach((row: any) => this.inflight.add(`${spec.name}:${row.id}`));
        await tbl.clear();
      }
    } finally {
      this.inflight.delete(sentinel);
      // Clear table-row sentinels after the dexie events have fired.
      setTimeout(() => {
        for (const key of Array.from(this.inflight)) {
          if (key !== sentinel) this.inflight.delete(key);
        }
      }, 0);
    }
  }

  private async initialPull(householdId: string): Promise<void> {
    const fdb = getFirebaseDb();
    if (!fdb) return;
    for (const spec of TABLE_SPECS) {
      const snap = await getDocs(collection(fdb, "households", householdId, spec.name));
      const tbl = spec.table();
      for (const docSnap of snap.docs) {
        const data = docSnap.data() as any;
        const id = docSnap.id;
        this.inflight.add(`${spec.name}:${id}`);
        try {
          await tbl.put({ ...data, id });
        } finally {
          this.inflight.delete(`${spec.name}:${id}`);
        }
      }
    }
  }

  private async pushAllLocal(householdId: string): Promise<void> {
    const fdb = getFirebaseDb();
    if (!fdb) return;
    for (const spec of TABLE_SPECS) {
      const all = await spec.table().toArray();
      for (const row of all as any[]) {
        const id = String(row.id);
        await setDoc(
          doc(fdb, "households", householdId, spec.name, id),
          stripUndefined({ ...row, id }),
          { merge: true }
        );
      }
    }
  }

  private attachListeners(householdId: string): void {
    const fdb = getFirebaseDb();
    if (!fdb) return;
    for (const spec of TABLE_SPECS) {
      const unsub = onSnapshot(
        collection(fdb, "households", householdId, spec.name),
        (snap) => {
          snap.docChanges().forEach(async (change) => {
            const id = change.doc.id;
            const key = `${spec.name}:${id}`;
            const isPendingLocalWrite = change.doc.metadata.hasPendingWrites;
            const recentlyPushedAt = this.recentLocalPushes.get(key);
            const isEcho =
              isPendingLocalWrite ||
              (recentlyPushedAt != null && Date.now() - recentlyPushedAt < ECHO_GUARD_MS);

            let previous: any = null;
            if (!isEcho) {
              try {
                previous = (await spec.table().get(id)) || null;
              } catch {
                previous = null;
              }
            }

            this.inflight.add(key);
            try {
              if (change.type === "removed") {
                await spec.table().delete(id);
              } else {
                const data = change.doc.data() as any;
                await spec.table().put({ ...data, id });
              }
            } catch (err) {
              console.warn(`[sync] listener apply failed for ${key}`, err);
            } finally {
              this.inflight.delete(key);
            }

            if (!isEcho) {
              this.lastIncomingAt = Date.now();
              const detail: SyncRemoteAppliedDetail = {
                tableName: spec.name,
                docId: id,
                type: change.type,
                data: change.type === "removed" ? null : (change.doc.data() as any),
                previous
              };
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent(SYNC_REMOTE_APPLIED_EVENT, { detail }));
              }
              // Re-notify subscribers so they can pick up the lastIncomingAt change.
              this.listeners.forEach((l) => l(this.status, this.error || undefined));
            }
          });
        },
        (err) => {
          console.warn(`[sync] listener error for ${spec.name}`, err);
          this.setStatus("error", err.message);
        }
      );
      this.unsubscribers.push(unsub);
    }
  }

  private attachHooks(householdId: string): void {
    for (const spec of TABLE_SPECS) {
      const table = spec.table();
      const tableName = spec.name;

      const onCreate = (primKey: string, obj: any) => {
        const key = `${tableName}:${primKey}`;
        if (this.inflight.has(key)) return;
        this.queuePush(householdId, tableName, String(primKey), { ...obj, id: primKey });
      };
      const onUpdate = (mods: any, primKey: string, obj: any) => {
        const key = `${tableName}:${primKey}`;
        if (this.inflight.has(key)) return;
        this.queuePush(householdId, tableName, String(primKey), { ...obj, ...mods, id: primKey });
      };
      const onDelete = (primKey: string) => {
        const key = `${tableName}:${primKey}`;
        if (this.inflight.has(key)) return;
        this.queuePush(householdId, tableName, String(primKey), null);
      };

      table.hook("creating", onCreate);
      table.hook("updating", onUpdate as any);
      table.hook("deleting", onDelete as any);

      this.hookHandlers.push(
        { table, event: "creating", fn: onCreate },
        { table, event: "updating", fn: onUpdate },
        { table, event: "deleting", fn: onDelete }
      );
    }
  }

  private queuePush(
    householdId: string,
    tableName: string,
    docId: string,
    data: any | null
  ): void {
    void householdId;
    this.pendingPushes.set(`${tableName}:${docId}`, data);
    if (this.flushHandle != null) return;
    this.flushHandle = window.setTimeout(() => {
      this.flushHandle = null;
      void this.flushPushes();
    }, 50);
  }

  private async flushPushes(): Promise<void> {
    const fdb = getFirebaseDb();
    const householdId = this.householdId;
    if (!fdb || !householdId || this.pendingPushes.size === 0) return;
    const entries = Array.from(this.pendingPushes.entries());
    this.pendingPushes.clear();
    this.setStatus("syncing");
    let lastError: string | null = null;
    const now = Date.now();
    for (const [key, data] of entries) {
      const [tableName, docId] = key.split(":");
      this.recentLocalPushes.set(key, now);
      try {
        const ref = doc(fdb, "households", householdId, tableName, docId);
        if (data == null) {
          await deleteDoc(ref);
        } else {
          await setDoc(ref, stripUndefined(data), { merge: false });
        }
      } catch (err: any) {
        console.warn(`[sync] push failed for ${key}`, err);
        lastError = err?.message || String(err);
      }
    }
    // Prune the echo-guard map periodically.
    for (const [k, ts] of this.recentLocalPushes) {
      if (now - ts > ECHO_GUARD_MS * 2) this.recentLocalPushes.delete(k);
    }
    if (lastError) {
      this.setStatus("error", lastError);
    } else if (this.householdId) {
      this.setStatus("synced");
    }
  }
}

export const syncEngine = new SyncEngine();
