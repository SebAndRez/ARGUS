# Wave 000 — Preflight — Backfill Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Which current table(s) feed this wave's target table(s)

None. This wave creates zero domain tables, so there is no row-level
backfill in the sense of `ARGUS_BACKFILL_CATALOG_v1.0.md` (Part C). What
this wave "feeds" is process state, not data:

- The verified backup (§1 of `migration.sql`) is the precondition every
  later wave's backfill depends on — if a later wave's backfill needs to be
  reverted because a mapping rule was wrong, the verified backup from this
  wave is the actual safety net, not any individual wave's `rollback.sql`
  (some backfills are explicitly documented as not safely reversible once
  applied, e.g. D-06's CriticalPoi split in Wave 060).
- The 6 roles created here are the actors that every later wave's backfill
  runs as (`migration_owner` for DDL and backfill INSERT/UPDATE statements,
  never `app_api`).

## Mapping decisions (D-01..D-08) applicable

None directly. This wave is upstream of all data-mapping decisions.

## Batch strategy

N/A — no rows to move.

## Idempotency key strategy

N/A for data. For the role-creation DDL itself, idempotency is achieved via
`IF NOT EXISTS` guards in `migration.sql` (safe to re-run without erroring
if a role already exists).

## Checkpoint strategy

The single checkpoint for this wave is binary: "backup verified and
restorable" (yes/no) + "all 6 roles exist with the expected attributes"
(yes/no — see `validation.sql` §1). There is no partial-completion state to
checkpoint mid-wave because there is no row-level work.
