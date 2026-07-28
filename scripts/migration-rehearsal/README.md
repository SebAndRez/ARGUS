# ARGUS local migration rehearsal

Runs the full `prisma/target-migrations/` package (waves `000_preflight`
through `100_projections_legacy_retirement`) against a disposable, local-only
PostgreSQL 17 + PostGIS container. Never touches production, never touches
`prisma/schema.prisma` or `prisma/migrations/`.

## Status of this package (written without a local Docker/PostgreSQL engine)

Every script here is real, working orchestration code — not a simulation —
but it has never been run against a live engine in the session that wrote
it, because this machine had no admin rights to install Docker Desktop /
enable WSL2 (installing those is a system-level change outside what an
agent session may do autonomously; see the conversation this was produced
in). Treat the **first real run** as a debugging pass: `ON_ERROR_STOP=1` on
every `psql` invocation means any real column/constraint/syntax mismatch in
`prisma/target-migrations/*/migration.sql` or in
`scripts/migration-rehearsal/fixtures/001_synthetic_fixtures.sql` will stop
the run immediately with the exact failing file and statement — fix that
file, then re-run from the top (every script tears down and recreates the
database first, so re-running is always safe).

## Prerequisites

1. **Docker Desktop**, installed by you (requires admin rights + a possible
   reboot — an agent session cannot do this):
   ```
   winget install --id Docker.DockerDesktop --exact --accept-source-agreements --accept-package-agreements
   ```
   Start Docker Desktop, wait for it to say "Engine running", and confirm:
   ```
   docker info
   ```
2. Node/npm (already present in this repo) — used for `prisma validate` and
   `npx vitest run`.

## Running the full rehearsal

One command, once Docker is up:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\migration-rehearsal\Invoke-ArgusFullRehearsal.ps1
```

This runs Fases 5 through 22 of the mandate end-to-end: fresh container →
apply all 11 waves (migration + backfill ×2 + validation each) → synthetic
fixtures → RLS runtime checks (role-switching via `SET ROLE`, never
`migration_owner`) → physical validations → `prisma validate` → repo test
suites (`tests/database-target/`, the two P0 endpoint-auth suites) →
rollback 100→000 → reapply 000→100 (reproducibility, same volume) → destroy
volume + fresh install → repeat once more (reproducibility, second volume)
→ write result docs under `docs/architecture/private/` (git-excluded) →
stage + commit the permitted tracked paths only → tear everything down.

It never runs `git push`.

## Individual scripts

- `lib/Common.ps1` — shared helpers (env loading, password generation, the
  local-only guard, `docker exec -i psql` wrapper, catalog snapshots).
  Dot-sourced by every other script; never run directly.
- `lib/assert-local-only.mjs` — the actual remote-connection guard (Fase 6).
  Pure Node, no dependencies, unit-tested by
  `tests/database-target/target-migration-rehearsal-local-only-guard.test.ts`.
  Called by every script here before any `psql` connection.
- `Reset-ArgusRehearsal.ps1` — tears down container+volume, generates a
  fresh local-only password, brings up an empty healthy instance.
- `Invoke-Wave.ps1 -WaveDir <path> [-Rollback] [-SkipBackfill]` — applies or
  rolls back one wave folder, with before/after catalog snapshots and
  per-file logging.
- `Test-ArgusRehearsal.ps1` — fixtures + RLS runtime checks + physical
  validations + `prisma validate` + repo test suites, against an
  already-migrated database (does not apply/roll back waves itself).
- `Invoke-ArgusFullRehearsal.ps1` — the single entry point described above.

## Manual / partial runs

```powershell
# Just bring up an empty rehearsal database:
. .\scripts\migration-rehearsal\lib\Common.ps1
.\scripts\migration-rehearsal\Reset-ArgusRehearsal.ps1

# Apply one specific wave:
.\scripts\migration-rehearsal\Invoke-Wave.ps1 -WaveDir prisma\target-migrations\000_preflight

# Roll it back:
.\scripts\migration-rehearsal\Invoke-Wave.ps1 -WaveDir prisma\target-migrations\000_preflight -Rollback

# Run only the post-migration checks (assumes waves already applied):
.\scripts\migration-rehearsal\Test-ArgusRehearsal.ps1
```

## What never leaves this machine

- `docker-compose.argus-migration.yml` binds Postgres to `127.0.0.1` only,
  on port `55432` (not the default `5432`), in a container named
  `argus_migration_rehearsal_pg`, database `argus_migration_rehearsal`.
- The local password is generated fresh by `Reset-ArgusRehearsal.ps1` into
  `.env.argus-migration.local` (git-excluded via `.git/info/exclude`, never
  `.gitignore`, per the mandate) and deleted by
  `Invoke-ArgusFullRehearsal.ps1`'s cleanup step.
- `lib/assert-local-only.mjs` refuses to let any script proceed unless
  `ARGUS_MIGRATION_LOCAL_ONLY=true`, the host is `127.0.0.1`/`localhost`,
  and `DATABASE_URL` contains none of: `supabase`, `pooler`, `vercel`,
  `neon`, `railway`, `render`, `aws`, `azure`.
- Logs land in `migration-rehearsal-logs/` and artifacts in
  `migration-rehearsal-artifacts/` — both git-excluded, both local to this
  checkout.

## Known static finding worth keeping in mind while debugging a first run

`governance.jurisdictions.primary_administrative_area_id` is `NOT NULL` but
deliberately has **no FK constraint** in Wave 010 — the constraint is added
in Wave 080, after `geo.administrative_areas` exists (see the comment at
`prisma/target-migrations/010_foundation/migration.sql:202`). This is why
`scripts/migration-rehearsal/fixtures/001_synthetic_fixtures.sql` inserts
fixture data only after all 11 waves have applied, rather than interleaved
per-wave: interleaving would hit that forward reference before Wave 080
closes it.
