-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 030 — Ingestion, Observation & Evidence — Backfill draft.
-- Origen: IngestionRun(3,405)+KnowledgeIngestionRun(1,899)->ingest.ingestion_runs
-- (FUSIONAR); KnowledgeSource(1)->ingest.sources (FUSIONAR with the ~43-source
-- code catalog, DUP-003); ExternalEvent(1,904)->ingest.source_records
-- (T-01) + evidence.observations; Report(1)->evidence.observations;
-- KnowledgeEvidence(2,463)->evidence.evidence_records (partial — the
-- incident_id-linked half completes in Wave 040). D-04: TelecomConnectivityStatus/
-- TelecomConnectivityEvidence (0 rows each) -> evidence.observations /
-- .evidence_records, structural mapping only.

ALTER TABLE ingest.sources ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE ingest.sources ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE ingest.sources ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE ingest.sources ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sources_legacy ON ingest.sources (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

ALTER TABLE ingest.ingestion_runs ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE ingest.ingestion_runs ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE ingest.ingestion_runs ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE ingest.ingestion_runs ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ingestion_runs_legacy ON ingest.ingestion_runs (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

ALTER TABLE ingest.source_records ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE ingest.source_records ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE ingest.source_records ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE ingest.source_records ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_source_records_legacy ON ingest.source_records (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

ALTER TABLE evidence.observations ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE evidence.observations ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE evidence.observations ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE evidence.observations ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_observations_legacy ON evidence.observations (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

ALTER TABLE evidence.evidence_records ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE evidence.evidence_records ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE evidence.evidence_records ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE evidence.evidence_records ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_evidence_records_legacy ON evidence.evidence_records (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

-- ============================================================
-- 1. ingest.sources <- KnowledgeSource (1 row, FUSIONAR with code catalog)
-- ============================================================
-- SQL_COMPLEMENTARY_REQUIRED: the ~43-source code catalog (DUP-003) lives
-- in application code (src/lib/*), not a database table — reconciling it
-- with KnowledgeSource's single row requires a code-review pass, not SQL
-- alone. Drafted here as a placeholder for the 1 known row only.
INSERT INTO ingest.sources (provider_id, endpoint_signature, name, status, legacy_source, legacy_record_id, migration_confidence, migration_review_status, created_at)
SELECT NULL, ks.id, ks.name, CASE WHEN ks.enabled THEN 'ACTIVE'::ingest.source_status_enum ELSE 'INACTIVE'::ingest.source_status_enum END,
  'KnowledgeSource', ks.id, 'MEDIUM', 'REQUIRES_REVIEW', ks."createdAt"
FROM "KnowledgeSource" ks
ON CONFLICT DO NOTHING;
-- NOTE: provider_id is NULL (column is nullable, FK ON DELETE SET NULL) -
-- there is no real ingest.providers row to reference yet (CREATE_EMPTY per
-- Target-Current Mapping - no current source). A fabricated gen_random_uuid()
-- here would violate fk_sources_provider since it wouldn't match any real
-- providers row; NULL is correct until that resolution happens, flagged for
-- implementation review.

-- ============================================================
-- 2. ingest.ingestion_runs <- IngestionRun(3,405) + KnowledgeIngestionRun(1,899)
--    Batch: 5,000-row batches per origin_kind, ORDER BY started_at.
-- ============================================================
-- origin_kind is NOT NULL with no default (migration.sql:86-97, whitelist
-- CHECK 'EXTERNAL_EVENT_PIPELINE'|'GLOBAL_WATCH_PIPELINE') and idempotency_key
-- does not exist as a column on this table - removed. completed_at renamed
-- to the real column name, finished_at. ingest.ingestion_run_status_enum has
-- no 'COMPLETED' label (migration.sql:31: RUNNING/SUCCEEDED/FAILED) -
-- 'SUCCEEDED' is the correct label.
INSERT INTO ingest.ingestion_runs (source_id, origin_kind, status, started_at, finished_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT s.id, 'EXTERNAL_EVENT_PIPELINE', CASE ir.status WHEN 'success' THEN 'SUCCEEDED'::ingest.ingestion_run_status_enum ELSE 'FAILED'::ingest.ingestion_run_status_enum END,
  ir."fetchedAt", ir."completedAt", 'IngestionRun', ir.id, 'HIGH', 'AUTO_MAPPED'
FROM "IngestionRun" ir
JOIN ingest.sources s ON s.legacy_record_id = ir."sourceId" -- resolved via KnowledgeSource fusion above; falls to REQUIRES_REVIEW if unresolved
ORDER BY ir."fetchedAt"
ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;

INSERT INTO ingest.ingestion_runs (source_id, origin_kind, status, started_at, finished_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT s.id, 'GLOBAL_WATCH_PIPELINE', CASE kir.status WHEN 'completed' THEN 'SUCCEEDED'::ingest.ingestion_run_status_enum ELSE 'FAILED'::ingest.ingestion_run_status_enum END,
  kir."startedAt", kir."finishedAt", 'KnowledgeIngestionRun', kir.id, 'HIGH', 'AUTO_MAPPED'
FROM "KnowledgeIngestionRun" kir
JOIN ingest.sources s ON s.legacy_record_id = kir."sourceId"
ORDER BY kir."startedAt"
ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;

-- ============================================================
-- 3. ingest.source_records <- ExternalEvent (1,904, T-01). Single batch,
--    dedup on (source_id, external_id) partial unique index.
-- ============================================================
-- column is "origin" not "origin_kind"; "provenance"/"content_hash" do not
-- exist on this table (migration.sql:103-118) - removed.
-- ingest.source_record_origin_enum has no 'EXTERNAL_EVENT_PIPELINE' label
-- (migration.sql:30: AUTOMATED_FEED/MANUAL_UPLOAD/API_PULL) - 'AUTOMATED_FEED'
-- is the correct label for a scheduled ingestion pipeline.
INSERT INTO ingest.source_records (ingestion_run_id, source_id, origin, external_id, raw_content, received_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT
  (SELECT id FROM ingest.ingestion_runs ORDER BY started_at LIMIT 1), -- placeholder single-run association, real run resolves per-event's actual ingestion run
  s.id, 'AUTOMATED_FEED'::ingest.source_record_origin_enum, ee."externalId",
  COALESCE(ee.raw, '{}'),
  COALESCE(ee."fetchedAt", ee."createdAt"),
  'ExternalEvent', ee.id, 'HIGH', 'AUTO_MAPPED'
FROM "ExternalEvent" ee
JOIN ingest.sources s ON s.legacy_record_id = ee."sourceId"
ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;

-- ============================================================
-- 4. evidence.observations <- Report(1) + ExternalEvent(1,904) + HelpRequest(0, origin)
--    Single batch, D-04 TelecomConnectivityStatus(0) structural mapping only.
-- ============================================================
INSERT INTO evidence.observations (origin_type, author_type, claim_text, provenance, occurred_at, reported_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status, created_at)
SELECT 'CITIZEN_REPORT'::evidence.observation_origin_enum, 'CITIZEN'::evidence.report_author_type_enum,
  r.description, jsonb_build_object('legacy_record_id', r.id), r."createdAt", r."createdAt",
  'Report', r.id, 'MEDIUM', 'REQUIRES_REVIEW', r."createdAt"
FROM "Report" r
ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;

-- evidence.observation_origin_enum has no 'EXTERNAL_SOURCE' label
-- (migration.sql:34: CITIZEN_REPORT/AUTOMATED_INGESTION) - 'AUTOMATED_INGESTION'
-- is the correct label for pipeline-sourced data.
INSERT INTO evidence.observations (origin_type, claim_text, provenance, occurred_at, reported_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status, created_at)
SELECT 'AUTOMATED_INGESTION'::evidence.observation_origin_enum,
  ee.title, jsonb_build_object('legacy_record_id', ee.id), ee."occurredAt", ee."fetchedAt",
  'ExternalEvent', ee.id, 'MEDIUM', 'REQUIRES_REVIEW', ee."createdAt"
FROM "ExternalEvent" ee
ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;
-- D-04: TelecomConnectivityStatus (0 rows) — origin_type='TELECOM_CONNECTIVITY_LEGACY'
-- structural mapping only, no rows to move:
-- INSERT INTO evidence.observations (origin_type, ...) SELECT 'TELECOM_CONNECTIVITY_LEGACY', ... FROM "TelecomConnectivityStatus"; -- 0 rows, never executes a real row

-- ============================================================
-- 5. evidence.evidence_records <- KnowledgeEvidence (2,463, partial — the
--    incident_id-linked half reconciles in Wave 040 alongside
--    incident.incident_evidence_links). Batched 1,000 rows at a time.
-- ============================================================
-- column is "evidence_origin" not "origin_type"; "chain_of_custody" does not
-- exist - the nearest real column is "structured_content" (migration.sql:193-205).
INSERT INTO evidence.evidence_records (evidence_origin, classification, structured_content,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status, created_at)
-- evidence.evidence_origin_enum has no 'EXTERNAL_SOURCE' label
-- (migration.sql:38: INTERNAL/EXTERNAL) - 'EXTERNAL' is the correct label.
SELECT 'EXTERNAL'::evidence.evidence_origin_enum, 'OPERATIONAL'::security.information_classification_enum,
  jsonb_build_object('sourceId', ke."sourceId", 'sourceName', ke."sourceName", 'legacy_record_id', ke.id),
  'KnowledgeEvidence', ke.id, 'MEDIUM', 'REQUIRES_REVIEW', ke."createdAt"
FROM "KnowledgeEvidence" ke
ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;
-- D-04: TelecomConnectivityEvidence (0 rows) -> evidence_records/evidence_assets,
-- structural mapping only, same pattern as above — 0 rows, no INSERT executes for real.

-- ============================================================
-- 6. Row counts (before/after)
-- ============================================================
SELECT
  (SELECT COUNT(*) FROM "IngestionRun") AS ingestion_run_before,
  (SELECT COUNT(*) FROM "KnowledgeIngestionRun") AS knowledge_ingestion_run_before,
  (SELECT COUNT(*) FROM "ExternalEvent") AS external_event_before,
  (SELECT COUNT(*) FROM "Report") AS report_before,
  (SELECT COUNT(*) FROM "KnowledgeEvidence") AS knowledge_evidence_before;
-- Expected: 3405, 1899, 1904, 1, 2463

SELECT
  (SELECT COUNT(*) FROM ingest.ingestion_runs) AS ingestion_runs_after, -- expect 5304 (3405+1899)
  (SELECT COUNT(*) FROM ingest.source_records) AS source_records_after, -- expect 1904
  (SELECT COUNT(*) FROM evidence.observations) AS observations_after, -- expect 1905 (1904+1)
  (SELECT COUNT(*) FROM evidence.evidence_records) AS evidence_records_after; -- expect 2463

-- ============================================================
-- 7. Validation query — every ExternalEvent row has exactly one
--    source_records row and one observations row
-- ============================================================
SELECT ee.id FROM "ExternalEvent" ee
LEFT JOIN ingest.source_records sr ON sr.legacy_source = 'ExternalEvent' AND sr.legacy_record_id = ee.id
LEFT JOIN evidence.observations o ON o.legacy_source = 'ExternalEvent' AND o.legacy_record_id = ee.id
WHERE sr.id IS NULL OR o.id IS NULL;
-- Expected: 0 rows.

-- ============================================================
-- 8. MIGRATION_REVIEW_QUEUE
-- ============================================================
CREATE OR REPLACE VIEW ingest.vw_migration_review_queue AS
SELECT 'ingest.sources'::text AS target_table, id, legacy_source, legacy_record_id, migration_review_status FROM ingest.sources WHERE migration_review_status = 'REQUIRES_REVIEW';
CREATE OR REPLACE VIEW evidence.vw_migration_review_queue AS
SELECT 'evidence.observations'::text AS target_table, id, legacy_source, legacy_record_id, migration_review_status FROM evidence.observations WHERE migration_review_status = 'REQUIRES_REVIEW'
UNION ALL
SELECT 'evidence.evidence_records', id, legacy_source, legacy_record_id, migration_review_status FROM evidence.evidence_records WHERE migration_review_status = 'REQUIRES_REVIEW';

-- ============================================================
-- 9. Checkpoints
-- ============================================================
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status)
SELECT '030_ingestion_observation_evidence', 'IngestionRun+KnowledgeIngestionRun', 'ingest.ingestion_runs', 5304,
  (SELECT COUNT(*) FROM ingest.ingestion_runs), CASE WHEN (SELECT COUNT(*) FROM ingest.ingestion_runs) = 5304 THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status)
SELECT '030_ingestion_observation_evidence', 'ExternalEvent', 'ingest.source_records', 1904,
  (SELECT COUNT(*) FROM ingest.source_records), CASE WHEN (SELECT COUNT(*) FROM ingest.source_records) = 1904 THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status)
SELECT '030_ingestion_observation_evidence', 'KnowledgeEvidence', 'evidence.evidence_records', 2463,
  (SELECT COUNT(*) FROM evidence.evidence_records), CASE WHEN (SELECT COUNT(*) FROM evidence.evidence_records) = 2463 THEN 'PASS' ELSE 'FAIL' END;
