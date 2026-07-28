# Wave 020 — Identity — Test Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Before applying this wave

- `target-migration-order.test.ts` — `020_identity` sorts after `010_foundation`;
  the 4 `ALTER TABLE` deferred-FK resolutions in `migration.sql` §5 only
  target tables created in `010_foundation`.
- `target-migration-safety.test.ts` — no `DROP`/`TRUNCATE` against any current
  production table (`User` untouched).
- `target-schema-target-validity.test.ts` — every `CREATE TABLE` matches a
  ficha in Table Catalog v1.1 §identity/§institution/§capability, with the
  `VERIFY_AGAINST_V1.0` caveat noted in README.md explicitly logged as a known
  gap, not silently passed.

## After applying this wave

- `target-offline-identity.test.ts` — **the load-bearing test for this
  wave (D-01)**: asserts `prisma/schema.target.prisma` declares no mandatory
  `Person -> InstitutionalMembership` relation, and that
  `institution.institutional_memberships` is empty immediately post-backfill.
- `target-model-count.test.ts` — 9+4+4=17 tables across the 3 schemas.
- `target-rls-coverage.test.ts` — all 17 tables have RLS enabled + >=1 policy
  (see `validation.sql` §5); none use `USING (true)`.
- `target-table-traceability.test.ts` — `User` has a traceable destination
  entry in `ARGUS_BACKFILL_CATALOG_v1.0.md` covering `people`/`user_accounts`/
  `verified_identities`/`consents`/`reputation_events`.
- `target-critical-instruction-version.test.ts` — not applicable to this wave.

## Not covered by this wave's tests

- `target-help-request-close.test.ts`, `target-resource-reservation.test.ts`,
  `target-geography-strategy.test.ts` — not applicable; relevant in
  050_help_mission/060_resources/080_geography respectively.
