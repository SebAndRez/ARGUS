# Wave 010 — Foundation

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Objective

Establish the two schemas with zero forward-only dependency on any other
domain schema: `governance` (system-of-rules catalogs) and `security`
(access-control/audit primitives). Every later wave's tables reference
`governance.*`/`security.*` types and tables (`information_classification_enum`,
`actor_type_enum`, `governance.jurisdictions`, `security.audit_logs`, etc.),
so this wave must exist before any wave 020-100 migration is applied. Also
installs the two PostgreSQL extensions (`pgcrypto`, `postgis`) needed from
this wave forward.

## Tables covered

**governance schema — 15 tables** (Table Catalog v1.1 §`governance`; the
schema's own header prose says "13" but enumerates `jurisdictions`/`policies`
as modified-not-new on top of the 10 unchanged + 3 new — reconciled total is
15, matching the 15 `CREATE TABLE` statements in `migration.sql`):
`territorial_configurations`, `operational_rules`, `automation_rules`,
`automation_rule_incident_types`, `incident_categories`, `incident_types`,
`doctrine_versions`, `feature_flags`, `emergency_bases`, `jurisdictions`,
`jurisdiction_scopes`, `policies`, `resource_reservation_rules`,
`hazard_types`, `administrative_area_kinds`.

**security schema — 10 tables**: `access_policies`, `permissions`,
`access_roles`, `access_role_permissions`, `contextual_accesses`,
`access_decisions`, `audit_logs` (partitioned by `occurred_at`, D-02),
`security_events`, `retention_policies`, `legal_holds`.

## Dependencies on prior waves

`000_preflight` — the 6 roles (`migration_owner`, `app_api`, `ingest_worker`,
`jobs_worker`, `audit_reader`, `readonly_inspector`) must exist before this
wave's `GRANT`/`REVOKE` statements run.

## Forward references deferred to later waves

Per Keys/Constraints v1.1 §2 (CASCADE only within one Aggregate Root — every
cross-BC FK is RESTRICT/SET NULL) and the fact that `governance`/`security`
are the very first domain schemas created, several columns in this wave's
tables are typed `uuid` **without** the FK constraint, with the constraint
added by `ALTER TABLE ... ADD CONSTRAINT` in the wave that creates the
referenced table:

| Column | Deferred FK target | Added in |
|---|---|---|
| `governance.jurisdictions.declaring_organization_id` | `institution.organizations(id)` | 020_identity |
| `governance.resource_reservation_rules.institution_id` | `institution.organizations(id)` | 020_identity |
| `security.audit_logs.device_id` | `identity.devices(id)` | 020_identity |
| `security.audit_logs.operational_session_id` | `identity.operational_sessions(id)` | 020_identity |
| `security.audit_logs.incident_id` | `incident.incidents(id)` | 040_incident |
| `security.audit_logs.mission_id` | `mission.missions(id)` | 050_help_mission |

`governance.jurisdictions.primary_administrative_area_id` remains `NOT NULL`
with its FK deferred to `080_geography` — see that wave's migration.sql.

## Human decisions (D-0X) that apply

None of D-01..D-08 govern this wave's own table set directly (they govern
identity/incident/help/resource/geo/ice mapping) — but this wave's
`security.audit_logs` (D-01, D-02) and `governance.jurisdictions`/`policies`
approval columns (P2-07, not a D-0X item) are the physical carriers several
later waves' D-0X decisions write into.

## What this wave does NOT do

- Does not populate any seed row (`governance.hazard_types` seed values,
  `governance.administrative_area_kinds` seed hierarchy, etc.) — seeding is
  backfill, not DDL; see `backfill-plan.md`.
- Does not activate `pg_partman` or any scheduled partition-creation job for
  `security.audit_logs` — only the initial `y2026m07` partition is drafted,
  flagged `SQL_COMPLEMENTARY_REQUIRED` in `migration.sql`.
- Does not enable RLS on any table — that is `rls_roles.sql`/`rls_policies.sql`/
  `rls_validation.sql` in this same folder (Part B of the mandate), applied
  conceptually alongside this wave's tables but tracked as separate files.

## Files in this folder

| File | Purpose |
|---|---|
| `migration.sql` | Extensions, schemas, 15 governance + 10 security tables, transversal + local enums, grants |
| `rollback.sql` | Reverse order: revoke grants, drop security tables, drop governance tables, drop types, drop extensions (guarded) |
| `validation.sql` | SELECT-only: table/column existence, enum value counts, FK/CHECK presence, partition presence for `audit_logs` |
| `backfill-plan.md` | Seed data plan (hazard_types, administrative_area_kinds, incident_types seed per Enums Reference v1.1 §3) — no current-database backfill (governance/security have no current-database source) |
| `test-plan.md` | Names the target-schema tests this wave must satisfy |
| `rls_roles.sql` | Part B — restates the 6 roles' RLS-relevant attributes in context of this wave's tables (roles themselves created in 000_preflight) |
| `rls_policies.sql` | Part B — concrete policy templates for governance/security tables + the 8 transversal pattern templates required by the mandate |
| `rls_validation.sql` | Part B — SELECT-only: every `OPERATIONAL+` table in this wave has RLS enabled AND >=1 policy |
