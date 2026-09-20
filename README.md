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

## Writing recipes

Ingredients come from the pantry, but you do not have to go there first. Type a name in
the ingredient search and, if nothing matches, create it inline with a unit, a category
and a storage place — it is added to the pantry and selected ready for a quantity.

## Tracking what meals cost

The point of this is deciding what to eat, not bookkeeping. A rough per-serving figure is
enough to notice when a meal has quietly become more expensive than going out.

### Recording prices

**Prices → Add a shopping trip** takes a receipt the way it is printed:

- Enter the pack the way the label states it — `400 g`, `1 kg`, `750 cc`, `0.744 kg`,
  `2.41 lb`. The conversion into the units the pantry uses happens for you.
- Put the **price you were charged** in Price and anything taken off in **Discount**.
  Only the net matters for cost, and supermarket promotions are big enough that using
  shelf prices would overstate every meal made from those ingredients.
- Type the **printed total** at the top. The running total is compared against it, so a
  mistyped price or a skipped line shows up immediately instead of quietly biasing costs.
- Unrecognised names offer a **Create** button inline, so a trip can be entered without
  leaving for the pantry page and back.

Prices can also be captured straight from the grocery list: tick items off as usual and
fill the **Price paid** column, and *Add checked to pantry* records both the stock and
the prices in one go.

### Keeping prices comparable across places

A price history split across "Suprema", "Pechuga" and "Chicken breast" is three short
histories and no comparison. So each ingredient is one pantry item that can answer to
several names: when you type a shop's name and pick your item, you are offered
*remember this as another name for it*, and it resolves by itself next time.

### Locations

Each location carries its currency, an exchange rate, and two optional numbers:

- **Eating out, per person** — what a normal meal out costs there. Planned meals are
  compared against it, which is the comparison the whole feature exists for.
- **Inflation %/yr** — only worth setting where prices move fast. With it, an older price
  is carried forward rather than presented as if it were today's.

Costs are only ever compared between purchases that can be converted into the same
currency; a location with no exchange rate keeps its prices to itself rather than
producing an average that means nothing. The rate in force on the day is stamped onto
each purchase, so correcting a rate later never rewrites past trips.

### Whole packets, not grams

A recipe is charged for what it makes you **buy**, not for what it takes out of the
packet. Using 200 g from a 970 g jar costs the jar.

This is deliberately the cautious estimate. Charging 200 g assumes the other 770 g gets
eaten later, and that assumption fails every time a half-used jar gets left behind in a
move. Over-stating a cost makes you cook something else; under-stating it makes you think
cooking was cheap when it was not.

Three ways an ingredient can be charged, shown per line in the recipe cost breakdown:

| Basis | When | Charged |
| --- | --- | --- |
| **Whole packs** (default) | A pack size is set and the item is not marked shared | Packs rounded up: 200 g of a 970 g jar → one jar |
| **Shared** | Ticked *used across many meals* — butter, milk, oil, spices | Only what the recipe uses |
| **Loose** | No pack size set — anything weighed at the counter | Only what the recipe uses |

**Spices default to shared**, because a jar of paprika lasts months and charging the
whole jar to every recipe that touches it is wrong by a wide margin — on exactly the
ingredients that appear in the most recipes. The checkbox follows the category as you
pick it, so the rule is visible rather than applied on save. Everything else, condiments
included, defaults to whole packs and is decided one item at a time: that category holds
both the oil that goes into everything and the jar of mustard bought for one dish.

Pack sizes fill themselves in from the first shopping trip that records one, and are
editable on the Pantry page. Untick *sold in this size* while entering a trip for
anything weighed at the counter. **Prices → Price coverage** lists everything currently
charged by the pack, so you can sweep through once and mark the genuinely shared ones.

Because a jar is a jar, cost per serving does not scale linearly — doubling a recipe that
still fits in one jar halves its cost per serving. So the whole recipe is costed first and
divided by its base servings afterwards.

### The grocery list stays in grams

Quantities on the list are the amount actually needed, never a pack count. The grams are
what tell you whether one jar covers it, whether you need two, and which size to reach
for — a pack count would throw that away. The number of packs is shown underneath as a
hint, so you do not have to divide at the shelf.

The list's **estimated total** does round up to whole packs, because that is what goes
through the till. Two numbers here will not agree, and should not:

- It rounds **once for the list**, not once per recipe. Two dishes each needing 200 g of
  passata buy one jar between them, so the list total is lower than the two meals' costs
  added together.
- It ignores *used across many meals*. Whether the rest of the butter gets used next week
  has no bearing on a whole block going through the till today.

A meal's cost answers "what did this dish cost me". The list answers "what will this shop
cost me".

### Where costs show up

- **Planner** — a cost on each meal card, marked `!` when that meal costs more per
  serving than eating out, plus a plan cost panel with the total for the days on screen, the
  servings-weighted average per serving, a per-meal breakdown, and a flag on any meal
  that costs more than eating out. Meals not yet priced are counted separately, never as
  free.

  Whether a meal beats eating out is always judged **per serving**, never on the batch
  total: a pot that feeds six costs more than an omelette and is not the worse deal for
  it. Batch totals are shown beside the per-serving figures for the "what did tonight
  cost" question, but they never decide the verdict.

  Each day is charged what it **consumes**. A batch cooked on Sunday and finished on
  Wednesday is split across those days: the cook day is charged the servings its leftovers
  did not claim, and each leftover meal carries its own share. The parts always add back
  up to the batch, so nothing is counted twice and planning to eat leftovers does not look
  free — it never was.
- **Recipes** — cost per serving, filterable and sortable, with `+` meaning some
  ingredients are still unpriced. A **Cheaper than eating out** filter narrows the list
  to recipes that beat the eat-out cost recorded for the active location; recipes with no
  price are left out rather than assumed cheap.
- **Recipe editor** — the per-ingredient breakdown showing how each line was charged
  ("1 pack × 970 g · 770 g spare"), the cost to make the whole recipe, and how much of
  that is packet you do not use here.
- **Prices → Shopping trips** — every trip you have entered, with its lines, how the
  total compares with what the receipt said, and a way to delete a whole trip if it went
  in wrong. Deleting a trip removes its prices with it; pantry stock is left alone.
- **Prices → Price coverage** — unpriced ingredients ranked by how many recipes each one
  is holding back, so the shortest route to useful numbers is obvious. Salt and the like
  can be marked *cost is negligible* so they stop counting as missing.

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
