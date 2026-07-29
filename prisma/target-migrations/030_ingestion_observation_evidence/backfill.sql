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
--
-- RECONCILED (this session): all legacy-provenance columns now ship as part
-- of migration.sql's CREATE TABLE statements (no more post-hoc ALTER TABLE
-- ADD COLUMN patches here); all column names/enum literals below match
-- schema.target.prisma exactly.

-- ============================================================
-- 0. ingest.providers <- a single placeholder provider, since
--    KnowledgeSource/the code source catalog have no resolvable
--    institution.organizations row (D-01 — never fabricated) and
--    ingest.sources.provider_id is NOT NULL post-reconciliation.
-- ============================================================
INSERT INTO ingest.providers (id, name, organization_id, status)
SELECT gen_random_uuid(), 'Legacy Source Catalog (DUP-003, unresolved organization)', NULL, 'ACTIVE'::ingest.provider_status_enum
WHERE NOT EXISTS (SELECT 1 FROM ingest.providers WHERE name = 'Legacy Source Catalog (DUP-003, unresolved organization)');

-- ============================================================
-- 1. ingest.sources <- KnowledgeSource (1 row, FUSIONAR with code catalog)
-- ============================================================
-- SQL_COMPLEMENTARY_REQUIRED: the ~43-source code catalog (DUP-003) lives
-- in application code (src/lib/*), not a database table — reconciling it
-- with KnowledgeSource's single row requires a code-review pass, not SQL
-- alone. Drafted here as a placeholder for the 1 known row only.
-- ingest.sources has NO legacy-provenance columns (schema.target.prisma's
-- Source model has none — Source is populated via the DUP-003 logical
-- consolidation, not a literal 1:1 legacy row migration); endpoint_signature
-- doubles as the natural correlation key downstream (it is the table's own
-- real uq_sources_provider_endpoint identity, set here to the legacy
-- KnowledgeSource id for exactly this purpose).
INSERT INTO ingest.sources (provider_id, endpoint_signature, name, status, created_at)
SELECT (SELECT id FROM ingest.providers WHERE name = 'Legacy Source Catalog (DUP-003, unresolved organization)'),
  ks.id, ks.name, CASE WHEN ks.enabled THEN 'ACTIVE'::ingest.source_status_enum ELSE 'INACTIVE'::ingest.source_status_enum END,
  ks."createdAt"
FROM "KnowledgeSource" ks
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. ingest.ingestion_runs <- IngestionRun(3,405) + KnowledgeIngestionRun(1,899)
--    Batch: 5,000-row batches per origin_kind, ORDER BY started_at.
-- ============================================================
INSERT INTO ingest.ingestion_runs (source_id, idempotency_key, origin_kind, status, started_at, completed_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT s.id, gen_random_uuid(), 'EXTERNAL_EVENT_PIPELINE'::ingest.ingestion_run_origin_kind_enum,
  CASE ir.status WHEN 'success' THEN 'COMPLETED'::ingest.ingestion_run_status_enum ELSE 'FAILED'::ingest.ingestion_run_status_enum END,
  ir."fetchedAt", ir."completedAt", 'IngestionRun', ir.id, 'HIGH', 'AUTO_MAPPED'
FROM "IngestionRun" ir
JOIN ingest.sources s ON s.endpoint_signature = ir."sourceId" -- resolved via KnowledgeSource fusion above (endpoint_signature = legacy KnowledgeSource id); falls to REQUIRES_REVIEW if unresolved
ORDER BY ir."fetchedAt"
ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;

INSERT INTO ingest.ingestion_runs (source_id, idempotency_key, origin_kind, status, started_at, completed_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT s.id, gen_random_uuid(), 'GLOBAL_WATCH_PIPELINE'::ingest.ingestion_run_origin_kind_enum,
  CASE kir.status WHEN 'completed' THEN 'COMPLETED'::ingest.ingestion_run_status_enum ELSE 'FAILED'::ingest.ingestion_run_status_enum END,
  kir."startedAt", kir."finishedAt", 'KnowledgeIngestionRun', kir.id, 'HIGH', 'AUTO_MAPPED'
FROM "KnowledgeIngestionRun" kir
JOIN ingest.sources s ON s.endpoint_signature = kir."sourceId"
ORDER BY kir."startedAt"
ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;

-- ============================================================
-- 3. ingest.source_records <- ExternalEvent (1,904, T-01). Single batch,
--    dedup on (source_id, external_id) partial unique index.
-- ============================================================
INSERT INTO ingest.source_records (ingestion_run_id, source_id, origin_kind, external_id, provenance, raw_content, content_hash, received_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT
  (SELECT id FROM ingest.ingestion_runs WHERE legacy_source = 'IngestionRun' ORDER BY started_at LIMIT 1),
  s.id, 'EXTERNAL_EVENT'::ingest.source_record_origin_enum, ee."externalId",
  jsonb_build_object('legacy_record_id', ee.id, 'legacy_table', 'ExternalEvent'),
  COALESCE(ee.raw, '{}'),
  encode(sha256(COALESCE(ee.raw, '{}')::text::bytea), 'hex'),
  COALESCE(ee."fetchedAt", ee."createdAt"),
  'ExternalEvent', ee.id, 'HIGH', 'AUTO_MAPPED'
FROM "ExternalEvent" ee
JOIN ingest.sources s ON s.endpoint_signature = ee."sourceId"
ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;

-- ============================================================
-- 4. evidence.observations <- Report(1) + ExternalEvent(1,904)
--    Single batch. D-04 TelecomConnectivityStatus(0) structural mapping only.
-- ============================================================
-- author_person_id is a real uuid FK to identity.people(id) — Report.userId
-- is the legacy cuid, resolved via identity.people.legacy_record_id (Ola 2
-- backfill, User -> identity.people), never inserted as a raw cuid string.
INSERT INTO evidence.observations (origin_type, author_type, author_person_id, claim_text, provenance, occurred_at, reported_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status, created_at)
SELECT 'PRIMARY'::evidence.observation_origin_enum, 'CITIZEN'::evidence.report_author_type_enum, p.id,
  r.description, jsonb_build_object('chain', jsonb_build_array(jsonb_build_object('step_kind', 'CITIZEN_REPORT', 'timestamp', r."createdAt")), 'depth', 1),
  r."createdAt", r."createdAt",
  'Report', r.id, CASE WHEN p.id IS NOT NULL THEN 'HIGH' ELSE 'LOW' END, CASE WHEN p.id IS NOT NULL THEN 'AUTO_MAPPED' ELSE 'REQUIRES_REVIEW' END, r."createdAt"
FROM "Report" r
LEFT JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = r."userId"
ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;

INSERT INTO evidence.observations (origin_type, claim_text, source_record_id, provenance, occurred_at, reported_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status, created_at)
SELECT 'PRIMARY'::evidence.observation_origin_enum,
  ee.title,
  (SELECT id FROM ingest.source_records WHERE legacy_source = 'ExternalEvent' AND legacy_record_id = ee.id),
  jsonb_build_object('chain', jsonb_build_array(jsonb_build_object('step_kind', 'EXTERNAL_EVENT_INGESTION', 'timestamp', ee."createdAt")), 'depth', 1),
  ee."occurredAt", ee."fetchedAt",
  'ExternalEvent', ee.id, 'MEDIUM', 'REQUIRES_REVIEW', ee."createdAt"
FROM "ExternalEvent" ee
ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;
-- D-04: TelecomConnectivityStatus (0 rows) — origin_type='PRIMARY',
-- structural mapping only, no rows to move (0 rows in current schema, never
-- executes a real row).

-- ============================================================
-- 5. evidence.evidence_records <- KnowledgeEvidence (2,463, partial — the
--    incident_id-linked half reconciles in Wave 040 alongside
--    incident.incident_evidence_links). Batched 1,000 rows at a time.
-- ============================================================
INSERT INTO evidence.evidence_records (evidence_origin, classification, chain_of_custody,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status, created_at)
SELECT 'DERIVED'::evidence.evidence_origin_enum, 'OPERATIONAL'::security.information_classification_enum,
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
-- ingest.sources has no legacy-provenance columns (see §1 note above) —
-- excluded from this view, never fabricated.
CREATE OR REPLACE VIEW ingest.vw_migration_review_queue AS
SELECT 'ingest.source_records'::text AS target_table, id, legacy_source, legacy_record_id, migration_review_status FROM ingest.source_records WHERE migration_review_status = 'REQUIRES_REVIEW';
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
