# Food Tracker (rev 2)

Fast, phone-first food and calorie log. Plain HTML/CSS/JS, no build step, no dependencies.
Data lives on the device; Google Drive sync is optional.

## What it does

- Search box is focused on load. Local matches (built-in foods, your recents, favorites, custom foods) appear on the
  first keystroke; Open Food Facts and USDA FoodData Central results are added about 0.3 s after you stop typing.
- Every result row has a round **+** that logs the food straight away with its last-used portion (or its first
  household unit). Tapping the row opens the portion sheet instead: quantity x unit, live kcal/protein/carbs/fat, one tap on Add.
- Portions: grams or ml always, plus household units ("1 chicken leg", "1 soda can (355 ml)", "1 slice", "1 cup",
  "1 tbsp"). Units come from USDA `foodMeasures`/`foodPortions`, Open Food Facts `serving_size`/package size, the
  built-in list, or what you define on a custom food.
- Meal (breakfast/lunch/dinner/snacks) is picked from the time of day and can be changed in the sheet. The **+** beside a
  meal heading forces that meal.
- Daily totals against editable targets, day navigation, edit/delete with undo, custom foods, quick-add of raw calories,
  barcode lookup (camera where the browser has `BarcodeDetector`, typed number everywhere), JSON export/import.
- 74 built-in foods so it works with no network at all.

## Files

```
index.html              page shell
css/app.css             styles (light + dark)
js/nutrition.js         portion and nutrient math, dates, meal-by-time, serving-text parser   (pure)
js/foods-data.js        built-in starter foods with household units
js/store.js             state, localStorage persistence, entries, recents/favorites, local search, merge, import/export
js/api.js               Open Food Facts + USDA clients and normalizers
js/drive.js             Google Drive appDataFolder sync
js/cloud.js             storage adapter for the Claude-artifact build (db capability); inert elsewhere
js/app.js               UI wiring only
sw.js, manifest.webmanifest, icons/    PWA (offline shell, install)
.htaccess               optional Apache cache/MIME hints
tools/build.js          builds dist/index.html (everything inlined)
tests/                  node unit tests + headless-browser smoke test
```

Each `js/` file attaches to one global, `window.FT`, and also exports for Node, so the logic files run unchanged in tests
and in a future native wrapper.

## Install on Apache

1. Copy the folder contents (everything except `tests/`, `tools/`, `dist/`, `package.json`) into a directory under your
   web root, e.g. `/var/www/html/food/`.
2. Open `https://your-host/food/`. That is all; there is no server-side code.
3. HTTPS is needed for the installable/offline part (service worker) and for Google sign-in. Plain HTTP still runs the app.
4. On the phone: Safari -> Share -> Add to Home Screen (Android Chrome: Install app).

Updating: overwrite the files. Clients pick the new version up on their second launch. If you change the list of shell
files, bump `VERSION` in `sw.js`.

## Food databases

- **Open Food Facts**: no key. Packaged products and barcodes.
- **USDA FoodData Central**: ships with `DEMO_KEY`, which is rate-limited (roughly 30 requests/hour per IP). Get a free
  key at https://fdc.nal.usda.gov/api-key-signup and paste it in Settings.
- Either source can be switched off in Settings. A remote food is copied into local data the first time you log or star it,
  so it is instant and offline afterwards.

## Google Drive sync (optional)

The app stores one file, `food-tracker.json`, in the hidden per-app folder of your Drive (`appDataFolder`). It cannot see
any other Drive file.

1. https://console.cloud.google.com -> create a project.
2. APIs & Services -> Library -> enable **Google Drive API**.
3. APIs & Services -> OAuth consent screen: External, add scope `.../auth/drive.appdata`, add your own Google account as a
   test user (no verification needed while it is only you).
4. Credentials -> Create credentials -> **OAuth client ID** -> Web application. Under *Authorized JavaScript origins* add the
   exact origin the app is served from (e.g. `https://your-host`; `http://localhost:8080` for local testing).
5. Copy the client ID (`...apps.googleusercontent.com`) into Settings -> Google Drive sync, then tap **Sync now**.

How it behaves: the first sync in a session opens the Google popup (tap the sync arrow in the header or Sync now). After
that, changes are pushed about 4 s after each edit and pulled when the app comes back to the foreground, until the token
expires (about an hour); then tap sync again. Conflict rule: per record, the newer timestamp wins; deletions are kept as
tombstones for 90 days so they propagate. With no client ID the app never contacts Google.

## Single-file build (Claude artifact)

```
node tools/build.js      # writes dist/index.html, about 98 kB, no external references
```

`dist/index.html` also opens directly from disk and can be dropped on Apache as is. The same file detects where it runs:

| Where | Storage | Export | Google Drive | Online food databases |
|---|---|---|---|---|
| Apache / file | `localStorage` | file download | OAuth sync (appDataFolder) | yes |
| Claude artifact | artifact `db`, private per viewer, plus `localStorage` as a cache | `downloads` capability | "Back up to Google Drive" through the Drive connector | no (sandbox blocks other hosts) |

Artifact mode (`js/cloud.js`) turns on when `window.claude.use` exists. The artifact must declare
`{db: {}, user: {}, downloads: true, mcp: {servers: [{server: "Google Drive", tools: ["create_file"]}]}}`.
State is mirrored to `data/users/<viewer id>/` as `meta`, `foods-0..7` and one `e-YYYY-MM` document per month; only
changed documents are written, about 1.5 s after an edit, and the store is re-read when the tab becomes visible again.
The USDA key is not written there. If a capability is missing the app says so and keeps working from browser storage.
Not available inside Claude: online search, barcode, camera, two-way Drive sync (the connector can create files but not
overwrite them, so restore is: download the backup from Drive, then Settings -> Import).

## Tests

```
node --test tests/*.test.js     # 40 unit tests: math, portions, store, merge, API normalizers, Drive sync, artifact db adapter (fakes)
python3 tests/smoke.py          # needs playwright + Chrome; drives the real UI, served and single-file, APIs mocked
```

## Data format

`localStorage["foodtracker.v1"]` and the Drive file share one shape:
`{version, settings, foods{id}, entries{id}, usage{foodId}, favorites{foodId}}`. Entries store a snapshot of name, portion
and nutrients, so history does not change when a food is edited or a database row changes.

## Roadmap: iPhone app

1. Today: the PWA installs from Safari and runs offline.
2. Wrap with Capacitor (`npx cap init`, `webDir` = this folder, `npx cap add ios`). The UI and all `js/` logic are reused as is.
3. Pieces that need a native replacement inside WKWebView:
   - Barcode: Safari/WKWebView has no `BarcodeDetector`; use a Capacitor barcode-scanner plugin behind `lookupBarcode()`.
   - Google sign-in: the GIS popup is not allowed in embedded web views; use a native Google Sign-In plugin and hand the
     access token to `FT.drive.syncOnce()` (it already takes a token and a fetch function).
   - Storage: swap the storage adapter passed to `createStore()` for Capacitor Preferences or SQLite; consider iCloud.
4. Optional native extras: HealthKit write (dietary energy and macros), home-screen widget with remaining kcal, Siri shortcut for quick add.
