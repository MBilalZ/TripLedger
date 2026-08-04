# TripLedger

Multi-pool trip expense settlement for family & friends.

**Cost: free-tier friendly** — Vue SPA on GitHub Pages + optional **Supabase** (anonymous auth, Postgres, Realtime) for shared trips and invite links. Without Supabase env vars, the app runs locally on this device (IndexedDB).

## Stack

- Vue 3 + Vite + Pinia + PrimeVue
- Dexie (local / offline fallback)
- Supabase (shared trips, invites, realtime)
- Pure settlement engine (`packages/engine`) — integer paisa math

## Develop

```bash
pnpm install
pnpm test:engine
pnpm --filter @tripledger/web typecheck
pnpm dev
```

### Local-only (default)

No env vars needed. Data stays in IndexedDB. Dev Tools → **Load sample trip** seeds Abbottabad demo numbers.

### Shared trips (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. Enable **Anonymous sign-ins** (Authentication → Providers → Anonymous).
3. Run [`supabase/migrations/20260304120000_init.sql`](supabase/migrations/20260304120000_init.sql) in the SQL editor.
4. Copy Project URL and anon key into `apps/web/.env.local`:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

5. Auth → URL configuration: add `http://localhost:5173` (and production URL below).

Restart `pnpm dev`. Create a trip → **Copy invite link** → open in another browser/profile → enter display name → both see the same expenses live.

## Use

1. **New trip** → name → Save (draft until Save).
2. Invite members (cloud) or add people under **More → People**.
3. Log expenses (a **General** pool is created automatically if needed).
4. Adjustments: simple A→B or **Split a total** (equal/shares/percent/exact).
5. Export WhatsApp / Excel / PDF / JSON when balanced.

## Deploy (GitHub Pages)

**Live URL:** https://MBilalZ.github.io/TripLedger/

### Secrets (for shared mode on prod)

Repo → Settings → Secrets and variables → Actions:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

In Supabase Auth URL config add: `https://MBilalZ.github.io/TripLedger`

### Deploy

Pushes to `prod` run [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml): engine tests, web typecheck, build with `VITE_BASE=/TripLedger/` + Supabase secrets, then publish.

```bash
git checkout prod
git merge main
git push origin prod
```

### Local production preview

```bash
VITE_BASE=/TripLedger/ \
VITE_SUPABASE_URL=... \
VITE_SUPABASE_ANON_KEY=... \
pnpm --filter @tripledger/web build
pnpm --filter @tripledger/web preview
```

## Architecture

- Facts only: participants, pools, members, expenses, splits, adjustments, settlement settings.
- Settlement always derived via `settleTrip()` (never persisted).
- Expense edits supersede rows; adjustments can be grouped (`adjustment_group_id`) for split fan-out.
- RLS: only trip members read/write; invite join via `join_trip_with_token` RPC.
