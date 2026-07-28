# Wave 080 — Geography

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Objective

Create `geo.*` (8 tables). D-07 governs `geo.administrative_areas`: schema
created with full provenance columns, deliberately left empty of geometry
(`CREATE_EMPTY`, not an omission) until an approved official cartographic
source is selected.

## Tables covered

`administrative_areas`, `operational_zones`, `operational_sectors`,
`extraction_points`, `reception_points`, `meeting_points`,
`operational_routes`, `perimeters`.

## VERIFY_AGAINST_V1.0 disclosure

`administrative_areas`, `operational_zones`, `operational_routes`,
`perimeters` have full fichas given directly in Table Catalog v1.1,
transcribed verbatim (plus D-07's provenance columns on
`administrative_areas`, new structure per the Decision Register). The
remaining 4 tables are reconstructed from cross-referenced clues.

## Dependencies on prior waves

`010_foundation` (`governance.administrative_area_kinds`), `040_incident`
(`incident.incidents`), `050_help_mission` (`mission.missions`,
`help.operational_needs`).

## Human decisions (D-0X) that apply

**D-07**: no `boundary` geometry is populated for `geo.administrative_areas`
in this migration — the current 33-table database has zero geospatial
columns (only loose `latitude Float?`/`longitude Float?` pairs on 6 tables),
so there is no source data to migrate, and synthesizing polygons from those
loose points would produce false-official geometry, an unacceptable risk for
operational resource-deployment decisions. The table is created empty,
explicitly, with `CREATE_EMPTY` as the documented action, not silence.
**D-06** (from Wave 060) continues here: `extraction_points`/
`reception_points`/`meeting_points` are the geo-side destinations for
`CriticalPoi`'s route (B), pending the same human-reviewed classification
rule table as Wave 060's `resource.*` route (A).

## What this wave does NOT do

- Does not populate `geo.administrative_areas.boundary` with any geometry,
  synthetic or derived from `bbox`/lat-lng pairs (D-07's explicit
  prohibition).
- Does not enable RLS on `geo.administrative_areas` — it is a deliberately
  PUBLIC catalog (Access Control v1.1 §7), protected by GRANT only (no
  runtime role has write access; only `migration_owner` can insert/update).
- Does not backfill `geo.operational_routes` — current routes are computed
  on-demand via OSRM/Valhalla/GraphHopper and never persisted
  (`NO_RECONSTRUCTABLE`).

## Files in this folder

| File | Purpose |
|---|---|
| `migration.sql` | Schema, 6 local enums, 8 tables (with D-07 provenance columns), 4 deferred-FK resolutions from Waves 010/040/050, RLS (except administrative_areas), grants |
| `rollback.sql` | Reverse order, drops the 4 deferred FKs first |
| `validation.sql` | SELECT-only: table/column existence, D-07 empty-boundary check, GIST index presence, RLS coverage (with the deliberate administrative_areas exemption confirmed, not flagged as an error) |
| `backfill-plan.md` | `geo.administrative_areas` EXTERNAL_SOURCE_REQUIRED (0 rows, schema only); `meeting_points`/`extraction_points`/`reception_points` D-06 route-B subset of `CriticalPoi` |
| `test-plan.md` | `target-geography-strategy.test.ts` is the load-bearing test for this wave |
