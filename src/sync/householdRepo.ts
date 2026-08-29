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
  Timestamp,
  updateDoc
} from "firebase/firestore";
import { ensureSignedIn } from "./auth";
import { getFirebaseDb } from "./firebase";

export const HOUSEHOLD_CHANGED_EVENT = "household-changed";

const STORAGE_KEY = "active-household-id";
const CODE_KEY = "active-household-code";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const CODE_LENGTH = 6;
/** A code is a bearer credential; it shouldn't outlive the conversation it was shared in. */
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

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

/**
 * Invite codes are the credential that grants access to a household's data, so they come
 * from the CSPRNG rather than Math.random(). Rejection sampling keeps the alphabet evenly
 * distributed — 256 is not a multiple of 32's neighbours in general, and modulo bias would
 * make some characters likelier than others.
 */
function generateCode(length = CODE_LENGTH): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let out = "";
  while (out.length < length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (out.length >= length) break;
      if (byte >= limit) continue;
      out += CODE_ALPHABET.charAt(byte % CODE_ALPHABET.length);
    }
  }
  return out;
}

/** A real Timestamp, not a string, so the Firestore rules can reject expired codes too. */
function inviteExpiryFromNow(): Timestamp {
  return Timestamp.fromMillis(Date.now() + INVITE_TTL_MS);
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

  // NOTE: must be sequential, not a batch. The invite-code rule checks
  // isMember(householdId) via get(), which can't see writes from the same batch.
  await setDoc(householdRef, {
    name: name || null,
    ownerId: uid,
    memberIds: [uid],
    createdAt: serverTimestamp()
  });
  try {
    await setDoc(doc(db, "inviteCodes", code), {
      householdId: householdRef.id,
      createdAt: serverTimestamp(),
      expiresAt: inviteExpiryFromNow()
    });
  } catch (err) {
    // Best-effort cleanup so we don't leave an orphan household if invite-code create fails.
    try {
      await deleteDoc(householdRef);
    } catch {
      /* ignore */
    }
    throw err;
  }

  setActive(householdRef.id, code);
  return { householdId: householdRef.id, code };
}

export async function joinHousehold(code: string): Promise<{ householdId: string; code: string }> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Sync not configured.");
  const uid = await ensureSignedIn();
  if (!uid) throw new Error("Could not sign in.");

  const normalized = code.trim().toUpperCase();
  if (normalized.length !== CODE_LENGTH || !/^[A-Z0-9]+$/.test(normalized)) {
    throw new Error(`Invite codes are ${CODE_LENGTH} characters. Check the spelling.`);
  }
  const inviteSnap = await getDoc(doc(db, "inviteCodes", normalized));
  if (!inviteSnap.exists()) {
    throw new Error("That invite code wasn't found. Check the spelling.");
  }
  const invite = inviteSnap.data() as { householdId?: string; expiresAt?: Timestamp };
  const { householdId } = invite;
  if (!householdId) throw new Error("Invite code is corrupted.");
  // Codes minted before expiry existed carry no stamp; those stay valid until rotated.
  if (invite.expiresAt && invite.expiresAt.toMillis() < Date.now()) {
    throw new Error("That invite code has expired. Ask the other device for a new one.");
  }

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
  await setDoc(doc(db, "inviteCodes", newCode), {
    householdId,
    createdAt: serverTimestamp(),
    expiresAt: inviteExpiryFromNow()
  });
  if (oldCode) {
    try {
      await deleteDoc(doc(db, "inviteCodes", oldCode));
    } catch {
      /* ignore */
    }
  }
  setActive(householdId, newCode);
  return newCode;
}

/**
 * Remove another member. Only the owner can do this (the rules enforce it too) — it is the
 * way back from a leaked invite code, which previously meant deleting the whole household.
 */
export async function removeMember(uid: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Sync not configured.");
  const householdId = getActiveHouseholdId();
  if (!householdId) throw new Error("No active household.");
  const self = await ensureSignedIn();
  if (uid === self) {
    throw new Error("Use “Disconnect this device” to remove yourself.");
  }
  await updateDoc(doc(db, "households", householdId), { memberIds: arrayRemove(uid) });
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

