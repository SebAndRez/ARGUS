# Wave 080 — Test Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Before applying this wave

- `target-migration-order.test.ts` — sorts after `070_alerts_communications`;
  FKs to `incident.incidents`/`mission.missions` resolve.
- `target-migration-safety.test.ts` — no destructive statement against
  `CriticalPoi`.

## After applying this wave

- `target-geography-strategy.test.ts` — **the load-bearing test for this
  wave**: asserts (a) `geo.administrative_areas` has all 6 D-07 provenance
  columns, (b) it contains 0 rows immediately post-migration, (c) no
  migration statement anywhere in the 11 waves derives `boundary` from a
  `bbox` or from synthetic point-to-polygon construction.
- `target-model-count.test.ts` — 8 tables.
- `target-rls-coverage.test.ts` — 7 of the 8 tables RLS-enabled with >=1
  policy; `administrative_areas` explicitly confirmed exempt (not a failure)
  per Access Control v1.1 §7.
- `target-table-traceability.test.ts` — confirms `CriticalPoi`'s route (B)
  destination entries (`meeting_points`/`extraction_points`/
  `reception_points`) exist in `ARGUS_BACKFILL_CATALOG_v1.0.md`, consistent
  with Wave 060's route (A) entries.

## Not covered by this wave's tests

- `target-help-request-close.test.ts`, `target-resource-reservation.test.ts`,
  `target-offline-identity.test.ts`, `target-critical-instruction-version.test.ts`
  — not applicable to this wave.
