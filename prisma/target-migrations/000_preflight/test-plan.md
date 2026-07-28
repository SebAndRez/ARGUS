# Wave 000 — Preflight — Test Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

References tests under `tests/database-target/*.test.ts` written in
parallel by another agent. This wave does not require those files to exist
yet — it only fixes the names so both efforts stay consistent.

## Before applying this wave

- `target-migration-safety.test.ts` — assert that no statement in
  `migration.sql` issues `DROP TABLE`/`DROP SCHEMA`/`TRUNCATE` against any
  of the 33 current production tables (this wave should touch zero domain
  tables, current or target).
- Manual/process check (not a `.test.ts`): verified backup exists and has
  been test-restored (see `backfill-plan.md`).

## After applying this wave

- `target-rls-coverage.test.ts` (partial applicability) — assert that none
  of the 6 roles created has `rolbypassrls = true` and that `app_api`
  specifically has `rolbypassrls = false` (this is the D-03 structural
  condition every later wave's RLS design depends on).
- `target-migration-order.test.ts` — assert this wave's folder sorts first
  lexicographically (`000_preflight`) among the 11 wave folders, and that
  no other wave's `migration.sql` references a role not created here.
- Custom (not in the named list, but relevant): a drift-check assertion
  that `public.rls_auto_enable()`'s grantee set (`anon`/`authenticated`) is
  either unchanged from the documented baseline (if remediation has not yet
  been executed) or empty (if it has) — never silently different from both.

## Not covered by this wave's tests

- `target-schema-target-validity.test.ts`, `target-model-count.test.ts`,
  `target-table-traceability.test.ts`, `target-no-destructive-cascade.test.ts`,
  `target-critical-instruction-version.test.ts`,
  `target-help-request-close.test.ts`, `target-resource-reservation.test.ts`,
  `target-offline-identity.test.ts`, `target-geography-strategy.test.ts` —
  none apply to this wave since it has no domain tables; they become
  relevant starting with Wave 010 and are named again in each later wave's
  own `test-plan.md` where they actually apply.
