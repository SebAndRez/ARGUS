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
-- RECONCILED (this session): the `incident` schema section below is
-- transcribed column-for-column, enum-for-enum from `prisma/schema.target.prisma`
-- (the authority) — no `VERIFY_AGAINST_V1.0` marker remains on any
-- `incident.*` table. `risk.*`/`command.*` are OUT OF SCOPE for this
-- reconciliation pass (not named by the wave-4 mandate's explicit table
-- list) and are carried over unchanged from the prior draft — they still
-- carry their own `VERIFY_AGAINST_V1.0` markers, a known, separately
-- tracked gap, not silently resolved here.
--
-- Concurrency (Fase 12): incident.incident_promotions gets 3 UNIQUE
-- constraints (candidate, incident, idempotency_key) — the physical
-- mechanism that makes double-promotion structurally impossible, not just
-- application-level. incident.discard_decisions gets 1 UNIQUE constraint
-- (candidate) — the same mechanism for "no second discard".

CREATE SCHEMA IF NOT EXISTS incident;
CREATE SCHEMA IF NOT EXISTS risk;
CREATE SCHEMA IF NOT EXISTS command;

-- ============================================================
-- 1. Local enums (incident.* values transcribed verbatim from
--    schema.target.prisma; risk.*/command.* unchanged, out of scope)
-- ============================================================
DO $$ BEGIN CREATE TYPE incident.incident_candidate_status_enum AS ENUM
  ('UNDER_ASSESSMENT','PROMOTING','PROMOTED','DISCARDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE incident.hypothesis_status_enum AS ENUM ('ACTIVE','DISCARDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE incident.incident_verification_status_enum AS ENUM
  ('UNCONFIRMED','PARTIALLY_CONFIRMED','CONFIRMED','DISPUTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE incident.incident_operational_status_enum AS ENUM
  ('DETECTED','ASSESSING','ACTIVE','CONTAINED','MITIGATING','RESOLVED','CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE incident.incident_preventive_status_enum AS ENUM
  ('NONE','MONITORING','PREVENTIVE_ACTION','STANDBY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE incident.incident_trend_enum AS ENUM
  ('UNKNOWN','IMPROVING','STABLE','WORSENING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE incident.incident_structural_status_enum AS ENUM
  ('INDEPENDENT','PARENT','CHILD','MERGED','SPLIT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE incident.sub_incident_status_enum AS ENUM ('ACTIVE','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE incident.incident_relation_type_enum AS ENUM
  ('CAUSES','CAUSED_BY','CONSEQUENCE_OF','ASSOCIATED_WITH','PROPAGATED_FROM','AFFECTS','SUPERSEDES',
   'DERIVED_FROM','SECONDARY_THREAT_OF','GROUPING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE incident.incident_state_dimension_enum AS ENUM
  ('VERIFICATION','OPERATIONAL','PREVENTIVE','TREND','STRUCTURAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE incident.incident_link_type_enum AS ENUM
  ('RELEVANT_CONTEXT','TRIGGERING','CORROBORATING','CONTRADICTING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE incident.incident_link_status_enum AS ENUM ('RELEVANT','MARKED_IRRELEVANT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE incident.causality_enum AS ENUM ('DIRECT','INDIRECT','UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RECONCILED (corrective session): value sets transcribed from
-- schema.target.prisma's RiskAssessmentStatus/ForecastStatus/
-- RiskScenarioStatus — 'CLOSED'->'REVISED' and 'DISCARDED'->'REPLACED'
-- were prior-draft inventions with no authority.
DO $$ BEGIN CREATE TYPE risk.risk_assessment_status_enum AS ENUM ('ACTIVE','REVISED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #39, 2
DO $$ BEGIN CREATE TYPE risk.forecast_status_enum AS ENUM ('ACTIVE','SUPERSEDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #40, 2
DO $$ BEGIN CREATE TYPE risk.risk_scenario_status_enum AS ENUM ('ACTIVE','REPLACED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #41, 2

-- RECONCILED (corrective session): recommendation_status_enum was
-- ('PENDING','ACTED_ON') — schema.target.prisma's RecommendationStatus is
-- ('ACTIVE','OVERRIDDEN'), matching the HumanOverride override semantics.
DO $$ BEGIN CREATE TYPE command.command_structure_status_enum AS ENUM ('ACTIVE','DISSOLVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #42, 2
DO $$ BEGIN CREATE TYPE command.recommendation_status_enum AS ENUM ('ACTIVE','OVERRIDDEN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #43, 2

-- ============================================================
-- 2. incident schema — 17 tables
-- ============================================================

-- correlation_key/classification/promotion_started_at added (were missing);
-- closed_at removed (not a physical column on schema.target.prisma's
-- IncidentCandidate — terminal state is tracked via incident_promotions/
-- discard_decisions instead); legacy provenance retained (D-02, already
-- correct here, now also mirrored onto the Prisma model in this session).
CREATE TABLE IF NOT EXISTS incident.incident_candidates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status               incident.incident_candidate_status_enum NOT NULL DEFAULT 'UNDER_ASSESSMENT',
  correlation_key      text NULL,
  classification       security.information_classification_enum NOT NULL DEFAULT 'OPERATIONAL',
  promotion_started_at timestamptz NULL,
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL CHECK (migration_confidence IN ('HIGH','MEDIUM','LOW')),
  migration_review_status varchar(30) NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_incident_candidates_legacy ON incident.incident_candidates (legacy_source, legacy_record_id)
  WHERE legacy_record_id IS NOT NULL;

-- Full ficha given directly in Table Catalog v1.1 (P1-01) — unchanged, already correct.
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

-- status enum values fixed (ACTIVE/DISCARDED, matches Prisma HypothesisStatus) — column shape already matched.
CREATE TABLE IF NOT EXISTS incident.hypotheses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_candidate_id uuid NOT NULL,
  description           text NOT NULL,
  status                incident.hypothesis_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_hypotheses_candidate FOREIGN KEY (incident_candidate_id) REFERENCES incident.incident_candidates(id) ON DELETE CASCADE
);

-- incident.incidents created before incident_promotions (FK target)
-- origin_candidate_id/title/description ADDED (all present, NOT declared,
-- on schema.target.prisma — were missing entirely); incident_type_id made
-- NOT NULL (matches Prisma); preventive_status/trend/structural_status
-- made NOT NULL WITH DEFAULT (matches Prisma defaults NONE/UNKNOWN/
-- INDEPENDENT — were nullable with no default); legacy provenance retained.
CREATE TABLE IF NOT EXISTS incident.incidents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_candidate_id  uuid NULL,
  verification_status  incident.incident_verification_status_enum NOT NULL DEFAULT 'UNCONFIRMED',
  operational_status   incident.incident_operational_status_enum NOT NULL DEFAULT 'DETECTED',
  preventive_status    incident.incident_preventive_status_enum NOT NULL DEFAULT 'NONE',
  trend                incident.incident_trend_enum NOT NULL DEFAULT 'UNKNOWN',
  structural_status    incident.incident_structural_status_enum NOT NULL DEFAULT 'INDEPENDENT',
  incident_type_id     uuid NOT NULL,
  classification       security.information_classification_enum NOT NULL DEFAULT 'CRITICAL',
  title                varchar(255) NOT NULL,
  description          text NULL,
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL CHECK (migration_confidence IN ('HIGH','MEDIUM','LOW')),
  migration_review_status varchar(30) NULL CHECK (migration_review_status IN
    ('AUTO_MAPPED','REQUIRES_REVIEW','REVIEWED_APPROVED','REVIEWED_REJECTED')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  closed_at            timestamptz NULL,
  CONSTRAINT fk_incidents_incident_type FOREIGN KEY (incident_type_id) REFERENCES governance.incident_types(id) ON DELETE RESTRICT,
  CONSTRAINT fk_incidents_origin_candidate FOREIGN KEY (origin_candidate_id) REFERENCES incident.incident_candidates(id) ON DELETE RESTRICT,
  CONSTRAINT uq_incidents_origin_candidate_id UNIQUE (origin_candidate_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_legacy ON incident.incidents (legacy_source, legacy_record_id)
  WHERE legacy_record_id IS NOT NULL;

-- Rebuilt to match schema.target.prisma's IncidentPromotion exactly:
-- decided_by_actor_type, automation_rule_id, automation_rule_version,
-- input_data_snapshot, confidence, explanation, idempotency_key all ADDED
-- (were entirely missing). 3 UNIQUE constraints ADDED — these are the
-- physical mechanism (Fase 12) making double promotion of the same
-- candidate, double promotion into the same incident, and a duplicate
-- idempotent retry all structurally impossible, not just
-- application-checked.
CREATE TABLE IF NOT EXISTS incident.incident_promotions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_candidate_id uuid NOT NULL,
  incident_id           uuid NOT NULL,
  decided_by_actor_type security.actor_type_enum NOT NULL,
  decided_by_actor_id   uuid NOT NULL,
  automation_rule_id    uuid NULL,
  automation_rule_version integer NULL,
  input_data_snapshot   jsonb NOT NULL,
  confidence            evidence.confidence_level_enum NOT NULL,
  explanation           text NOT NULL,
  idempotency_key       uuid NOT NULL,
  decided_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_incident_promotions_candidate FOREIGN KEY (incident_candidate_id) REFERENCES incident.incident_candidates(id) ON DELETE RESTRICT,
  CONSTRAINT fk_incident_promotions_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_incident_promotions_automation_rule FOREIGN KEY (automation_rule_id) REFERENCES governance.automation_rules(id) ON DELETE SET NULL,
  CONSTRAINT uq_incident_promotions_candidate UNIQUE (incident_candidate_id),
  CONSTRAINT uq_incident_promotions_incident UNIQUE (incident_id),
  CONSTRAINT uq_incident_promotions_idempotency UNIQUE (idempotency_key),
  CONSTRAINT ck_incident_promotions_actor_or_rule CHECK (
    (decided_by_actor_type = 'AUTOMATION_RULE' AND automation_rule_id IS NOT NULL)
    OR (decided_by_actor_type <> 'AUTOMATION_RULE')
  )
);

-- decided_by_actor_type ADDED (was missing); reason made NOT NULL (matches
-- Prisma); discarded_at renamed to decided_at (matches Prisma field name).
-- UNIQUE constraint on incident_candidate_id ADDED (SQL_COMPLEMENTARY_REQUIRED
-- — Prisma has no native unique here, but Fase 10/12's "no second discard"
-- invariant requires one; additive, never contradicts the Prisma model).
CREATE TABLE IF NOT EXISTS incident.discard_decisions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_candidate_id uuid NOT NULL,
  decided_by_actor_type security.actor_type_enum NOT NULL,
  decided_by_actor_id   uuid NOT NULL,
  reason                text NOT NULL,
  decided_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_discard_decisions_candidate FOREIGN KEY (incident_candidate_id) REFERENCES incident.incident_candidates(id) ON DELETE RESTRICT,
  -- SQL_COMPLEMENTARY_REQUIRED (Fase 10/12): at most one discard per candidate.
  CONSTRAINT uq_discard_decisions_candidate UNIQUE (incident_candidate_id)
);

CREATE TABLE IF NOT EXISTS incident.sub_incidents (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id                  uuid NOT NULL,
  area                         geography(Polygon,4326) NOT NULL,
  status                       incident.sub_incident_status_enum NOT NULL DEFAULT 'ACTIVE',
  responsible_organization_id  uuid NULL,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_sub_incidents_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_incidents_organization FOREIGN KEY (responsible_organization_id) REFERENCES institution.organizations(id) ON DELETE SET NULL,
  CONSTRAINT ck_sub_incidents_area_not_null CHECK (area IS NOT NULL)
);

-- relation_type enum values fixed (matches Prisma IncidentRelationType exactly).
CREATE TABLE IF NOT EXISTS incident.incident_relations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_incident_id  uuid NOT NULL,
  target_incident_id  uuid NOT NULL,
  relation_type       incident.incident_relation_type_enum NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_incident_relations_source FOREIGN KEY (source_incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_incident_relations_target FOREIGN KEY (target_incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT
);

-- reason/confidence/decided_by_actor_type ADDED (all NOT NULL per Prisma IncidentMerge — were missing).
CREATE TABLE IF NOT EXISTS incident.incident_merges (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_incident_id  uuid NOT NULL,
  reason              text NOT NULL,
  confidence          evidence.confidence_level_enum NOT NULL,
  decided_by_actor_type security.actor_type_enum NOT NULL,
  decided_by_actor_id uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_incident_merges_result FOREIGN KEY (result_incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT
);

-- Full ficha given directly in Table Catalog v1.1 (P1-01) — unchanged, already correct.
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

-- criterion/decided_by_actor_type ADDED (NOT NULL per Prisma IncidentSplit — were missing).
CREATE TABLE IF NOT EXISTS incident.incident_splits (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_incident_id  uuid NOT NULL,
  criterion             text NOT NULL,
  decided_by_actor_type security.actor_type_enum NOT NULL,
  decided_by_actor_id   uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_incident_splits_original FOREIGN KEY (original_incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT
);

-- Full ficha given directly in Table Catalog v1.1 (P1-01) — unchanged, already correct.
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

-- from_value/to_value renamed to previous_value/new_value (matches Prisma
-- IncidentTransition field names); reason/evidence_id/decided_by_actor_type
-- ADDED (all present on Prisma — were missing); transitioned_at renamed to
-- occurred_at; dimension enum values fixed (short names: VERIFICATION/
-- OPERATIONAL/PREVENTIVE/TREND/STRUCTURAL). Legacy provenance retained.
CREATE TABLE IF NOT EXISTS incident.incident_transitions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id          uuid NOT NULL,
  dimension            incident.incident_state_dimension_enum NOT NULL,
  previous_value       varchar(50) NULL,
  new_value            varchar(50) NOT NULL,
  reason               text NULL,
  evidence_id          uuid NULL,
  decided_by_actor_type security.actor_type_enum NOT NULL,
  decided_by_actor_id  uuid NOT NULL,
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL,
  migration_review_status varchar(30) NULL,
  occurred_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_incident_transitions_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_incident_transitions_evidence FOREIGN KEY (evidence_id) REFERENCES evidence.evidence_records(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_incident_transitions_legacy ON incident.incident_transitions (legacy_source, legacy_record_id)
  WHERE legacy_record_id IS NOT NULL;
-- SQL_COMPLEMENTARY_REQUIRED: partition RANGE(occurred_at) monthly, deferred until 10M rows/5GB/degradation (D-04).

-- link_type/status enum values fixed to match Prisma exactly;
-- linked_by_actor_type/method/causality/justification ADDED (all present
-- on Prisma IncidentObservationLink — were missing/incomplete).
CREATE TABLE IF NOT EXISTS incident.incident_observation_links (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id        uuid NOT NULL,
  observation_id     uuid NOT NULL,
  link_type          incident.incident_link_type_enum NOT NULL,
  linked_by_actor_type security.actor_type_enum NOT NULL,
  linked_by_actor_id uuid NOT NULL,
  method             evidence.link_method_enum NOT NULL,
  confidence         evidence.confidence_level_enum NOT NULL,
  causality          incident.causality_enum NULL,
  status             incident.incident_link_status_enum NOT NULL DEFAULT 'RELEVANT',
  justification      text NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_iol_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_iol_observation FOREIGN KEY (observation_id) REFERENCES evidence.observations(id) ON DELETE RESTRICT,
  CONSTRAINT ck_iol_confidence_not_null CHECK (confidence IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_iol_incident_id ON incident.incident_observation_links (incident_id);

CREATE TABLE IF NOT EXISTS incident.incident_evidence_links (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id        uuid NOT NULL,
  evidence_id        uuid NOT NULL,
  link_type          incident.incident_link_type_enum NOT NULL,
  linked_by_actor_type security.actor_type_enum NOT NULL,
  linked_by_actor_id uuid NOT NULL,
  method             evidence.link_method_enum NOT NULL,
  confidence         evidence.confidence_level_enum NOT NULL,
  causality          incident.causality_enum NULL,
  status             incident.incident_link_status_enum NOT NULL DEFAULT 'RELEVANT',
  justification      text NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_iel_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_iel_evidence FOREIGN KEY (evidence_id) REFERENCES evidence.evidence_records(id) ON DELETE RESTRICT,
  CONSTRAINT ck_iel_confidence_not_null CHECK (confidence IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_iel_incident_id ON incident.incident_evidence_links (incident_id);

-- Renamed from affected_area_versions to match Prisma's AffectedAreaVersion
-- @@map exactly (already "affected_area_versions" — unchanged); bounding_box_cache
-- ADDED (present on Prisma — was missing).
CREATE TABLE IF NOT EXISTS incident.affected_area_versions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id        uuid NOT NULL,
  version_number     integer NOT NULL,
  geometry           geography(MultiPolygon,4326) NOT NULL,
  bounding_box_cache geography(Polygon,4326) NULL,
  centroid_cache     geography(Point,4326) NULL,
  superseded_by_id   uuid NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_affected_area_versions_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_affected_area_versions_superseded FOREIGN KEY (superseded_by_id) REFERENCES incident.affected_area_versions(id) ON DELETE SET NULL,
  CONSTRAINT uq_affected_area_versions_incident_number UNIQUE (incident_id, version_number)
);
CREATE INDEX IF NOT EXISTS gix_affected_area_versions_geometry ON incident.affected_area_versions USING GIST (geometry);

-- alias_scope ADDED (varchar(50) NOT NULL, present on Prisma — was missing).
CREATE TABLE IF NOT EXISTS incident.incident_aliases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id  uuid NOT NULL,
  alias        varchar(255) NOT NULL,
  alias_scope  varchar(50) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_incident_aliases_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT,
  CONSTRAINT uq_incident_aliases_alias UNIQUE (alias)
);

-- ============================================================
-- 3. risk schema — 6 tables
-- ============================================================
-- RECONCILED (corrective session): transcribed column-for-column from
-- schema.target.prisma's RiskAssessment/Forecast/RiskScenario/
-- ExposedPopulation/RiskAssessmentRevision/RiskAreaVersion models. No
-- `VERIFY_AGAINST_V1.0` marker remains on any risk.* table.
--
-- D-02 legacy provenance is carried ONLY by the 2 tables that actually
-- receive backfill per ARGUS_BACKFILL_CATALOG_v1.0.md Fase 9
-- (`risk_assessments` <- RiskAssessment, 45 rows; `risk_assessment_revisions`
-- <- RiskAssessmentRevision, 50 rows) — the other 4 risk.* tables receive
-- no backfill and therefore carry no mixin (D-02 mandates it for
-- backfilled tables, not universally).

-- classification/status/created_at match Prisma; legacy provenance retained
-- (real backfill recipient, 45 rows).
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

-- RECONCILED: risk_assessment_id made NULLABLE (Prisma `String?` with
-- onDelete: SetNull — a NOT NULL column can never receive SET NULL);
-- forecast_horizon renamed to `horizon` and made NOT NULL (Prisma
-- `Unsupported("interval")`, no `?`); `scenario` text NOT NULL ADDED (was
-- missing entirely); created_at renamed to issued_at (Prisma `issuedAt`).
CREATE TABLE IF NOT EXISTS risk.forecasts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_assessment_id uuid NULL,
  horizon            interval NOT NULL,
  scenario           text NOT NULL,
  status             risk.forecast_status_enum NOT NULL DEFAULT 'ACTIVE',
  issued_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_forecasts_risk_assessment FOREIGN KEY (risk_assessment_id) REFERENCES risk.risk_assessments(id) ON DELETE SET NULL
);

-- RECONCILED: `probability` numeric(5,2) NULL ADDED (was missing);
-- created_at REMOVED (not on the Prisma model); ON DELETE CASCADE
-- (Prisma `onDelete: Cascade`, was RESTRICT).
CREATE TABLE IF NOT EXISTS risk.risk_scenarios (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_assessment_id uuid NOT NULL,
  description        text NOT NULL,
  probability        numeric(5,2) NULL,
  status             risk.risk_scenario_status_enum NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT fk_risk_scenarios_risk_assessment FOREIGN KEY (risk_assessment_id) REFERENCES risk.risk_assessments(id) ON DELETE CASCADE
);

-- RECONCILED: estimated_count renamed to population_estimate (Prisma
-- `populationEstimate`); `classification` ADDED (was missing, Prisma
-- default RESTRICTED); created_at REMOVED (not on the Prisma model);
-- ON DELETE CASCADE (Prisma `onDelete: Cascade`, was RESTRICT).
CREATE TABLE IF NOT EXISTS risk.exposed_populations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_assessment_id       uuid NOT NULL,
  administrative_area_id   uuid NULL,   -- FK to geo.administrative_areas deferred to Wave 080
  operational_zone_id      uuid NULL,   -- FK to geo.operational_zones deferred to Wave 080
  population_estimate      integer NULL,
  classification           security.information_classification_enum NOT NULL DEFAULT 'RESTRICTED',
  CONSTRAINT fk_exposed_populations_risk_assessment FOREIGN KEY (risk_assessment_id) REFERENCES risk.risk_assessments(id) ON DELETE CASCADE
);

-- RECONCILED: `changes` jsonb NULL renamed to `content_snapshot` jsonb
-- NOT NULL (Prisma `contentSnapshot Json`, no `?`); constraint renamed to
-- the Prisma @@unique map name. Legacy provenance retained (real backfill
-- recipient, 50 rows).
CREATE TABLE IF NOT EXISTS risk.risk_assessment_revisions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_assessment_id   uuid NOT NULL,
  revision_number      integer NOT NULL,
  content_snapshot     jsonb NOT NULL,
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL,
  migration_review_status varchar(30) NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_rar_risk_assessment FOREIGN KEY (risk_assessment_id) REFERENCES risk.risk_assessments(id) ON DELETE RESTRICT,
  CONSTRAINT uq_risk_assessment_revisions_number UNIQUE (risk_assessment_id, revision_number)
);

-- Column shape already matched Prisma; only the UNIQUE constraint name was
-- reconciled to the Prisma @@unique map name.
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
  CONSTRAINT uq_risk_area_versions_number UNIQUE (risk_assessment_id, version_number)
);
CREATE INDEX IF NOT EXISTS gix_risk_area_versions_geometry ON risk.risk_area_versions USING GIST (geometry);

-- ============================================================
-- 4. command schema — 6 tables
-- ============================================================
-- RECONCILED (corrective session): transcribed column-for-column from
-- schema.target.prisma's IncidentCommandStructure/CommandRole/
-- CommandHandover/OperationalDecision/AutomatedRecommendation/
-- HumanOverride models. No `VERIFY_AGAINST_V1.0` marker remains on any
-- command.* table.
--
-- No command.* table receives backfill (confirmed against
-- ARGUS_BACKFILL_CATALOG_v1.0.md Fase 9 — command.* appears in no wave's
-- backfill list), so per D-02 no command.* table carries the legacy
-- provenance mixin. `automated_recommendations` previously carried it
-- with no backfill to justify it — removed.

-- RECONCILED: established_at renamed to created_at (Prisma `createdAt`);
-- UNIQUE on incident_id ADDED (Prisma `@unique(map:
-- "uq_incident_command_structures_incident_id")` — at most one command
-- structure per incident, was missing).
CREATE TABLE IF NOT EXISTS command.incident_command_structures (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id   uuid NOT NULL,
  status        command.command_structure_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at    timestamptz NOT NULL DEFAULT now(),
  dissolved_at  timestamptz NULL,
  CONSTRAINT fk_ics_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT,
  CONSTRAINT uq_incident_command_structures_incident_id UNIQUE (incident_id)
);

-- Full ficha given directly in Table Catalog v1.1 (P1-01) — already matched
-- schema.target.prisma's CommandRole column-for-column, unchanged.
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

-- RECONCILED: from_actor_type/from_actor_id (both NULL — the first handover
-- of an incident has no predecessor) and to_actor_type (NOT NULL) ADDED —
-- all three present on Prisma's CommandHandover, all three were missing;
-- handed_over_at renamed to occurred_at (Prisma `occurredAt`).
CREATE TABLE IF NOT EXISTS command.command_handovers (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_command_structure_id uuid NOT NULL,
  from_actor_type                security.actor_type_enum NULL,
  from_actor_id                  uuid NULL,
  to_actor_type                  security.actor_type_enum NOT NULL,
  to_actor_id                    uuid NOT NULL,
  occurred_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_command_handovers_structure FOREIGN KEY (incident_command_structure_id) REFERENCES command.incident_command_structures(id) ON DELETE RESTRICT
);

-- RECONCILED: decided_by_actor_type ADDED (present on Prisma, was missing);
-- decided_by_actor_id made NOT NULL (Prisma `String`, no `?` — an
-- operational decision always has a decider, that is the whole point of
-- the table).
CREATE TABLE IF NOT EXISTS command.operational_decisions (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_command_structure_id uuid NOT NULL,
  decided_by_actor_type          security.actor_type_enum NOT NULL,
  decided_by_actor_id            uuid NOT NULL,
  description                    text NOT NULL,
  decided_at                     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_operational_decisions_structure FOREIGN KEY (incident_command_structure_id) REFERENCES command.incident_command_structures(id) ON DELETE RESTRICT
);

-- RECONCILED: generated_by_rule_id + its FK to governance.automation_rules
-- ADDED (present on Prisma, was missing — this is the audit link back to
-- the AutomationRule that produced the recommendation);
-- recommendation_text renamed to `content` (Prisma `content`); created_at
-- renamed to generated_at (Prisma `generatedAt`); default status is now
-- 'ACTIVE' (matching the reconciled enum); legacy provenance mixin REMOVED
-- (no backfill targets this table — see section note above).
CREATE TABLE IF NOT EXISTS command.automated_recommendations (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_command_structure_id uuid NOT NULL,
  generated_by_rule_id           uuid NULL,
  content                        text NOT NULL,
  status                          command.recommendation_status_enum NOT NULL DEFAULT 'ACTIVE',
  generated_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_automated_recommendations_structure FOREIGN KEY (incident_command_structure_id) REFERENCES command.incident_command_structures(id) ON DELETE RESTRICT,
  CONSTRAINT fk_automated_recommendations_rule FOREIGN KEY (generated_by_rule_id) REFERENCES governance.automation_rules(id) ON DELETE SET NULL
);

-- RECONCILED: overridden_by_actor_type ADDED (present on Prisma, was
-- missing); overridden_by_actor_id made NOT NULL; `reason` text NULL
-- renamed to `justification` text NOT NULL (Prisma `justification String`
-- — a Clause V human-override safeguard record with no justification would
-- defeat its own purpose); UNIQUE on automated_recommendation_id ADDED
-- (Prisma `@unique(map: "uq_human_overrides_recommendation_id")` — at most
-- one override per recommendation, was missing).
CREATE TABLE IF NOT EXISTS command.human_overrides (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automated_recommendation_id  uuid NOT NULL,
  overridden_by_actor_type     security.actor_type_enum NOT NULL,
  overridden_by_actor_id       uuid NOT NULL,
  justification                text NOT NULL,
  overridden_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_human_overrides_recommendation FOREIGN KEY (automated_recommendation_id) REFERENCES command.automated_recommendations(id) ON DELETE RESTRICT,
  CONSTRAINT uq_human_overrides_recommendation_id UNIQUE (automated_recommendation_id)
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
  FOR ALL USING (
    current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN')
    AND security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, classification)
  );

ALTER TABLE incident.incident_candidate_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.incident_candidate_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY ico_inherit ON incident.incident_candidate_observations
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE incident.hypotheses ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.hypotheses FORCE ROW LEVEL SECURITY;
CREATE POLICY hypotheses_inherit ON incident.hypotheses
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

-- IncidentPromotion is the promotion decision record — visible to the
-- deciding actor, anyone with a command role on the resulting incident, or
-- audit_reader (never USING(true); Fase 13).
ALTER TABLE incident.incident_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.incident_promotions FORCE ROW LEVEL SECURITY;
CREATE POLICY incident_promotions_scoped ON incident.incident_promotions
  FOR ALL USING (
    decided_by_actor_id = current_setting('argus.actor_id')::uuid
    OR security.fn_has_command_role(current_setting('argus.actor_id')::uuid, incident_id)
    OR current_user = 'audit_reader'
  );

ALTER TABLE incident.discard_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident.discard_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY discard_decisions_scoped ON incident.discard_decisions
  FOR ALL USING (
    decided_by_actor_id = current_setting('argus.actor_id')::uuid
    OR current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN','AUDIT_READER')
  );

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
-- Now reads the row's OWN classification column (added by the corrective
-- session's risk.* reconciliation) instead of a hardcoded 'RESTRICTED'
-- literal — the row's real classification is what Access Control v1.1 §3's
-- formula requires.
CREATE POLICY exposed_populations_restricted ON risk.exposed_populations
  FOR ALL USING ( security.fn_classification_allowed(current_setting('argus.actor_id')::uuid, classification) );

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
-- SCHEMA-LEVEL USAGE (corrective session): table grants below are
-- unreachable without USAGE on their schema ("permission denied for
-- schema <x>" fires before RLS is even consulted). Proven by the real
-- non-superuser RLS matrix, scripts/migration-rehearsal/sql/rls-matrix-checks.sql.
GRANT USAGE ON SCHEMA incident TO app_api, ingest_worker, jobs_worker, readonly_inspector;
GRANT USAGE ON SCHEMA risk TO app_api, jobs_worker, readonly_inspector;
GRANT USAGE ON SCHEMA command TO app_api, readonly_inspector;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA incident TO app_api;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA risk TO app_api;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA command TO app_api;
GRANT SELECT ON ALL TABLES IN SCHEMA incident TO ingest_worker, jobs_worker, readonly_inspector;
GRANT SELECT ON ALL TABLES IN SCHEMA risk TO jobs_worker, readonly_inspector;
GRANT SELECT ON ALL TABLES IN SCHEMA command TO readonly_inspector;

-- ============================================================
-- 8. security.fn_has_command_role — REAL body (corrective session)
-- ============================================================
-- 010_foundation/rls_policies.sql defines this function as a
-- `SELECT false` stub (documented there) because `command.command_roles`/
-- `command.incident_command_structures` do not exist at wave 010 time, and
-- `CREATE FUNCTION ... LANGUAGE sql` validates table references against
-- the catalog at creation time (confirmed empirically — a real body in
-- wave 010 fails that wave outright with "relation does not exist").
-- Redefined here, now that this wave has created both tables (and
-- institution.institutional_memberships already exists from wave 020).
--
-- Rejects: actor absent, incident absent, no command_roles row for that
-- (actor, incident) pair, a REVOKED role (revoked_at IS NOT NULL), a role
-- not yet in effect (assigned_at > now()), a command structure that is not
-- ACTIVE or has been dissolved, and — the corrective mandate's explicit
-- addition over the original stub's own sketch — an EXPIRED or non-ACTIVE
-- institutional membership when the role is tied to one
-- (`institutional_membership_id` is nullable on `command_roles`: some
-- command roles are held by actors without a modeled institutional
-- membership, e.g. `actor_type='SYSTEM'`, in which case the membership
-- check does not apply).
CREATE OR REPLACE FUNCTION security.fn_has_command_role(p_actor_id uuid, p_incident_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM command.command_roles cr
    JOIN command.incident_command_structures ics ON ics.id = cr.incident_command_structure_id
    LEFT JOIN institution.institutional_memberships im ON im.id = cr.institutional_membership_id
    WHERE p_actor_id IS NOT NULL
      AND p_incident_id IS NOT NULL
      AND ics.incident_id = p_incident_id
      AND cr.actor_id = p_actor_id
      AND cr.revoked_at IS NULL
      AND cr.assigned_at <= now()
      AND ics.status = 'ACTIVE'
      AND ics.dissolved_at IS NULL
      AND (
        cr.institutional_membership_id IS NULL
        OR (im.status = 'ACTIVE' AND (im.effective_to IS NULL OR im.effective_to > now()))
      )
  );
$$;
