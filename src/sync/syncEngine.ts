import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  Unsubscribe,
  writeBatch
} from "firebase/firestore";
import { Table } from "dexie";
import { db as appDb } from "../db/db";
import { getFirebaseDb } from "./firebase";

export type SyncMode = "create" | "join" | "reconnect";
export type SyncStatus = "off" | "starting" | "syncing" | "synced" | "error";

export const SYNC_REMOTE_APPLIED_EVENT = "sync-remote-applied";

// When the sync engine applies a remote change to a Dexie table, it also dispatches
// the existing domain event for that table so UI listeners refresh without code changes.
// Tables that didn't have a domain event get one here.
const TABLE_DOMAIN_EVENTS: Record<string, string[]> = {
  pantryItems: ["pantry-items-updated"],
  inventoryLots: ["inventory-updated"],
  recipes: ["recipes-updated"],
  recipeIngredients: ["recipe-ingredients-updated"],
  mealSlots: ["meal-slots-updated"],
  plannedMeals: ["planned-meals-updated"],
  essentialItems: ["essentials-updated"],
  locationProfiles: ["locations-updated"],
  purchaseEntries: ["purchases-updated"],
  receipts: ["receipts-updated"],
  groceryLists: ["grocery-lists-updated"],
  groceryLines: ["grocery-lines-updated"],
  weekTemplates: ["week-templates-updated"],
  people: ["people-updated"],
  cookedPortions: ["cooked-portions-updated"]
};

export interface SyncRemoteAppliedDetail {
  tableName: string;
  docId: string;
  type: "added" | "modified" | "removed";
  data: any | null;
  previous: any | null;
}

const ECHO_GUARD_MS = 4000;
/** Long enough to absorb a burst of snapshot changes, short enough to feel live. */
const DOMAIN_REFRESH_DEBOUNCE_MS = 120;
/** Firestore caps a batch at 500 operations. */
const BATCH_LIMIT = 500;

// Sync lifecycle tracing is useful while developing and noise in production — and one of
// these lines used to print the household id, which is credential-grade.
const SYNC_DEBUG = import.meta.env.DEV;

function debugLog(message: string) {
  if (SYNC_DEBUG) console.log(`[sync] ${message}`);
}

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
  { name: "receipts", table: () => appDb.receipts },
  { name: "groceryLists", table: () => appDb.groceryLists },
  { name: "groceryLines", table: () => appDb.groceryLines },
  { name: "weekTemplates", table: () => appDb.weekTemplates },
  { name: "people", table: () => appDb.people },
  { name: "cookedPortions", table: () => appDb.cookedPortions }
];

/**
 * Firestore rejects `undefined` at any depth, and several models nest — a WeekTemplate
 * holds days, which hold meals, whose optional fields are usually undefined. A shallow
 * strip left those in place and the whole write threw.
 */
export function stripUndefined(value: any): any {
  if (Array.isArray(value)) {
    return value.filter((entry) => entry !== undefined).map((entry) => stripUndefined(entry));
  }
  if (!value || typeof value !== "object") return value;
  // Leave anything that isn't a plain object alone (Date, Firestore sentinels).
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: any = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    out[k] = stripUndefined(v);
  }
  return out;
}

const SHADOW_SEP = "|";

function shadowKey(householdId: string, tableName: string, docId: string): string {
  return `${householdId}${SHADOW_SEP}${tableName}${SHADOW_SEP}${docId}`;
}

/** Split `table:docId` without truncating ids that contain a colon. */
function splitPushKey(key: string): [string, string] {
  const at = key.indexOf(":");
  return [key.slice(0, at), key.slice(at + 1)];
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
  private pendingRefreshTables = new Set<string>();
  private refreshHandle: number | null = null;
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
    // "error" is deliberately restartable — otherwise a single failed push wedges sync
    // until the user disconnects and rejoins, because reloads land here too.
    if (this.status !== "off" && this.status !== "error" && this.householdId === householdId) {
      return;
    }
    if (this.status !== "off") await this.stop();

    const fdb = getFirebaseDb();
    if (!fdb) {
      this.setStatus("error", "Firebase not configured.");
      return;
    }
    this.householdId = householdId;
    this.setStatus("starting");
    debugLog(`start mode=${mode}`);

    try {
      if (mode === "join") {
        debugLog("wiping local data (join)");
        await this.wipeLocal();
      }

      // Pull everything once before attaching live listeners so the initial state is consistent.
      // Only a reconnect reconciles deletions: on "create" the cloud is empty and local is the
      // source of truth, and on "join" local was just wiped.
      debugLog("initial pull starting");
      await this.initialPull(householdId, mode === "reconnect");
      debugLog("initial pull complete");

      // Attach listeners + hooks BEFORE pushing local, so any changes that happen during the
      // push are captured. This also lets us flip to "synced" sooner — the user sees live updates
      // while leftover local docs get pushed in the background.
      this.attachListeners(householdId);
      this.attachHooks(householdId);
      this.setStatus("synced");
      debugLog("listeners attached, status=synced");

      if (mode === "create" || mode === "reconnect") {
        // Background push — don't block the UI. Errors get surfaced via status.
        this.pushAllLocal(householdId)
          .then(() => debugLog("background push complete"))
          .catch((err) => {
            console.warn("[sync] background push failed", err);
            this.setStatus("error", err?.message || "Background push failed.");
          });
      }
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
    if (this.refreshHandle != null) {
      window.clearTimeout(this.refreshHandle);
      this.refreshHandle = null;
    }
    this.pendingRefreshTables.clear();
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

  /**
   * Coalesce table-refresh notifications. Pages respond to these by re-reading the entire
   * table, so firing one per incoming document turned a 200-document sync into 200 full
   * table reads.
   */
  private queueDomainRefresh(tableName: string): void {
    this.pendingRefreshTables.add(tableName);
    if (this.refreshHandle != null) return;
    this.refreshHandle = window.setTimeout(() => {
      this.refreshHandle = null;
      const tables = Array.from(this.pendingRefreshTables);
      this.pendingRefreshTables.clear();
      for (const table of tables) {
        for (const eventName of TABLE_DOMAIN_EVENTS[table] || []) {
          window.dispatchEvent(new CustomEvent(eventName));
        }
      }
    }, DOMAIN_REFRESH_DEBOUNCE_MS);
  }

  /** What we last recorded the cloud as holding for this household. */
  private async loadShadowSet(householdId: string): Promise<Set<string>> {
    try {
      const rows = await appDb.syncedDocs.where("householdId").equals(householdId).toArray();
      return new Set(rows.map((row) => row.key));
    } catch (err) {
      // No bookkeeping means no reconciliation, which is the safe direction: we keep
      // rows we're unsure about rather than deleting them.
      console.warn("[sync] shadow set unreadable — skipping delete reconciliation", err);
      return new Set();
    }
  }

  private async saveShadowSet(householdId: string, keys: string[]): Promise<void> {
    try {
      await appDb.transaction("rw", appDb.syncedDocs, async () => {
        await appDb.syncedDocs.clear();
        if (keys.length) {
          await appDb.syncedDocs.bulkPut(keys.map((key) => ({ key, householdId })));
        }
      });
    } catch (err) {
      console.warn("[sync] could not persist shadow set", err);
    }
  }

  /** Best-effort: record that the cloud does (or no longer does) hold this document. */
  private async markSynced(tableName: string, docId: string, exists: boolean): Promise<void> {
    const householdId = this.householdId;
    if (!householdId) return;
    const key = shadowKey(householdId, tableName, docId);
    try {
      if (exists) await appDb.syncedDocs.put({ key, householdId });
      else await appDb.syncedDocs.delete(key);
    } catch {
      /* bookkeeping only — a miss costs us one skipped reconciliation, never data */
    }
  }

  /**
   * Pull the household's documents into Dexie.
   *
   * When `reconcileDeletes` is set, local rows that are missing from the pull AND were
   * present in the cloud last time we looked are treated as deleted elsewhere and removed.
   * Rows missing from both the pull and the shadow set were created here while offline,
   * so they survive and get pushed up afterwards.
   */
  private async initialPull(householdId: string, reconcileDeletes: boolean): Promise<void> {
    const fdb = getFirebaseDb();
    if (!fdb) return;

    const knownRemote = reconcileDeletes
      ? await this.loadShadowSet(householdId)
      : new Set<string>();
    const nextShadow: string[] = [];
    const touchedTables = new Set<string>();

    for (const spec of TABLE_SPECS) {
      const snap = await getDocs(collection(fdb, "households", householdId, spec.name));
      const tbl = spec.table();
      const remoteIds = new Set<string>();

      for (const docSnap of snap.docs) {
        const data = docSnap.data() as any;
        const id = docSnap.id;
        remoteIds.add(id);
        nextShadow.push(shadowKey(householdId, spec.name, id));
        this.inflight.add(`${spec.name}:${id}`);
        try {
          await tbl.put({ ...data, id });
          touchedTables.add(spec.name);
        } finally {
          this.inflight.delete(`${spec.name}:${id}`);
        }
      }

      if (!reconcileDeletes || knownRemote.size === 0) continue;

      const localIds = (await tbl.toCollection().primaryKeys()) as string[];
      const deletedElsewhere = localIds.filter(
        (id) => !remoteIds.has(id) && knownRemote.has(shadowKey(householdId, spec.name, id))
      );
      for (const id of deletedElsewhere) {
        const key = `${spec.name}:${id}`;
        this.inflight.add(key);
        try {
          await tbl.delete(id);
          touchedTables.add(spec.name);
        } finally {
          this.inflight.delete(key);
        }
      }
      if (deletedElsewhere.length) {
        debugLog(`${spec.name}: removed ${deletedElsewhere.length} row(s) deleted on another device`);
      }
    }

    await this.saveShadowSet(householdId, nextShadow);

    // The UI is already mounted by the time this runs, so tell it what changed —
    // otherwise reconciled deletions stay on screen until the next interaction.
    if (typeof window !== "undefined") {
      for (const tableName of touchedTables) {
        for (const eventName of TABLE_DOMAIN_EVENTS[tableName] || []) {
          window.dispatchEvent(new CustomEvent(eventName));
        }
      }
    }
  }

  /**
   * Push every local row. Batched — this used to be one awaited round-trip per document,
   * so a first sync of a few hundred rows meant a few hundred serial requests over mobile
   * data.
   */
  private async pushAllLocal(householdId: string): Promise<void> {
    const fdb = getFirebaseDb();
    if (!fdb) return;
    for (const spec of TABLE_SPECS) {
      const all = (await spec.table().toArray()) as any[];
      for (let offset = 0; offset < all.length; offset += BATCH_LIMIT) {
        const chunk = all.slice(offset, offset + BATCH_LIMIT);
        const batch = writeBatch(fdb);
        for (const row of chunk) {
          const id = String(row.id);
          batch.set(
            doc(fdb, "households", householdId, spec.name, id),
            stripUndefined({ ...row, id }),
            { merge: true }
          );
        }
        await batch.commit();
        // Only record the ids once the batch actually landed.
        for (const row of chunk) {
          await this.markSynced(spec.name, String(row.id), true);
        }
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
              await this.markSynced(spec.name, id, change.type !== "removed");
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
                // The per-document event is what drives live toasts, so it fires immediately.
                window.dispatchEvent(new CustomEvent(SYNC_REMOTE_APPLIED_EVENT, { detail }));
                // The domain events make pages re-read the whole table, so a burst of
                // incoming documents is coalesced into one refresh per table instead of one
                // full table read per document.
                this.queueDomainRefresh(spec.name);
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
      const [tableName, docId] = splitPushKey(key);
      this.recentLocalPushes.set(key, now);
      try {
        const ref = doc(fdb, "households", householdId, tableName, docId);
        if (data == null) {
          await deleteDoc(ref);
        } else {
          await setDoc(ref, stripUndefined(data), { merge: false });
        }
        await this.markSynced(tableName, docId, data != null);
      } catch (err: any) {
        console.warn(`[sync] push failed for ${key}`, err);
        // Name the document — a bare Firestore message gives no clue which save was lost.
        lastError = `Couldn't sync ${tableName} (${err?.message || String(err)})`;
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
