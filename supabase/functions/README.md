# Supabase Edge Functions

## `recompute-settlement`

Loads a trip workspace with the caller’s JWT, runs the settlement engine from `_shared/` (kept in sync with `@tripledger/engine` via `pnpm sync:edge-engine`), and upserts `trip_settlement_snapshots`.

```bash
supabase functions deploy recompute-settlement
```

The web app prefers this function when available and falls back to local `settleTrip` + `upsert_settlement_snapshot` RPC.

## `send-push`

Drains `push_events` (filled by DB triggers on expenses, trip members, adjustments, settlement snapshots) and delivers Web Push to member subscriptions.

**Auth:** `Authorization: Bearer <PUSH_DRAIN_SECRET>` only (cron/ops). User JWTs and forged `role` claims are rejected. The web app does **not** invoke this function.

### VAPID keys

Generate once:

```bash
npx web-push generate-vapid-keys
```

Set Edge secrets:

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY='...' \
  VAPID_PRIVATE_KEY='...' \
  VAPID_SUBJECT='mailto:you@example.com'
```

Expose the **public** key to the web app as `VITE_VAPID_PUBLIC_KEY` (local `.env` / GitHub Actions secret).

### Deploy

```bash
supabase functions deploy send-push
```

Apply migration `20260805000000_push_notifications.sql` (via `pnpm setup:supabase` or your usual migrate path).

### Cron / ops drain

Set a dedicated drain secret (not the service-role JWT):

```bash
supabase secrets set PUSH_DRAIN_SECRET="$(openssl rand -base64 32)"
```

Invoke periodically (GitHub Actions workflow `drain-push.yml` does this every 5 minutes):

```bash
curl -X POST "$SUPABASE_URL/functions/v1/send-push" \
  -H "Authorization: Bearer $PUSH_DRAIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

See [docs/RUNBOOK.md](../../docs/RUNBOOK.md).
