# Wave 030 — Ingestion, Observation & Evidence — Backfill Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Source -> target

| Source (current) | Rows | Target | Action |
|---|---|---|---|
| `IngestionRun` | 3,405 | `ingest.ingestion_runs` (`origin_kind='EXTERNAL_EVENT_PIPELINE'`) | FUSIONAR |
| `KnowledgeIngestionRun` | 1,899 | `ingest.ingestion_runs` (`origin_kind='GLOBAL_WATCH_PIPELINE'`) | FUSIONAR |
| `IngestionRun.error` (subset) | subset of 3,405 | `ingest.ingestion_errors` | DIVIDIR |
| `KnowledgeSource` | 1 | `ingest.sources` (FUSIONAR with the ~43-source code catalog, DUP-003) | FUSIONAR |
| `ExternalEvent.raw`/`.normalized` | 1,904 | `ingest.source_records` | TRANSFORMAR (T-01) |
| `Report` | 1 | `evidence.observations` (`author_type='CITIZEN'`) | FUSIONAR |
| `HelpRequest`(origin, 0 rows) | 0 | `evidence.observations` | FUSIONAR (no-op, 0 rows) |
| `ExternalEvent` | 1,904 | `evidence.observations` | FUSIONAR |
| `TelecomConnectivityStatus` (D-04) | 0 | `evidence.observations` (`origin_type='TELECOM_CONNECTIVITY_LEGACY'`) | TRANSFORMAR, 0 rows moved, structural mapping only |
| `KnowledgeEvidence` | 2,463 | `evidence.evidence_records` (partial — the `incident_id`-linked half moves in Wave 040 alongside `incident.incident_evidence_links`) | TRANSFORMAR |
| `TelecomConnectivityEvidence` (D-04) | 0 | `evidence.evidence_records`/`.evidence_assets` (registro vs. adjunto) | TRANSFORMAR, 0 rows, structural only |
| `KnowledgeIncident.rawEvidenceRefsJson` (subset) | subset of 1,969 | `evidence.observation_evidence_links` | DIVIDIR |

`ingest.source_connectors`/`ingest.providers`/`ingest.transformations` are
`DERIVAR`/`NO_RECONSTRUCTABLE`/`CREATE_EMPTY` respectively (see Target-Current
Mapping v1.1 §1 `ingest` section) — no row-level backfill.
`evidence.evidence_versions`/`.evidence_assessments`/`.confirmations`/
`.refutations`/`.contradictions`/`.corroborations` are all `CREATE_EMPTY`.

## D-04 applicability

Both `TelecomConnectivityStatus` and `TelecomConnectivityEvidence` are empty
(0 rows) in production (`ARGUS_CURRENT_DATABASE_BASELINE_v1.0.md` §5) — this
backfill moves **zero rows** for D-04, but the structural mapping (which
`evidence.*` table each maps to, and the `origin_type` label marking
provenance) must be fixed and approved now so the first real row created
after this migration lands correctly, per the Decision Register's explicit
requirement that D-04's mapping be documented even with 0 rows to move.

## Batch strategy

`ingestion_runs` fusion (5,304 rows combined): batched by `origin_kind`,
5,000-row batches, `ORDER BY started_at` to preserve chronological order for
any downstream reporting that assumes insertion order. `source_records`
(1,904 rows): single batch, order not significant (each row is independent).
`observations` (1,905 rows combined `Report`+`ExternalEvent`+0 `HelpRequest`):
single batch. `evidence_records` (2,463 rows, partial): batched 1,000 rows
at a time given the JSON transformation cost per row (T-08 analog).

## Idempotency key

`legacy_record_id` (original cuid) per table, uniquely indexed on
`(legacy_source, legacy_record_id)` — see `ix_ingestion_runs` unique index
already declared in `migration.sql`; equivalent indexes for
`source_records`/`observations`/`evidence_records` are
`SQL_COMPLEMENTARY_REQUIRED`, added alongside the backfill script.

## Checkpoint strategy

One checkpoint per source table: `IngestionRun` migrated (3,405/3,405),
`KnowledgeIngestionRun` migrated (1,899/1,899), `ExternalEvent` migrated
(1,904/1,904 into both `source_records` and `observations`), `Report`
migrated (1/1), `KnowledgeEvidence` migrated (2,463/2,463, split between this
wave and Wave 040's `incident_evidence_links`).

## Deduplication

`source_records` deduplicates on `(source_id, external_id)` (partial unique
index already in `migration.sql`) — protects against re-ingesting the same
`ExternalEvent` twice under a different `legacy_record_id` if the backfill
script is re-run without the idempotency key check working correctly.

## Migration confidence / review status

`ingestion_runs`, `source_records`: `HIGH` (direct structural transforms, no
ambiguity in field mapping). `observations` (from `ExternalEvent`/`Report`):
`MEDIUM` (fusion of two conceptually different sources under one schema
requires judgment about `origin_type` assignment — flagged
`REQUIRES_REVIEW` for the first batch until the mapping is spot-checked).
`evidence_records` (from `KnowledgeEvidence`): `MEDIUM` (T-08 analog
transform, structural but not yet spot-checked against real row shapes).
D-04 rows: `HIGH` confidence in the mapping design itself (0 rows to
misclassify), explicitly re-flagged `REQUIRES_REVIEW` for the *first real
row* created after cutover, per the Decision Register's risk note.

## Row counts

Before: 0 for all 17 target tables. After: `ingestion_runs`=5,304 (3,405+1,899),
`source_records`=1,904, `observations`=1,905 (1,904+1, `HelpRequest` origin
contributes 0), `evidence_records`=2,463 (until Wave 040 reconciles the
incident-linked subset), `ingestion_errors`<=3,405 (subset with non-null
`error`, "no verificado" exact count). All other target tables in this wave: 0.

## Validation / rollback / non-migratable records

See `validation.sql`. Rollback: `DELETE ... WHERE legacy_source IN (...)` in
child-to-parent order. Non-migratable: none identified for this wave's
sources — every row in `IngestionRun`/`KnowledgeIngestionRun`/`ExternalEvent`/
`Report`/`KnowledgeEvidence` has a defined destination structure (some
individual rows may still land in `migration_review_status=REQUIRES_REVIEW`
per D-02's conservative-default rule, which is not the same as
non-migratable).
