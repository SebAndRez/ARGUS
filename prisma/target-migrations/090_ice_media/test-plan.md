# Wave 090 — Test Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Before applying this wave

- `target-migration-order.test.ts` — sorts after `080_geography`; FKs to
  `identity.people`/`incident.incidents`/`mission.missions`/`help.help_requests`/
  `evidence.evidence_records`/`governance.emergency_bases` all resolve, none
  deferred.
- `target-migration-safety.test.ts` — no destructive statement against
  `FamilyPlan`/`PreparednessProfile`/`EmergencyContact` (VESTA).

## After applying this wave

- `target-rls-coverage.test.ts` — **the load-bearing test for this wave
  (D-08)**: asserts all 8 `ice.*` tables have RLS enabled with a declared
  policy that is not `USING (true)`, and that at least one policy template
  exists for `EmergencyBasis`-driven access (`fn_has_emergency_access`).
  Also asserts `ice.emergency_accesses` has no UPDATE/DELETE policy
  (append-only by design).
- `target-model-count.test.ts` — 20 tables (8+8+4).
- `target-table-traceability.test.ts` — confirms `ice.emergency_contact_designations`
  has **no** traced source from `EmergencyContact` (VESTA) in
  `ARGUS_BACKFILL_CATALOG_v1.0.md` (D-08's explicit correction of v1.0),
  and that `community.*`'s 4 tables have no traced source from any VESTA
  table (D-03).
- `target-offline-identity.test.ts` — not applicable to this wave, included
  only to confirm it still passes unaffected (this wave adds no relation
  to `identity.people`/`user_accounts` beyond the existing FKs already
  covered by Wave 020's own suite).

## Not covered by this wave's tests

- `target-help-request-close.test.ts`, `target-resource-reservation.test.ts`,
  `target-critical-instruction-version.test.ts`, `target-geography-strategy.test.ts`
  — not applicable to this wave.
