# Supabase Edge Functions

## `recompute-settlement`

Loads a trip workspace with the caller’s JWT, runs `@tripledger/engine` (`_shared/`), and upserts `trip_settlement_snapshots`.

```bash
supabase functions deploy recompute-settlement
```

The web app prefers this function when available and falls back to local `settleTrip` + `upsert_settlement_snapshot` RPC.

## `send-push`

Drains `push_events` (filled by DB triggers on expenses, trip members, adjustments, settlement snapshots) and delivers Web Push to member subscriptions.

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

The web client invokes `send-push` after successful sync to drain the queue. You can also schedule periodic invokes (Supabase cron / external) with a user JWT or by calling the function URL with the anon key + a signed-in Authorization header.
