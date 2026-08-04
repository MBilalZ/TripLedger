# Contributing to TripLedger

## Branches

| Branch | Purpose |
|---|---|
| `main` | Integration / default PR target |
| `prod` | Production deploy (GitHub Pages) |

Ship to production by merging `main` into `prod` and pushing `prod`:

```bash
git checkout prod
git merge main
git push origin prod
```

## Local checks

```bash
pnpm install
pnpm lint
pnpm check:edge-engine
pnpm check:rls
pnpm test:engine
pnpm --filter @tripledger/validation test
pnpm test:web
pnpm --filter @tripledger/web typecheck
pnpm --filter @tripledger/web build
```

Optional e2e (builds/previews the web app):

```bash
pnpm --filter @tripledger/web build
pnpm test:e2e
```

## Edge engine sync

After changing `packages/engine` or `packages/types`, regenerate the Deno copy:

```bash
pnpm sync:edge-engine
```

CI fails if `supabase/functions/_shared` drifts.

## Pull requests

- Target `main` unless the change is deploy-only.
- Keep CI green (lint, tests, typecheck, build, audit).
- Do not commit `.env`, `.env.supabase`, or service-role keys.
- Prefer small, focused PRs.

## Docs

- Product / setup: [README.md](README.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Security: [docs/SECURITY.md](docs/SECURITY.md)
- Ops: [docs/RUNBOOK.md](docs/RUNBOOK.md)
