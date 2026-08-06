# Active migrations

Only SQL files in this directory are applied by `pnpm setup:supabase` (sorted by filename).

| File | Role |
|---|---|
| `20260806160000_extensions_and_tables.sql` | Extensions + core tables/indexes |
| `20260806160001_helpers_and_rate_limit.sql` | RLS helpers + rate limiting |
| `20260806160002_integrity_triggers.sql` | Integrity helpers and table triggers |
| `20260806160003_auth_profile.sql` | Auth profile bootstrap |
| `20260806160004_push_triggers.sql` | Push enqueue helpers/triggers |
| `20260806160005_rpcs.sql` | Application RPCs |
| `20260806160006_grants_and_rls.sql` | Grants + RLS policies |
| `20260806160007_realtime.sql` | Realtime publication |

Add new changes as **new timestamped files** after these (do not edit applied chunks in place on shared DBs).

## Fresh project / stage

```bash
SKIP_GH_SECRETS=1 pnpm setup:supabase
```

## Existing DB that already ran the old monolith

If `public.schema_migrations` still contains `20260806160000_init.sql`, replace that row with the eight chunk filenames (schema already matches; do not re-run the SQL).

See [docs/RUNBOOK.md](../../docs/RUNBOOK.md).
