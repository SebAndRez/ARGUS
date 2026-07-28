# Wave 090 — ICE, Media & Community — Backfill Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Source -> target

All 20 tables in this wave are populated with **zero rows** from the current
database, per `ARGUS_MIGRATION_DECISION_REGISTER_v1.0_FROZEN.md` D-08/D-03:

| Target table | Reason for 0 rows |
|---|---|
| `ice.emergency_profiles`, `.medical_conditions`, `.allergies`, `.current_medications`, `.medical_devices`, `.special_needs`, `.emergency_accesses`, `.emergency_contact_designations` | CREATE_EMPTY (D-08) — "no existe hoy ningún concepto de consentimiento médico ni de acceso de emergencia en los 33 modelos actuales." `emergency_contact_designations` explicitly corrects v1.0, which had cited `EmergencyContact.priority` (VESTA) as a partial source — v1.1 confirms zero relationship |
| `media.publications`, `.live_streams`, `.content_moderations`, `.anonymizations`, `.redactions`, `.visual_maskings`, `.usage_licenses`, `.publication_authorizations` | CREATE_EMPTY — entirely new domain; `redactions` has a logical analog in `toPublicReport()`'s in-code redaction pattern, but that pattern has never persisted a row, so there is nothing to migrate, only a structural precedent to acknowledge |
| `community.family_networks`, `.dependents`, `.community_groups`, `.volunteers` | CREATE_EMPTY (D-03) — none is fed by `PreparednessProfile`/`FamilyPlan`/`EmergencyContact`(VESTA)/`PreparednessChecklistItem`/`PreparednessReminder`. `community.volunteers` has a **partial** structural precedent (`User.role` subset already migrates into this same table shape in Wave 020's identity backfill) but that is not repeated here — this wave creates the table, Wave 020's backfill (if re-run) is the only writer |

## D-08 applicability

Governs the entire `ice.*` subtree. `FamilyPlan.medicalNeedsNotes` (free
text, the one real VESTA user with complete medical-adjacent data) is
**never** auto-extracted into `ice.emergency_profiles` or any satellite
table — the Decision Register's No-Go is absolute and requires a
separate human decision (outside D-01..D-08) plus documented user
consent before any such transcription could even be considered.

## D-03 applicability

Governs `community.*` entirely — same posture as Wave 080's `geo.meeting_points`
correction: no VESTA table is treated as a source for any `community.*`
row in this migration.

## Batch strategy / idempotency / checkpoint / deduplication

N/A — 0 rows to move in this entire wave. If `FamilyPlan.medicalNeedsNotes`
is ever structured with explicit user consent, that future backfill will
need its own batch/idempotency/checkpoint design at that time — not
anticipated here, since D-08's No-Go means no timeline exists for it.

## Migration confidence / review status

N/A — no backfill rows to assign confidence to. The 9 local enums (D-08's
clinical-item status vocabulary, media publication/live-stream/license
status, community status enums) are reviewed as part of the structural
design, not as data-quality metrics.

## Row counts

Before: 0 (no `ice.*`/`media.*`/`community.*` tables exist in the current
33-table database). After: 0 for all 20 tables (structural readiness
only — `ice.emergency_profiles` is available for **new** users declaring
structured medical data from cutover forward; the existing VESTA user's
free-text medical notes remain in `FamilyPlan.medicalNeedsNotes`,
unconverted, per D-08's Criterio de cierre).

## Validation / rollback / non-migratable records

See `validation.sql`. Rollback: `DROP TABLE`/`DROP TYPE`/`DROP SCHEMA` as in
`rollback.sql` — zero data-loss risk at 0 rows. No record is non-migratable
(none exist to migrate in this wave's scope).
