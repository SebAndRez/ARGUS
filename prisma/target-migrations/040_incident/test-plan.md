# Wave 040 — Test Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Before applying this wave

- `target-migration-order.test.ts` — sorts after `030_ingestion_observation_evidence`;
  every FK to `evidence.*`/`governance.*`/`institution.*` resolves.
- `target-migration-safety.test.ts` — no destructive statement against
  `KnowledgeIncident`/`IncidentRelation`/`IncidentTransition`/`RiskAssessment`/
  `RiskAssessmentRevision`.

## After applying this wave

- `target-model-count.test.ts` — 17+6+6=29 tables (flagging the risk/command
  placement decision explicitly in the test's own comments, since the
  original wave assignment did not name these schemas).
- `target-schema-target-validity.test.ts` — the 5-dimension split on
  `incident.incidents` is checked column-by-column against
  `incident_state_dimension_enum`'s 5 values, not just presence of 5 columns.
- `target-rls-coverage.test.ts` — all 29 tables RLS-enabled with >=1 policy.
- `target-no-destructive-cascade.test.ts` — confirms the only `CASCADE`s in
  this wave (`incident_candidate_observations`, `incident_merge_sources`,
  `incident_split_targets`, `command_roles`) are intra-aggregate, matching
  Keys/Constraints v1.1 §2.2's explicit list.
- `target-table-traceability.test.ts` — `KnowledgeIncident`/
  `IncidentRelation`/`IncidentTransition`/`RiskAssessment`/
  `RiskAssessmentRevision` all have non-empty destination entries in
  `ARGUS_BACKFILL_CATALOG_v1.0.md`.

## Not covered by this wave's tests

- `target-critical-instruction-version.test.ts`, `target-help-request-close.test.ts`,
  `target-resource-reservation.test.ts`, `target-offline-identity.test.ts`,
  `target-geography-strategy.test.ts` — not applicable to this wave.
