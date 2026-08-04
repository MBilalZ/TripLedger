# Supabase Edge Functions

## `recompute-settlement`

Loads a trip workspace with the caller’s JWT, runs `@tripledger/engine` (`_shared/`), and upserts `trip_settlement_snapshots`.

```bash
supabase functions deploy recompute-settlement
```

The web app prefers this function when available and falls back to local `settleTrip` + `upsert_settlement_snapshot` RPC.
