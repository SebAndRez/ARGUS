# Wave 070 — Alerts & Communications

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Objective

Create `comms.*` (7 tables — the delivery-chain content-kind consistency
mechanism, P1-05/P2-02) and `alert.*` (8 tables — including the single
documented circular FK in the entire 168-table model, and D-01's
cryptographic integrity chain).

## Tables covered

`comms.communication_plans`, `comms.messages`, `comms.delivery_attempts`,
`comms.acknowledgements`, `comms.comprehension_confirmations`,
`comms.offline_communication_plans`, `comms.communication_losses` (7);
`alert.alerts`, `alert.alert_authorizations`, `alert.alert_cancellations`,
`alert.alert_supersessions`, `alert.critical_instructions`,
`alert.critical_instruction_versions`, `alert.instruction_authorizations`,
`alert.instruction_compliance_records` (8).

## VERIFY_AGAINST_V1.0 disclosure

8 of the 15 tables have full fichas transcribed verbatim from Table Catalog
v1.1 (`comms.messages`/`.delivery_attempts`/`.acknowledgements`/
`.comprehension_confirmations`/`.communication_losses`, `alert.alerts`/
`.critical_instructions`/`.critical_instruction_versions`); the remaining 7
are reconstructed from cross-referenced clues, flagged per table.

## Dependencies on prior waves

`010_foundation` (`security.information_classification_enum`,
`security.actor_type_enum`, `governance.jurisdictions`), `020_identity`
(`identity.devices`, `identity.operational_sessions`), `040_incident`
(`incident.incidents`, `risk.risk_assessments`).

## Human decisions (D-0X) that apply

**D-01** governs `alert.critical_instruction_versions`'s cryptographic
integrity chain (`integrity_algorithm`, `canonicalization_version`,
`integrity_key_id`) — structurally identical in purpose to
`security.audit_logs`'s chain (Wave 010), confirmed column-for-column
consistent by `target-critical-instruction-version.test.ts`.

## The one circular FK in the whole model

`alert.critical_instructions.current_version_id` <-> `alert.critical_instruction_versions.critical_instruction_id`
(Keys/Constraints v1.1 §8). Resolved by the documented 3-step protocol:
create `critical_instructions` with `current_version_id = NULL`; create the
first `critical_instruction_versions` row; `UPDATE critical_instructions SET
current_version_id = ...`. This migration.sql creates `critical_instructions`
first (nullable FK omitted at creation time), then
`critical_instruction_versions`, then adds the forward FK via `ALTER TABLE`
plus a cross-consistency trigger — the single documented resolution, not
repeated or promised elsewhere without content.

## What this wave does NOT do

- Does not implement `ck_civ_order_requires_authority` as a row-level CHECK
  — it requires a multi-table trigger (verifies signer authority against
  jurisdiction membership), flagged `SQL_COMPLEMENTARY_REQUIRED`, not
  silently dropped.
- Does not backfill any table in this wave — both schemas are entirely
  `CREATE_EMPTY` in the current database (alerts/critical instructions have
  no persisted current-database analogue; `messages`/`acknowledgements` were
  computed in memory or in `localStorage`, `NO_RECONSTRUCTABLE`).

## Files in this folder

| File | Purpose |
|---|---|
| `migration.sql` | Schemas, 9 local enums, 15 tables, circular-FK 3-step resolution + trigger, content_kind consistency trigger, RLS, grants |
| `rollback.sql` | Reverse order — drops the forward FK on `critical_instructions` before dropping `critical_instruction_versions` |
| `validation.sql` | SELECT-only: table/column existence, circular-FK resolution check, both triggers present, RLS coverage |
| `backfill-plan.md` | All 15 tables CREATE_EMPTY / NO_RECONSTRUCTABLE — no current-database source |
| `test-plan.md` | `target-critical-instruction-version.test.ts` is the load-bearing test for this wave |
