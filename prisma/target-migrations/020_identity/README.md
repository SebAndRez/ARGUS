# Wave 020 — Identity

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Objective

Create the identity/institution/capability foundation: `identity.*` (9
tables — person, account, verification, device, session, reputation,
emergency contact, consent), `institution.*` (4 tables, D-01: CREATE_EMPTY),
`capability.*` (4 tables, no current-database dependency).

## Tables covered

`identity.people`, `identity.user_accounts`, `identity.verified_identities`,
`identity.liveness_checks`, `identity.devices`, `identity.operational_sessions`,
`identity.reputation_events`, `identity.emergency_contacts`,
`identity.consents` (9); `institution.organizations`,
`institution.organizational_units`, `institution.institutional_memberships`,
`institution.institutional_credentials` (4); `capability.capabilities`,
`capability.accreditations`, `capability.licenses`,
`capability.availability_declarations` (4).

## VERIFY_AGAINST_V1.0 disclosure

Table Catalog v1.1 defers the full ficha of every unmodified identity/
institution/capability table to `ARGUS_PHYSICAL_TABLE_CATALOG_v1.0.md`,
which is **not available in this session**. Every table below except
`capability.accreditations` (whose full ficha IS given directly in v1.1) is
reconstructed from cross-referenced clues in the available frozen documents
(Access Control v1.1 ownership-column names, Enums Reference v1.1 enum
names/counts, Target-Current Mapping v1.1 field names for the `User` split)
and flagged `VERIFY_AGAINST_V1.0` in `migration.sql`. This is a structural
best-effort, not a confirmed transcription — a human must reconcile every
such table against v1.0 before this draft is final DDL.

## Dependencies on prior waves

`000_preflight` (roles), `010_foundation` (governance/security schemas,
`information_classification_enum`, `actor_type_enum`, the 4 deferred FKs this
wave resolves: `governance.jurisdictions.declaring_organization_id`,
`governance.resource_reservation_rules.institution_id`,
`security.audit_logs.device_id`, `security.audit_logs.operational_session_id`).

## Human decisions (D-0X) that apply

**D-01** governs this entire wave: `institution.*` is populated
`CREATE_EMPTY` (zero synthetic organizations/memberships); the 7 current
`User` rows migrate to `identity.people`+`identity.user_accounts` with
`institution_assignment_status` **derived**, never stored, as `UNASSIGNED`
when no active `institutional_memberships` row exists. No RLS policy in this
wave uses `NOT EXISTS (institución_prohibida)` — every institutional policy
uses a positive `EXISTS`/`fn_has_active_membership` check (D-01 mitigation
against a future accidental "UNASSIGNED = trusted default" bug).

## What this wave does NOT do

- Does not create any `institutional_memberships` row automatically for the
  7 migrated `User` rows (D-01).
- Does not attempt to reconstruct `identity.reputation_events` history —
  only current `User.trustScore`/`.strikes` values migrate as single rows,
  never a synthesized event history (see backfill-plan.md).
- Does not migrate anything from `Sanction` into `identity.reputation_events`
  (D-05 — `Sanction` stays `LEGACY_READ_ONLY`, handled in Wave 100).

## Files in this folder

| File | Purpose |
|---|---|
| `migration.sql` | Schemas, local enums, 17 tables, 4 deferred-FK resolutions from Wave 010, RLS, grants |
| `rollback.sql` | Reverse order, guarded, drops the 4 deferred FKs first |
| `validation.sql` | SELECT-only: table/column existence, D-01 derivation query, RLS coverage |
| `backfill-plan.md` | `User` (7 rows) -> `people`+`user_accounts`+`verified_identities`(partial)+`consents`(partial); D-01 zero-membership rule |
| `test-plan.md` | `target-offline-identity.test.ts` (D-01) is the load-bearing test for this wave |
