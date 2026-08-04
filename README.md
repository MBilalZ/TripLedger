# TripLedger

Offline-first multi-pool trip expense settlement for family & friends.

**Cost: $0 forever** — no backend, no accounts. Data lives in your browser (IndexedDB). After the first visit, the app shell is cached for offline use. Share trips via JSON export/import.

## Stack

- Vue 3 + Vite + Pinia + PrimeVue
- Dexie (IndexedDB)
- Pure settlement engine (`packages/engine`) — integer paisa math, greedy min-transfers, consistency invariants

## Develop

```bash
pnpm install
pnpm test:engine   # golden + fuzz tests
pnpm --filter @tripledger/web typecheck
pnpm dev           # http://localhost:5173
```

In local dev, **Tools → Load sample trip** seeds an Abbottabad-style demo (hidden in production builds).

## Use

1. Open the app → **New trip** → enter a name → **Save trip** (back before Save discards the draft).
2. Under **More**, add people and at least one pool, then log expenses.
3. **Balances** shows who owes whom when the trip is balanced.
4. Export **WhatsApp** / **Excel** / **PDF** / **JSON** from the trip header (settlement exports require a balanced trip).
5. On another device: **Tools → Import JSON**. Delete trips from the home list or the trip header trash control.

## Architecture

- Persist only facts: participants, pools, pool members, expenses, expense splits, adjustments, trip settlement settings.
- Split modes (pool default + per-expense override): **equal**, **shares/heads**, **percent**, **exact**.
- Settlement transfer modes: **minimize**, **settle to one**, **pairwise**; rounding: whole rupees or exact paisa.
- Never persist balances or settlements — always derived via `settleTrip()`.
- Expense deletes supersede rows (`supersededById`); history stays auditable.

If the Pools UI looks stale after upgrading, delete the old sample trip and (in local dev) click **Load sample trip** again (IndexedDB schema migrates automatically).

## Deploy (GitHub Pages)

TripLedger is a static SPA. Hosting only serves files — trip data stays in each browser’s IndexedDB.

**Live URL:** https://MBilalZ.github.io/TripLedger/

### One-time setup

1. Open the repo on GitHub → **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.

### Deploy

Pushes to the `prod` branch trigger [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml):

1. Install with pnpm, run engine tests and web typecheck, then build `@tripledger/web` with `VITE_BASE=/TripLedger/`.
2. Copy `index.html` → `404.html` so Vue Router deep links work on refresh.
3. Publish `apps/web/dist` to GitHub Pages.

```bash
git checkout prod
git merge main   # or open a PR into prod
git push origin prod
```

Watch the run under **Actions**. When it finishes, open the live URL above.

### Local production preview

```bash
VITE_BASE=/TripLedger/ pnpm --filter @tripledger/web build
pnpm --filter @tripledger/web preview
```

Then open the preview URL and navigate under `/TripLedger/`. Local `pnpm dev` keeps `base` as `/` and does not need `VITE_BASE`.
