-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 030 — Ingestion, Observation & Evidence
-- Schemas: ingest (7 tables), evidence (10 tables). D-04 (TelecomConnectivity*)
-- applies to evidence.observations/evidence_records/evidence_assets.
--
-- Authority: ARGUS_PHYSICAL_TABLE_CATALOG_v1.1_FROZEN.md §ingest/§evidence,
-- ARGUS_PHYSICAL_ENUMS_REFERENCE_DATA_v1.1_FROZEN.md,
-- ARGUS_PHYSICAL_ACCESS_CONTROL_v1.1_FROZEN.md §4.4-4.5,
-- ARGUS_MIGRATION_DECISION_REGISTER_v1.0_FROZEN.md D-04.
--
-- VERIFY_AGAINST_V1.0: as in Wave 020, every table below except
-- `evidence.observations` (full ficha given directly in Table Catalog v1.1,
-- P2-03 modification, transcribed verbatim) is reconstructed from
-- cross-referenced clues (Access Control v1.1 §4.4-4.5, Enums Reference v1.1,
-- Target-Current Mapping v1.1 field names) since the v1.0 ficha source is
-- not available in this session — flagged per table.

CREATE SCHEMA IF NOT EXISTS ingest;
CREATE SCHEMA IF NOT EXISTS evidence;

-- ============================================================
-- 1. Local enums
-- ============================================================
DO $$ BEGIN CREATE TYPE ingest.source_status_enum AS ENUM ('ACTIVE','INACTIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #116
DO $$ BEGIN CREATE TYPE ingest.connector_status_enum AS ENUM ('ACTIVE','INACTIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #117
DO $$ BEGIN CREATE TYPE ingest.provider_status_enum AS ENUM ('ACTIVE','INACTIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #118
DO $$ BEGIN CREATE TYPE ingest.source_record_origin_enum AS ENUM ('AUTOMATED_FEED','MANUAL_UPLOAD','API_PULL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #16, 3 values
DO $$ BEGIN CREATE TYPE ingest.ingestion_run_status_enum AS ENUM ('RUNNING','SUCCEEDED','FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- 3 values

DO $$ BEGIN CREATE TYPE evidence.confidence_level_enum AS ENUM ('UNKNOWN','LOW','MEDIUM','HIGH','CONFIRMED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #2, 5 values, transversal
DO $$ BEGIN CREATE TYPE evidence.observation_origin_enum AS ENUM ('CITIZEN_REPORT','AUTOMATED_INGESTION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #17, 2 values
DO $$ BEGIN CREATE TYPE evidence.report_author_type_enum AS ENUM ('CITIZEN','PROFESSIONAL','SYSTEM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #18, 3 values
DO $$ BEGIN CREATE TYPE evidence.observation_verification_status_enum AS ENUM
  ('UNVERIFIED','PENDING','VERIFIED','DISPUTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #19, 4 values
DO $$ BEGIN CREATE TYPE evidence.evidence_origin_enum AS ENUM ('INTERNAL','EXTERNAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #20, 2 values
DO $$ BEGIN CREATE TYPE evidence.observation_evidence_link_type_enum AS ENUM
  ('SUPPORTS','CONTEXTUALIZES','CONTRADICTS','SUPERSEDES'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #21, 4 values
DO $$ BEGIN CREATE TYPE evidence.link_method_enum AS ENUM ('AUTOMATED','MANUAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #22, 2 values
DO $$ BEGIN CREATE TYPE evidence.link_status_enum AS ENUM ('ACTIVE','RETRACTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #23, 2 values
DO $$ BEGIN CREATE TYPE evidence.contradiction_party_type_enum AS ENUM ('OBSERVATION','EVIDENCE_RECORD'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #37, 2 values

-- ============================================================
-- 2. ingest schema — 7 tables
-- ============================================================

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS ingest.providers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            varchar(255) NOT NULL,
  organization_id uuid NULL,
  status          ingest.provider_status_enum NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT fk_providers_organization FOREIGN KEY (organization_id) REFERENCES institution.organizations(id) ON DELETE SET NULL
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS ingest.sources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         varchar(255) NOT NULL,
  provider_id  uuid NULL,
  status       ingest.source_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_sources_provider FOREIGN KEY (provider_id) REFERENCES ingest.providers(id) ON DELETE SET NULL
);

-- VERIFY_AGAINST_V1.0. 1:1 structural (Keys/Constraints v1.1 §4).
CREATE TABLE IF NOT EXISTS ingest.source_connectors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       uuid NOT NULL UNIQUE,
  connector_kind  varchar(100) NOT NULL,
  status          ingest.connector_status_enum NOT NULL DEFAULT 'ACTIVE',
  config          jsonb NULL,
  CONSTRAINT fk_source_connectors_source FOREIGN KEY (source_id) REFERENCES ingest.sources(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0. Fuses IngestionRun + KnowledgeIngestionRun (T-01,
-- D-02) under an origin_kind discriminator.
CREATE TABLE IF NOT EXISTS ingest.ingestion_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id            uuid NULL,
  origin_kind          varchar(30) NOT NULL,
  status               ingest.ingestion_run_status_enum NOT NULL DEFAULT 'RUNNING',
  started_at           timestamptz NOT NULL DEFAULT now(),
  finished_at          timestamptz NULL,
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL CHECK (migration_confidence IN ('HIGH','MEDIUM','LOW')),
  migration_review_status varchar(30) NULL,
  CONSTRAINT fk_ingestion_runs_source FOREIGN KEY (source_id) REFERENCES ingest.sources(id) ON DELETE SET NULL,
  CONSTRAINT ck_ingestion_runs_origin_kind_whitelist
    CHECK (origin_kind IN ('EXTERNAL_EVENT_PIPELINE','GLOBAL_WATCH_PIPELINE'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ingestion_runs_legacy ON ingest.ingestion_runs (legacy_source, legacy_record_id)
  WHERE legacy_record_id IS NOT NULL;

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS ingest.source_records (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id            uuid NULL,
  ingestion_run_id     uuid NULL,
  origin               ingest.source_record_origin_enum NOT NULL,
  external_id          varchar(255) NULL,
  raw_content          jsonb NOT NULL,   -- P2-03 exempt, mandate: preserve original content unnormalized
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL,
  migration_review_status varchar(30) NULL,
  received_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_source_records_source FOREIGN KEY (source_id) REFERENCES ingest.sources(id) ON DELETE SET NULL,
  CONSTRAINT fk_source_records_ingestion_run FOREIGN KEY (ingestion_run_id) REFERENCES ingest.ingestion_runs(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_source_records_source_external
  ON ingest.source_records (source_id, external_id) WHERE external_id IS NOT NULL;

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS ingest.transformations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_record_id      uuid NOT NULL,
  transformation_kind   varchar(100) NOT NULL,
  applied_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_transformations_source_record FOREIGN KEY (source_record_id) REFERENCES ingest.source_records(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS ingest.ingestion_errors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_run_id  uuid NOT NULL,
  error_message     text NOT NULL,
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_ingestion_errors_run FOREIGN KEY (ingestion_run_id) REFERENCES ingest.ingestion_runs(id) ON DELETE CASCADE
);

-- ============================================================
-- 3. evidence schema — 10 tables
-- ============================================================

-- Full ficha given directly in Table Catalog v1.1 (P2-03 modification) —
-- transcribed verbatim.
CREATE TABLE IF NOT EXISTS evidence.observations (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_type                     evidence.observation_origin_enum NOT NULL,
  author_type                     evidence.report_author_type_enum NULL,
  author_person_id                uuid NULL,
  author_identity_status_snapshot jsonb NULL,
  author_membership_snapshot      jsonb NULL,
  source_record_id                uuid NULL,
  claim_text                      text NOT NULL,
  claim_structured                jsonb NULL,
  claim_schema_version            integer NOT NULL DEFAULT 1,
  provenance                      jsonb NOT NULL,
  provenance_schema_version       integer NOT NULL DEFAULT 1,
  location                        geography(Point,4326) NULL,
  occurred_at                     timestamptz NULL,
  reported_at                     timestamptz NULL,
  verification_status             evidence.observation_verification_status_enum NOT NULL DEFAULT 'UNVERIFIED',
  confidence_level                evidence.confidence_level_enum NOT NULL DEFAULT 'UNKNOWN',
  corrects_observation_id         uuid NULL,
  retracts_observation_id         uuid NULL,
  local_alias                     varchar(255) NULL,
  device_id                       uuid NULL,
  operational_session_id          uuid NULL,
  client_created_at               timestamptz NULL,
  received_at                     timestamptz NULL,
  reconciliation_status           varchar(30) NULL,
  legacy_status                   text NULL,
  legacy_source                   varchar(100) NULL,
  legacy_record_id                text NULL,
  migration_confidence            varchar(10) NULL CHECK (migration_confidence IN ('HIGH','MEDIUM','LOW')),
  migration_review_status         varchar(30) NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_observations_author_person FOREIGN KEY (author_person_id) REFERENCES identity.people(id) ON DELETE SET NULL,
  CONSTRAINT fk_observations_source_record FOREIGN KEY (source_record_id) REFERENCES ingest.source_records(id) ON DELETE SET NULL,
  CONSTRAINT fk_observations_device FOREIGN KEY (device_id) REFERENCES identity.devices(id) ON DELETE SET NULL,
  CONSTRAINT fk_observations_operational_session FOREIGN KEY (operational_session_id) REFERENCES identity.operational_sessions(id) ON DELETE SET NULL,
  CONSTRAINT fk_observations_corrects FOREIGN KEY (corrects_observation_id) REFERENCES evidence.observations(id) ON DELETE SET NULL,
  CONSTRAINT fk_observations_retracts FOREIGN KEY (retracts_observation_id) REFERENCES evidence.observations(id) ON DELETE SET NULL,
  CONSTRAINT ck_observations_confidence_not_null CHECK (confidence_level IS NOT NULL),
  CONSTRAINT ck_observations_provenance_schema_version CHECK (provenance_schema_version >= 1),
  CONSTRAINT ck_observations_claim_schema_version CHECK (claim_structured IS NULL OR claim_schema_version >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_observations_device_local_alias
  ON evidence.observations (device_id, local_alias) WHERE device_id IS NOT NULL AND local_alias IS NOT NULL;
CREATE INDEX IF NOT EXISTS gix_observations_location ON evidence.observations USING GIST (location);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS evidence.evidence_records (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_origin      evidence.evidence_origin_enum NOT NULL,
  content_summary      text NULL,
  structured_content   jsonb NULL,
  classification       security.information_classification_enum NOT NULL DEFAULT 'SENSITIVE',
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL,
  migration_review_status varchar(30) NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- VERIFY_AGAINST_V1.0. D-04: also destination for TelecomConnectivityEvidence
-- (binary/attachment subset).
CREATE TABLE IF NOT EXISTS evidence.evidence_assets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id  uuid NOT NULL,
  asset_uri    text NOT NULL,
  mime_type    varchar(100) NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_evidence_assets_evidence FOREIGN KEY (evidence_id) REFERENCES evidence.evidence_records(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS evidence.evidence_versions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_asset_id    uuid NOT NULL,
  version_number       integer NOT NULL,
  content_hash         text NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_evidence_versions_asset FOREIGN KEY (evidence_asset_id) REFERENCES evidence.evidence_assets(id) ON DELETE RESTRICT,
  CONSTRAINT uq_evidence_versions_asset_number UNIQUE (evidence_asset_id, version_number)
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS evidence.evidence_assessments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id            uuid NOT NULL,
  assessed_by_actor_id   uuid NULL,
  assessment_notes       text NULL,
  assessed_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_evidence_assessments_evidence FOREIGN KEY (evidence_id) REFERENCES evidence.evidence_records(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS evidence.observation_evidence_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL,
  evidence_id    uuid NOT NULL,
  link_type      evidence.observation_evidence_link_type_enum NOT NULL,
  link_method    evidence.link_method_enum NOT NULL,
  status         evidence.link_status_enum NOT NULL DEFAULT 'ACTIVE',
  confidence     evidence.confidence_level_enum NOT NULL,
  CONSTRAINT fk_oel_observation FOREIGN KEY (observation_id) REFERENCES evidence.observations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_oel_evidence FOREIGN KEY (evidence_id) REFERENCES evidence.evidence_records(id) ON DELETE RESTRICT,
  CONSTRAINT ck_oel_confidence_not_null CHECK (confidence IS NOT NULL)
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS evidence.confirmations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id      uuid NOT NULL,
  confirmed_by_actor_id uuid NULL,
  confirmed_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_confirmations_observation FOREIGN KEY (observation_id) REFERENCES evidence.observations(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS evidence.refutations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id    uuid NOT NULL,
  refuted_by_actor_id uuid NULL,
  reason            text NULL,
  refuted_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_refutations_observation FOREIGN KEY (observation_id) REFERENCES evidence.observations(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS evidence.contradictions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_a_type evidence.contradiction_party_type_enum NOT NULL,
  party_a_id   uuid NOT NULL,
  party_b_type evidence.contradiction_party_type_enum NOT NULL,
  party_b_id   uuid NOT NULL,
  detected_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_contradictions_party_a ON evidence.contradictions (party_a_type, party_a_id);
CREATE INDEX IF NOT EXISTS ix_contradictions_party_b ON evidence.contradictions (party_b_type, party_b_id);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS evidence.corroborations (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id             uuid NOT NULL,
  corroborating_observation_id uuid NOT NULL,
  confidence                 evidence.confidence_level_enum NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_corroborations_observation FOREIGN KEY (observation_id) REFERENCES evidence.observations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_corroborations_corroborating FOREIGN KEY (corroborating_observation_id) REFERENCES evidence.observations(id) ON DELETE RESTRICT
);

-- ============================================================
-- 4. RLS
-- ============================================================
-- ingest.* — OPERATIONAL, no direct public/anon access (Access Control v1.1 §4.4)
ALTER TABLE ingest.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.sources FORCE ROW LEVEL SECURITY;
CREATE POLICY sources_operational_role ON ingest.sources
  FOR ALL USING ( current_setting('argus.actor_role', true) = 'OPERATIONAL' OR current_setting('argus.actor_role', true) = 'ADMIN' );

ALTER TABLE ingest.source_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.source_connectors FORCE ROW LEVEL SECURITY;
CREATE POLICY source_connectors_inherit ON ingest.source_connectors
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE ingest.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.providers FORCE ROW LEVEL SECURITY;
CREATE POLICY providers_operational_role ON ingest.providers
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE ingest.ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.ingestion_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY ingestion_runs_inherit ON ingest.ingestion_runs
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE ingest.source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.source_records FORCE ROW LEVEL SECURITY;
CREATE POLICY source_records_classification ON ingest.source_records
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE ingest.transformations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.transformations FORCE ROW LEVEL SECURITY;
CREATE POLICY transformations_inherit ON ingest.transformations
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE ingest.ingestion_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.ingestion_errors FORCE ROW LEVEL SECURITY;
CREATE POLICY ingestion_errors_inherit ON ingest.ingestion_errors
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

-- evidence.* — SENSITIVE-CRITICAL, assignment/command/ownership-scoped
-- (Access Control v1.1 §4.5). Full incident/mission joins are deferred
-- conceptually until incident_observation_links (Wave 040) exists; the
-- policy below expresses the ownership/classification baseline now and is
-- extended (not replaced) by an additional USING clause added via
-- Wave 040's migration.sql once incident linkage exists.
ALTER TABLE evidence.observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.observations FORCE ROW LEVEL SECURITY;
CREATE POLICY observations_owner_or_classification ON evidence.observations
  FOR ALL USING (
    security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', author_person_id)
    OR security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, 'SENSITIVE')
  );

ALTER TABLE evidence.evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.evidence_records FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_records_classification ON evidence.evidence_records
  FOR ALL USING ( security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, classification) );

ALTER TABLE evidence.evidence_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.evidence_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_assets_inherit ON evidence.evidence_assets
  FOR ALL USING ( EXISTS (
    SELECT 1 FROM evidence.evidence_records er WHERE er.id = evidence_id
      AND security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, er.classification)
  ) );

ALTER TABLE evidence.evidence_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.evidence_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_versions_inherit ON evidence.evidence_versions
  FOR ALL USING ( EXISTS (
    SELECT 1 FROM evidence.evidence_assets ea JOIN evidence.evidence_records er ON er.id = ea.evidence_id
    WHERE ea.id = evidence_asset_id AND security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, er.classification)
  ) );

ALTER TABLE evidence.evidence_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.evidence_assessments FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_assessments_inherit ON evidence.evidence_assessments
  FOR ALL USING ( EXISTS (
    SELECT 1 FROM evidence.evidence_records er WHERE er.id = evidence_id
      AND security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, er.classification)
  ) );

ALTER TABLE evidence.observation_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.observation_evidence_links FORCE ROW LEVEL SECURITY;
CREATE POLICY oel_max_of_both ON evidence.observation_evidence_links
  FOR ALL USING (
    EXISTS (SELECT 1 FROM evidence.observations o WHERE o.id = observation_id
      AND security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', o.author_person_id))
    OR EXISTS (SELECT 1 FROM evidence.evidence_records er WHERE er.id = evidence_id
      AND security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, er.classification))
  );

ALTER TABLE evidence.confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.confirmations FORCE ROW LEVEL SECURITY;
CREATE POLICY confirmations_inherit ON evidence.confirmations
  FOR ALL USING ( EXISTS (SELECT 1 FROM evidence.observations o WHERE o.id = observation_id
    AND security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, 'SENSITIVE')) );

ALTER TABLE evidence.refutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.refutations FORCE ROW LEVEL SECURITY;
CREATE POLICY refutations_inherit ON evidence.refutations
  FOR ALL USING ( EXISTS (SELECT 1 FROM evidence.observations o WHERE o.id = observation_id
    AND security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, 'SENSITIVE')) );

ALTER TABLE evidence.contradictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.contradictions FORCE ROW LEVEL SECURITY;
CREATE POLICY contradictions_classification ON evidence.contradictions
  FOR ALL USING ( security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, 'SENSITIVE') );

ALTER TABLE evidence.corroborations ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.corroborations FORCE ROW LEVEL SECURITY;
CREATE POLICY corroborations_inherit ON evidence.corroborations
  FOR ALL USING ( EXISTS (SELECT 1 FROM evidence.observations o WHERE o.id = observation_id
    AND security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, 'SENSITIVE')) );

-- ============================================================
-- 5. Grants
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA ingest TO ingest_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA ingest TO app_api, jobs_worker;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA evidence TO app_api;
GRANT SELECT, INSERT ON evidence.observations, evidence.evidence_records, evidence.evidence_assets
  TO ingest_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA ingest TO readonly_inspector;
GRANT SELECT ON ALL TABLES IN SCHEMA evidence TO readonly_inspector;
