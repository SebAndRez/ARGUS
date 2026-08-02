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
-- RECONCILED (this session) against `prisma/schema.target.prisma`, the
-- authoritative name/shape source for every column/enum below. Every
-- prior `VERIFY_AGAINST_V1.0` marker has been resolved by transcribing
-- schema.target.prisma exactly — none remain. The 2 additive gaps found
-- IN schema.target.prisma itself (missing D-02 legacy-provenance mixin on
-- IngestionRun/SourceRecord/Observation; missing `origin_kind` on
-- IngestionRun, explicitly named by ARGUS_EXECUTABLE_DATABASE_MIGRATION_PLAN_v1.0.md's
-- own Ola 3 text) were fixed in schema.target.prisma in the same session,
-- not worked around here.

CREATE SCHEMA IF NOT EXISTS ingest;
CREATE SCHEMA IF NOT EXISTS evidence;

-- ============================================================
-- 1. Local enums (values transcribed verbatim from schema.target.prisma)
-- ============================================================
DO $$ BEGIN CREATE TYPE ingest.source_status_enum AS ENUM ('ACTIVE','INACTIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ingest.connector_status_enum AS ENUM ('ACTIVE','INACTIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ingest.provider_status_enum AS ENUM ('ACTIVE','INACTIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ingest.source_record_origin_enum AS ENUM ('EXTERNAL_EVENT','DIRECT_CAPTURE','DERIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ingest.ingestion_run_status_enum AS ENUM ('RUNNING','COMPLETED','FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ingest.ingestion_run_origin_kind_enum AS ENUM ('EXTERNAL_EVENT_PIPELINE','GLOBAL_WATCH_PIPELINE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE evidence.confidence_level_enum AS ENUM ('UNKNOWN','LOW','MEDIUM','HIGH','CONFIRMED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE evidence.observation_origin_enum AS ENUM ('PRIMARY','DERIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE evidence.report_author_type_enum AS ENUM ('CITIZEN','PROFESSIONAL','INSTITUTIONAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE evidence.observation_verification_status_enum AS ENUM
  ('UNVERIFIED','PARTIALLY_VERIFIED','VERIFIED','REFUTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE evidence.evidence_origin_enum AS ENUM ('PRIMARY','DERIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE evidence.observation_evidence_link_type_enum AS ENUM
  ('SUPPORTS','CONTRADICTS','REFUTES','CONTEXTUALIZES'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE evidence.link_method_enum AS ENUM ('MANUAL','AUTOMATIC'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE evidence.link_status_enum AS ENUM ('ACTIVE','REVOKED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE evidence.contradiction_party_type_enum AS ENUM ('OBSERVATION','EVIDENCE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. ingest schema — 7 tables
-- ============================================================

CREATE TABLE IF NOT EXISTS ingest.providers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            varchar(255) NOT NULL,
  organization_id uuid NULL,
  status          ingest.provider_status_enum NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT fk_providers_organization FOREIGN KEY (organization_id) REFERENCES institution.organizations(id) ON DELETE SET NULL
);

-- provider_id/endpoint_signature NOT NULL + uq_sources_provider_endpoint
-- (schema.target.prisma: providerId String, endpointSignature String, both
-- required; ON DELETE RESTRICT — a Source without a resolvable Provider is
-- never persisted, matching wave3Transformers.ts's own REQUIRES_REVIEW
-- contract for an unresolved providerId).
CREATE TABLE IF NOT EXISTS ingest.sources (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id         uuid NOT NULL,
  endpoint_signature  text NOT NULL,
  name                varchar(255) NOT NULL,
  status              ingest.source_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_sources_provider FOREIGN KEY (provider_id) REFERENCES ingest.providers(id) ON DELETE RESTRICT,
  CONSTRAINT uq_sources_provider_endpoint UNIQUE (provider_id, endpoint_signature)
);

-- No `connector_kind` column — schema.target.prisma's SourceConnector model
-- has no such field; `config` is NOT NULL there too.
CREATE TABLE IF NOT EXISTS ingest.source_connectors (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL UNIQUE,
  config   jsonb NOT NULL,
  status   ingest.connector_status_enum NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT fk_source_connectors_source FOREIGN KEY (source_id) REFERENCES ingest.sources(id) ON DELETE CASCADE
);

-- origin_kind: real enum column (schema.target.prisma IngestionRunOriginKind,
-- added this session to close a gap against the frozen Ola 3 plan text,
-- which already named this exact discriminator). idempotency_key: real
-- column (was missing). source_id NOT NULL + ON DELETE CASCADE (matches
-- the Prisma relation). finished_at renamed to completed_at (matches
-- Prisma's `completedAt`). Legacy provenance: this table receives backfill
-- from IngestionRun+KnowledgeIngestionRun (T-01) per D-02.
CREATE TABLE IF NOT EXISTS ingest.ingestion_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id            uuid NOT NULL,
  idempotency_key      uuid NOT NULL,
  origin_kind          ingest.ingestion_run_origin_kind_enum NOT NULL,
  status               ingest.ingestion_run_status_enum NOT NULL DEFAULT 'RUNNING',
  started_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz NULL,
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL CHECK (migration_confidence IN ('HIGH','MEDIUM','LOW')),
  migration_review_status varchar(30) NULL,
  CONSTRAINT fk_ingestion_runs_source FOREIGN KEY (source_id) REFERENCES ingest.sources(id) ON DELETE CASCADE,
  CONSTRAINT uq_ingestion_runs_source_idempotency UNIQUE (source_id, idempotency_key)
);
-- SQL_COMPLEMENTARY_REQUIRED: partition RANGE(started_at) monthly (Prisma comment) — deferred, not required for rehearsal-scale data.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ingestion_runs_legacy ON ingest.ingestion_runs (legacy_source, legacy_record_id)
  WHERE legacy_record_id IS NOT NULL;

-- origin renamed to origin_kind (matches Prisma field name); provenance/
-- content_hash added (were missing — both NOT NULL per schema.target.prisma);
-- source_id/ingestion_run_id NOT NULL + ON DELETE RESTRICT (matches Prisma
-- relations); created_at added (was missing). Legacy provenance: receives
-- backfill from ExternalEvent (T-01) per D-02.
CREATE TABLE IF NOT EXISTS ingest.source_records (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_run_id     uuid NOT NULL,
  source_id            uuid NOT NULL,
  origin_kind          ingest.source_record_origin_enum NOT NULL,
  external_id          text NULL,
  provenance           jsonb NOT NULL,
  raw_content          jsonb NOT NULL,   -- P2-03 exempt, mandate: preserve original content unnormalized
  content_hash         text NOT NULL,
  classification       security.information_classification_enum NOT NULL DEFAULT 'OPERATIONAL',
  received_at          timestamptz NOT NULL DEFAULT now(),
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL CHECK (migration_confidence IN ('HIGH','MEDIUM','LOW')),
  migration_review_status varchar(30) NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_source_records_source FOREIGN KEY (source_id) REFERENCES ingest.sources(id) ON DELETE RESTRICT,
  CONSTRAINT fk_source_records_ingestion_run FOREIGN KEY (ingestion_run_id) REFERENCES ingest.ingestion_runs(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_source_records_source_external
  ON ingest.source_records (source_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_source_records_legacy ON ingest.source_records (legacy_source, legacy_record_id)
  WHERE legacy_record_id IS NOT NULL;
-- SQL_COMPLEMENTARY_REQUIRED: partition RANGE(received_at) monthly (Prisma comment) — deferred, not required for rehearsal-scale data.

-- transformation_kind/applied_at renamed to operation/created_at (matches
-- Prisma field names); result (jsonb NOT NULL) added — was missing.
CREATE TABLE IF NOT EXISTS ingest.transformations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_record_id      uuid NOT NULL,
  operation      varchar(100) NOT NULL,
  result         jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_transformations_source_record FOREIGN KEY (source_record_id) REFERENCES ingest.source_records(id) ON DELETE RESTRICT
);

-- error_message renamed to detail (nullable, matches Prisma); error_code
-- (varchar(50) NOT NULL) added — was missing.
CREATE TABLE IF NOT EXISTS ingest.ingestion_errors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_run_id  uuid NOT NULL,
  error_code        varchar(50) NOT NULL,
  detail            text NULL,
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_ingestion_errors_run FOREIGN KEY (ingestion_run_id) REFERENCES ingest.ingestion_runs(id) ON DELETE CASCADE
);

-- ============================================================
-- 3. evidence schema — 10 tables
-- ============================================================

-- Column names already matched schema.target.prisma exactly (columns were
-- correct in the prior draft) — only the 3 enum value sets above were
-- wrong and are now fixed (origin_type/author_type/verification_status).
-- Legacy provenance columns (legacy_status..migration_review_status) were
-- already present, matching D-02 (T-04, T-12).
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_observations_legacy ON evidence.observations (legacy_source, legacy_record_id)
  WHERE legacy_record_id IS NOT NULL;

-- content_summary/structured_content replaced with the real Prisma columns
-- (chain_of_custody jsonb NOT NULL, license_terms jsonb NULL, consent_id,
-- derived_from_evidence_id); legacy provenance added (was missing — this
-- table receives backfill from KnowledgeEvidence/Evidence per T-04/T-12/D-04).
CREATE TABLE IF NOT EXISTS evidence.evidence_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_origin       evidence.evidence_origin_enum NOT NULL,
  classification        security.information_classification_enum NOT NULL DEFAULT 'SENSITIVE',
  chain_of_custody      jsonb NOT NULL,
  license_terms         jsonb NULL,
  consent_id            uuid NULL,
  derived_from_evidence_id uuid NULL,
  legacy_status         text NULL,
  legacy_source         varchar(100) NULL,
  legacy_record_id      text NULL,
  migration_confidence  varchar(10) NULL CHECK (migration_confidence IN ('HIGH','MEDIUM','LOW')),
  migration_review_status varchar(30) NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_evidence_records_derived_from FOREIGN KEY (derived_from_evidence_id) REFERENCES evidence.evidence_records(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_evidence_records_legacy ON evidence.evidence_records (legacy_source, legacy_record_id)
  WHERE legacy_record_id IS NOT NULL;

-- asset_uri renamed to storage_ref, content_hash added (both NOT NULL,
-- matches Prisma EvidenceAsset); mime_type made NOT NULL (matches Prisma).
CREATE TABLE IF NOT EXISTS evidence.evidence_assets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id  uuid NOT NULL UNIQUE,
  storage_ref  text NOT NULL,
  content_hash text NOT NULL,
  mime_type    varchar(100) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_evidence_assets_evidence FOREIGN KEY (evidence_id) REFERENCES evidence.evidence_records(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_evidence_assets_content_hash ON evidence.evidence_assets (content_hash);

CREATE TABLE IF NOT EXISTS evidence.evidence_versions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_asset_id    uuid NOT NULL,
  transformation       varchar(100) NOT NULL,
  storage_ref          text NOT NULL,
  classification       security.information_classification_enum NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_evidence_versions_asset FOREIGN KEY (evidence_asset_id) REFERENCES evidence.evidence_assets(id) ON DELETE RESTRICT
);

-- assessed_by_actor_id made NOT NULL (matches Prisma), assessed_by_actor_type
-- added (was missing), assessment_notes renamed to notes, authenticity_score/
-- relevance_score (decimal(5,2)) added — were missing entirely.
CREATE TABLE IF NOT EXISTS evidence.evidence_assessments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id            uuid NOT NULL,
  assessed_by_actor_type security.actor_type_enum NOT NULL,
  assessed_by_actor_id   uuid NOT NULL,
  authenticity_score     decimal(5,2) NULL,
  relevance_score        decimal(5,2) NULL,
  notes                  text NULL,
  assessed_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_evidence_assessments_evidence FOREIGN KEY (evidence_id) REFERENCES evidence.evidence_records(id) ON DELETE RESTRICT
);

-- link_method/status/confidence retained (already correct shape) but the
-- 2 required actor columns (linked_by_actor_type/linked_by_actor_id) were
-- missing and are added; justification/revoked_at added — all present on
-- Prisma's ObservationEvidenceLink model.
CREATE TABLE IF NOT EXISTS evidence.observation_evidence_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id    uuid NOT NULL,
  evidence_id       uuid NOT NULL,
  link_type         evidence.observation_evidence_link_type_enum NOT NULL,
  linked_by_actor_type security.actor_type_enum NOT NULL,
  linked_by_actor_id   uuid NOT NULL,
  link_method       evidence.link_method_enum NOT NULL,
  confidence        evidence.confidence_level_enum NOT NULL,
  justification     text NULL,
  status            evidence.link_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz NULL,
  CONSTRAINT fk_oel_observation FOREIGN KEY (observation_id) REFERENCES evidence.observations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_oel_evidence FOREIGN KEY (evidence_id) REFERENCES evidence.evidence_records(id) ON DELETE RESTRICT,
  CONSTRAINT ck_oel_confidence_not_null CHECK (confidence IS NOT NULL)
);

-- Confirmation/Refutation/Corroboration are Observation<->Observation
-- self-referential relations in schema.target.prisma (confirmedBy/
-- refutedBy/corroboratedBy ANOTHER Observation) — NOT Observation<->Actor
-- relations. Corrected to match; the previous actor-based shape is removed.
CREATE TABLE IF NOT EXISTS evidence.confirmations (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id              uuid NOT NULL,
  confirmed_by_observation_id uuid NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_confirmations_observation FOREIGN KEY (observation_id) REFERENCES evidence.observations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_confirmations_confirmed_by FOREIGN KEY (confirmed_by_observation_id) REFERENCES evidence.observations(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS evidence.refutations (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id            uuid NOT NULL,
  refuted_by_observation_id uuid NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_refutations_observation FOREIGN KEY (observation_id) REFERENCES evidence.observations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_refutations_refuted_by FOREIGN KEY (refuted_by_observation_id) REFERENCES evidence.observations(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS evidence.contradictions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_a_type evidence.contradiction_party_type_enum NOT NULL,
  party_a_id   uuid NOT NULL,
  party_b_type evidence.contradiction_party_type_enum NOT NULL,
  party_b_id   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_contradictions_party_a ON evidence.contradictions (party_a_type, party_a_id);
CREATE INDEX IF NOT EXISTS ix_contradictions_party_b ON evidence.contradictions (party_b_type, party_b_id);

CREATE TABLE IF NOT EXISTS evidence.corroborations (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id                uuid NOT NULL,
  corroborated_by_observation_id uuid NOT NULL,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_corroborations_observation FOREIGN KEY (observation_id) REFERENCES evidence.observations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_corroborations_corroborated_by FOREIGN KEY (corroborated_by_observation_id) REFERENCES evidence.observations(id) ON DELETE RESTRICT
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
  FOR ALL USING ( security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, 'SENSITIVE') );

ALTER TABLE evidence.refutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.refutations FORCE ROW LEVEL SECURITY;
CREATE POLICY refutations_inherit ON evidence.refutations
  FOR ALL USING ( security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, 'SENSITIVE') );

ALTER TABLE evidence.contradictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.contradictions FORCE ROW LEVEL SECURITY;
CREATE POLICY contradictions_classification ON evidence.contradictions
  FOR ALL USING ( security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, 'SENSITIVE') );

ALTER TABLE evidence.corroborations ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.corroborations FORCE ROW LEVEL SECURITY;
CREATE POLICY corroborations_inherit ON evidence.corroborations
  FOR ALL USING ( security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, 'SENSITIVE') );

-- ============================================================
-- 5. Grants
-- ============================================================
-- SCHEMA-LEVEL USAGE (corrective session): table grants below are
-- unreachable without USAGE on their schema ("permission denied for
-- schema <x>" fires before RLS is even consulted). Proven by the real
-- non-superuser RLS matrix, scripts/migration-rehearsal/sql/rls-matrix-checks.sql.
GRANT USAGE ON SCHEMA ingest TO app_api, jobs_worker, readonly_inspector;
GRANT USAGE ON SCHEMA evidence TO app_api, ingest_worker, jobs_worker, readonly_inspector;
GRANT USAGE ON SCHEMA ingest TO ingest_worker;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA ingest TO ingest_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA ingest TO app_api, jobs_worker;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA evidence TO app_api;
GRANT SELECT, INSERT ON evidence.observations, evidence.evidence_records, evidence.evidence_assets
  TO ingest_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA ingest TO readonly_inspector;
GRANT SELECT ON ALL TABLES IN SCHEMA evidence TO readonly_inspector;
