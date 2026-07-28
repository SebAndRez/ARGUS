# Wave 010 — Foundation — Test Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

References tests under `tests/database-target/*.test.ts` written in parallel
by another agent; file names fixed here for consistency even where they do
not yet exist.

## Before applying this wave

- `target-migration-order.test.ts` — this wave's folder (`010_foundation`)
  sorts immediately after `000_preflight`; asserts no table in this wave
  references a table from a later wave without going through the documented
  deferred-FK mechanism (see README.md).
- `target-migration-safety.test.ts` — no `DROP TABLE`/`DROP SCHEMA`/`TRUNCATE`
  against any of the 33 current production tables.
- `target-schema-target-validity.test.ts` — every `CREATE TABLE` in
  `migration.sql` matches a ficha in `ARGUS_PHYSICAL_TABLE_CATALOG_v1.1_FROZEN.md`
  §`governance`/§`security`.

## After applying this wave

- `target-model-count.test.ts` — `governance` has 15 tables, `security` has
  10 tables (21 physical relations counting `security.audit_logs`'s monthly
  partition child as non-logical), reconciling the Table Catalog's own
  internal "13"/"10" prose-vs-enumeration mismatch by direct count.
- `target-rls-coverage.test.ts` — every table in this wave classified
  `OPERATIONAL+` in `ARGUS_PHYSICAL_ACCESS_CONTROL_v1.1_FROZEN.md` §4.19/§4.17
  has `rowsecurity=true` AND >=1 policy once `rls_policies.sql` is applied
  (never RLS-enabled-zero-policies — the exact drift this migration exists to
  avoid repeating, see `000_preflight/rls_auto_enable_remediation.sql`).
- `target-no-destructive-cascade.test.ts` — confirms zero `ON DELETE CASCADE`
  crosses a Bounded Context boundary in this wave (the only `CASCADE` in this
  wave's `migration.sql` is `automation_rule_incident_types`'s two FKs and
  `resource_reservation_rules.supersedes_rule_id`'s `SET NULL`, both intra-BC
  or self-referential).
- `target-critical-instruction-version.test.ts` — not directly applicable to
  this wave (no `alert.*` tables), but the three integrity columns
  (`integrity_algorithm`, `canonicalization_version`, `integrity_key_id`)
  introduced on `security.audit_logs` here must match, column-for-column, the
  same three columns introduced on `alert.critical_instruction_versions` in
  070_alerts_communications (D-01 consistency check).
- `target-table-traceability.test.ts` — every table with a non-`CREATE_EMPTY`
  action in `ARGUS_TARGET_CURRENT_MAPPING_v1.1_FROZEN.md` §1 `governance`/
  `security` rows has a corresponding entry in `ARGUS_BACKFILL_CATALOG_v1.0.md`.

## Not covered by this wave's tests

- `target-help-request-close.test.ts`, `target-resource-reservation.test.ts`
  (mechanism defined via `governance.resource_reservation_rules` here, but
  the reservation table itself and its trigger are 060_resources),
  `target-offline-identity.test.ts`, `target-geography-strategy.test.ts` — all
  become directly relevant starting with later waves; referenced again there.
