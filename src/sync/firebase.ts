import { FirebaseApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import {
  Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "firebase/firestore";

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function readConfig(): FirebaseConfig | null {
  const env = import.meta.env;
  const config: FirebaseConfig = {
    apiKey: String(env.VITE_FIREBASE_API_KEY || ""),
    authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN || ""),
    projectId: String(env.VITE_FIREBASE_PROJECT_ID || ""),
    storageBucket: String(env.VITE_FIREBASE_STORAGE_BUCKET || ""),
    messagingSenderId: String(env.VITE_FIREBASE_MESSAGING_SENDER_ID || ""),
    appId: String(env.VITE_FIREBASE_APP_ID || "")
  };
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    if (typeof console !== "undefined") {
      console.warn(
        `[sync] Firebase config missing keys: ${missing.join(", ")}. Sync will be disabled.`
      );
    }
    return null;
  }
  return config;
}

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;
let initAttempted = false;

export function isFirebaseConfigured(): boolean {
  return readConfig() !== null;
}

export function getFirebaseApp(): FirebaseApp | null {
  if (cachedApp) return cachedApp;
  if (initAttempted) return null;
  initAttempted = true;
  const config = readConfig();
  if (!config) return null;
  const existing = getApps();
  cachedApp = existing.length ? existing[0] : initializeApp(config);
  return cachedApp;
}

export function getFirebaseAuth(): Auth | null {
  if (cachedAuth) return cachedAuth;
  const app = getFirebaseApp();
  if (!app) return null;
  cachedAuth = getAuth(app);
  return cachedAuth;
}

export function getFirebaseDb(): Firestore | null {
  if (cachedDb) return cachedDb;
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    cachedDb = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      }),
      // Many ad-blockers (uBlock, Brave Shields, AdGuard) block Firestore's default
      // WebChannel transport. Auto-detect falls back to long polling over plain HTTPS,
      // which they generally let through.
      experimentalAutoDetectLongPolling: true
    });
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[sync] Failed to enable persistent cache, falling back to memory.", err);
    }
    cachedDb = null;
    return null;
  }
  return cachedDb;
}
