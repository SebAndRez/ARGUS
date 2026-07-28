-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 040 — Incident (+ Risk & Command)
-- Schemas: incident (17 tables), risk (6 tables), command (6 tables) = 29
-- tables. D-02 applies (5-dimension state split on incident.incidents,
-- 5-column legacy provenance on every backfilled table).
--
-- PLACEMENT NOTE: the mandate's wave-to-schema assignment list did not
-- explicitly name `risk.*`/`command.*` in any of the 11 waves. Both schemas
-- have a direct, non-deferrable FK dependency on incident.incidents
-- (risk.risk_assessments.incident_id, command.incident_command_structures.incident_id)
-- and are conceptually part of the incident-response lifecycle (risk
-- assessment precedes/accompanies an incident candidate; command structure
-- exists only once an incident is promoted) — they are placed in this wave
-- as the most defensible single home, flagged explicitly here and in the
-- final report rather than silently omitted.
--
-- Authority: ARGUS_PHYSICAL_TABLE_CATALOG_v1.1_FROZEN.md §incident/§risk/
-- §command, ARGUS_PHYSICAL_ACCESS_CONTROL_v1.1_FROZEN.md §4.6-4.8,
-- ARGUS_MIGRATION_DECISION_REGISTER_v1.0_FROZEN.md D-02.
--
-- VERIFY_AGAINST_V1.0: all tables except the 3 with full fichas given
-- directly in Table Catalog v1.1 (`incident.incident_candidate_observations`,
-- `incident.incident_merge_sources`, `incident.incident_split_targets`,
-- `command.command_roles`, `risk.risk_assessments` partial,
-- `risk.risk_area_versions` partial) are reconstructed from cross-referenced
-- clues, flagged per table.

CREATE SCHEMA IF NOT EXISTS incident;
CREATE SCHEMA IF NOT EXISTS risk;
CREATE SCHEMA IF NOT EXISTS command;

-- ============================================================
-- 1. Local enums
-- ============================================================
DO $$ BEGIN CREATE TYPE incident.incident_candidate_status_enum AS ENUM
  ('OPEN','CORRELATING','PROMOTED','DISCARDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #24, 4
DO $$ BEGIN CREATE TYPE incident.hypothesis_status_enum AS ENUM ('OPEN','RESOLVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #25, 2
DO $$ BEGIN CREATE TYPE incident.incident_verification_status_enum AS ENUM
  ('UNVERIFIED','PENDING','VERIFIED','DISPUTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #26, 4
DO $$ BEGIN CREATE TYPE incident.incident_operational_status_enum AS ENUM
  ('ACTIVE','CONTAINED','MITIGATING','RESOLVED','MONITORING','ARCHIVED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #27, 7
DO $$ BEGIN CREATE TYPE incident.incident_preventive_status_enum AS ENUM
  ('NONE','WATCH','WARNING','ALERT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #28, 4
DO $$ BEGIN CREATE TYPE incident.incident_trend_enum AS ENUM
  ('IMPROVING','STABLE','WORSENING','UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #29, 4
DO $$ BEGIN CREATE TYPE incident.incident_structural_status_enum AS ENUM
  ('SINGLE','MERGED','SPLIT','SUB_INCIDENT','RELATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #30, 5
DO $$ BEGIN CREATE TYPE incident.sub_incident_status_enum AS ENUM ('ACTIVE','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #31, 2
DO $$ BEGIN CREATE TYPE incident.incident_relation_type_enum AS ENUM
  ('RELATED','DUPLICATE_OF','CAUSED_BY','PRECEDES','FOLLOWS','ESCALATES','DE_ESCALATES',
   'PART_OF','CONTAINS','REFERENCES'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #32, 10
DO $$ BEGIN CREATE TYPE incident.incident_state_dimension_enum AS ENUM
  ('VERIFICATION_STATUS','OPERATIONAL_STATUS','PREVENTIVE_STATUS','TREND','STRUCTURAL_STATUS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #33, 5, D-02 5-dimension split
DO $$ BEGIN CREATE TYPE incident.incident_link_type_enum AS ENUM
  ('PRIMARY','SUPPORTING','CONTEXTUAL','SUPERSEDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #34, 4
DO $$ BEGIN CREATE TYPE incident.incident_link_status_enum AS ENUM ('ACTIVE','RETRACTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #35, 2
DO $$ BEGIN CREATE TYPE incident.causality_enum AS ENUM ('DIRECT','CONTRIBUTING','COINCIDENTAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #36, 3

DO $$ BEGIN CREATE TYPE risk.risk_assessment_status_enum AS ENUM ('ACTIVE','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #39, 2
DO $$ BEGIN CREATE TYPE risk.forecast_status_enum AS ENUM ('ACTIVE','SUPERSEDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #40, 2
DO $$ BEGIN CREATE TYPE risk.risk_scenario_status_enum AS ENUM ('ACTIVE','DISCARDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #41, 2

DO $$ BEGIN CREATE TYPE command.command_structure_status_enum AS ENUM ('ACTIVE','DISSOLVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #42, 2
DO $$ BEGIN CREATE TYPE command.recommendation_status_enum AS ENUM ('PENDING','ACTED_ON'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #43, 2

-- ============================================================
-- 2. incident schema — 17 tables
-- ============================================================

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS incident.incident_candidates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status               incident.incident_candidate_status_enum NOT NULL DEFAULT 'OPEN',
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL CHECK (migration_confidence IN ('HIGH','MEDIUM','LOW')),
  migration_review_status varchar(30) NULL,
  opened_at            timestamptz NOT NULL DEFAULT now(),
  closed_at            timestamptz NULL
);

-- Full ficha given directly in Table Catalog v1.1 (P1-01) — transcribed verbatim.
CREATE TABLE IF NOT EXISTS incident.incident_candidate_observations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_candidate_id  uuid NOT NULL,
  observation_id         uuid NOT NULL,
  correlation_confidence evidence.confidence_level_enum NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_ico_candidate FOREIGN KEY (incident_candidate_id) REFERENCES incident.incident_candidates(id) ON DELETE CASCADE,
  CONSTRAINT fk_ico_observation FOREIGN KEY (observation_id) REFERENCES evidence.observations(id) ON DELETE RESTRICT,
  CONSTRAINT uq_ico_candidate_observation UNIQUE (incident_candidate_id, observation_id),
  CONSTRAINT ck_ico_confidence_not_null CHECK (correlation_confidence IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_ico_incident_candidate_id ON incident.incident_candidate_observations (incident_candidate_id);
CREATE INDEX IF NOT EXISTS ix_ico_observation_id ON incident.incident_candidate_observations (observation_id);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS incident.hypotheses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_candidate_id uuid NOT NULL,
  description           text NOT NULL,
  status                incident.hypothesis_status_enum NOT NULL DEFAULT 'OPEN',
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_hypotheses_candidate FOREIGN KEY (incident_candidate_id) REFERENCES incident.incident_candidates(id) ON DELETE CASCADE
);

-- incident.incidents created before incident_promotions (FK target)
-- VERIFY_AGAINST_V1.0. T-02 (D-02): 5 dimensions strictly separated, never
-- collapsed into a single "status" column.
CREATE TABLE IF NOT EXISTS incident.incidents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_status  incident.incident_verification_status_enum NOT NULL DEFAULT 'UNVERIFIED',
  operational_status   incident.incident_operational_status_enum NOT NULL DEFAULT 'ACTIVE',
  preventive_status    incident.incident_preventive_status_enum NULL,
  trend                incident.incident_trend_enum NULL,
  structural_status    incident.incident_structural_status_enum NULL,
  incident_type_id     uuid NULL,
  classification       security.information_classification_enum NOT NULL DEFAULT 'CRITICAL',
  location             geography(Point,4326) NULL,
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL CHECK (migration_confidence IN ('HIGH','MEDIUM','LOW')),
  migration_review_status varchar(30) NULL CHECK (migration_review_status IN
    ('AUTO_MAPPED','REQUIRES_REVIEW','REVIEWED_APPROVED','REVIEWED_REJECTED')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  closed_at            timestamptz NULL,
  CONSTRAINT fk_incidents_incident_type FOREIGN KEY (incident_type_id) REFERENCES governance.incident_types(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS gix_incidents_location ON incident.incidents USING GIST (location);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS incident.incident_promotions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_candidate_id uuid NOT NULL,
  incident_id           uuid NOT NULL,
  decided_by_actor_id   uuid NULL,
  promoted_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_incident_promotions_candidate FOREIGN KEY (incident_candidate_id) REFERENCES incident.incident_candidates(id) ON DELETE RESTRICT,
  CONSTRAINT fk_incident_promotions_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS incident.discard_decisions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_candidate_id uuid NOT NULL,
  decided_by_actor_id   uuid NULL,
  reason                text NULL,
  discarded_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_discard_decisions_candidate FOREIGN KEY (incident_candidate_id) REFERENCES incident.incident_candidates(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS incident.sub_incidents (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id                  uuid NOT NULL,
  responsible_organization_id  uuid NULL,
  status                       incident.sub_incident_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at                   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_sub_incidents_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sub_incidents_organization FOREIGN KEY (responsible_organization_id) REFERENCES institution.organizations(id) ON DELETE SET NULL
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS incident.incident_relations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_incident_id  uuid NOT NULL,
  target_incident_id  uuid NOT NULL,
  relation_type       incident.incident_relation_type_enum NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_incident_relations_source FOREIGN KEY (source_incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_incident_relations_target FOREIGN KEY (target_incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS incident.incident_merges (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_incident_id  uuid NOT NULL,
  decided_by_actor_id uuid NULL,
  merged_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_incident_merges_result FOREIGN KEY (result_incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT
);

-- Full ficha given directly in Table Catalog v1.1 (P1-01).
CREATE TABLE IF NOT EXISTS incident.incident_merge_sources (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_merge_id  uuid NOT NULL,
  source_incident_id uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_ims_merge FOREIGN KEY (incident_merge_id) REFERENCES incident.incident_merges(id) ON DELETE CASCADE,
  CONSTRAINT fk_ims_source FOREIGN KEY (source_incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT,
  CONSTRAINT uq_ims_merge_source UNIQUE (incident_merge_id, source_incident_id)
);
CREATE INDEX IF NOT EXISTS ix_ims_incident_merge_id ON incident.incident_merge_sources (incident_merge_id);
CREATE INDEX IF NOT EXISTS ix_ims_source_incident_id ON incident.incident_merge_sources (source_incident_id);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS incident.incident_splits (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_incident_id  uuid NOT NULL,
  decided_by_actor_id   uuid NULL,
  split_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_incident_splits_original FOREIGN KEY (original_incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT
);

-- Full ficha given directly in Table Catalog v1.1 (P1-01).
CREATE TABLE IF NOT EXISTS incident.incident_split_targets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_split_id   uuid NOT NULL,
  target_incident_id  uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_ist_split FOREIGN KEY (incident_split_id) REFERENCES incident.incident_splits(id) ON DELETE CASCADE,
  CONSTRAINT fk_ist_target FOREIGN KEY (target_incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT,
  CONSTRAINT uq_ist_split_target UNIQUE (incident_split_id, target_incident_id)
);
CREATE INDEX IF NOT EXISTS ix_ist_incident_split_id ON incident.incident_split_targets (incident_split_id);
CREATE INDEX IF NOT EXISTS ix_ist_target_incident_id ON incident.incident_split_targets (target_incident_id);

-- VERIFY_AGAINST_V1.0. T-03 (D-02): split by dimension.
CREATE TABLE IF NOT EXISTS incident.incident_transitions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id          uuid NOT NULL,
  dimension            incident.incident_state_dimension_enum NOT NULL,
  from_value           varchar(50) NULL,
  to_value             varchar(50) NOT NULL,
  decided_by_actor_id  uuid NULL,
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL,
  migration_review_status varchar(30) NULL,
  transitioned_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_incident_transitions_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS incident.incident_observation_links (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id        uuid NOT NULL,
  observation_id     uuid NOT NULL,
  link_type          incident.incident_link_type_enum NOT NULL,
  status             incident.incident_link_status_enum NOT NULL DEFAULT 'ACTIVE',
  linked_by_actor_id uuid NULL,
  confidence         evidence.confidence_level_enum NOT NULL,
  CONSTRAINT fk_iol_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_iol_observation FOREIGN KEY (observation_id) REFERENCES evidence.observations(id) ON DELETE RESTRICT,
  CONSTRAINT ck_iol_confidence_not_null CHECK (confidence IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_iol_incident_id ON incident.incident_observation_links (incident_id);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS incident.incident_evidence_links (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id        uuid NOT NULL,
  evidence_id        uuid NOT NULL,
  link_type          incident.incident_link_type_enum NOT NULL,
  status             incident.incident_link_status_enum NOT NULL DEFAULT 'ACTIVE',
  linked_by_actor_id uuid NULL,
  confidence         evidence.confidence_level_enum NOT NULL,
  CONSTRAINT fk_iel_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_iel_evidence FOREIGN KEY (evidence_id) REFERENCES evidence.evidence_records(id) ON DELETE RESTRICT,
  CONSTRAINT ck_iel_confidence_not_null CHECK (confidence IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_iel_incident_id ON incident.incident_evidence_links (incident_id);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS incident.affected_area_versions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id        uuid NOT NULL,
  version_number     integer NOT NULL,
  geometry           geography(MultiPolygon,4326) NOT NULL,
  centroid_cache     geography(Point,4326) NULL,
  superseded_by_id   uuid NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_affected_area_versions_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_affected_area_versions_superseded FOREIGN KEY (superseded_by_id) REFERENCES incident.affected_area_versions(id) ON DELETE SET NULL,
  CONSTRAINT uq_affected_area_versions_incident_number UNIQUE (incident_id, version_number)
);
CREATE INDEX IF NOT EXISTS gix_affected_area_versions_geometry ON incident.affected_area_versions USING GIST (geometry);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS incident.incident_aliases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id  uuid NOT NULL,
  alias        varchar(255) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_incident_aliases_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT,
  CONSTRAINT uq_incident_aliases_alias UNIQUE (alias)
);

-- ============================================================
-- 3. risk schema — 6 tables
-- ============================================================

-- Partial ficha given directly in Table Catalog v1.1 (P1-02/Corrección#8) —
-- hazard_type_id column transcribed verbatim, rest VERIFY_AGAINST_V1.0.
CREATE TABLE IF NOT EXISTS risk.risk_assessments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hazard_type_id        uuid NOT NULL,
  incident_candidate_id uuid NULL,
  incident_id           uuid NULL,
  classification        security.information_classification_enum NOT NULL DEFAULT 'RESTRICTED',
  status                risk.risk_assessment_status_enum NOT NULL DEFAULT 'ACTIVE',
  legacy_status         text NULL,
  legacy_source         varchar(100) NULL,
  legacy_record_id      text NULL,
  migration_confidence  varchar(10) NULL CHECK (migration_confidence IN ('HIGH','MEDIUM','LOW')),
  migration_review_status varchar(30) NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_risk_assessments_hazard_type FOREIGN KEY (hazard_type_id) REFERENCES governance.hazard_types(id) ON DELETE RESTRICT,
  CONSTRAINT fk_risk_assessments_candidate FOREIGN KEY (incident_candidate_id) REFERENCES incident.incident_candidates(id) ON DELETE SET NULL,
  CONSTRAINT fk_risk_assessments_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE SET NULL
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS risk.forecasts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_assessment_id uuid NOT NULL,
  forecast_horizon   interval NULL,
  status             risk.forecast_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_forecasts_risk_assessment FOREIGN KEY (risk_assessment_id) REFERENCES risk.risk_assessments(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS risk.risk_scenarios (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_assessment_id uuid NOT NULL,
  description        text NOT NULL,
  status             risk.risk_scenario_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_risk_scenarios_risk_assessment FOREIGN KEY (risk_assessment_id) REFERENCES risk.risk_assessments(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS risk.exposed_populations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_assessment_id       uuid NOT NULL,
  administrative_area_id   uuid NULL,   -- FK to geo.administrative_areas deferred to Wave 080
  operational_zone_id      uuid NULL,   -- FK to geo.operational_zones deferred to Wave 080
  estimated_count          integer NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_exposed_populations_risk_assessment FOREIGN KEY (risk_assessment_id) REFERENCES risk.risk_assessments(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS risk.risk_assessment_revisions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_assessment_id   uuid NOT NULL,
  revision_number      integer NOT NULL,
  changes              jsonb NULL,
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL,
  migration_review_status varchar(30) NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_rar_risk_assessment FOREIGN KEY (risk_assessment_id) REFERENCES risk.risk_assessments(id) ON DELETE RESTRICT,
  CONSTRAINT uq_rar_assessment_number UNIQUE (risk_assessment_id, revision_number)
);

-- Ficha given directly in Table Catalog v1.1 (P1-06 modification, centroid_cache).
CREATE TABLE IF NOT EXISTS risk.risk_area_versions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_assessment_id uuid NOT NULL,
  version_number     integer NOT NULL,
  geometry           geography(MultiPolygon,4326) NOT NULL,
  centroid_cache     geography(Point,4326) NULL,
  superseded_by_id   uuid NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_rav_risk_assessment FOREIGN KEY (risk_assessment_id) REFERENCES risk.risk_assessments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_rav_superseded FOREIGN KEY (superseded_by_id) REFERENCES risk.risk_area_versions(id) ON DELETE SET NULL,
  CONSTRAINT uq_rav_assessment_number UNIQUE (risk_assessment_id, version_number)
);
CREATE INDEX IF NOT EXISTS gix_risk_area_versions_geometry ON risk.risk_area_versions USING GIST (geometry);

-- ============================================================
-- 4. command schema — 6 tables
-- ============================================================

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS command.incident_command_structures (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id   uuid NOT NULL,
  status        command.command_structure_status_enum NOT NULL DEFAULT 'ACTIVE',
  established_at timestamptz NOT NULL DEFAULT now(),
  dissolved_at  timestamptz NULL,
  CONSTRAINT fk_ics_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT
);

-- Full ficha given directly in Table Catalog v1.1 (P1-01) — transcribed verbatim.
CREATE TABLE IF NOT EXISTS command.command_roles (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_command_structure_id uuid NOT NULL,
  actor_type                     security.actor_type_enum NOT NULL,
  actor_id                       uuid NOT NULL,
  institutional_membership_id    uuid NULL,
  role_label                     varchar(100) NOT NULL,
  assigned_at                    timestamptz NOT NULL DEFAULT now(),
  revoked_at                     timestamptz NULL,
  CONSTRAINT fk_command_roles_structure FOREIGN KEY (incident_command_structure_id) REFERENCES command.incident_command_structures(id) ON DELETE CASCADE,
  CONSTRAINT fk_command_roles_membership FOREIGN KEY (institutional_membership_id) REFERENCES institution.institutional_memberships(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_command_roles_structure_id ON command.command_roles (incident_command_structure_id);
CREATE INDEX IF NOT EXISTS ix_command_roles_actor ON command.command_roles (actor_type, actor_id);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS command.command_handovers (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_command_structure_id uuid NOT NULL,
  to_actor_id                    uuid NOT NULL,
  handed_over_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_command_handovers_structure FOREIGN KEY (incident_command_structure_id) REFERENCES command.incident_command_structures(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS command.operational_decisions (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_command_structure_id uuid NOT NULL,
  decided_by_actor_id            uuid NULL,
  description                    text NOT NULL,
  decided_at                     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_operational_decisions_structure FOREIGN KEY (incident_command_structure_id) REFERENCES command.incident_command_structures(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS command.automated_recommendations (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_command_structure_id uuid NOT NULL,
  recommendation_text            text NOT NULL,
  status                          command.recommendation_status_enum NOT NULL DEFAULT 'PENDING',
  legacy_status                  text NULL,
  legacy_source                  varchar(100) NULL,
  legacy_record_id                text NULL,
  migration_confidence            varchar(10) NULL,
  migration_review_status         varchar(30) NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_automated_recommendations_structure FOREIGN KEY (incident_command_structure_id) REFERENCES command.incident_command_structures(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS command.human_overrides (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automated_recommendation_id  uuid NOT NULL,
  overridden_by_actor_id       uuid NULL,
  reason                       text NULL,
  overridden_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_human_overrides_recommendation FOREIGN KEY (automated_recommendation_id) REFERENCES command.automated_recommendations(id) ON DELETE RESTRICT
);

-- ============================================================
-- 5. Deferred FK from Wave 010
-- ============================================================
ALTER TABLE security.audit_logs
  ADD CONSTRAINT fk_audit_logs_incident
  FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE SET NULL;

-- ============================================================
-- 6. RLS (Access Control v1.1 §4.6-4.8)
-- ============================================================
ALTER TABLE incident.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.incidents FORCE ROW LEVEL SECURITY;
CREATE POLICY incidents_assignment_or_command ON incident.incidents
  FOR ALL USING (
    security.fn_has_command_role(current_setting('argus.actor_id')::uuid, id)
    AND security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, classification)
  );

ALTER TABLE incident.incident_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.incident_candidates FORCE ROW LEVEL SECURITY;
CREATE POLICY incident_candidates_operational ON incident.incident_candidates
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE incident.incident_candidate_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.incident_candidate_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY ico_inherit ON incident.incident_candidate_observations
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE incident.hypotheses ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.hypotheses FORCE ROW LEVEL SECURITY;
CREATE POLICY hypotheses_inherit ON incident.hypotheses
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE incident.incident_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.incident_promotions FORCE ROW LEVEL SECURITY;
CREATE POLICY incident_promotions_inherit ON incident.incident_promotions
  FOR ALL USING ( EXISTS (SELECT 1 FROM incident.incidents i WHERE i.id = incident_id
    AND security.fn_has_command_role(current_setting('argus.actor_id')::uuid, i.id)) );

ALTER TABLE incident.discard_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.discard_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY discard_decisions_inherit ON incident.discard_decisions
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE incident.sub_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.sub_incidents FORCE ROW LEVEL SECURITY;
CREATE POLICY sub_incidents_inherit ON incident.sub_incidents
  FOR ALL USING ( security.fn_has_command_role(current_setting('argus.actor_id')::uuid, incident_id) );

ALTER TABLE incident.incident_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.incident_relations FORCE ROW LEVEL SECURITY;
CREATE POLICY incident_relations_inherit ON incident.incident_relations
  FOR ALL USING (
    security.fn_has_command_role(current_setting('argus.actor_id')::uuid, source_incident_id)
    OR security.fn_has_command_role(current_setting('argus.actor_id')::uuid, target_incident_id)
  );

ALTER TABLE incident.incident_merges ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.incident_merges FORCE ROW LEVEL SECURITY;
CREATE POLICY incident_merges_inherit ON incident.incident_merges
  FOR ALL USING ( security.fn_has_command_role(current_setting('argus.actor_id')::uuid, result_incident_id) );

ALTER TABLE incident.incident_merge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.incident_merge_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY ims_inherit ON incident.incident_merge_sources
  FOR ALL USING ( security.fn_has_command_role(current_setting('argus.actor_id')::uuid, source_incident_id) );

ALTER TABLE incident.incident_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.incident_splits FORCE ROW LEVEL SECURITY;
CREATE POLICY incident_splits_inherit ON incident.incident_splits
  FOR ALL USING ( security.fn_has_command_role(current_setting('argus.actor_id')::uuid, original_incident_id) );

ALTER TABLE incident.incident_split_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.incident_split_targets FORCE ROW LEVEL SECURITY;
CREATE POLICY ist_inherit ON incident.incident_split_targets
  FOR ALL USING ( security.fn_has_command_role(current_setting('argus.actor_id')::uuid, target_incident_id) );

ALTER TABLE incident.incident_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.incident_transitions FORCE ROW LEVEL SECURITY;
CREATE POLICY incident_transitions_inherit ON incident.incident_transitions
  FOR ALL USING ( security.fn_has_command_role(current_setting('argus.actor_id')::uuid, incident_id) );

ALTER TABLE incident.incident_observation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.incident_observation_links FORCE ROW LEVEL SECURITY;
CREATE POLICY iol_inherit ON incident.incident_observation_links
  FOR ALL USING ( security.fn_has_command_role(current_setting('argus.actor_id')::uuid, incident_id) );

ALTER TABLE incident.incident_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.incident_evidence_links FORCE ROW LEVEL SECURITY;
CREATE POLICY iel_inherit ON incident.incident_evidence_links
  FOR ALL USING ( security.fn_has_command_role(current_setting('argus.actor_id')::uuid, incident_id) );

ALTER TABLE incident.affected_area_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.affected_area_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY affected_area_versions_inherit ON incident.affected_area_versions
  FOR ALL USING ( security.fn_has_command_role(current_setting('argus.actor_id')::uuid, incident_id) );

ALTER TABLE incident.incident_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.incident_aliases FORCE ROW LEVEL SECURITY;
CREATE POLICY incident_aliases_operational ON incident.incident_aliases
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

-- risk.* — RESTRICTED, actor_role='OPERATIONAL' AND classification_allowed
ALTER TABLE risk.risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk.risk_assessments FORCE ROW LEVEL SECURITY;
CREATE POLICY risk_assessments_operational ON risk.risk_assessments
  FOR ALL USING (
    current_setting('argus.actor_role', true) = 'OPERATIONAL'
    AND security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, classification)
  );

ALTER TABLE risk.forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk.forecasts FORCE ROW LEVEL SECURITY;
CREATE POLICY forecasts_inherit ON risk.forecasts
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE risk.risk_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk.risk_scenarios FORCE ROW LEVEL SECURITY;
CREATE POLICY risk_scenarios_inherit ON risk.risk_scenarios
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE risk.exposed_populations ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk.exposed_populations FORCE ROW LEVEL SECURITY;
CREATE POLICY exposed_populations_restricted ON risk.exposed_populations
  FOR ALL USING ( security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, 'RESTRICTED') );

ALTER TABLE risk.risk_assessment_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk.risk_assessment_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY rar_inherit ON risk.risk_assessment_revisions
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE risk.risk_area_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk.risk_area_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY rav_inherit ON risk.risk_area_versions
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

-- command.* — RESTRICTED, fn_has_command_role
ALTER TABLE command.incident_command_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE command.incident_command_structures FORCE ROW LEVEL SECURITY;
CREATE POLICY ics_command_role ON command.incident_command_structures
  FOR ALL USING ( security.fn_has_command_role(current_setting('argus.actor_id')::uuid, incident_id) );

ALTER TABLE command.command_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE command.command_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY command_roles_own_or_command ON command.command_roles
  FOR ALL USING (
    actor_id = current_setting('argus.actor_id')::uuid
    OR EXISTS (SELECT 1 FROM command.incident_command_structures ics WHERE ics.id = incident_command_structure_id
      AND security.fn_has_command_role(current_setting('argus.actor_id')::uuid, ics.incident_id))
  );

ALTER TABLE command.command_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE command.command_handovers FORCE ROW LEVEL SECURITY;
CREATE POLICY command_handovers_inherit ON command.command_handovers
  FOR ALL USING ( EXISTS (SELECT 1 FROM command.incident_command_structures ics WHERE ics.id = incident_command_structure_id
    AND security.fn_has_command_role(current_setting('argus.actor_id')::uuid, ics.incident_id)) );

ALTER TABLE command.operational_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE command.operational_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY operational_decisions_inherit ON command.operational_decisions
  FOR ALL USING ( EXISTS (SELECT 1 FROM command.incident_command_structures ics WHERE ics.id = incident_command_structure_id
    AND security.fn_has_command_role(current_setting('argus.actor_id')::uuid, ics.incident_id)) );

ALTER TABLE command.automated_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE command.automated_recommendations FORCE ROW LEVEL SECURITY;
CREATE POLICY automated_recommendations_inherit ON command.automated_recommendations
  FOR ALL USING ( EXISTS (SELECT 1 FROM command.incident_command_structures ics WHERE ics.id = incident_command_structure_id
    AND security.fn_has_command_role(current_setting('argus.actor_id')::uuid, ics.incident_id)) );

ALTER TABLE command.human_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE command.human_overrides FORCE ROW LEVEL SECURITY;
CREATE POLICY human_overrides_inherit ON command.human_overrides
  FOR ALL USING ( EXISTS (SELECT 1 FROM command.automated_recommendations ar
    JOIN command.incident_command_structures ics ON ics.id = ar.incident_command_structure_id
    WHERE ar.id = automated_recommendation_id
      AND security.fn_has_command_role(current_setting('argus.actor_id')::uuid, ics.incident_id)) );

-- ============================================================
-- 7. Grants
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA incident TO app_api;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA risk TO app_api;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA command TO app_api;
GRANT SELECT ON ALL TABLES IN SCHEMA incident TO ingest_worker, jobs_worker, readonly_inspector;
GRANT SELECT ON ALL TABLES IN SCHEMA risk TO jobs_worker, readonly_inspector;
GRANT SELECT ON ALL TABLES IN SCHEMA command TO readonly_inspector;
