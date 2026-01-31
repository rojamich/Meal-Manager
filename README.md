# Meal Manager (Offline PWA)

Local-first meal planner and grocery list generator that works fully offline using IndexedDB. Optional Firebase sync scaffolding is included but disabled by default.

## Local development

- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`

## GitHub Pages deploy

1. Build the app: `npm run build`
2. Commit the `dist` folder or use GitHub Actions to deploy.
3. If using GitHub Actions, use a static deploy workflow that uploads `dist` to Pages.
4. This project sets `base: "./"` in `vite.config.ts` so it works with static hosting under a subpath.

## Offline behavior

- The app uses IndexedDB (via Dexie) for all data storage.
- A service worker caches the app shell so the UI loads without a network connection.
- All features work offline with no backend.

## Backup and restore

- Go to Settings -> Backup.
- Click Export JSON to download a full backup of all local data.
- Use Import JSON to restore on another device. Import replaces existing data.

## Firebase sync (disabled)

Set `VITE_ENABLE_FIREBASE_SYNC=true` in `.env.local` to enable the stub. You must wire up Firebase SDK and auth if you want real sync.