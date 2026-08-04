# TripLedger runbook

## Apply migrations

```bash
cp .env.example .env.supabase   # once
# fill SUPABASE_PROJECT_REF, SUPABASE_ANON_KEY, SUPABASE_DB_PASSWORD, …

pnpm setup:supabase
```

If a migration fails with “already exists”, **do not** mark it applied blindly. Inspect the remote schema/policies, reconcile, then insert the filename into `public.schema_migrations` only when the migration is fully present.

## Deploy GitHub Pages

1. Ensure GH secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_VAPID_PUBLIC_KEY` / `VITE_SENTRY_DSN`.
2. Merge to `prod` and push:

```bash
git checkout prod
git merge main
git push origin prod
```

Workflow: `.github/workflows/deploy-pages.yml`.

## Deploy Edge Functions

Requires Supabase CLI + linked project (`supabase link`).

```bash
pnpm sync:edge-engine
supabase functions deploy recompute-settlement
supabase functions deploy send-push
```

Set VAPID secrets:

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY='...' \
  VAPID_PRIVATE_KEY='...' \
  VAPID_SUBJECT='mailto:you@example.com'
```

## Drain push queue (cron)

`send-push` accepts **only** the service role key:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/send-push" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Schedule every 1–5 minutes (Supabase cron, GitHub Actions, or external). Never expose the service role key to the SPA.

## Rotate VAPID keys

1. Generate new keys: `npx web-push generate-vapid-keys`
2. Update Edge secrets (`VAPID_*`)
3. Update `VITE_VAPID_PUBLIC_KEY` in `.env.supabase`, `apps/web/.env.local`, and GH secret
4. Redeploy Pages + `send-push`
5. Users must re-subscribe to push (old subscriptions become invalid)

## Observability

- Set `VITE_SENTRY_DSN` (local + GH secret) to enable browser error reporting via `reportError`.
- Optional Edge: `supabase secrets set SENTRY_DSN=...` (used by `_shared/reportError.ts`).
- Without DSN, failures still log with a tag (e.g. `settlement.persist`, `sync.outbox`, `send-push`).

## Incident: settlement wrong for a trip

1. Confirm facts in DB (expenses not voided/superseded incorrectly).
2. Call `recompute-settlement` with a member JWT, or reload the trip in the app.
3. Compare `trip_settlement_snapshots.facts_hash` to a local `settleTrip` of the same facts.
4. If Edge and client disagree, run `pnpm sync:edge-engine` / redeploy functions — `_shared` may be stale.

## Incident: push not delivering

1. Confirm VAPID Edge secrets and `VITE_VAPID_PUBLIC_KEY` match.
2. Confirm cron is invoking `send-push` with the service role key (401 = wrong auth).
3. Inspect `push_events` / `push_subscriptions` tables.
4. Check browser notification permission + (iOS) installed PWA.
