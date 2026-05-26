import { useEffect, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "./firebase";

export type SyncAuthStatus = "disabled" | "signing-in" | "signed-in" | "error";

interface AuthState {
  status: SyncAuthStatus;
  uid: string | null;
  error: string | null;
}

let signInPromise: Promise<void> | null = null;

export async function ensureSignedIn(): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  if (auth.currentUser?.uid) return auth.currentUser.uid;
  if (!signInPromise) {
    signInPromise = signInAnonymously(auth)
      .then(() => undefined)
      .catch((err) => {
        signInPromise = null;
        throw err;
      });
  }
  await signInPromise;
  return auth.currentUser?.uid || null;
}

export function useSyncAuth(): AuthState {
  const [state, setState] = useState<AuthState>(() => ({
    status: isFirebaseConfigured() ? "signing-in" : "disabled",
    uid: null,
    error: null
  }));

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setState({ status: "disabled", uid: null, error: null });
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.uid) {
        setState({ status: "signed-in", uid: user.uid, error: null });
      } else {
        setState({ status: "signing-in", uid: null, error: null });
        ensureSignedIn().catch((err) => {
          setState({ status: "error", uid: null, error: err?.message || "Sign in failed" });
        });
      }
    });
    return unsubscribe;
  }, []);

  return state;
}
