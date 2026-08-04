# TripLedger

Multi-pool trip expense settlement for family & friends.

**Cost: free-tier friendly** — Vue SPA on GitHub Pages + optional **Supabase** (email/password auth with no confirmation email, Postgres, Realtime) for shared trips and invite links. Without Supabase env vars, the app runs locally on this device (IndexedDB).

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

One-command setup (applies SQL migrations, writes `apps/web/.env.local`, sets GitHub Actions secrets; with an access token configures email/password auth with autoconfirm, disables anonymous, and sets redirect URLs):

```bash
cp .env.example .env.supabase
# edit .env.supabase with anon key, DB password, optional service role + access token

pnpm install
pnpm setup:supabase
pnpm dev
```

Or export the same vars in your shell. See [`.env.example`](.env.example). Secrets are never committed (`.env.supabase` / `.env.local` are gitignored).

If you skip `SUPABASE_ACCESS_TOKEN`, in the dashboard: enable **Email** provider, disable **Anonymous**, turn off **Confirm email**, and add Site URL / redirects.

Then: **Sign up** → create a trip → **Copy invite link** → other device **Sign in / Sign up** → confirm display name → both see expenses live.

## Use

1. **Sign in / Sign up** (cloud) with email + password.
2. **New trip** → name → Save (draft until Save).
3. Invite members (cloud) or add people under **More → People**.
4. Log expenses (a **General** pool is created automatically if needed).
5. Adjustments: simple A→B or **Split a total** (equal/shares/percent/exact).
6. Export WhatsApp / Excel / PDF / JSON when balanced.

## Deploy (GitHub Pages)

**Live URL:** https://MBilalZ.github.io/TripLedger/

### Secrets (for shared mode on prod)

`pnpm setup:supabase` sets these via `gh` when available:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Or set them manually under Repo → Settings → Secrets. Auth Site URL should include `https://MBilalZ.github.io/TripLedger`.

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
