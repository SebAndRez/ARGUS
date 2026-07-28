# Wave 030 — Ingestion, Observation & Evidence

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Objective

Create `ingest.*` (7 tables — the pipeline that fuses today's two parallel
ingestion pipelines, `IngestionRun`/`KnowledgeIngestionRun`, under a single
`origin_kind` discriminator) and `evidence.*` (10 tables — the observation/
evidence core that `Report`, `HelpRequest`'s origin, `ExternalEvent`, and
D-04's `TelecomConnectivityStatus`/`TelecomConnectivityEvidence` all feed).

## Tables covered

`ingest.providers`, `ingest.sources`, `ingest.source_connectors`,
`ingest.ingestion_runs`, `ingest.source_records`, `ingest.transformations`,
`ingest.ingestion_errors` (7); `evidence.observations`,
`evidence.evidence_records`, `evidence.evidence_assets`,
`evidence.evidence_versions`, `evidence.evidence_assessments`,
`evidence.observation_evidence_links`, `evidence.confirmations`,
`evidence.refutations`, `evidence.contradictions`,
`evidence.corroborations` (10).

## VERIFY_AGAINST_V1.0 disclosure

Same caveat as Wave 020 — every table except `evidence.observations` (full
ficha given directly in Table Catalog v1.1) is reconstructed from
cross-referenced clues, not transcribed from the unavailable v1.0 document.

## Dependencies on prior waves

`010_foundation` (`security.information_classification_enum`), `020_identity`
(`identity.people`, `identity.devices`, `identity.operational_sessions`,
`institution.organizations`).

## Human decisions (D-0X) that apply

**D-04** (`TelecomConnectivityStatus`/`TelecomConnectivityEvidence`): both
current tables are empty (0 rows), so this wave's backfill moves 0 rows, but
the structural mapping is fixed now — `origin_type='TELECOM_CONNECTIVITY_LEGACY'`
(illustrative enum label, pending final approval of the exact
`observation_origin_enum` label set) on `evidence.observations` for the
aggregated-status side, `evidence.evidence_records`/`evidence.evidence_assets`
(structured-record vs. binary-attachment split) for the evidence side. See
`backfill-plan.md`.

## What this wave does NOT do

- Does not backfill `ingest.transformations` — the current codebase never
  recorded normalization operations as data (`NO_RECONSTRUCTABLE`).
- Does not create any row in `evidence.confirmations`/`.refutations`/
  `.contradictions`/`.corroborations` — all four are `CREATE_EMPTY`, genuinely
  new domain concepts with no current-database analogue.
- Does not yet add the incident-scoped RLS extension on `evidence.observations`/
  `evidence_records` (Access Control v1.1 §4.5 mentions
  `incident_observation_links`-based command/assignment routes) — those links
  are created in Wave 040; this wave's policy covers the ownership/
  classification baseline only, extended later.

## Files in this folder

| File | Purpose |
|---|---|
| `migration.sql` | Schemas, 12 local enums, 17 tables, RLS, grants |
| `rollback.sql` | Reverse order, guarded |
| `validation.sql` | SELECT-only: table/column existence, FK/CHECK presence, RLS coverage |
| `backfill-plan.md` | `ExternalEvent`(1,904)->`source_records`+`observations`; `KnowledgeEvidence`(2,463, partial, rest in Wave 040)->`evidence_records`; `IngestionRun`(3,405)+`KnowledgeIngestionRun`(1,899)->`ingestion_runs` fused; D-04 Telecom (0 rows, structural only) |
| `test-plan.md` | `target-schema-target-validity.test.ts`, `target-table-traceability.test.ts` are load-bearing here |
