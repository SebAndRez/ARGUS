# Wave 040 — Incident (+ Risk & Command)

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Objective

Create the incident canonical core (`incident.*`, 17 tables) together with
`risk.*` (6) and `command.*` (6) — 29 tables total. This is the highest-risk,
highest-impact wave of the whole migration: `KnowledgeIncident` (1,969 rows,
the current system's de-facto core, 14+ consumer files) transforms into
`incident.incidents` under D-02's mandatory 5-dimension split.

## Tables covered

incident (17): `incident_candidates`, `incident_candidate_observations`,
`hypotheses`, `incidents`, `incident_promotions`, `discard_decisions`,
`sub_incidents`, `incident_relations`, `incident_merges`,
`incident_merge_sources`, `incident_splits`, `incident_split_targets`,
`incident_transitions`, `incident_observation_links`,
`incident_evidence_links`, `affected_area_versions`, `incident_aliases`.

risk (6): `risk_assessments`, `forecasts`, `risk_scenarios`,
`exposed_populations`, `risk_assessment_revisions`, `risk_area_versions`.

command (6): `incident_command_structures`, `command_roles`,
`command_handovers`, `operational_decisions`, `automated_recommendations`,
`human_overrides`.

## Placement note — risk.* and command.* not named in the original wave list

The task's 11-wave table-to-wave assignment did not explicitly place
`risk.*`/`command.*` in any wave. Both schemas have a direct FK dependency on
`incident.incidents`/`incident.incident_candidates` and are part of the
incident lifecycle (risk assessment accompanies a candidate/incident; a
command structure exists only once an incident is promoted) — they are
placed here as the most defensible single home. This is a judgment call,
flagged explicitly in this README and in the final report to the requester,
not a silent assumption.

## Dependencies on prior waves

`010_foundation` (`governance.incident_types`, `governance.hazard_types`,
`security.information_classification_enum`, `security.actor_type_enum`),
`020_identity` (`institution.organizations`, `institution.institutional_memberships`),
`030_ingestion_observation_evidence` (`evidence.observations`,
`evidence.evidence_records`, `evidence.confidence_level_enum`).

## Human decisions (D-0X) that apply

**D-02** governs this wave almost entirely: `incident.incidents` carries 5
strictly separate state dimensions (`verification_status`,
`operational_status`, `preventive_status`, `trend`, `structural_status`) —
never collapsed into one column — plus the 5-column legacy-provenance
convention on every table backfilled from `KnowledgeIncident`/
`IncidentRelation`/`IncidentTransition`/`RiskAssessment`/
`RiskAssessmentRevision`. Ambiguous legacy states get
`migration_review_status = REQUIRES_REVIEW` and the most conservative
target value — never guessed.

## What this wave does NOT do

- Does not collapse `incidents`' 5 dimensions into a derived "combined
  status" column — a read-side compatibility adapter may synthesize one for
  legacy UI, but it is never persisted as a source of truth (D-02).
- Does not backfill `incident.incident_observation_links` from any current
  read-time correlation (`NO_RECONSTRUCTABLE` — `canonicalReadLayer.ts`
  never persisted its correlations).
- Does not extend `evidence.observations`/`evidence_records`'s RLS policy
  from Wave 030 with the incident-scoped clause promised there — that
  extension is `SQL_COMPLEMENTARY_REQUIRED`, added by a human alongside this
  wave's own policies, not auto-generated here (would require an `ALTER
  POLICY` this draft does not attempt without explicit review).

## Files in this folder

| File | Purpose |
|---|---|
| `migration.sql` | Schemas, 18 local enums, 29 tables, deferred FK from Wave 010, RLS, grants |
| `rollback.sql` | Reverse order, guarded |
| `validation.sql` | SELECT-only: table/column existence, D-02 dimension-separation check, RLS coverage |
| `backfill-plan.md` | `KnowledgeIncident`(1,969)->`incidents`+`incident_candidates` (T-02); `IncidentRelation`(0)->`incident_relations`; `IncidentTransition`(16)->`incident_transitions` (T-03); `RiskAssessment`(45)/`RiskAssessmentRevision`(50)->`risk.*` |
| `test-plan.md` | `target-critical-instruction-version.test.ts` not applicable; D-02-specific assertions are load-bearing |
