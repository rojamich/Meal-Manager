# Meal Manager (Offline PWA)

Local-first meal planner and grocery list generator that works fully offline using IndexedDB. Optional Firebase sync scaffolding is included but disabled by default.

## Local development

- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`

## GitHub Pages deploy

1. Ensure `base` in `vite.config.ts` matches your repo name. This repo is configured for `/Meal-Manager/`.
2. Push to `main` to trigger the GitHub Actions workflow in `.github/workflows/deploy.yml`.
3. In GitHub: Settings → Pages → Source: **GitHub Actions**.
4. Your site will be available at: `https://<username>.github.io/Meal-Manager/`.

## Offline behavior

- The app uses IndexedDB (via Dexie) for all data storage.
- A service worker caches the app shell so the UI loads without a network connection.
- All features work offline with no backend.

## Offline install (PWA)

- Desktop (Chrome/Edge): visit the site, then use the install icon in the address bar.
- Android (Chrome): visit the site → menu → “Add to Home screen.”
- iOS (Safari): Share → “Add to Home Screen.”

## Backup and restore

- Go to Settings -> Backup.
- Click Export JSON to download a full backup of all local data.
- Use Import JSON to restore on another device. Import replaces existing data.

## Firebase sync (disabled)

Set `VITE_ENABLE_FIREBASE_SYNC=true` in `.env.local` to enable the stub. You must wire up Firebase SDK and auth if you want real sync.
