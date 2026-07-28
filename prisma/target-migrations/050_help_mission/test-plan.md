# Wave 050 — Test Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Before applying this wave

- `target-migration-order.test.ts` — sorts after `040_incident`; FKs to
  `incident.incidents`/`command.command_roles` resolve.
- `target-migration-safety.test.ts` — no destructive statement against
  `HelpRequest`.

## After applying this wave

- `target-help-request-close.test.ts` — **the load-bearing test for this
  wave**: asserts (a) `app_api` has no direct column-level `UPDATE` on
  `status`/`closed_*` outside the function (flagging the
  `SQL_COMPLEMENTARY_REQUIRED` gap noted in README.md as an open item, not a
  pass), (b) the function rejects `p_operator_actor_id = requester_person_id`,
  (c) the RLS `UPDATE` policy independently denies the requester regardless
  of function correctness, (d) the function is idempotent on repeated
  `p_idempotency_key`.
- `target-model-count.test.ts` — 6+10=16 tables.
- `target-rls-coverage.test.ts` — all 16 tables RLS-enabled with >=1 policy;
  `mission.mission_assignments` specifically checked as a bridge table
  (Access Control v1.1 §5) with its own non-trivial policy, not inherited.
- `target-table-traceability.test.ts` — `HelpRequest` has a destination
  entry despite 0 rows to move.

## Not covered by this wave's tests

- `target-resource-reservation.test.ts`, `target-offline-identity.test.ts`,
  `target-geography-strategy.test.ts`, `target-critical-instruction-version.test.ts`
  — not applicable to this wave.
