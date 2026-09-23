-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 030 — Rollback. Must run after 040-100 rollbacks (incident.* and
-- later waves FK into evidence.observations/evidence_records), before
-- 020_identity/010_foundation rollbacks.

REVOKE SELECT ON ALL TABLES IN SCHEMA evidence FROM readonly_inspector;
REVOKE SELECT ON ALL TABLES IN SCHEMA ingest FROM readonly_inspector;
REVOKE SELECT, INSERT ON evidence.observations, evidence.evidence_records, evidence.evidence_assets FROM ingest_worker;
REVOKE SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA evidence FROM app_api;
REVOKE SELECT ON ALL TABLES IN SCHEMA ingest FROM app_api, jobs_worker;
REVOKE SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA ingest FROM ingest_worker;

-- Drop this wave's sync functions (backfill.sql — one mapping shared by the
-- backfill and the application's shadow-write). They live in migration_meta,
-- whose schema-level DROP in 000's rollback has no CASCADE, so a function
-- left behind here would fail that rollback instead of surviving silently.
-- The cross-wave FK this wave adds onto a Wave 020 table has to come off
-- here: identity.reputation_events outlives this rollback, and a constraint
-- pointing at a dropped table would block it.
DO $$ BEGIN
  ALTER TABLE identity.reputation_events DROP CONSTRAINT IF EXISTS fk_reputation_events_evidence;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DROP FUNCTION IF EXISTS migration_meta.fn_sync_knowledge_evidence(text[], text[]);
DROP FUNCTION IF EXISTS migration_meta.fn_sync_reports(text[]);
DROP FUNCTION IF EXISTS migration_meta.fn_sync_external_events(text[]);
DROP FUNCTION IF EXISTS migration_meta.fn_sync_ingestion_runs(text[]);
DROP FUNCTION IF EXISTS migration_meta.fn_sync_sources(text[]);

-- Drop the MIGRATION_REVIEW_QUEUE views (backfill.sql) before any table they
-- depend on, or those DROP TABLE statements fail with "other objects depend on it".
DROP VIEW IF EXISTS ingest.vw_migration_review_queue;
DROP VIEW IF EXISTS evidence.vw_migration_review_queue;

DROP TABLE IF EXISTS evidence.corroborations;
DROP TABLE IF EXISTS evidence.contradictions;
DROP TABLE IF EXISTS evidence.refutations;
DROP TABLE IF EXISTS evidence.confirmations;
DROP TABLE IF EXISTS evidence.observation_evidence_links;
DROP TABLE IF EXISTS evidence.evidence_assessments;
DROP TABLE IF EXISTS evidence.evidence_versions;
DROP TABLE IF EXISTS evidence.evidence_assets;
DROP TABLE IF EXISTS evidence.evidence_records;
DROP TABLE IF EXISTS evidence.observations;

DROP TABLE IF EXISTS ingest.ingestion_errors;
DROP TABLE IF EXISTS ingest.transformations;
DROP TABLE IF EXISTS ingest.source_records;
DROP TABLE IF EXISTS ingest.ingestion_runs;
DROP TABLE IF EXISTS ingest.source_connectors;
DROP TABLE IF EXISTS ingest.sources;
DROP TABLE IF EXISTS ingest.providers;

DO $$ BEGIN DROP TYPE IF EXISTS evidence.contradiction_party_type_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS evidence.link_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS evidence.link_method_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS evidence.observation_evidence_link_type_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS evidence.evidence_origin_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS evidence.observation_verification_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS evidence.report_author_type_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS evidence.observation_origin_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS evidence.confidence_level_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS ingest.ingestion_run_origin_kind_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS ingest.ingestion_run_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS ingest.source_record_origin_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS ingest.provider_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS ingest.connector_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS ingest.source_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP SCHEMA IF EXISTS evidence;
DROP SCHEMA IF EXISTS ingest;
