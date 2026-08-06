# Edge Functions

Supabase is used for Auth, PostgREST, and Realtime. The only Edge Function is push delivery (needs VAPID secrets).

## `send-push`

Drain `push_events` and deliver Web Push to trip members.

Auth: `Authorization: Bearer <PUSH_DRAIN_SECRET>` (cron / ops only).

```bash
supabase functions deploy send-push
```

Secrets:

```bash
supabase secrets set \
  PUSH_DRAIN_SECRET='...' \
  VAPID_PUBLIC_KEY='...' \
  VAPID_PRIVATE_KEY='...' \
  VAPID_SUBJECT='mailto:you@example.com'
```

Settlement runs entirely in the client via `@tripledger/engine`; snapshots are upserted through the `upsert_settlement_snapshot` RPC.
