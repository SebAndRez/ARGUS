# Wave 060 — Resources

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Objective

Create `resource.*` — 10 tables per the frozen Table Catalog v1.1
enumeration (the mandate's own wave-assignment prose says "9", undercounting
`operational_unit_members`, a new v1.1 table — reconciled the same way
010_foundation reconciled governance's 13-vs-15 mismatch: trust the
enumerated `CREATE TABLE` list over summary prose). D-06 (`CriticalPoi`
4-way split) is the central decision governing this wave's backfill.

## Tables covered

`resources`, `operational_units`, `operational_unit_members`, `facilities`,
`supplies`, `inventories`, `vehicle_profiles`, `aircraft_profiles`,
`uncrewed_vehicle_profiles`, `resource_reservations`.

## VERIFY_AGAINST_V1.0 disclosure

`operational_unit_members`, `uncrewed_vehicle_profiles`, and
`resource_reservations` have full fichas transcribed verbatim from Table
Catalog v1.1; the other 7 tables are reconstructed from cross-referenced clues.

## Dependencies on prior waves

`010_foundation` (`governance.resource_type_enum`,
`governance.resource_reservation_rules` — the config table this wave's
reservation TTLs resolve against, never codified locally), `020_identity`
(`institution.organizations`), `050_help_mission` (`mission.missions`).

## Human decisions (D-0X) that apply

**D-06**: `CriticalPoi` (530 rows) splits into 4 routes, never assumed route
(A) automatically: **(A)** operational facility -> `resource.facilities`/
`.resources`; **(B)** operational point -> `geo.meeting_points`/
`.extraction_points`/`.reception_points` (Wave 080); **(C)** public reference
-> a projection/reference catalog (Wave 100); **(D)** insufficiently
classified -> `MIGRATION_REVIEW_QUEUE`. The 108 rows with a
`CriticalPoiOperationalStatus` (shelters with managed state) are the clearest
candidates for route (A); the remaining ~422 rows require per-`type`
classification documented in `backfill-plan.md`.

## What this wave does NOT do

- Does not assume the entirety of `CriticalPoi` maps to `resource.facilities`
  — D-06 explicitly forbids this.
- Does not resolve `CriticalPoiStatusEvidence`'s missing FK (REL-002,
  asymmetric integrity vs. `CriticalPoiOperationalStatus`) automatically —
  the backfill must fix it explicitly, not inherit it silently into the
  target schema.
- Does not hardcode the 5/15-minute reservation TTLs or the max-extension
  count anywhere in `resource_reservations` — every such value is resolved
  at runtime from `governance.resource_reservation_rules` (Wave 010).

## Files in this folder

| File | Purpose |
|---|---|
| `migration.sql` | Schema, 4 local enums, 10 tables, single-extension trigger, RLS, grants |
| `rollback.sql` | Reverse order, guarded, drops the trigger/function first |
| `validation.sql` | SELECT-only: table/column existence, trigger presence, anti-double-reservation index, RLS coverage |
| `backfill-plan.md` | `CriticalPoi`(530)+`CriticalPoiOperationalStatus`(108)+`CriticalPoiStatusEvidence`(108) D-06 4-way split |
| `test-plan.md` | `target-resource-reservation.test.ts` is the load-bearing test for this wave |
