# Meal Manager (Offline PWA)

Local-first meal planner and grocery list generator that works fully offline using IndexedDB.

## Local development

- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`
- Lint: `npm run lint`
- Tests: `npm test` (`npm run test:watch` while working)

## GitHub Pages deploy

1. Ensure `base` in `vite.config.ts` matches your repo name. This repo is configured for `/Meal-Manager/`.
2. Push to `main` to trigger the GitHub Actions workflow in `.github/workflows/deploy.yml`.
3. In GitHub: Settings → Pages → Source: **GitHub Actions**.
4. Your site will be available at: `https://<username>.github.io/Meal-Manager/`.

## Offline behavior

- The app uses IndexedDB (via Dexie) for all data storage.
- A service worker caches the app shell so the UI loads without a network connection.
- All features work offline with no backend.
- After service worker config changes, you may need a hard refresh or clear site data once.

## Offline install (PWA)

- Desktop (Chrome/Edge): visit the site, then use the install icon in the address bar.
- Android (Chrome): visit the site → menu → “Add to Home screen.”
- iOS (Safari): Share → “Add to Home Screen.”

## Backup and restore

- Go to Settings -> Backup.
- Click Export JSON to download a full backup of all local data.
- Use Import JSON to restore on another device. Import replaces existing data.

## Cloud sync (optional)

Cloud sync lets two devices share the same data over Firebase Firestore.

### One-time Firebase setup

1. Create a free project at <https://console.firebase.google.com>.
2. In the project, enable:
   - **Authentication** → Sign-in method → **Anonymous** → Enable.
   - **Cloud Firestore** → Create database → Production mode → pick a region.
3. Add a web app (gear icon → Project settings → Your apps → Web).
4. Copy the config values into a new `.env.local` at the project root using this exact format:

   ```env
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```

   The API key for a web client is meant to be public — security is enforced by Firestore rules below.

### Set Firestore security rules

This repo includes `firestore.rules` at the root. Apply it once:

**Option A — via the Firebase console (easiest):**
1. In the Firebase console, open **Firestore Database → Rules**.
2. Replace the entire contents with the file [`firestore.rules`](./firestore.rules).
3. Click **Publish**.

**Option B — via the Firebase CLI:**
```sh
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules --project <your-project-id>
```
(`firebase.json` in this repo already points at `firestore.rules`, so no `firebase init` needed.)

**Option C — automatically on every push to `main`:**
Add a `FIREBASE_SERVICE_ACCOUNT` repository secret containing the JSON key of a service
account with the *Firebase Rules Admin* role. The deploy workflow then keeps the deployed
rules in step with this repo. Without the secret that job is skipped and the site still
deploys — but the rules in the repo and the rules in production can then drift apart.

### Recommended: lock the project down

These are console settings, not code, and are worth doing once:

- **App Check** (Build → App Check) with reCAPTCHA v3. Anonymous sign-in is free and
  unlimited, so without App Check anyone can create accounts against your project. The
  exposure is quota and cost rather than your data.
- **Restrict the API key** (Google Cloud console → APIs & Services → Credentials) to your
  GitHub Pages origin as an HTTP referrer.
- **Set a budget alert** on the project.

### Enable sync on the deployed site (GitHub Pages)

`.env.local` is git-ignored, so the GitHub Actions build doesn't have access to your Firebase config. Add the values as **repository secrets** so they're injected at build time:

1. In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret.**
2. Add each of these (same names and values as in `.env.local`):
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
3. Push to `main` (or re-run the latest workflow) — the next deploy will include them.

These are public client values; the security model is the Firestore rules, not hiding the API key.

### Using sync

1. In the app: **Settings → Sync → Create household**. Copy the 6-character invite code.
2. On the second device, install the same app, open **Settings → Sync → Join household**, enter the code.
3. From then on, changes on either device flow to the other (offline writes queue and replay).
4. Joining replaces the second device's local data with the household's. Export a JSON backup first if anything on it matters.

Notes on how sync behaves:

- **Invite codes expire after 24 hours** and can be rotated at any time from Settings → Sync.
  Rotating immediately invalidates the previous code.
- **The device that created the household owns it.** Only that device can remove other
  members, from the member list in Settings → Sync. Every device can remove itself with
  *Disconnect this device*.
- **Deletions propagate even across an offline gap.** A device that was closed while another
  member deleted something reconciles on reconnect, rather than re-uploading what was deleted.
  Anything created offline is kept and pushed up.
- **Conflicts are last-write-wins per document.** Two people editing different fields of the
  same recipe at the same time will keep only one of the two edits.
