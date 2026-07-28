# Wave 060 — Test Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Before applying this wave

- `target-migration-order.test.ts` — sorts after `050_help_mission`; FK to
  `mission.missions` resolves.
- `target-migration-safety.test.ts` — no destructive statement against
  `CriticalPoi`/`CriticalPoiOperationalStatus`/`CriticalPoiStatusEvidence`.

## After applying this wave

- `target-resource-reservation.test.ts` — **the load-bearing test for this
  wave**: asserts (a) no numeric TTL/extension-count constant is hardcoded in
  `resource.resource_reservations`'s DDL or trigger body (must resolve from
  `governance.resource_reservation_rules` at runtime), (b) the single-
  extension trigger rejects a second extension attempt, (c) the anti-double-
  reservation partial unique index exists and covers exactly
  `('PENDING_CONFIRMATION','CONFIRMED')`.
- `target-table-traceability.test.ts` — confirms `CriticalPoi`'s D-06 4-way
  split is represented in `ARGUS_BACKFILL_CATALOG_v1.0.md` with all 4 routes
  present, and that `CriticalPoiStatusEvidence`'s REL-002 gap has an explicit
  remediation entry (not silently inherited).
- `target-model-count.test.ts` — 10 tables (flagging the "9 vs 10" mandate
  text discrepancy explicitly, resolved in favor of the frozen catalog).
- `target-rls-coverage.test.ts` — all 10 tables RLS-enabled with >=1 policy.

## Not covered by this wave's tests

- `target-help-request-close.test.ts`, `target-offline-identity.test.ts`,
  `target-geography-strategy.test.ts` (relevant in 080_geography for the
  route-B subset), `target-critical-instruction-version.test.ts` — not
  applicable to this wave.
