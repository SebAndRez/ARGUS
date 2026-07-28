# Wave 070 — Test Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Before applying this wave

- `target-migration-order.test.ts` — sorts after `060_resources`; FKs to
  `incident.incidents`/`risk.risk_assessments`/`governance.jurisdictions`
  resolve.
- `target-migration-safety.test.ts` — no destructive statement (no current
  table maps here at all).

## After applying this wave

- `target-critical-instruction-version.test.ts` — **the load-bearing test
  for this wave**: asserts (a) the circular FK is fully resolved in both
  directions with the cross-consistency trigger active, (b) the 3
  cryptographic integrity columns on `critical_instruction_versions` match
  `security.audit_logs`'s equivalent columns type-for-type (D-01
  consistency), (c) `ck_delivery_attempts_civ_required`/`_exclusive` and the
  equivalent pair on `acknowledgements`/`comprehension_confirmations` all
  exist and are enforced.
- `target-model-count.test.ts` — 7+8=15 tables.
- `target-rls-coverage.test.ts` — all 15 tables RLS-enabled with >=1 policy;
  `alert.alerts`'s public-vs-restricted split checked specifically (public
  alerts readable without assignment, draft alerts not).
- `target-no-destructive-cascade.test.ts` — confirms zero `CASCADE` in this
  wave (every FK here is RESTRICT or SET NULL, matching Keys/Constraints
  v1.1 §2's "no CASCADE crosses a BC boundary, and none of this wave's FKs
  are even intra-aggregate CASCADE candidates").

## Not covered by this wave's tests

- `target-help-request-close.test.ts`, `target-resource-reservation.test.ts`,
  `target-offline-identity.test.ts`, `target-geography-strategy.test.ts` —
  not applicable to this wave.
