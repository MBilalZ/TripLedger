# TripLedger security notes

## Threat model (summary)

TripLedger is a small-group expense app on GitHub Pages + optional Supabase. Attackers may try to:

- Read or mutate another trip’s expenses
- Forge privileged Edge Function calls
- Abuse invite join or push delivery
- Exfiltrate secrets from the static SPA

## Trust boundaries

| Secret / credential | Where it lives | Client? |
|---|---|---|
| `VITE_SUPABASE_ANON_KEY` | SPA + GH Pages | Yes (expected) |
| `VITE_VAPID_PUBLIC_KEY` | SPA | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge / setup only | **Never** |
| `PUSH_DRAIN_SECRET` | Edge + GitHub Actions cron | **Never** (not `VITE_*`) |
| `VAPID_PRIVATE_KEY` | Edge secrets | **Never** |
| DB password / access token | Local `.env.supabase` / ops | **Never** |

RLS and security-definer RPCs are the real authorization layer. The anon key alone must not grant cross-trip access.

## Auth (free-tier choices)

Documented product choices (not enterprise IdP):

- Email/password with **autoconfirm** (no SMTP required)
- Anonymous auth **disabled**
- No MFA / SSO in-tree
- Password length enforced in the client UI (minimum 8)

Tighten these in the Supabase dashboard if you need a stricter posture.

## Data access (RLS)

- Trip members can **read** workspace tables for their trips.
- **Expense and expense_split writes** are not open to direct client `INSERT`/`UPDATE`/`DELETE`; they go through security-definer RPCs (`create_expense_with_splits`, `revise_expense_with_splits`, `void_expense`, `remove_participant`, …) that check membership.
- Pool / pool_member editing remains member-writable (pool configuration), with membership checks.
- Invite join uses `join_trip_with_token` (rate-limited / capped in prod hardening).
- Soft-delete and void semantics are enforced in app + RPCs; do not rely on the client alone.

## Edge Functions

- `recompute-settlement` uses the caller’s JWT with the anon client (RLS applies to reads; upsert via RPC).
- `send-push` accepts **only** `PUSH_DRAIN_SECRET` as `Authorization: Bearer …`. It does **not** trust unverified JWT payloads. Schedule drains with cron/ops (GitHub Actions); the web app does not drain the global queue.

## Browser hardening

- CSP and `nosniff` meta tags in `apps/web/index.html`
- Service worker / PWA caching of static assets only for the app shell

## Reporting

Optional error reporting: `VITE_SENTRY_DSN` (browser) and Edge secret `SENTRY_DSN`. Without them, errors still log through `reportError` helpers.

## What this is not

- Not a substitute for a BFF, WAF, or enterprise SSO
- Not multi-tenant org isolation beyond trip membership
- Not a formal penetration-test report
