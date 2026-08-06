# TripLedger

**Group expense tracking for trips with different sharing groups.**

Named **pools** (Hotel, BBQ, Fuel, …) carry who shares and the default split; **payments** record cash outside the expense feed. Settlement stays integer-paisa / PKR.

**UAT / public testing:** every capability is unlocked (charts, exports, receipts, advanced splits). There is no subscription UI yet — flags live in `apps/web/src/lib/features.ts` for a future paywall. Monetization is deferred.

**Cost: free-tier friendly** — Vue SPA on GitHub Pages + optional **Supabase** (email/password auth with no confirmation email, Postgres, Realtime, Edge Functions) for shared trips, invite links, and Web Push. Without Supabase env vars, the app runs locally on this device (IndexedDB / PWA offline).

## Stack

- **App:** Vue 3 + Vite + Pinia + PrimeVue + vue-router + PWA (`vite-plugin-pwa`)
- **Local / offline:** Dexie (IndexedDB) + outbox sync when cloud is enabled
- **Cloud:** Supabase Auth, Postgres + RLS, Realtime, Storage, Edge Functions
- **Domain packages:** `@tripledger/types`, `@tripledger/engine` (integer paisa settlement), `@tripledger/validation`
- **Push:** Web Push + VAPID (`send-push` Edge Function)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/SECURITY.md](docs/SECURITY.md).

## Monorepo layout

| Path | Role |
|---|---|
| `apps/web` | Vue SPA (UI, Pinia, Dexie, sync, Supabase client) |
| `packages/engine` | Pure settlement math + golden/fuzz tests |
| `packages/types` | Shared domain types |
| `packages/validation` | Money / backup input guards |
| `supabase/migrations` | Schema, RLS, RPCs |
| `supabase/functions` | `recompute-settlement`, `send-push` (+ synced `_shared` engine) |
| `scripts/` | Setup, edge-engine sync, RLS policy checks |

## Develop

```bash
pnpm install
pnpm test:engine
pnpm --filter @tripledger/validation test
pnpm --filter @tripledger/web typecheck
pnpm lint
pnpm dev
```

CI also runs web build, edge-engine drift check, RLS policy static checks, and `pnpm audit --audit-level=high`.

### Local-only (default)

No env vars needed. Data stays in IndexedDB. Under **Tools → Load sample trip** (local/dev, non-cloud) seeds Abbottabad demo numbers.

### Shared trips (Supabase)

One-command setup applies SQL migrations, writes `apps/web/.env.local`, and can set GitHub Actions secrets. With an access token it also configures email/password auth (autoconfirm), disables anonymous, and sets redirect URLs:

```bash
cp .env.example .env.supabase
# edit .env.supabase with anon key, DB password, optional service role + access token + VAPID public key

pnpm install
pnpm setup:supabase
pnpm dev
```

`setup:supabase` does **not** deploy Edge Functions or set Edge secrets. After setup, deploy functions and VAPID secrets as described in [supabase/functions/README.md](supabase/functions/README.md) and [docs/RUNBOOK.md](docs/RUNBOOK.md).

Or export the same vars in your shell. See [`.env.example`](.env.example). Secrets are never committed (`.env.supabase` / `.env.local` are gitignored).

If you skip `SUPABASE_ACCESS_TOKEN`, in the dashboard: enable **Email** provider, disable **Anonymous**, turn off **Confirm email**, and add Site URL / redirects.

Then: **Sign up** → create a trip → **Copy invite link** → other device **Sign in / Sign up** → confirm display name → both see expenses live.

## Use

1. **Sign in / Sign up** (cloud) with email + password.
2. App tabs: **Groups** · **Activity** · **Account**.
3. **New group** → name → Save. Inside a group: **Expenses · Balances · Settle · Pools · Payments · More**.
4. Invite members (cloud) or add friends under **More → Friends**.
5. Add expenses **pool-first** (a **General** pool is created automatically if needed).
6. **Payments** for cash / settle-ups outside expenses; **Settle up** to preview transfers and record them.
7. Export WhatsApp / Excel / PDF / JSON from More or the Export chip when balanced.
8. (Optional) enable Web Push when `VITE_VAPID_PUBLIC_KEY` is configured.

## Deploy (GitHub Pages)

**Live URL:** https://MBilalZ.github.io/TripLedger/

### Secrets (for shared mode on prod)

`pnpm setup:supabase` sets these via `gh` when available:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_VAPID_PUBLIC_KEY` (when present in `.env.supabase`)

Or set them manually under Repo → Settings → Secrets. Auth Site URL should include `https://MBilalZ.github.io/TripLedger`.

### Deploy

Pushes to `prod` run [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml): tests, typecheck, build with `VITE_BASE=/TripLedger/` + Supabase/VAPID secrets, then publish.

```bash
git checkout prod
git merge main
git push origin prod
```

Branch model and PR expectations: [CONTRIBUTING.md](CONTRIBUTING.md).

### Local production preview

```bash
VITE_BASE=/TripLedger/ \
VITE_SUPABASE_URL=... \
VITE_SUPABASE_ANON_KEY=... \
VITE_VAPID_PUBLIC_KEY=... \
pnpm --filter @tripledger/web build
pnpm --filter @tripledger/web preview
```

## Architecture (summary)

- **Facts only** as source of truth: participants, pools, members, expenses, splits, adjustments, settlement settings.
- Settlement is **derived** via `settleTrip()`; cloud may **persist snapshots** in `trip_settlement_snapshots` (client upsert or `recompute-settlement` Edge Function) for realtime/shared views — snapshots are not authoritative facts.
- Expense edits supersede rows; adjustments can be grouped (`adjustment_group_id`) for split fan-out.
- RLS: trip members read workspace data; expense/split **writes** go through security-definer RPCs; invite join via `join_trip_with_token`.
- Offline cloud path: Dexie cache + outbox → sync engine → Supabase.

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
