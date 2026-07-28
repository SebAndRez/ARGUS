# Wave 100 — Test Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Before applying this wave

- `target-migration-order.test.ts` — sorts last (after `090_ice_media`);
  every `proj.*` view/function's source table already exists (identity,
  incident, mission, alert, resource, help, comms, evidence schemas all
  created in prior waves).
- `target-migration-safety.test.ts` — no destructive statement anywhere in
  this wave targets `PreparednessProfile`/`FamilyPlan`/`EmergencyContact`(VESTA)/
  `PreparednessChecklistItem`/`PreparednessReminder`/`Sanction` (D-03, D-05);
  confirms `migration.sql` §5's 2 `DROP` statements are commented-out
  drafts, not live DDL.

## After applying this wave

- **Load-bearing for this wave:**
  - Proj write-lockdown: confirms zero `INSERT`/`UPDATE`/`DELETE` grant to
    `app_api`/`ingest_worker`/`jobs_worker` on any `proj.*` relation
    (Executable Plan "Ola 10" §4's transversal rule).
  - P1-06 geometry check: `proj.public_map_feed`'s definition contains
    `ST_Simplify` before any geometry column is exposed.
  - D-03 check: `proj.legacy_vesta_preparedness_profiles` exists, and its
    definition performs no transformation (straight column passthrough).
  - `target-table-traceability.test.ts`: confirms `ARGUS_BACKFILL_CATALOG_v1.0.md`
    has an entry for every one of the 33 current tables' disposition (not
    just the 2 retired ones) — cross-checked against this wave's README.md
    "Legacy retirement notes" table.
- `target-model-count.test.ts` — 11 `knowledge.*` tables; `proj.*` object
  count (3 materialized views + 6 plain views + 7 `SECURITY DEFINER`
  functions = 16 physical objects backing the 11 logical catalog entries
  + the 1 permanent D-03 view).
- `target-rls-coverage.test.ts` — all 11 `knowledge.*` tables RLS-enabled
  with >=1 policy.

## Not covered by this wave's tests

- `target-help-request-close.test.ts`, `target-resource-reservation.test.ts`,
  `target-offline-identity.test.ts`, `target-critical-instruction-version.test.ts`,
  `target-geography-strategy.test.ts` — not applicable to this wave.
- No automated test can verify the `knowledge_documents` fusion's dedup
  judgment call (4 duplicate-column pairs) — requires human review against
  real row content, per `backfill-plan.md`.
