export const isFirebaseEnabled = import.meta.env.VITE_ENABLE_FIREBASE_SYNC === "true";

export async function initFirebaseSync() {
  if (!isFirebaseEnabled) return;
  console.log("Firebase sync enabled (scaffold)");
}