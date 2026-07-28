# Wave 090 — ICE, Media & Community

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Objective

Structure `ice.*` (medical/emergency-access data, the most sensitive
domain of the whole system — D-08 applies in full); create `media.*`
(new domain, publication/moderation/redaction pipeline); create
`community.*` (D-03: explicitly **not** fed by VESTA). All 20 tables in
this wave are `CREATE_EMPTY` — none has a current-database source.

## Tables covered

`ice.*` (8): `emergency_profiles`, `medical_conditions`, `allergies`,
`current_medications`, `medical_devices`, `special_needs`,
`emergency_accesses`, `emergency_contact_designations`.

`media.*` (8): `publications`, `live_streams`, `content_moderations`,
`anonymizations`, `redactions`, `visual_maskings`, `usage_licenses`,
`publication_authorizations`.

`community.*` (4): `family_networks`, `dependents`, `community_groups`,
`volunteers`.

## VERIFY_AGAINST_V1.0 disclosure

Only `ice.emergency_profiles`'s PK-generation note (P2-09, UUIDv4 via
`gen_random_uuid()`, not UUIDv7) is given directly in Table Catalog
v1.1. Every other table in this wave (19 of 20) is reconstructed from
cross-referenced clues in Access Control v1.1 (§4.14-4.16 ownership/RLS
shape) and the Decision Register (D-08, D-03) — flagged
`VERIFY_AGAINST_V1.0` per table in `migration.sql`. This is a
structural best-effort, not a confirmed transcription.

## Dependencies on prior waves

`020_identity` (`identity.people`), `010_foundation`
(`security.actor_type_enum`, `governance.emergency_bases`),
`040_incident` (`incident.incidents`), `050_help_mission`
(`mission.missions`, `help.help_requests`), `030_ingestion_observation_evidence`
(`evidence.evidence_records`).

## Human decisions (D-0X) that apply

**D-08** governs `ice.*` entirely: medical consent must be explicit,
granular, revocable, purpose-limited, category-limited, time-limited,
and auditable; `EmergencyBasis`-driven access is independent of
ordinary consent and never substitutes for it. `ice.emergency_accesses`
carries all 10 audit-grade concepts the Decision Register requires
(actor, purpose, basis, incident, mission, data disclosed, start,
expiry, revocation, plus the row itself as the audit record). No
current structure feeds `ice.*` — this corrects v1.0, which had cited
`EmergencyContact.priority` (VESTA) as a partial source for
`emergency_contact_designations`; v1.1 confirms zero relationship.

**D-03** governs `community.*`: none of the 4 tables is fed by
`PreparednessProfile`/`FamilyPlan`/`EmergencyContact`(VESTA)/
`PreparednessChecklistItem`/`PreparednessReminder`. VESTA remains
`LEGACY_READ_ONLY` (surfaced via `proj.legacy_vesta_preparedness_profiles`
in Wave 100), untouched by this wave.

## What this wave does NOT do

- Does not transcribe `FamilyPlan.medicalNeedsNotes` (free text, the
  one real VESTA user's medical data) into `ice.emergency_profiles` or
  any satellite table — D-08's explicit No-Go, absolute, no exception
  without documented user consent plus a separate human decision
  outside D-01..D-08.
- Does not create any `community.*` row from VESTA data (D-03).
- Does not grant any application role direct, unaudited read access to
  `ice.*` clinical tables outside the owner-or-emergency-access RLS
  pattern — every emergency-basis access path is designed to run
  through the audit-carrying `ice.emergency_accesses` row, never a bare
  `SELECT` bypass.

## Files in this folder

| File | Purpose |
|---|---|
| `migration.sql` | Schemas (`ice`, `media`, `community`), 9 local enums, 20 tables, RLS (D-08 owner-or-emergency-access pattern on `ice.*`, append-only `emergency_accesses`), grants |
| `rollback.sql` | Reverse order — `media.publications` children before `publications`; `community.dependents`/`.community_groups`/`.volunteers` before `family_networks`; `ice.*` satellites before `emergency_profiles` |
| `validation.sql` | SELECT-only: table/column existence, D-08 UUIDv4-default check on `emergency_profiles.id`, `emergency_accesses` audit-column completeness (10 concepts), RLS coverage on all 20 tables, append-only check (no UPDATE/DELETE policy on `emergency_accesses`) |
| `backfill-plan.md` | All 20 tables `CREATE_EMPTY` — no current-database source for `ice.*`/`media.*`/`community.*` (D-08, D-03) |
| `test-plan.md` | `target-rls-coverage.test.ts` (D-08) is the load-bearing test for this wave |
