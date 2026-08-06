# TripLedger architecture

## Goals

- Correct integer-paisa settlement from trip **facts**
- Work offline (local IndexedDB) and optionally sync to Supabase
- Keep the browser free of service-role secrets
- Use Supabase for Auth + data storage (PostgREST/Realtime); avoid Edge business logic

## Layers (MVC-style)

```
View:        views / components
Controller:  Pinia stores + orchestration composables
Model:       packages/{types,engine,validation} + lib/mapToTripFacts
Data:        repositories (local | cloud+outbox)
Infra:       services/* (Supabase) + db/dexie + sync/*
```

| Layer | Location | Responsibility |
|---|---|---|
| View | `apps/web/src/views`, `components` | Presentation |
| Controller | `apps/web/src/stores`, form composables | User flows; no raw SQL |
| Model | `packages/*`, `lib/mapToTripFacts` | Domain + settlement |
| Data | `apps/web/src/repositories` | Local vs cloud write path |
| Infra | `apps/web/src/services`, `db`, `sync` | Supabase/Dexie adapters |
| Backend | `supabase/migrations`, `functions/send-push` | Schema, RLS, thin RPCs, push drain |

## Settlement

1. UI/workspace builds `TripFacts` (`mapToTripFacts`).
2. `settleTrip(facts)` in `@tripledger/engine` returns balances/transfers (pure).
3. Cloud mode persists a **snapshot** via `upsert_settlement_snapshot` RPC (client-computed), keyed by facts hash.
4. Snapshots support shared/realtime views; **facts remain source of truth**.

## Offline / cloud sync

- **Local-only:** repositories talk only to Dexie.
- **Cloud:** writes update Dexie immediately, enqueue outbox ops, sync engine drains to Supabase RPCs/tables when online.
- Realtime subscriptions trigger quiet workspace reloads.
- PWA/service worker caches the shell for installable/offline use.

## Edge Functions

| Function | Auth | Role |
|---|---|---|
| `send-push` | **PUSH_DRAIN_SECRET** bearer (cron/ops) | Drain `push_events`, deliver Web Push |

See [supabase/functions/README.md](../supabase/functions/README.md).

## Schema

Ordered SQL chunks in `supabase/migrations/` (tables → helpers → triggers → RPCs → RLS → realtime).

## Branch / deploy

- `main` — integration branch
- `prod` — GitHub Pages deploy source
- `refactor/clean-slate` — architecture reset (merge when ready)

See [CONTRIBUTING.md](../CONTRIBUTING.md) and [RUNBOOK.md](RUNBOOK.md).
