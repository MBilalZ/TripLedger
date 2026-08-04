# TripLedger

Offline-first multi-pool trip expense settlement for family & friends.

**Cost: $0 forever** — no backend, no accounts. Data lives in your browser (IndexedDB). Share trips via JSON export/import.

## Stack

- Vue 3 + Vite + Pinia + PrimeVue
- Dexie (IndexedDB)
- Pure settlement engine (`packages/engine`) — integer paisa math, greedy min-transfers, consistency invariants

## Develop

```bash
pnpm install
pnpm test:engine   # golden + fuzz tests
pnpm dev           # http://localhost:5173
```

## Use

1. Open the app → **Load sample trip** (Abbottabad-style numbers).
2. Dashboard shows **Balanced** and who pays whom:
   - Mamo → Bilal **19,488**
   - Salman → Bilal **656**
   - Farhan → Bilal **718**
3. Export **WhatsApp** / **Excel** / **PDF** / **JSON** from the trip header.
4. On another device: **Import JSON**.

## Architecture

- Persist only facts: participants, pools, pool members, expenses, expense splits, adjustments, trip settlement settings.
- Split modes (pool default + per-expense override): **equal**, **shares/heads**, **percent**, **exact**.
- Settlement transfer modes: **minimize**, **settle to one**, **pairwise**; rounding: whole rupees or exact paisa.
- Never persist balances or settlements — always derived via `settleTrip()`.
- Expense deletes supersede rows (`supersededById`); history stays auditable.

If the Pools UI looks stale after upgrading, delete the old sample trip and click **Load sample trip** again (IndexedDB schema migrates automatically).

## Deploy (optional, still free)

Build static files and host on Cloudflare Pages (or any static host):

```bash
pnpm --filter @tripledger/web build
```

Upload `apps/web/dist`.
