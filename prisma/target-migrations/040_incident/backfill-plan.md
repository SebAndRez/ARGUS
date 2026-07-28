# Wave 040 — Incident (+ Risk & Command) — Backfill Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Source -> target

| Source (current) | Rows | Target | Action |
|---|---|---|---|
| `KnowledgeIncident` (subset `verificationStatus IN ('unverified','candidate')`) | subset of 1,969 | `incident.incident_candidates` | DIVIDIR |
| `KnowledgeIncident` (remainder) | remainder of 1,969 | `incident.incidents` | TRANSFORMAR — **T-02, the highest-impact single transform of the whole plan** |
| `KnowledgeIncident.status IN ('rejected','duplicate')` | subset of 1,969 | `incident.discard_decisions` | DERIVAR |
| `IncidentTransition` | 16 | `incident.incident_transitions` | TRANSFORMAR (T-03) — split into per-dimension rows using `legacy_status_mapping` |
| `IncidentRelation` | 0 | `incident.incident_relations` | MIGRAR 1:1 (structure only, 0 rows) |
| `KnowledgeEvidence.incidentId` (subset) | subset of 2,463 | `incident.incident_evidence_links` | DIVIDIR |
| `KnowledgeIncident.geometryJson` (subset) | subset of 1,969 | `incident.affected_area_versions` | MIGRATION_REVIEW_QUEUE — unversioned JSON, no PostGIS validation performed historically, every row requires geometry validation before acceptance |
| `KnowledgeIncident.externalId` (subset) | subset of 1,969 | `incident.incident_aliases` | DERIVAR |
| — (proxy: first row of `IncidentTransition` per incident) | proxy of 16 | `incident.incident_promotions` | MIGRATION_REVIEW_QUEUE — explicitly marked "inferred", not an audited original decision |
| `RiskAssessment` | 45 | `risk.risk_assessments` | TRANSFORMAR (`riskType` string -> `hazard_type_id` FK) |
| `RiskAssessmentRevision` | 50 | `risk.risk_assessment_revisions` | MIGRAR 1:1 |
| `RiskAssessment.recommendedAction` (subset) | subset of 45 | `command.automated_recommendations` | DERIVAR (optional) |

All other tables in this wave (`hypotheses`, `incident_candidate_observations`,
`sub_incidents`, `incident_merges`, `incident_merge_sources`,
`incident_splits`, `incident_split_targets`, `incident_observation_links`,
`risk.forecasts`, `risk.risk_scenarios`, `risk.exposed_populations`,
`risk.risk_area_versions`, all 6 `command.*` tables except
`automated_recommendations`) are `CREATE_EMPTY` — no current-database source.

## D-02 applicability

Governs the entire `incidents`/`incident_transitions` transform. The 11
legacy `status` values on `KnowledgeIncident` map through a versioned
`legacy_status_mapping` table (documented centrally in
`ARGUS_BACKFILL_CATALOG_v1.0.md`, Part C) to the 5 target dimensions — never
an inline `CASE WHEN`. Any legacy value without a confident mapping rule gets
`migration_review_status = REQUIRES_REVIEW` and the most conservative target
value (e.g. an ambiguous "active-ish" status maps to `operational_status =
'MONITORING'`, never `'ACTIVE'`, when uncertain).

## Batch strategy

`incidents`/`incident_candidates` split (1,969 rows): batched 500 rows at a
time, transaction per batch, since the T-02 transform requires a
`legacy_status_mapping` join per row (not embarrassingly parallel at
arbitrary batch size without risking partial-incident states mid-migration).
`incident_transitions` (16 rows): single batch. `risk_assessments`/
`risk_assessment_revisions` (45+50=95 rows): single batch.

## Idempotency key

`legacy_record_id` per table, uniquely indexed (index declaration
`SQL_COMPLEMENTARY_REQUIRED`, added alongside the backfill script).

## Checkpoint strategy

Checkpoints: "`KnowledgeIncident` fully classified into `incident_candidates`
vs `incidents`" (1,969/1,969 accounted for, including
`MIGRATION_REVIEW_QUEUE` rows — accounted for, not migrated cleanly, is still
a checkpoint pass), "`IncidentTransition` fully split by dimension"
(16/16), "`RiskAssessment`/`RiskAssessmentRevision` fully migrated" (45/45,
50/50).

## Deduplication

Not applicable at this volume beyond the standard `legacy_record_id`
idempotency key — no known duplicate-row risk in any of this wave's sources.

## Migration confidence / review status

`incidents`/`incident_candidates`: `MEDIUM` overall, `LOW` for any row whose
legacy `status` has no confident dimension mapping (explicit
`REQUIRES_REVIEW`). `incident_transitions`: `MEDIUM` (T-03 split is
mechanical but unverified against real data shape). `incident_promotions`:
`LOW`, explicitly `REQUIRES_REVIEW` for all rows (inferred proxy, not an
audited decision, per the Target-Current Mapping's own caveat).
`risk_assessments`/`risk_assessment_revisions`: `HIGH` (direct 1:1/near-1:1
structural transforms).

## Row counts

Before: 0 for all 29 target tables. After: `incidents`+`incident_candidates`
combined = 1,969 (exact split "no verificado" until the
`verificationStatus` filter runs against real data),
`incident_transitions`=16, `incident_relations`=0, `discard_decisions`
(subset, "no verificado"), `affected_area_versions` (subset,
`MIGRATION_REVIEW_QUEUE`, "no verificado"), `incident_aliases` (subset, "no
verificado"), `incident_evidence_links` (subset of 2,463, "no verificado"),
`incident_promotions` (proxy of 16), `risk_assessments`=45,
`risk_assessment_revisions`=50, `automated_recommendations` (subset of 45,
optional, "no verificado"). All other tables in this wave: 0.

## Validation / rollback / non-migratable records

See `validation.sql`. Rollback: `DELETE ... WHERE legacy_source IN (...)` in
child-to-parent order (transitions/links before incidents themselves).
Non-migratable: none confirmed non-migratable outright, but
`affected_area_versions` and `incident_promotions` both route a subset to
`MIGRATION_REVIEW_QUEUE` rather than a clean automatic migration — this is a
documented review requirement, not a data-loss event.
