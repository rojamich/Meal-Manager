import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { ensureSignedIn } from "./auth";
import { getFirebaseDb } from "./firebase";

export const HOUSEHOLD_CHANGED_EVENT = "household-changed";

const STORAGE_KEY = "active-household-id";
const CODE_KEY = "active-household-code";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export interface Household {
  id: string;
  name?: string;
  memberIds: string[];
  ownerId: string;
  createdAt?: unknown;
}

function getStored(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function setStored(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getActiveHouseholdId(): string {
  return getStored(STORAGE_KEY);
}

export function getActiveInviteCode(): string {
  return getStored(CODE_KEY);
}

function setActive(householdId: string, code: string) {
  setStored(STORAGE_KEY, householdId);
  setStored(CODE_KEY, code);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(HOUSEHOLD_CHANGED_EVENT, { detail: { householdId, code } })
    );
  }
}

function generateCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length));
  }
  return out;
}

async function uniqueInviteCode(): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Sync not configured.");
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateCode();
    const snap = await getDoc(doc(db, "inviteCodes", code));
    if (!snap.exists()) return code;
  }
  throw new Error("Could not allocate an unused invite code; try again.");
}

export async function createHousehold(name?: string): Promise<{ householdId: string; code: string }> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Sync not configured. Add Firebase env vars and reload.");
  const uid = await ensureSignedIn();
  if (!uid) throw new Error("Could not sign in.");

  const householdRef = doc(collection(db, "households"));
  const code = await uniqueInviteCode();

  const batch = writeBatch(db);
  batch.set(householdRef, {
    name: name || null,
    ownerId: uid,
    memberIds: [uid],
    createdAt: serverTimestamp()
  });
  batch.set(doc(db, "inviteCodes", code), {
    householdId: householdRef.id,
    createdAt: serverTimestamp()
  });
  await batch.commit();

  setActive(householdRef.id, code);
  return { householdId: householdRef.id, code };
}

export async function joinHousehold(code: string): Promise<{ householdId: string; code: string }> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Sync not configured.");
  const uid = await ensureSignedIn();
  if (!uid) throw new Error("Could not sign in.");

  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(normalized)) {
    throw new Error("Invite code looks invalid.");
  }
  const inviteSnap = await getDoc(doc(db, "inviteCodes", normalized));
  if (!inviteSnap.exists()) {
    throw new Error("That invite code wasn't found. Check the spelling.");
  }
  const { householdId } = inviteSnap.data() as { householdId: string };
  if (!householdId) throw new Error("Invite code is corrupted.");

  await updateDoc(doc(db, "households", householdId), {
    memberIds: arrayUnion(uid)
  });
  setActive(householdId, normalized);
  return { householdId, code: normalized };
}

export async function leaveHousehold(): Promise<void> {
  const db = getFirebaseDb();
  if (!db) {
    setActive("", "");
    return;
  }
  const uid = await ensureSignedIn();
  const householdId = getActiveHouseholdId();
  if (uid && householdId) {
    try {
      const ref = doc(db, "households", householdId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as Household;
        const remaining = (data.memberIds || []).filter((member) => member !== uid);
        if (remaining.length === 0) {
          await deleteDoc(ref);
          if (getActiveInviteCode()) {
            try {
              await deleteDoc(doc(db, "inviteCodes", getActiveInviteCode()));
            } catch {
              /* ignore */
            }
          }
        } else {
          await updateDoc(ref, { memberIds: arrayRemove(uid) });
        }
      }
    } catch (err) {
      console.warn("[sync] leaveHousehold cleanup failed", err);
    }
  }
  setActive("", "");
}

export async function rotateInviteCode(): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Sync not configured.");
  const householdId = getActiveHouseholdId();
  if (!householdId) throw new Error("No active household.");
  const oldCode = getActiveInviteCode();
  const newCode = await uniqueInviteCode();
  const batch = writeBatch(db);
  batch.set(doc(db, "inviteCodes", newCode), {
    householdId,
    createdAt: serverTimestamp()
  });
  if (oldCode) batch.delete(doc(db, "inviteCodes", oldCode));
  await batch.commit();
  setActive(householdId, newCode);
  return newCode;
}

export function subscribeToHousehold(
  householdId: string,
  onUpdate: (household: Household | null) => void
): () => void {
  const db = getFirebaseDb();
  if (!db || !householdId) {
    onUpdate(null);
    return () => undefined;
  }
  return onSnapshot(
    doc(db, "households", householdId),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      const data = snap.data() as Omit<Household, "id">;
      onUpdate({ id: householdId, ...data });
    },
    (err) => {
      console.warn("[sync] household subscription error", err);
      onUpdate(null);
    }
  );
}

// Convenience: also call setDoc helper for new households created via batch above so TS knows it.
void setDoc;
