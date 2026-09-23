# Realistic legacy baseline (local rehearsal only)

Replaces the former `fixtures/000_legacy_synthetic_fixtures.sql` (22 hand-written
tables, lowercase statuses, UUID ids, `timestamptz` dates). That fixture let the
rehearsal pass while the backfills would have failed or misclassified data on
the real Supabase project. Everything here runs against the disposable local
container only; nothing reads from or writes to Supabase.

| File | When | What |
|---|---|---|
| `00_supabase_platform.sql` | End of `Reset-ArgusRehearsal.ps1`, **before** the empty-catalog snapshot | Makes the container look like the shared Supabase project measured read-only in the Paso 3 preflight: PostGIS **absent**, `pgcrypto`/`uuid-ossp` in schema `extensions`, role `search_path = "$user", public, extensions`, `TimeZone = UTC`, API roles `anon`/`authenticated`/`service_role` with production's default privileges, and the `ensure_rls` event trigger → `public.rls_auto_enable()` (verbatim). Platform, never ARGUS residue. |
| 13 × `prisma/migrations/*/migration.sql` | `Import-ArgusLegacyBaseline` | The **real** legacy schema, applied in production's historical order (`_prisma_migrations.started_at`), not the lexicographic folder order. Verified structurally identical to production's `public` schema (0 differences: tables, columns, types, nullability, defaults, FKs, indexes). |
| `10_prisma_migrations.sql` | same | `_prisma_migrations` exactly as production has it: 15 rows / 13 names, including the 2 BOM-failure attempts marked rolled back. |
| `20_realistic_data.sql` | same | Deterministic, fictitious data with production's volumes and distributions (see the file header: `[M]` measured, `[C]` from the code that writes the column, `[T]` deliberate test coverage). |

Production shapes the data reproduces, each of which broke at least one wave:

- ids are Prisma **cuids** (never UUIDs) — `AuditLog.targetId` 54/54 [M];
- dates are **`timestamp without time zone`** holding UTC [M];
- `KnowledgeIncident.verificationStatus` is **UPPERCASE** (`CANDIDATE` 4737, `OFFICIAL` 3457, `UNVERIFIED` 13) and `status` is NULL in 85% [M];
- `IngestionRun`/`KnowledgeIngestionRun`/`ExternalEvent` reference many source ids while `KnowledgeSource` has one row [M];
- `HazardKnowledgeFact.hazardType` has 33 free-text Spanish values [M]; `RiskAssessment.riskType` 4 codes [M];
- `CriticalPoi` 11 categories / 2 sources [M];
- `IncidentTransition`: 59 of 81 rows have no `newStatus` (severity-only changes) [M+C];
- `HelpRequest` (0 in production) and `FamilyPlan` (1, empty) get data [T] so their paths really run — including a fictitious medical note that must never reach any target table (D-08).

Checks built on top of it (all blocking, see `Invoke-ArgusFullRehearsal.ps1`):
`sql/legacy-data-invariants.sql` (reconciliation, classification, UTC instants,
cuids, audit, D-08), `sql/legacy-fingerprint.sql` (legacy rows byte-identical
after install and after rollback), `lib/compare-target-schema.mjs` (structural
drift vs `schema.target.prisma`, ratcheted by `target-schema-drift-baseline.json`)
and `tests/database-target/legacy-audit-backfill-integrity.test.ts` (every
migrated audit row verified by the application's own verifier).
