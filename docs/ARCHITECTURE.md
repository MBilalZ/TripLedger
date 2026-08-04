# TripLedger architecture

## Goals

- Correct integer-paisa settlement from trip **facts**
- Work offline (local IndexedDB) and optionally sync to Supabase
- Keep the browser free of service-role secrets

## Layers

```
views / composables
        ↓
Pinia stores (auth, trips, workspace/*)
        ↓
repositories (local | cloud+outbox)
        ↓
api/* + db/dexie          sync/engine (outbox drain)
        ↓                        ↓
IndexedDB                  Supabase (Auth, PostgREST, Realtime, Edge)
        ↓
packages/engine ← packages/types
```

| Layer | Location | Responsibility |
|---|---|---|
| UI | `apps/web/src/views`, `components`, `composables` | Presentation and form flows |
| State | `apps/web/src/stores` | Auth, trip list, workspace modules |
| Repositories | `apps/web/src/repositories` | Local vs cloud write path; cloud wraps Dexie + outbox |
| API | `apps/web/src/api` | Supabase client calls, error mapping |
| Sync | `apps/web/src/sync` | Outbox queue, push/pull, status |
| Domain | `packages/{types,engine,validation}` | Shared types, settlement, input guards |
| Backend | `supabase/migrations`, `supabase/functions` | Schema, RLS, RPCs, Edge jobs |

## Settlement

1. UI/workspace builds `TripFacts` (`mapToTripFacts`).
2. `settleTrip(facts)` in `@tripledger/engine` returns balances/transfers (pure).
3. Cloud mode may persist a **snapshot** (`upsert_settlement_snapshot` RPC or `recompute-settlement` Edge Function) keyed by facts hash.
4. Snapshots support shared/realtime settlement views; **facts remain source of truth**. Editing facts invalidates/replaces the snapshot.

Edge Functions use a **synced copy** of the engine under `supabase/functions/_shared/` (kept in sync with `packages/engine` + `packages/types` via `pnpm sync:edge-engine`). CI fails if `_shared` drifts.

## Offline / cloud sync

- **Local-only:** repositories talk only to Dexie.
- **Cloud:** writes update Dexie immediately, enqueue outbox ops, sync engine drains to Supabase RPCs/tables when online.
- Realtime subscriptions trigger quiet workspace reloads.
- PWA/service worker caches the shell for installable/offline use.

## Edge Functions

| Function | Auth | Role |
|---|---|---|
| `recompute-settlement` | Caller user JWT | Settle trip with engine; upsert snapshot |
| `send-push` | **PUSH_DRAIN_SECRET** bearer (cron/ops) | Drain `push_events`, deliver Web Push |

See [supabase/functions/README.md](../supabase/functions/README.md).

## Branch / deploy

- `main` — integration branch
- `prod` — GitHub Pages deploy source

See [CONTRIBUTING.md](../CONTRIBUTING.md) and [RUNBOOK.md](RUNBOOK.md).
