# TripLedger runbook

## Apply migrations

Schema lives in ordered chunks under `supabase/migrations/` (see that directory’s README).
Add new changes as new timestamped files.

### Stage (local testing)

Use a dedicated Supabase project (not prod). Credentials: gitignored `.env.supabase.stage`.

```bash
# once: copy from .env.example and fill stage project values
cp .env.example .env.supabase.stage

pnpm setup:supabase:stage
# writes apps/web/.env.local from the stage project (does not touch GH secrets)

# migrations only:
pnpm migrate:supabase:stage
```

### Prod

Prod migrations run in **Deploy GitHub Pages** (`pnpm migrate:supabase`). Do not apply prod SQL by hand for routine releases.

One-shot bootstrap (fresh project / sync GH secrets from `.env.supabase`):

```bash
pnpm setup:supabase
```

### Fresh / reset project

1. In Supabase Dashboard: reset the database (or use a new project).
2. If an old `receipts` Storage bucket still exists, **empty and delete it via the Storage UI or Storage API** — do not `DELETE FROM storage.objects` in SQL (blocked by Supabase).
3. Clear remote `public.schema_migrations` if present after a partial wipe.
4. Apply: `pnpm setup:supabase:stage` (stage) or `pnpm setup:supabase` (prod bootstrap).

If a migration fails with “already exists”, **do not** mark it applied blindly. Inspect the remote schema/policies, reconcile, then insert the filename into `public.schema_migrations` only when the migration is fully present.

## Deploy GitHub Pages

1. Ensure GH secrets from `pnpm setup:supabase`: `VITE_SUPABASE_*`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, plus pooler overrides if used; optional `VITE_VAPID_PUBLIC_KEY` / `VITE_SENTRY_DSN`.
2. Merge to `prod` and push — the workflow applies pending migrations, then builds and deploys the site:

```bash
git checkout prod
git merge main
git push origin prod
```

Workflow: `.github/workflows/deploy-pages.yml`.

## Deploy Edge Functions

Only `send-push` (VAPID secrets). Settlement and auth run in the client.

Requires Supabase CLI + linked project (`supabase link`).

```bash
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

`send-push` accepts **only** `PUSH_DRAIN_SECRET` as the Bearer token.
Production uses [`.github/workflows/drain-push.yml`](../.github/workflows/drain-push.yml)
(every 5 minutes + manual `workflow_dispatch`).

Required secrets:

- Edge: `PUSH_DRAIN_SECRET` (`supabase secrets set`)
- GitHub: `PUSH_DRAIN_SECRET`, `VITE_SUPABASE_URL`

Manual invoke:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/send-push" \
  -H "Authorization: Bearer $PUSH_DRAIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Rotate VAPID keys

1. Generate new keys: `npx web-push generate-vapid-keys`
2. Update Edge secrets (`VAPID_*`)
3. Update `VITE_VAPID_PUBLIC_KEY` in `.env.supabase`, `apps/web/.env.local`, and GH secret
4. Redeploy Pages + `send-push`
5. Users must re-subscribe to push (old subscriptions become invalid)

## Observability

- Set `VITE_SENTRY_DSN` (local + GH secret) to enable browser error reporting via `reportError`.
- Optional Edge: `supabase secrets set SENTRY_DSN=...` (used by `send-push/reportError.ts`).
- Without DSN, failures still log with a tag (e.g. `settlement.persist`, `sync.outbox`, `send-push`).

## Incident: settlement wrong for a trip

1. Confirm facts in DB (expenses not removed/superseded incorrectly).
2. Reload the trip in the app (client re-runs `settleTrip` and upserts the snapshot).
3. Compare `trip_settlement_snapshots.facts_hash` / `result` to a local `settleTrip` of the same facts.

## Incident: push not delivering

1. Confirm VAPID Edge secrets and `VITE_VAPID_PUBLIC_KEY` match.
2. Confirm cron is invoking `send-push` with `PUSH_DRAIN_SECRET` (401 = wrong auth).
3. Inspect `push_events` / `push_subscriptions` tables.
4. Check browser notification permission + (iOS) installed PWA.
