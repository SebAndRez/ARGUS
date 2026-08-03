-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 080 — Geography
-- Schema: geo (8 tables). D-07 governs `geo.administrative_areas`: created
-- with full provenance-tracking columns but left EMPTY of geometry data
-- until an approved official cartographic source is selected.
--
-- Authority: ARGUS_PHYSICAL_TABLE_CATALOG_v1.1_FROZEN.md §geo,
-- ARGUS_PHYSICAL_ACCESS_CONTROL_v1.1_FROZEN.md §4.20, §7,
-- ARGUS_MIGRATION_DECISION_REGISTER_v1.0_FROZEN.md D-07.
--
-- VERIFY_AGAINST_V1.0: `geo.administrative_areas`, `geo.operational_zones`,
-- `geo.operational_routes`, `geo.perimeters` have full fichas given directly
-- in Table Catalog v1.1 and transcribed verbatim (plus D-07's provenance
-- columns, which are new structure this session adds per the Decision
-- Register, not present in any prior ficha). The remaining 4 tables
-- (`operational_sectors`, `extraction_points`, `reception_points`,
-- `meeting_points`) are reconstructed from cross-referenced clues.

CREATE SCHEMA IF NOT EXISTS geo;

-- ============================================================
-- 1. Local enums
-- ============================================================
DO $$ BEGIN CREATE TYPE geo.operational_zone_status_enum AS ENUM ('ACTIVE','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #107, 2
DO $$ BEGIN CREATE TYPE geo.operational_sector_status_enum AS ENUM ('ACTIVE','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #108, 2
DO $$ BEGIN CREATE TYPE geo.extraction_reception_status_enum AS ENUM
  ('PLANNED','ACTIVE','SATURATED','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #109, 4
DO $$ BEGIN CREATE TYPE geo.meeting_point_status_enum AS ENUM
  ('PLANNED','ACTIVE','SATURATED','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #110, 4
DO $$ BEGIN CREATE TYPE geo.route_status_enum AS ENUM ('PROPOSED','ACCEPTED','REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #111, 3
DO $$ BEGIN CREATE TYPE geo.perimeter_status_enum AS ENUM ('ACTIVE','LIFTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #112, 2

-- ============================================================
-- 2. Tables
-- ============================================================

-- Full ficha given directly in Table Catalog v1.1 (P1-02/P1-06) plus D-07's
-- required provenance columns (source_id, source_version, effective_from,
-- effective_to, acquisition_method, geometry_validation_status) — D-07:
-- CREATE_EMPTY, no boundary populated until an approved official
-- cartographic source is selected. bbox is NEVER used as canonical geometry.
CREATE TABLE IF NOT EXISTS geo.administrative_areas (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                       varchar(255) NOT NULL,
  area_kind_id               uuid NOT NULL,
  boundary                   geography(MultiPolygon,4326) NOT NULL,
  centroid_cache             geography(Point,4326) NULL,
  version                    integer NOT NULL DEFAULT 1,
  source_id                  varchar(100) NULL,
  source_version             varchar(50) NULL,
  effective_from             timestamptz NULL,
  effective_to               timestamptz NULL,
  acquisition_method         varchar(100) NULL,
  geometry_validation_status varchar(30) NULL CHECK (geometry_validation_status IN
    ('UNVALIDATED','VALIDATED','REJECTED')),
  CONSTRAINT fk_administrative_areas_kind FOREIGN KEY (area_kind_id) REFERENCES governance.administrative_area_kinds(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS gix_administrative_areas_boundary ON geo.administrative_areas USING GIST (boundary);
-- D-07: no INSERT of any row into this table is included in this migration —
-- the schema is created, deliberately left empty (CREATE_EMPTY), pending
-- proveedor cartográfico oficial selection (a decision outside this
-- mandate's scope, documented as an open blocker).

-- Full ficha given directly in Table Catalog v1.1 (P1-06) — transcribed verbatim.
CREATE TABLE IF NOT EXISTS geo.operational_zones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id    uuid NOT NULL,
  boundary       geography(Polygon,4326) NOT NULL,
  centroid_cache geography(Point,4326) NULL,
  status         geo.operational_zone_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at     timestamptz NOT NULL DEFAULT now(),
  closed_at      timestamptz NULL,
  CONSTRAINT fk_operational_zones_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS gix_operational_zones_boundary ON geo.operational_zones USING GIST (boundary);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS geo.operational_sectors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operational_zone_id uuid NOT NULL,
  boundary            geography(Polygon,4326) NULL,
  status              geo.operational_sector_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_operational_sectors_zone FOREIGN KEY (operational_zone_id) REFERENCES geo.operational_zones(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS gix_operational_sectors_boundary ON geo.operational_sectors USING GIST (boundary);

-- VERIFY_AGAINST_V1.0. D-06 route (B) candidate (subset of CriticalPoi).
CREATE TABLE IF NOT EXISTS geo.extraction_points (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id          uuid NULL,
  location             geography(Point,4326) NOT NULL,
  status               geo.extraction_reception_status_enum NOT NULL DEFAULT 'PLANNED',
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL,
  migration_review_status varchar(30) NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_extraction_points_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS gix_extraction_points_location ON geo.extraction_points USING GIST (location);

-- VERIFY_AGAINST_V1.0. D-06 route (B) candidate.
CREATE TABLE IF NOT EXISTS geo.reception_points (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id          uuid NULL,
  location             geography(Point,4326) NOT NULL,
  status               geo.extraction_reception_status_enum NOT NULL DEFAULT 'PLANNED',
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL,
  migration_review_status varchar(30) NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_reception_points_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS gix_reception_points_location ON geo.reception_points USING GIST (location);

-- VERIFY_AGAINST_V1.0. D-06 route (B): destination for the CriticalPoi
-- subset classified as passive operational point (NOT FamilyPlan — v1.1
-- corrects v1.0's mistaken FamilyPlan.primaryMeetingPoint mapping).
CREATE TABLE IF NOT EXISTS geo.meeting_points (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id          uuid NULL,
  location             geography(Point,4326) NOT NULL,
  status               geo.meeting_point_status_enum NOT NULL DEFAULT 'PLANNED',
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL,
  migration_review_status varchar(30) NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_meeting_points_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS gix_meeting_points_location ON geo.meeting_points USING GIST (location);

-- Full ficha given directly in Table Catalog v1.1 (P2-07) — transcribed verbatim.
CREATE TABLE IF NOT EXISTS geo.operational_routes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id            uuid NULL,
  path                  geography(LineString,4326) NOT NULL,
  status                geo.route_status_enum NOT NULL DEFAULT 'PROPOSED',
  decided_by_actor_type security.actor_type_enum NULL,
  decided_by_actor_id   uuid NULL,
  replaced_route_id     uuid NULL,
  version               integer NOT NULL DEFAULT 1,
  CONSTRAINT fk_operational_routes_mission FOREIGN KEY (mission_id) REFERENCES mission.missions(id) ON DELETE SET NULL,
  CONSTRAINT fk_operational_routes_replaced FOREIGN KEY (replaced_route_id) REFERENCES geo.operational_routes(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS gix_operational_routes_path ON geo.operational_routes USING GIST (path);

-- Full ficha given directly in Table Catalog v1.1 (P1-06) — transcribed verbatim.
CREATE TABLE IF NOT EXISTS geo.perimeters (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id    uuid NOT NULL,
  boundary       geography(Polygon,4326) NOT NULL,
  centroid_cache geography(Point,4326) NULL,
  status         geo.perimeter_status_enum NOT NULL DEFAULT 'ACTIVE',
  version        integer NOT NULL DEFAULT 1,
  CONSTRAINT fk_perimeters_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS gix_perimeters_boundary ON geo.perimeters USING GIST (boundary);

-- ============================================================
-- 3. Deferred FKs from prior waves — now resolvable
-- ============================================================
ALTER TABLE governance.jurisdictions
  ADD CONSTRAINT fk_jurisdictions_primary_administrative_area
  FOREIGN KEY (primary_administrative_area_id) REFERENCES geo.administrative_areas(id) ON DELETE RESTRICT;

ALTER TABLE risk.exposed_populations
  ADD CONSTRAINT fk_exposed_populations_administrative_area
  FOREIGN KEY (administrative_area_id) REFERENCES geo.administrative_areas(id) ON DELETE SET NULL;

ALTER TABLE risk.exposed_populations
  ADD CONSTRAINT fk_exposed_populations_operational_zone
  FOREIGN KEY (operational_zone_id) REFERENCES geo.operational_zones(id) ON DELETE SET NULL;

ALTER TABLE mission.mission_meeting_point_assignments
  ADD CONSTRAINT fk_mmpa_meeting_point
  FOREIGN KEY (meeting_point_id) REFERENCES geo.meeting_points(id) ON DELETE SET NULL;

-- ============================================================
-- 4. RLS (Access Control v1.1 §4.20, §7)
-- ============================================================
-- geo.administrative_areas: PUBLIC — exempt from RLS (Access Control v1.1
-- §7), protected by GRANT only (write exclusive to migration_owner/governance).
-- No ALTER TABLE ... ENABLE ROW LEVEL SECURITY here — deliberate.

ALTER TABLE geo.operational_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.operational_zones FORCE ROW LEVEL SECURITY;
CREATE POLICY operational_zones_assignment ON geo.operational_zones
  FOR ALL USING ( security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid,
    (SELECT id FROM mission.missions WHERE operational_need_id IN
      (SELECT id FROM help.operational_needs WHERE incident_id = operational_zones.incident_id) LIMIT 1))
    OR security.fn_has_command_role(current_setting('argus.actor_id')::uuid, incident_id) );

ALTER TABLE geo.operational_sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.operational_sectors FORCE ROW LEVEL SECURITY;
CREATE POLICY operational_sectors_inherit ON geo.operational_sectors
  FOR ALL USING ( EXISTS (SELECT 1 FROM geo.operational_zones oz WHERE oz.id = operational_zone_id
    AND security.fn_has_command_role(current_setting('argus.actor_id')::uuid, oz.incident_id)) );

ALTER TABLE geo.extraction_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.extraction_points FORCE ROW LEVEL SECURITY;
CREATE POLICY extraction_points_operational ON geo.extraction_points
  FOR ALL USING ( security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['OPERATIONAL','ADMIN']) );

ALTER TABLE geo.reception_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.reception_points FORCE ROW LEVEL SECURITY;
CREATE POLICY reception_points_operational ON geo.reception_points
  FOR ALL USING ( security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['OPERATIONAL','ADMIN']) );

ALTER TABLE geo.meeting_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.meeting_points FORCE ROW LEVEL SECURITY;
CREATE POLICY meeting_points_served_via_assignment ON geo.meeting_points
  FOR ALL USING ( EXISTS (SELECT 1 FROM mission.mission_meeting_point_assignments mmpa
    WHERE mmpa.meeting_point_id = meeting_points.id
      AND security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, mmpa.mission_id))
    OR security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['OPERATIONAL','ADMIN']) );

ALTER TABLE geo.operational_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.operational_routes FORCE ROW LEVEL SECURITY;
CREATE POLICY operational_routes_mission_scoped ON geo.operational_routes
  FOR ALL USING ( security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, mission_id) );

ALTER TABLE geo.perimeters ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.perimeters FORCE ROW LEVEL SECURITY;
CREATE POLICY perimeters_command_role ON geo.perimeters
  FOR ALL USING ( security.fn_has_command_role(current_setting('argus.actor_id')::uuid, incident_id) );

-- ============================================================
-- 5. Grants
-- ============================================================
-- SCHEMA-LEVEL USAGE (corrective session): table grants below are
-- unreachable without USAGE on their schema ("permission denied for
-- schema <x>" fires before RLS is even consulted). Proven by the real
-- non-superuser RLS matrix, scripts/migration-rehearsal/sql/rls-matrix-checks.sql.
GRANT USAGE ON SCHEMA geo TO app_api, ingest_worker, jobs_worker, readonly_inspector;
GRANT SELECT ON geo.administrative_areas TO app_api, ingest_worker, jobs_worker, readonly_inspector;
-- Write to administrative_areas is exclusive to migration_owner (no GRANT to
-- any runtime role) — enforces the PUBLIC-catalog "write exclusive to
-- governance" pattern from Access Control v1.1 §7.
GRANT SELECT, INSERT, UPDATE ON geo.operational_zones, geo.operational_sectors, geo.extraction_points,
  geo.reception_points, geo.meeting_points, geo.operational_routes, geo.perimeters TO app_api;
GRANT SELECT ON geo.operational_zones, geo.operational_sectors, geo.extraction_points,
  geo.reception_points, geo.meeting_points, geo.operational_routes, geo.perimeters
  TO jobs_worker, readonly_inspector;

-- ============================================================
-- 6. R31 â€” Incident â†’ OperationalZone â†’ Jurisdiction â†’ Command scope
-- ============================================================
-- BLOCKER R31. Before this section the model had no persisted path from an
-- incident to a jurisdiction: `geo.operational_zones` carries the incident
-- that OWNS it, and `governance.jurisdictions` carries an administrative
-- area, but nothing joined the two â€” so `security.fn_has_command_role`
-- could only ask "does this actor hold a command_roles row on this
-- incident", never "and does that role's jurisdictional scope actually
-- cover this incident".
--
-- Physical decision (authorized, not re-derived here):
--
--   incident.incidents
--     -> geo.incident_operational_zone_assignments   (M:N, temporal, audited)
--     -> geo.operational_zones
--     -> geo.operational_zone_jurisdiction_assignments (M:N, temporal, audited)
--     -> governance.jurisdictions                    (the canonical authority)
--     <- command.command_role_jurisdiction_scopes    (scope of a REAL role assignment)
--
-- Deliberately NOT done:
--   * no single `jurisdiction_id` column on `incident.incidents` â€” a scalar
--     column cannot carry kind, validity, provenance, revocation or history,
--     and would silently become a second source of truth next to the zones;
--   * no new Jurisdiction entity â€” `governance.jurisdictions` already IS the
--     canonical authority (Wave 010), so it is reused;
--   * no `ST_Intersects` inside any RLS policy â€” geometry answers WHERE
--     something is, never WHO commands it. The resolver below PROPOSES;
--     only an explicit, audited COMMAND assignment AUTHORIZES.
--
-- WAVE PLACEMENT: this section lives in Wave 080 and not in Wave 040
-- because the relation needs BOTH ends to exist. `geo.operational_zones` is
-- born here; forcing the FK into Wave 040 would reference a table that does
-- not exist yet. The matching rollback therefore removes the relation in
-- this wave's rollback.sql â€” i.e. before Wave 040 drops incident.incidents.

-- ------------------------------------------------------------
-- 6.1 Enums
-- ------------------------------------------------------------
-- PRIMARY   â€” the zone that principally DESCRIBES the incident.
-- AFFECTED  â€” a zone physically or operationally reached by the incident.
-- COMMAND   â€” a zone that GRANTS command scope over the incident.
-- MONITORINGâ€” a zone that must observe the incident, with no command authority.
-- Only COMMAND is ever consulted by security.fn_has_command_role. There is
-- deliberately NO PRIMARY -> COMMAND fallback: an incident with no COMMAND
-- assignment authorizes nobody.
DO $$ BEGIN CREATE TYPE geo.incident_zone_assignment_kind_enum AS ENUM
  ('PRIMARY','AFFECTED','COMMAND','MONITORING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- How the assignment came to exist. Load-bearing: the CHECK constraints
-- below read this column to decide whether the row is even allowed to be
-- COMMAND.
DO $$ BEGIN CREATE TYPE geo.incident_zone_resolution_method_enum AS ENUM
  ('MANUAL','OFFICIAL_SOURCE','SPATIAL_INTERSECTION','INHERITED_FROM_CANDIDATE','AUTOMATION_RULE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE geo.incident_zone_assignment_status_enum AS ENUM
  ('ACTIVE','REVOKED','SUPERSEDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE geo.zone_assignment_review_status_enum AS ENUM
  ('AUTO_APPROVED','REQUIRES_REVIEW','REVIEWED_APPROVED','REVIEWED_REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE geo.zone_jurisdiction_relation_kind_enum AS ENUM
  ('PRIMARY','OVERLAPPING','DELEGATED','SUPPORTING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE geo.zone_jurisdiction_assignment_status_enum AS ENUM
  ('ACTIVE','REVOKED','SUPERSEDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The resolver's answer vocabulary. A resolver NEVER returns "authorized".
DO $$ BEGIN CREATE TYPE geo.spatial_resolution_outcome_enum AS ENUM
  ('RESOLVED','MULTIPLE_MATCHES','NO_MATCH','INVALID_GEOMETRY','REQUIRES_REVIEW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE command.command_role_scope_status_enum AS ENUM
  ('ACTIVE','REVOKED','SUPERSEDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 6.2 governance.automation_rules â€” explicit command authorization
-- ------------------------------------------------------------
-- "AUTOMATION_RULE may create COMMAND only if the rule expressly allows it
-- and is approved". Expressed as a column ON THE RULE ITSELF rather than a
-- side table, so there is exactly one place to read and one place to audit,
-- and it cannot drift from the rule's own status/version. Default false:
-- every existing and every future rule is non-command-granting until a
-- governance decision flips it. Dropped again by this wave's rollback.
ALTER TABLE governance.automation_rules
  ADD COLUMN IF NOT EXISTS command_scope_authorized boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------
-- 6.3 geo.operational_zone_jurisdiction_assignments
-- ------------------------------------------------------------
-- geo.operational_zones had NO canonical jurisdiction reference (checked:
-- its ficha carries incident_id, boundary, centroid_cache, status only), so
-- the relation is materialized here rather than reused. Temporal and
-- revocable for the same reason as the incident relation: a jurisdiction
-- boundary decision is an administrative act with a validity window, not a
-- fact about geometry.
CREATE TABLE IF NOT EXISTS geo.operational_zone_jurisdiction_assignments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operational_zone_id         uuid NOT NULL,
  jurisdiction_id             uuid NOT NULL,
  relation_kind               geo.zone_jurisdiction_relation_kind_enum NOT NULL DEFAULT 'PRIMARY',
  status                      geo.zone_jurisdiction_assignment_status_enum NOT NULL DEFAULT 'ACTIVE',
  valid_from                  timestamptz NOT NULL DEFAULT now(),
  valid_until                 timestamptz NULL,
  provenance                  varchar(50) NOT NULL DEFAULT 'MANUAL',
  idempotency_key             uuid NOT NULL DEFAULT gen_random_uuid(),
  correlation_id              uuid NULL,
  assigned_by_subject_id      uuid NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  superseded_by_assignment_id uuid NULL,
  revoked_at                  timestamptz NULL,
  revoked_by_subject_id       uuid NULL,
  revocation_reason_code      varchar(50) NULL,
  CONSTRAINT fk_ozja_zone FOREIGN KEY (operational_zone_id)
    REFERENCES geo.operational_zones(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ozja_jurisdiction FOREIGN KEY (jurisdiction_id)
    REFERENCES governance.jurisdictions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ozja_assigned_by FOREIGN KEY (assigned_by_subject_id)
    REFERENCES security.access_subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ozja_revoked_by FOREIGN KEY (revoked_by_subject_id)
    REFERENCES security.access_subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ozja_superseded_by FOREIGN KEY (superseded_by_assignment_id)
    REFERENCES geo.operational_zone_jurisdiction_assignments(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT uq_ozja_idempotency UNIQUE (idempotency_key),
  CONSTRAINT ck_ozja_validity_window CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT ck_ozja_revocation_consistency CHECK (
    (status = 'REVOKED' AND revoked_at IS NOT NULL AND revocation_reason_code IS NOT NULL)
    OR (status <> 'REVOKED' AND revoked_at IS NULL AND revoked_by_subject_id IS NULL
        AND revocation_reason_code IS NULL)),
  CONSTRAINT ck_ozja_supersession_consistency CHECK (
    (status = 'SUPERSEDED' AND superseded_by_assignment_id IS NOT NULL)
    OR (status <> 'SUPERSEDED' AND superseded_by_assignment_id IS NULL)),
  CONSTRAINT ck_ozja_provenance_shape CHECK (provenance ~ '^[A-Z][A-Z0-9_]{2,49}$')
);
CREATE INDEX IF NOT EXISTS ix_ozja_zone ON geo.operational_zone_jurisdiction_assignments (operational_zone_id);
CREATE INDEX IF NOT EXISTS ix_ozja_jurisdiction ON geo.operational_zone_jurisdiction_assignments (jurisdiction_id);
CREATE INDEX IF NOT EXISTS ix_ozja_zone_kind_status ON geo.operational_zone_jurisdiction_assignments (operational_zone_id, relation_kind, status);
CREATE INDEX IF NOT EXISTS ix_ozja_validity ON geo.operational_zone_jurisdiction_assignments (valid_from, valid_until);
CREATE INDEX IF NOT EXISTS ix_ozja_assigned_by ON geo.operational_zone_jurisdiction_assignments (assigned_by_subject_id) WHERE assigned_by_subject_id IS NOT NULL;
-- One ACTIVE relation of a given kind per (zone, jurisdiction): two would make
-- revocation non-deterministic (revoke one, the other still authorizes).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ozja_active_equivalent
  ON geo.operational_zone_jurisdiction_assignments (operational_zone_id, jurisdiction_id, relation_kind)
  WHERE status = 'ACTIVE';
-- At most one ACTIVE PRIMARY jurisdiction per zone.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ozja_active_primary_per_zone
  ON geo.operational_zone_jurisdiction_assignments (operational_zone_id)
  WHERE relation_kind = 'PRIMARY' AND status = 'ACTIVE';

-- ------------------------------------------------------------
-- 6.4 geo.incident_operational_zone_assignments â€” THE R31 relation
-- ------------------------------------------------------------
-- Many-to-many on purpose: one incident spans several zones (it crosses a
-- boundary), and one zone hosts several incidents (a district with two
-- simultaneous events). Temporal, because command scope is granted and
-- withdrawn in time. Insert-only as HISTORY: rows are never deleted by any
-- domain operation â€” revocation and supersession are status transitions
-- that leave the original row intact, and no runtime role holds DELETE.
--
-- No PII: ids, enums and controlled codes only. Geometry is NOT copied here
-- â€” it stays on geo.operational_zones / incident.affected_area_versions.
CREATE TABLE IF NOT EXISTS geo.incident_operational_zone_assignments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id                 uuid NOT NULL,
  operational_zone_id         uuid NOT NULL,
  assignment_kind             geo.incident_zone_assignment_kind_enum NOT NULL,
  resolution_method           geo.incident_zone_resolution_method_enum NOT NULL,
  status                      geo.incident_zone_assignment_status_enum NOT NULL DEFAULT 'ACTIVE',
  valid_from                  timestamptz NOT NULL DEFAULT now(),
  valid_until                 timestamptz NULL,
  confidence                  evidence.confidence_level_enum NOT NULL DEFAULT 'UNKNOWN',
  review_status               geo.zone_assignment_review_status_enum NOT NULL DEFAULT 'REQUIRES_REVIEW',
  assigned_by_subject_id      uuid NULL,
  automation_rule_id          uuid NULL,
  source_record_id            uuid NULL,
  evidence_id                 uuid NULL,
  idempotency_key             uuid NOT NULL DEFAULT gen_random_uuid(),
  correlation_id              uuid NULL,
  provenance                  varchar(50) NOT NULL DEFAULT 'MANUAL',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  superseded_by_assignment_id uuid NULL,
  revoked_at                  timestamptz NULL,
  revoked_by_subject_id       uuid NULL,
  revocation_reason_code      varchar(50) NULL,
  CONSTRAINT fk_ioza_incident FOREIGN KEY (incident_id)
    REFERENCES incident.incidents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ioza_zone FOREIGN KEY (operational_zone_id)
    REFERENCES geo.operational_zones(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ioza_assigned_by FOREIGN KEY (assigned_by_subject_id)
    REFERENCES security.access_subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ioza_revoked_by FOREIGN KEY (revoked_by_subject_id)
    REFERENCES security.access_subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ioza_automation_rule FOREIGN KEY (automation_rule_id)
    REFERENCES governance.automation_rules(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ioza_source_record FOREIGN KEY (source_record_id)
    REFERENCES ingest.source_records(id) ON DELETE SET NULL,
  CONSTRAINT fk_ioza_evidence FOREIGN KEY (evidence_id)
    REFERENCES evidence.evidence_records(id) ON DELETE SET NULL,
  -- Self-reference is DEFERRABLE INITIALLY DEFERRED so a supersession can,
  -- inside one transaction, free the partial-unique slot on the old row
  -- (status -> SUPERSEDED, pointing at the id the successor is about to get)
  -- and then insert the successor. Immediate checking would make an atomic
  -- supersession impossible without first violating the "one ACTIVE
  -- equivalent" rule.
  --
  -- Only the REFERENCING-side check is deferred by that clause. ON DELETE
  -- RESTRICT is never deferrable in PostgreSQL whatever the constraint
  -- declares, which is exactly the behaviour wanted here: a predecessor may
  -- point at its successor across a transaction, but no DELETE can orphan a
  -- supersession chain even by accident.
  CONSTRAINT fk_ioza_superseded_by FOREIGN KEY (superseded_by_assignment_id)
    REFERENCES geo.incident_operational_zone_assignments(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT uq_ioza_idempotency UNIQUE (idempotency_key),
  CONSTRAINT ck_ioza_validity_window CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT ck_ioza_revocation_consistency CHECK (
    (status = 'REVOKED' AND revoked_at IS NOT NULL AND revocation_reason_code IS NOT NULL)
    OR (status <> 'REVOKED' AND revoked_at IS NULL AND revoked_by_subject_id IS NULL
        AND revocation_reason_code IS NULL)),
  CONSTRAINT ck_ioza_supersession_consistency CHECK (
    (status = 'SUPERSEDED' AND superseded_by_assignment_id IS NOT NULL)
    OR (status <> 'SUPERSEDED' AND superseded_by_assignment_id IS NULL)),
  -- A geographic intersection is evidence of REACH, never of AUTHORITY.
  CONSTRAINT ck_ioza_spatial_never_command CHECK (
    resolution_method <> 'SPATIAL_INTERSECTION'
    OR assignment_kind IN ('AFFECTED','MONITORING')),
  -- Promotion inherits description, never command.
  CONSTRAINT ck_ioza_inherited_never_command CHECK (
    resolution_method <> 'INHERITED_FROM_CANDIDATE'
    OR assignment_kind IN ('PRIMARY','AFFECTED','MONITORING')),
  -- COMMAND can only originate from a method a human or an expressly
  -- authorized rule stands behind.
  CONSTRAINT ck_ioza_command_requires_authorizable_method CHECK (
    assignment_kind <> 'COMMAND'
    OR resolution_method IN ('MANUAL','OFFICIAL_SOURCE','AUTOMATION_RULE')),
  -- A COMMAND row must name EXACTLY ONE authority: a real AccessSubject or a
  -- real AutomationRule. Neither is anonymous command; both at once would
  -- make "who granted this" unanswerable.
  CONSTRAINT ck_ioza_command_authority CHECK (
    assignment_kind <> 'COMMAND'
    OR ((CASE WHEN assigned_by_subject_id IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN automation_rule_id     IS NOT NULL THEN 1 ELSE 0 END)) = 1),
  -- COMMAND is an act, so it must carry the correlation id that ties the row
  -- to its audit record.
  CONSTRAINT ck_ioza_command_correlation CHECK (
    assignment_kind <> 'COMMAND' OR correlation_id IS NOT NULL),
  CONSTRAINT ck_ioza_automation_rule_method CHECK (
    resolution_method <> 'AUTOMATION_RULE' OR automation_rule_id IS NOT NULL),
  CONSTRAINT ck_ioza_provenance_shape CHECK (provenance ~ '^[A-Z][A-Z0-9_]{2,49}$')
);

CREATE INDEX IF NOT EXISTS ix_ioza_incident ON geo.incident_operational_zone_assignments (incident_id);
CREATE INDEX IF NOT EXISTS ix_ioza_zone ON geo.incident_operational_zone_assignments (operational_zone_id);
CREATE INDEX IF NOT EXISTS ix_ioza_incident_kind_status ON geo.incident_operational_zone_assignments (incident_id, assignment_kind, status);
CREATE INDEX IF NOT EXISTS ix_ioza_zone_kind_status ON geo.incident_operational_zone_assignments (operational_zone_id, assignment_kind, status);
CREATE INDEX IF NOT EXISTS ix_ioza_validity ON geo.incident_operational_zone_assignments (valid_from, valid_until);
CREATE INDEX IF NOT EXISTS ix_ioza_assigned_by ON geo.incident_operational_zone_assignments (assigned_by_subject_id) WHERE assigned_by_subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_ioza_automation_rule ON geo.incident_operational_zone_assignments (automation_rule_id) WHERE automation_rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_ioza_source_record ON geo.incident_operational_zone_assignments (source_record_id) WHERE source_record_id IS NOT NULL;

-- At most ONE active PRIMARY zone per incident. Two would make "the zone that
-- describes this incident" ambiguous, and the ambiguity would be invisible.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ioza_active_primary_per_incident
  ON geo.incident_operational_zone_assignments (incident_id)
  WHERE assignment_kind = 'PRIMARY' AND status = 'ACTIVE';
-- No duplicate ACTIVE relation of the same kind between the same pair. This
-- is what makes revocation meaningful: revoke the COMMAND assignment and no
-- twin row is left quietly authorizing.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ioza_active_equivalent
  ON geo.incident_operational_zone_assignments (incident_id, operational_zone_id, assignment_kind)
  WHERE status = 'ACTIVE';

-- ------------------------------------------------------------
-- 6.5 command.command_role_jurisdiction_scopes
-- ------------------------------------------------------------
-- Inspected first: command.command_roles carries actor + role_label +
-- institutional_membership_id and NO territorial scope, and
-- governance.jurisdiction_scopes' whitelist covers organizations/resources/
-- rules only â€” neither can express "this specific command role assignment
-- commands jurisdiction J". So the minimal missing relation is added here,
-- bound to the REAL role assignment id (command_roles.id), never to the
-- free-text role_label: a label cannot be revoked, dated, or audited.
CREATE TABLE IF NOT EXISTS command.command_role_jurisdiction_scopes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_role_id        uuid NOT NULL,
  jurisdiction_id        uuid NOT NULL,
  status                 command.command_role_scope_status_enum NOT NULL DEFAULT 'ACTIVE',
  valid_from             timestamptz NOT NULL DEFAULT now(),
  valid_until            timestamptz NULL,
  provenance             varchar(50) NOT NULL DEFAULT 'MANUAL',
  assigned_by_subject_id uuid NULL,
  idempotency_key        uuid NOT NULL DEFAULT gen_random_uuid(),
  correlation_id         uuid NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  superseded_by_scope_id uuid NULL,
  revoked_at             timestamptz NULL,
  revoked_by_subject_id  uuid NULL,
  revocation_reason_code varchar(50) NULL,
  CONSTRAINT fk_crjs_command_role FOREIGN KEY (command_role_id)
    REFERENCES command.command_roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_crjs_jurisdiction FOREIGN KEY (jurisdiction_id)
    REFERENCES governance.jurisdictions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_crjs_assigned_by FOREIGN KEY (assigned_by_subject_id)
    REFERENCES security.access_subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_crjs_revoked_by FOREIGN KEY (revoked_by_subject_id)
    REFERENCES security.access_subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_crjs_superseded_by FOREIGN KEY (superseded_by_scope_id)
    REFERENCES command.command_role_jurisdiction_scopes(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT uq_crjs_idempotency UNIQUE (idempotency_key),
  CONSTRAINT ck_crjs_validity_window CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT ck_crjs_revocation_consistency CHECK (
    (status = 'REVOKED' AND revoked_at IS NOT NULL AND revocation_reason_code IS NOT NULL)
    OR (status <> 'REVOKED' AND revoked_at IS NULL AND revoked_by_subject_id IS NULL
        AND revocation_reason_code IS NULL)),
  CONSTRAINT ck_crjs_supersession_consistency CHECK (
    (status = 'SUPERSEDED' AND superseded_by_scope_id IS NOT NULL)
    OR (status <> 'SUPERSEDED' AND superseded_by_scope_id IS NULL)),
  CONSTRAINT ck_crjs_provenance_shape CHECK (provenance ~ '^[A-Z][A-Z0-9_]{2,49}$')
);
CREATE INDEX IF NOT EXISTS ix_crjs_command_role ON command.command_role_jurisdiction_scopes (command_role_id);
CREATE INDEX IF NOT EXISTS ix_crjs_jurisdiction ON command.command_role_jurisdiction_scopes (jurisdiction_id);
CREATE INDEX IF NOT EXISTS ix_crjs_role_status ON command.command_role_jurisdiction_scopes (command_role_id, status);
CREATE INDEX IF NOT EXISTS ix_crjs_validity ON command.command_role_jurisdiction_scopes (valid_from, valid_until);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crjs_active_equivalent
  ON command.command_role_jurisdiction_scopes (command_role_id, jurisdiction_id)
  WHERE status = 'ACTIVE';

-- ------------------------------------------------------------
-- 6.6 Effective jurisdiction â€” the canonical read path
-- ------------------------------------------------------------
-- SECURITY DEFINER because this IS an authorization primitive: it must give
-- the same, true answer regardless of which rows the calling role can see.
-- A version that returned fewer jurisdictions to a low-privilege caller
-- would fail OPEN in the mismatch direction (fewer command jurisdictions
-- seen -> "no conflict" -> access granted elsewhere), so visibility is
-- deliberately not the caller's.
--
-- Every temporal and lifecycle condition is applied HERE, once, so no caller
-- can forget one: assignment ACTIVE + not revoked + not superseded + inside
-- its validity window, zone ACTIVE + not closed, zone->jurisdiction relation
-- likewise, and the jurisdiction itself currently in force.
CREATE OR REPLACE FUNCTION geo.fn_incident_effective_jurisdictions(
  p_incident_id     uuid,
  p_assignment_kind geo.incident_zone_assignment_kind_enum DEFAULT NULL
)
RETURNS TABLE (
  jurisdiction_id           uuid,
  operational_zone_id       uuid,
  assignment_kind           geo.incident_zone_assignment_kind_enum,
  assignment_id             uuid,
  zone_jurisdiction_id      uuid,
  relation_kind             geo.zone_jurisdiction_relation_kind_enum,
  declaring_organization_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT DISTINCT
    j.id, z.id, a.assignment_kind, a.id, zja.id, zja.relation_kind, j.declaring_organization_id
  FROM geo.incident_operational_zone_assignments a
  JOIN geo.operational_zones z ON z.id = a.operational_zone_id
  JOIN geo.operational_zone_jurisdiction_assignments zja ON zja.operational_zone_id = z.id
  JOIN governance.jurisdictions j ON j.id = zja.jurisdiction_id
  WHERE p_incident_id IS NOT NULL
    AND a.incident_id = p_incident_id
    AND (p_assignment_kind IS NULL OR a.assignment_kind = p_assignment_kind)
    AND a.status = 'ACTIVE'
    AND a.revoked_at IS NULL
    AND a.superseded_by_assignment_id IS NULL
    AND a.valid_from <= now()
    AND (a.valid_until IS NULL OR a.valid_until > now())
    AND z.status = 'ACTIVE'
    AND z.closed_at IS NULL
    AND zja.status = 'ACTIVE'
    AND zja.revoked_at IS NULL
    AND zja.superseded_by_assignment_id IS NULL
    AND zja.valid_from <= now()
    AND (zja.valid_until IS NULL OR zja.valid_until > now())
    AND j.effective_from <= now()
    AND (j.effective_to IS NULL OR j.effective_to > now());
$$;

-- The command projection. Hard-wired to assignment_kind = 'COMMAND'; there is
-- no parameter that could widen it, and no fallback to PRIMARY/AFFECTED/
-- MONITORING. An incident with zones but no COMMAND assignment returns zero
-- rows, which is what makes fn_has_command_role fail closed.
CREATE OR REPLACE FUNCTION geo.fn_incident_command_jurisdictions(p_incident_id uuid)
RETURNS TABLE (
  jurisdiction_id           uuid,
  operational_zone_id       uuid,
  assignment_id             uuid,
  declaring_organization_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT e.jurisdiction_id, e.operational_zone_id, e.assignment_id, e.declaring_organization_id
  FROM geo.fn_incident_effective_jurisdictions(p_incident_id, 'COMMAND'::geo.incident_zone_assignment_kind_enum) e;
$$;

-- ------------------------------------------------------------
-- 6.7 Spatial resolver â€” PROPOSES, never authorizes
-- ------------------------------------------------------------
-- Isolated on purpose: it is the ONLY place ST_Intersects/ST_Covers/ST_Area
-- appear in the authorization story, and it is never called from an RLS
-- policy. Policies evaluate per row, per query; running geometry there would
-- put a spatial join on the hot path of every read AND would make "who
-- commands" depend on a geometry that can change under the query.
--
-- Handles, by construction: Point, Polygon, MultiPolygon, absent geometry,
-- invalid geometry, an incident crossing several zones, overlapping zones,
-- and zones with no jurisdiction attached.
-- Deterministic idempotency key for a machine-generated proposal. The same
-- (incident, zone, kind, method) tuple always maps to the same uuid, so a
-- re-run of the resolver resolves to the SAME row instead of racing
-- uq_ioza_active_equivalent and failing. IMMUTABLE and pure: it derives a
-- name, it does not read the database.
CREATE OR REPLACE FUNCTION geo.fn_incident_zone_idempotency_key(
  p_incident_id         uuid,
  p_operational_zone_id uuid,
  p_assignment_kind     geo.incident_zone_assignment_kind_enum,
  p_resolution_method   geo.incident_zone_resolution_method_enum
)
RETURNS uuid
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT md5('ARGUS_R31|' || p_incident_id::text || '|' || p_operational_zone_id::text
             || '|' || p_assignment_kind::text || '|' || p_resolution_method::text)::uuid;
$$;

CREATE OR REPLACE FUNCTION geo.fn_resolve_zones_for_geography(
  p_geom              geography,
  p_min_overlap_ratio numeric DEFAULT 0.0
)
RETURNS TABLE (
  operational_zone_id      uuid,
  outcome                  geo.spatial_resolution_outcome_enum,
  proposed_assignment_kind geo.incident_zone_assignment_kind_enum,
  confidence               evidence.confidence_level_enum,
  overlap_ratio            numeric,
  covered                  boolean,
  jurisdiction_resolvable  boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_source_area double precision;
BEGIN
  -- Absent geometry is a legitimate state (an incident may be reported before
  -- any area is delineated), not an error: it resolves to NO_MATCH and
  -- proposes nothing. Checked BEFORE any PostGIS predicate runs, so a NULL
  -- never reaches ST_Intersects.
  IF p_geom IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'NO_MATCH'::geo.spatial_resolution_outcome_enum,
                        NULL::geo.incident_zone_assignment_kind_enum,
                        'UNKNOWN'::evidence.confidence_level_enum,
                        NULL::numeric, NULL::boolean, false;
    RETURN;
  END IF;

  -- Invalid geometry is reported as such and proposes nothing. Never silently
  -- repaired: a repaired boundary is a different claim about the world than
  -- the one that was reported. Also checked before ST_Intersects, which can
  -- raise on a self-intersecting ring rather than return false.
  IF NOT ST_IsValid(p_geom::geometry) THEN
    RETURN QUERY SELECT NULL::uuid, 'INVALID_GEOMETRY'::geo.spatial_resolution_outcome_enum,
                        NULL::geo.incident_zone_assignment_kind_enum,
                        'UNKNOWN'::evidence.confidence_level_enum,
                        NULL::numeric, NULL::boolean, false;
    RETURN;
  END IF;

  -- Areal source geometry gets a real overlap ratio; a Point/MultiPoint has
  -- zero area, so its ratio is NULL rather than a division by zero dressed up
  -- as 0.
  v_source_area := ST_Area(p_geom);

  RETURN QUERY
  -- The GIST index on geo.operational_zones.boundary (gix_operational_zones_
  -- boundary, created above) is what makes ST_Intersects here an index scan
  -- rather than a full-table geometry comparison.
  WITH matches AS (
    SELECT z.id AS zone_id,
           CASE
             WHEN v_source_area IS NULL OR v_source_area <= 0 THEN NULL
             ELSE round((ST_Area(ST_Intersection(z.boundary::geometry, p_geom::geometry)::geography)
                         / v_source_area)::numeric, 6)
           END AS ratio,
           ST_Covers(z.boundary::geometry, p_geom::geometry) AS is_covered,
           EXISTS (
             SELECT 1 FROM geo.operational_zone_jurisdiction_assignments zja
             JOIN governance.jurisdictions j ON j.id = zja.jurisdiction_id
             WHERE zja.operational_zone_id = z.id
               AND zja.status = 'ACTIVE'
               AND zja.revoked_at IS NULL
               AND zja.superseded_by_assignment_id IS NULL
               AND zja.valid_from <= now()
               AND (zja.valid_until IS NULL OR zja.valid_until > now())
               AND j.effective_from <= now()
               AND (j.effective_to IS NULL OR j.effective_to > now())
           ) AS jr
    FROM geo.operational_zones z
    WHERE z.status = 'ACTIVE'
      AND z.closed_at IS NULL
      AND ST_Intersects(z.boundary, p_geom)
  ),
  agg AS (
    SELECT count(*)::integer AS n,
           count(*) FILTER (WHERE NOT jr)::integer AS unresolvable
    FROM matches
  )
  SELECT m.zone_id,
         -- A zone whose jurisdiction cannot be resolved makes the whole answer
         -- a REVIEW item, not a silent success: a proposal against it would
         -- create a relation that leads nowhere.
         (CASE WHEN a.unresolvable > 0 THEN 'REQUIRES_REVIEW'
               WHEN a.n > 1            THEN 'MULTIPLE_MATCHES'
               ELSE                         'RESOLVED'
          END)::geo.spatial_resolution_outcome_enum,
         -- The strongest thing geometry may ever propose is AFFECTED. Never
         -- PRIMARY (a descriptive judgement) and never COMMAND (an act of
         -- authority). Enforced again by ck_ioza_spatial_never_command at
         -- write time, so changing this expression cannot widen it.
         (CASE WHEN m.is_covered
                 OR (m.ratio IS NOT NULL AND m.ratio >= greatest(coalesce(p_min_overlap_ratio, 0), 0))
               THEN 'AFFECTED' ELSE 'MONITORING'
          END)::geo.incident_zone_assignment_kind_enum,
         (CASE WHEN NOT m.jr                    THEN 'LOW'
               WHEN m.is_covered AND a.n = 1    THEN 'CONFIRMED'
               WHEN m.is_covered                THEN 'HIGH'
               WHEN m.ratio IS NULL             THEN 'MEDIUM'
               WHEN m.ratio >= 0.5              THEN 'HIGH'
               WHEN m.ratio > 0                 THEN 'MEDIUM'
               ELSE                                  'LOW'
          END)::evidence.confidence_level_enum,
         m.ratio, m.is_covered, m.jr
  FROM matches m CROSS JOIN agg a
  UNION ALL
  SELECT NULL::uuid, 'NO_MATCH'::geo.spatial_resolution_outcome_enum,
         NULL::geo.incident_zone_assignment_kind_enum,
         'UNKNOWN'::evidence.confidence_level_enum,
         NULL::numeric, NULL::boolean, false
  FROM agg a WHERE a.n = 0;
END
$fn$;

-- The canonical geometry of an incident, in the order the model actually
-- defines it: the current affected-area version first (incident.incidents
-- deliberately has NO geometry column of its own), then its sub-incidents,
-- then the points of the observations linked to it. Returns NULL when the
-- incident has no geometry at all â€” a supported state, not an error.
CREATE OR REPLACE FUNCTION geo.fn_incident_resolution_geography(p_incident_id uuid)
RETURNS geography
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(
    (SELECT aav.geometry
       FROM incident.affected_area_versions aav
      WHERE aav.incident_id = p_incident_id AND aav.superseded_by_id IS NULL
      ORDER BY aav.version_number DESC LIMIT 1),
    (SELECT ST_Union(si.area::geometry)::geography
       FROM incident.sub_incidents si
      WHERE si.incident_id = p_incident_id AND si.status = 'ACTIVE'),
    (SELECT ST_Collect(o.location::geometry)::geography
       FROM incident.incident_observation_links iol
       JOIN evidence.observations o ON o.id = iol.observation_id
      WHERE iol.incident_id = p_incident_id AND o.location IS NOT NULL)
  );
$$;

-- Same, for a candidate. A candidate has no affected-area version of its own,
-- so its geometry is the points of the observations correlated to it.
CREATE OR REPLACE FUNCTION geo.fn_candidate_resolution_geography(p_incident_candidate_id uuid)
RETURNS geography
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT ST_Collect(o.location::geometry)::geography
    FROM incident.incident_candidate_observations ico
    JOIN evidence.observations o ON o.id = ico.observation_id
   WHERE ico.incident_candidate_id = p_incident_candidate_id
     AND o.location IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION geo.fn_resolve_incident_operational_zones(
  p_incident_id       uuid,
  p_min_overlap_ratio numeric DEFAULT 0.0
)
RETURNS TABLE (
  operational_zone_id      uuid,
  outcome                  geo.spatial_resolution_outcome_enum,
  proposed_assignment_kind geo.incident_zone_assignment_kind_enum,
  confidence               evidence.confidence_level_enum,
  overlap_ratio            numeric,
  covered                  boolean,
  jurisdiction_resolvable  boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT * FROM geo.fn_resolve_zones_for_geography(
    geo.fn_incident_resolution_geography(p_incident_id), p_min_overlap_ratio);
$$;

CREATE OR REPLACE FUNCTION geo.fn_resolve_candidate_operational_zones(
  p_incident_candidate_id uuid,
  p_min_overlap_ratio     numeric DEFAULT 0.0
)
RETURNS TABLE (
  operational_zone_id      uuid,
  outcome                  geo.spatial_resolution_outcome_enum,
  proposed_assignment_kind geo.incident_zone_assignment_kind_enum,
  confidence               evidence.confidence_level_enum,
  overlap_ratio            numeric,
  covered                  boolean,
  jurisdiction_resolvable  boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT * FROM geo.fn_resolve_zones_for_geography(
    geo.fn_candidate_resolution_geography(p_incident_candidate_id), p_min_overlap_ratio);
$$;

-- ------------------------------------------------------------
-- 6.8 Audit writer for the relation
-- ------------------------------------------------------------
-- Uses the canonical partition lifecycle (fn_ensure_audit_log_partition_for_
-- write) and runs in the caller's transaction, so an assignment and its audit
-- record commit or fail together. Records ids, enum labels and controlled
-- codes ONLY: no geometry, no coordinates, no incident title, no evidence
-- body, no names, no emails, no free text.
CREATE OR REPLACE FUNCTION geo.fn_audit_incident_zone_change(
  p_action             varchar(100),
  p_assignment_id      uuid,
  p_incident_id        uuid,
  p_zone_id            uuid,
  p_assignment_kind    geo.incident_zone_assignment_kind_enum,
  p_resolution_method  geo.incident_zone_resolution_method_enum,
  p_reason_code        varchar(50),
  p_correlation_id     uuid,
  p_actor_subject_id   uuid,
  p_result             text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, security, public
AS $fn$
DECLARE
  v_now timestamptz := now();
BEGIN
  PERFORM security.fn_ensure_audit_log_partition_for_write(v_now);
  INSERT INTO security.audit_logs
    (id, actor_type, actor_id, action, target_table, target_id, classification,
     context, purpose, decision, result, integrity_value, correlation_id,
     incident_id, occurred_at)
  VALUES
    (gen_random_uuid(), 'SYSTEM',
     coalesce(p_actor_subject_id, '00000000-0000-0000-0000-000000000000'::uuid),
     p_action, 'geo.incident_operational_zone_assignments', p_assignment_id, 'RESTRICTED',
     jsonb_build_object(
       'incident_id',         p_incident_id,
       'operational_zone_id', p_zone_id,
       'assignment_kind',     p_assignment_kind::text,
       'resolution_method',   p_resolution_method::text,
       'reason_code',         p_reason_code),
     NULL, p_reason_code, p_result,
     encode(hmac(p_action || ':' || p_assignment_id::text || ':' || v_now::text,
                 'ARGUS_INCIDENT_ZONE_AUDIT_CHAIN', 'sha256'), 'hex'),
     p_correlation_id, p_incident_id, v_now);
END
$fn$;

-- ------------------------------------------------------------
-- 6.9 Explicit assignment operations
-- ------------------------------------------------------------
-- No runtime role holds INSERT/UPDATE/DELETE on the relation (see grants
-- below), so these SECURITY DEFINER functions are the ONLY writable path.
-- Same posture as security.access_role_assignments: a table that hands out
-- command scope must not be writable by the connection that consumes it.
CREATE OR REPLACE FUNCTION geo.fn_assign_incident_operational_zone(
  p_incident_id            uuid,
  p_operational_zone_id    uuid,
  p_assignment_kind        geo.incident_zone_assignment_kind_enum,
  p_resolution_method      geo.incident_zone_resolution_method_enum,
  p_assigned_by_subject_id uuid DEFAULT NULL,
  p_automation_rule_id     uuid DEFAULT NULL,
  p_confidence             evidence.confidence_level_enum DEFAULT 'MEDIUM',
  p_review_status          geo.zone_assignment_review_status_enum DEFAULT 'REQUIRES_REVIEW',
  p_valid_from             timestamptz DEFAULT now(),
  p_valid_until            timestamptz DEFAULT NULL,
  p_source_record_id       uuid DEFAULT NULL,
  p_evidence_id            uuid DEFAULT NULL,
  p_reason_code            varchar(50) DEFAULT NULL,
  p_provenance             varchar(50) DEFAULT 'MANUAL',
  p_idempotency_key        uuid DEFAULT NULL,
  p_correlation_id         uuid DEFAULT NULL,
  p_assignment_id          uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, security, public
AS $fn$
DECLARE
  v_key        uuid := coalesce(p_idempotency_key, gen_random_uuid());
  v_existing   uuid;
  v_id         uuid;
  v_person_id  uuid;
  v_subject_type security.actor_type_enum;
BEGIN
  -- IDEMPOTENCY FIRST. A retry must be a no-op returning the same row, before
  -- any validation can reject it for a state the first call itself created.
  SELECT id INTO v_existing FROM geo.incident_operational_zone_assignments WHERE idempotency_key = v_key;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM incident.incidents WHERE id = p_incident_id AND closed_at IS NULL) THEN
    RAISE EXCEPTION 'INCIDENT_ZONE_INCIDENT_NOT_OPEN: incident % does not exist or is closed', p_incident_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM geo.operational_zones
                  WHERE id = p_operational_zone_id AND status = 'ACTIVE' AND closed_at IS NULL) THEN
    RAISE EXCEPTION 'INCIDENT_ZONE_ZONE_NOT_ACTIVE: operational zone % does not exist or is closed', p_operational_zone_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF p_valid_until IS NOT NULL AND p_valid_until <= p_valid_from THEN
    RAISE EXCEPTION 'INCIDENT_ZONE_INVALID_WINDOW: valid_until must be strictly after valid_from'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Geometry may never reach COMMAND, and neither may inheritance. The CHECK
  -- constraints enforce this physically; raising here first turns a constraint
  -- violation into a named, diagnosable refusal.
  IF p_assignment_kind = 'COMMAND'
     AND p_resolution_method IN ('SPATIAL_INTERSECTION','INHERITED_FROM_CANDIDATE') THEN
    RAISE EXCEPTION 'INCIDENT_ZONE_COMMAND_METHOD_FORBIDDEN: % can never produce a COMMAND assignment', p_resolution_method
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_assignment_kind = 'COMMAND' THEN
    IF p_correlation_id IS NULL THEN
      RAISE EXCEPTION 'INCIDENT_ZONE_COMMAND_CORRELATION_REQUIRED: a COMMAND assignment must carry a correlation id'
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_reason_code IS NULL OR p_reason_code !~ '^[A-Z][A-Z0-9_]{2,49}$' THEN
      RAISE EXCEPTION 'INCIDENT_ZONE_COMMAND_REASON_REQUIRED: a COMMAND assignment must carry a controlled reason code'
        USING ERRCODE = 'check_violation';
    END IF;
    IF (p_assigned_by_subject_id IS NULL) = (p_automation_rule_id IS NULL) THEN
      RAISE EXCEPTION 'INCIDENT_ZONE_COMMAND_AUTHORITY_REQUIRED: exactly one of subject / automation rule must be named'
        USING ERRCODE = 'check_violation';
    END IF;

    -- The zone must actually lead somewhere: a COMMAND assignment onto a zone
    -- with no live jurisdiction would grant scope that resolves to nothing.
    IF NOT EXISTS (
      SELECT 1 FROM geo.operational_zone_jurisdiction_assignments zja
      JOIN governance.jurisdictions j ON j.id = zja.jurisdiction_id
      WHERE zja.operational_zone_id = p_operational_zone_id
        AND zja.status = 'ACTIVE' AND zja.revoked_at IS NULL
        AND zja.superseded_by_assignment_id IS NULL
        AND zja.valid_from <= now() AND (zja.valid_until IS NULL OR zja.valid_until > now())
        AND j.effective_from <= now() AND (j.effective_to IS NULL OR j.effective_to > now())
    ) THEN
      RAISE EXCEPTION 'INCIDENT_ZONE_JURISDICTION_UNRESOLVABLE: zone % has no jurisdiction in force', p_operational_zone_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF p_assigned_by_subject_id IS NOT NULL THEN
      SELECT s.subject_type, s.person_id INTO v_subject_type, v_person_id
      FROM security.access_subjects s
      WHERE s.id = p_assigned_by_subject_id AND s.status = 'ACTIVE';
      IF v_subject_type IS NULL THEN
        RAISE EXCEPTION 'INCIDENT_ZONE_SUBJECT_NOT_ACTIVE: subject % does not exist or is disabled', p_assigned_by_subject_id
          USING ERRCODE = 'foreign_key_violation';
      END IF;
      -- An authorizing access role, resolved from PERSISTED assignments â€” never
      -- from a session string. fn_active_access_roles is session-bound, so it is
      -- deliberately NOT used here: this asks about the subject that is being
      -- recorded as the granting authority, which may be a different session.
      IF NOT EXISTS (
        SELECT 1
        FROM security.access_role_assignments ara
        JOIN security.access_roles ar ON ar.id = ara.access_role_id
        WHERE ara.access_subject_id = p_assigned_by_subject_id
          AND ara.status = 'ACTIVE'
          AND ara.valid_from <= now() AND (ara.valid_until IS NULL OR ara.valid_until > now())
          AND ar.status = 'ACTIVE' AND ar.effective_from <= now()
          AND ar.code IN ('ADMIN','OPERATIONAL','SECURITY')
      ) THEN
        RAISE EXCEPTION 'INCIDENT_ZONE_SUBJECT_NOT_AUTHORIZED: subject % holds no ADMIN/OPERATIONAL/SECURITY grant', p_assigned_by_subject_id
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      -- A PERSON granting command scope must be institutionally current. A
      -- SYSTEM/ORGANIZATION/AUTOMATION_RULE subject has no membership to check.
      IF v_subject_type = 'PERSON' AND NOT EXISTS (
        SELECT 1 FROM institution.institutional_memberships im
        WHERE im.person_id = v_person_id
          AND im.status = 'ACTIVE'
          AND im.effective_from <= now()
          AND (im.effective_to IS NULL OR im.effective_to > now())
      ) THEN
        RAISE EXCEPTION 'INCIDENT_ZONE_MEMBERSHIP_EXPIRED: subject % has no current institutional membership', p_assigned_by_subject_id
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    IF p_automation_rule_id IS NOT NULL THEN
      -- "Only if the rule expressly allows it AND is approved" â€” both, read off
      -- the rule itself, in force right now.
      IF NOT EXISTS (
        SELECT 1 FROM governance.automation_rules r
        WHERE r.id = p_automation_rule_id
          AND r.command_scope_authorized
          AND r.status IN ('APPROVED','ACTIVE')
          AND r.effective_from <= now()
          AND (r.effective_to IS NULL OR r.effective_to > now())
      ) THEN
        RAISE EXCEPTION 'INCIDENT_ZONE_RULE_NOT_COMMAND_AUTHORIZED: automation rule % is not approved for command scope', p_automation_rule_id
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;

  -- EQUIVALENCE, checked AFTER every validation above so an unauthorized
  -- caller is refused rather than handed back the id of a row it could not
  -- have created. An ACTIVE assignment for the same (incident, zone, kind)
  -- already expresses exactly this relation, so the call is satisfied by it:
  -- returning it creates no new authority, whereas raising would make a
  -- resolver re-run over manually-curated rows fail for a state that is
  -- already correct. uq_ioza_active_equivalent remains the physical backstop.
  SELECT id INTO v_existing
  FROM geo.incident_operational_zone_assignments
  WHERE incident_id = p_incident_id
    AND operational_zone_id = p_operational_zone_id
    AND assignment_kind = p_assignment_kind
    AND status = 'ACTIVE';
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO geo.incident_operational_zone_assignments
    (id, incident_id, operational_zone_id, assignment_kind, resolution_method, status,
     valid_from, valid_until, confidence, review_status, assigned_by_subject_id,
     automation_rule_id, source_record_id, evidence_id, idempotency_key, correlation_id,
     provenance)
  VALUES
    (coalesce(p_assignment_id, gen_random_uuid()), p_incident_id, p_operational_zone_id,
     p_assignment_kind, p_resolution_method, 'ACTIVE',
     p_valid_from, p_valid_until, p_confidence, p_review_status, p_assigned_by_subject_id,
     p_automation_rule_id, p_source_record_id, p_evidence_id, v_key, p_correlation_id,
     p_provenance)
  RETURNING id INTO v_id;

  PERFORM geo.fn_audit_incident_zone_change(
    'INCIDENT_ZONE_ASSIGNED', v_id, p_incident_id, p_operational_zone_id,
    p_assignment_kind, p_resolution_method, p_reason_code, p_correlation_id,
    p_assigned_by_subject_id, 'SUCCESS');

  RETURN v_id;
END
$fn$;

-- Revocation is a status transition, never a DELETE: the row IS the history.
-- A revoked assignment authorizes nothing from the instant it commits â€” there
-- is no grace window, because fn_incident_effective_jurisdictions filters on
-- status/revoked_at, not on a cached view.
CREATE OR REPLACE FUNCTION geo.fn_revoke_incident_operational_zone_assignment(
  p_assignment_id         uuid,
  p_reason_code           varchar(50),
  p_revoked_by_subject_id uuid DEFAULT NULL,
  p_correlation_id        uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, security, public
AS $fn$
DECLARE
  v_row geo.incident_operational_zone_assignments%ROWTYPE;
BEGIN
  IF p_reason_code IS NULL OR p_reason_code !~ '^[A-Z][A-Z0-9_]{2,49}$' THEN
    RAISE EXCEPTION 'INCIDENT_ZONE_REVOCATION_REASON_INVALID: a controlled reason code is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_row FROM geo.incident_operational_zone_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'INCIDENT_ZONE_ASSIGNMENT_NOT_FOUND: %', p_assignment_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Already terminal: idempotent no-op rather than a second revocation. A
  -- SUPERSEDED row is NOT resurrected into REVOKED â€” that would rewrite
  -- history to make the successor look unparented.
  IF v_row.status <> 'ACTIVE' THEN
    RETURN false;
  END IF;

  UPDATE geo.incident_operational_zone_assignments
     SET status = 'REVOKED',
         revoked_at = now(),
         revoked_by_subject_id = p_revoked_by_subject_id,
         revocation_reason_code = p_reason_code,
         updated_at = now()
   WHERE id = p_assignment_id;

  PERFORM geo.fn_audit_incident_zone_change(
    'INCIDENT_ZONE_REVOKED', p_assignment_id, v_row.incident_id, v_row.operational_zone_id,
    v_row.assignment_kind, v_row.resolution_method, p_reason_code,
    coalesce(p_correlation_id, v_row.correlation_id), p_revoked_by_subject_id, 'SUCCESS');

  RETURN true;
END
$fn$;

-- Supersession replaces an assignment with a successor ATOMICALLY, in one
-- transaction: the predecessor moves to SUPERSEDED first (which frees the
-- `one ACTIVE equivalent` partial-unique slot) while already pointing at the
-- successor's id, and the successor is inserted immediately after. The
-- self-FK is DEFERRABLE INITIALLY DEFERRED precisely so this order is legal.
CREATE OR REPLACE FUNCTION geo.fn_supersede_incident_operational_zone_assignment(
  p_assignment_id          uuid,
  p_operational_zone_id    uuid,
  p_assignment_kind        geo.incident_zone_assignment_kind_enum,
  p_resolution_method      geo.incident_zone_resolution_method_enum,
  p_reason_code            varchar(50),
  p_assigned_by_subject_id uuid DEFAULT NULL,
  p_automation_rule_id     uuid DEFAULT NULL,
  p_confidence             evidence.confidence_level_enum DEFAULT 'MEDIUM',
  p_review_status          geo.zone_assignment_review_status_enum DEFAULT 'REQUIRES_REVIEW',
  p_valid_until            timestamptz DEFAULT NULL,
  p_provenance             varchar(50) DEFAULT 'MANUAL',
  p_idempotency_key        uuid DEFAULT NULL,
  p_correlation_id         uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, security, public
AS $fn$
DECLARE
  v_row    geo.incident_operational_zone_assignments%ROWTYPE;
  v_key    uuid := coalesce(p_idempotency_key, gen_random_uuid());
  v_exists uuid;
  v_new_id uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_exists FROM geo.incident_operational_zone_assignments WHERE idempotency_key = v_key;
  IF v_exists IS NOT NULL THEN
    RETURN v_exists;
  END IF;

  IF p_reason_code IS NULL OR p_reason_code !~ '^[A-Z][A-Z0-9_]{2,49}$' THEN
    RAISE EXCEPTION 'INCIDENT_ZONE_SUPERSESSION_REASON_INVALID: a controlled reason code is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_row FROM geo.incident_operational_zone_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'INCIDENT_ZONE_ASSIGNMENT_NOT_FOUND: %', p_assignment_id
      USING ERRCODE = 'no_data_found';
  END IF;
  -- A revoked assignment is not superseded into life again.
  IF v_row.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'INCIDENT_ZONE_NOT_ACTIVE: assignment % is % and cannot be superseded', p_assignment_id, v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE geo.incident_operational_zone_assignments
     SET status = 'SUPERSEDED',
         superseded_by_assignment_id = v_new_id,
         updated_at = now()
   WHERE id = p_assignment_id;

  PERFORM geo.fn_assign_incident_operational_zone(
    p_incident_id            => v_row.incident_id,
    p_operational_zone_id    => p_operational_zone_id,
    p_assignment_kind        => p_assignment_kind,
    p_resolution_method      => p_resolution_method,
    p_assigned_by_subject_id => p_assigned_by_subject_id,
    p_automation_rule_id     => p_automation_rule_id,
    p_confidence             => p_confidence,
    p_review_status          => p_review_status,
    p_valid_from             => now(),
    p_valid_until            => p_valid_until,
    p_source_record_id       => v_row.source_record_id,
    p_evidence_id            => v_row.evidence_id,
    p_reason_code            => p_reason_code,
    p_provenance             => p_provenance,
    p_idempotency_key        => v_key,
    p_correlation_id         => p_correlation_id,
    p_assignment_id          => v_new_id);

  PERFORM geo.fn_audit_incident_zone_change(
    'INCIDENT_ZONE_SUPERSEDED', p_assignment_id, v_row.incident_id, v_row.operational_zone_id,
    v_row.assignment_kind, v_row.resolution_method, p_reason_code,
    p_correlation_id, p_assigned_by_subject_id, 'SUCCESS');

  RETURN v_new_id;
END
$fn$;

-- Persists the resolver's proposals. Structurally incapable of writing
-- COMMAND: it hard-codes SPATIAL_INTERSECTION, and
-- ck_ioza_spatial_never_command rejects COMMAND for that method even if this
-- body were changed. Rows land as REQUIRES_REVIEW â€” a machine proposal is
-- never self-approving.
CREATE OR REPLACE FUNCTION geo.fn_persist_incident_zone_resolution(
  p_incident_id            uuid,
  p_assigned_by_subject_id uuid DEFAULT NULL,
  p_correlation_id         uuid DEFAULT NULL,
  p_min_overlap_ratio      numeric DEFAULT 0.0
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, security, public
AS $fn$
DECLARE
  r         record;
  v_written integer := 0;
BEGIN
  FOR r IN
    SELECT * FROM geo.fn_resolve_incident_operational_zones(p_incident_id, p_min_overlap_ratio)
     WHERE operational_zone_id IS NOT NULL
       AND outcome <> 'INVALID_GEOMETRY'
       AND jurisdiction_resolvable
  LOOP
    -- Deterministic idempotency key: re-running the resolver for the same
    -- (incident, zone, kind) resolves to the SAME row instead of a second,
    -- equivalent proposal. uq_ioza_active_equivalent would reject the
    -- duplicate anyway; this makes the re-run succeed instead of erroring.
    PERFORM geo.fn_assign_incident_operational_zone(
      p_incident_id            => p_incident_id,
      p_operational_zone_id    => r.operational_zone_id,
      p_assignment_kind        => r.proposed_assignment_kind,
      p_resolution_method      => 'SPATIAL_INTERSECTION',
      p_assigned_by_subject_id => p_assigned_by_subject_id,
      p_confidence             => r.confidence,
      p_review_status          => 'REQUIRES_REVIEW',
      p_reason_code            => 'SPATIAL_RESOLUTION',
      p_provenance             => 'SPATIAL_RESOLVER',
      p_idempotency_key        => geo.fn_incident_zone_idempotency_key(
                                    p_incident_id, r.operational_zone_id,
                                    r.proposed_assignment_kind, 'SPATIAL_INTERSECTION'),
      p_correlation_id         => p_correlation_id);
    v_written := v_written + 1;
  END LOOP;
  RETURN v_written;
END
$fn$;

-- ------------------------------------------------------------
-- 6.10 Promotion: IncidentCandidate -> Incident
-- ------------------------------------------------------------
-- Carries the candidate's geographic relations onto the new incident as
-- PRIMARY/AFFECTED/MONITORING, preserving provenance, confidence and review
-- status. It can NEVER create COMMAND â€” ck_ioza_inherited_never_command
-- rejects it, and the body never asks for it. A candidate with no resolvable
-- zone produces zero rows: the incident is still created, its jurisdiction
-- stays unresolved, and fn_has_command_role keeps failing closed. No zone is
-- invented to fill the gap.
CREATE OR REPLACE FUNCTION geo.fn_inherit_candidate_zone_assignments(
  p_incident_candidate_id  uuid,
  p_incident_id            uuid,
  p_assigned_by_subject_id uuid DEFAULT NULL,
  p_correlation_id         uuid DEFAULT NULL,
  p_min_overlap_ratio      numeric DEFAULT 0.0
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, security, public
AS $fn$
DECLARE
  r          record;
  v_written  integer := 0;
  v_primary  boolean := EXISTS (
    SELECT 1 FROM geo.incident_operational_zone_assignments
     WHERE incident_id = p_incident_id AND assignment_kind = 'PRIMARY' AND status = 'ACTIVE');
  v_kind     geo.incident_zone_assignment_kind_enum;
BEGIN
  FOR r IN
    SELECT * FROM geo.fn_resolve_candidate_operational_zones(p_incident_candidate_id, p_min_overlap_ratio)
     WHERE operational_zone_id IS NOT NULL
       AND outcome IN ('RESOLVED','MULTIPLE_MATCHES')
       AND jurisdiction_resolvable
     ORDER BY covered DESC, coalesce(overlap_ratio, 0) DESC, operational_zone_id
  LOOP
    -- The single best match becomes PRIMARY (a description, not authority);
    -- everything else keeps the kind the resolver proposed. Only one PRIMARY
    -- is ever attempted, and uq_ioza_active_primary_per_incident is the
    -- physical backstop.
    IF NOT v_primary AND r.outcome = 'RESOLVED' THEN
      v_kind := 'PRIMARY';
      v_primary := true;
    ELSE
      v_kind := r.proposed_assignment_kind;
    END IF;

    PERFORM geo.fn_assign_incident_operational_zone(
      p_incident_id            => p_incident_id,
      p_operational_zone_id    => r.operational_zone_id,
      p_assignment_kind        => v_kind,
      p_resolution_method      => 'INHERITED_FROM_CANDIDATE',
      p_assigned_by_subject_id => p_assigned_by_subject_id,
      p_confidence             => r.confidence,
      p_review_status          => 'REQUIRES_REVIEW',
      p_reason_code            => 'CANDIDATE_PROMOTION',
      p_provenance             => 'CANDIDATE_INHERITANCE',
      p_idempotency_key        => geo.fn_incident_zone_idempotency_key(
                                    p_incident_id, r.operational_zone_id,
                                    v_kind, 'INHERITED_FROM_CANDIDATE'),
      p_correlation_id         => p_correlation_id);
    v_written := v_written + 1;
  END LOOP;
  RETURN v_written;
END
$fn$;

-- ------------------------------------------------------------
-- 6.11 security.fn_has_command_role â€” R31 body
-- ------------------------------------------------------------
-- Redefined here (Wave 080) rather than in Wave 040 because it now consults
-- geo.*, which Wave 040 cannot reference. Wave 080's rollback restores the
-- Wave 040 body, so a partial rollback never leaves a function pointing at a
-- dropped table.
--
-- Resolves, in order, and fails closed at every step:
--   session AccessSubject -> command membership in force -> command role in
--   force -> institution -> the role's REAL jurisdictional scope -> the
--   incident's COMMAND operational zone -> that zone's effective jurisdiction.
--
-- Returns false for: no COMMAND assignment; only PRIMARY; only AFFECTED; only
-- MONITORING; a spatial intersection never confirmed as COMMAND; a revoked or
-- superseded or expired assignment; a jurisdiction mismatch; an expired
-- membership, role scope or jurisdiction; a closed incident or zone; a subject
-- that is not persisted and ACTIVE; a classification the actor may not reach.
--
-- Trusts NONE of: a command-role GUC, a client-supplied role name, an
-- unresolved jurisdiction id, ST_Intersects at decision time, or an actor id
-- that is not the session's own AccessSubject.
CREATE OR REPLACE FUNCTION security.fn_has_command_role(p_actor_id uuid, p_incident_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_session_actor text;
  v_subject_id    uuid;
BEGIN
  IF p_actor_id IS NULL OR p_incident_id IS NULL THEN
    RETURN false;
  END IF;

  -- SESSION BINDING. This function is SECURITY DEFINER and callable from every
  -- policy, so without this an authorized session could ask the question about
  -- somebody else's actor id and act on the answer.
  v_session_actor := coalesce(current_setting('argus.actor_id', true), '');
  IF v_session_actor <> '' THEN
    BEGIN
      IF p_actor_id IS DISTINCT FROM v_session_actor::uuid THEN
        RETURN false;
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN false;
    END;
  END IF;

  -- The actor must be a PERSISTED, ACTIVE AccessSubject. A command_roles row
  -- for an actor with no subject is an orphan, not an authorization.
  v_subject_id := security.fn_resolve_access_subject(p_actor_id);
  IF v_subject_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM command.command_roles cr
    JOIN command.incident_command_structures ics ON ics.id = cr.incident_command_structure_id
    JOIN incident.incidents i ON i.id = ics.incident_id
    JOIN command.command_role_jurisdiction_scopes crjs ON crjs.command_role_id = cr.id
    JOIN geo.fn_incident_command_jurisdictions(p_incident_id) icj
      ON icj.jurisdiction_id = crjs.jurisdiction_id
    LEFT JOIN institution.institutional_memberships im ON im.id = cr.institutional_membership_id
    WHERE ics.incident_id = p_incident_id
      AND cr.actor_id = p_actor_id
      -- command role in force
      AND cr.revoked_at IS NULL
      AND cr.assigned_at <= now()
      -- command structure in force
      AND ics.status = 'ACTIVE'
      AND ics.dissolved_at IS NULL
      -- incident still open
      AND i.closed_at IS NULL
      AND i.operational_status <> 'CLOSED'
      -- the role's jurisdictional scope in force
      AND crjs.status = 'ACTIVE'
      AND crjs.revoked_at IS NULL
      AND crjs.superseded_by_scope_id IS NULL
      AND crjs.valid_from <= now()
      AND (crjs.valid_until IS NULL OR crjs.valid_until > now())
      -- Institutional membership in force, when the role is tied to one — AND
      -- actually BELONGING to this actor. Without the ownership clause a
      -- command role could hang off somebody else's membership and inherit its
      -- institution, which is a cross-institutional escalation that looks
      -- perfectly valid row-by-row. (`institutional_membership_id` is
      -- nullable: some command roles are held by actors with no modeled
      -- membership, e.g. actor_type='SYSTEM', and the clause must not deny
      -- those by default.)
      AND (
        cr.institutional_membership_id IS NULL
        OR (im.status = 'ACTIVE'
            AND im.effective_from <= now()
            AND (im.effective_to IS NULL OR im.effective_to > now())
            AND (cr.actor_type <> 'PERSON' OR im.person_id = cr.actor_id))
      )
      -- institution compatibility: a jurisdiction declared by an organization
      -- is commanded from inside that organization, never from another one.
      AND (
        icj.declaring_organization_id IS NULL
        OR cr.institutional_membership_id IS NULL
        OR im.organization_id = icj.declaring_organization_id
      )
      -- purpose / EmergencyBasis / classification ceiling, all resolved from
      -- persisted grants by the single canonical implementation.
      AND security.fn_classification_allowed(p_actor_id, i.classification)
  );
END
$fn$;


-- ------------------------------------------------------------
-- 6.12 RLS for the R31 relations
-- ------------------------------------------------------------
-- ENABLE + FORCE on all three. Zero `USING (true)`. No policy reads
-- `argus.actor_role` (a session-settable string is not an authorization).
-- No policy evaluates PostGIS: geometry decides WHERE, never WHO.
--
-- No INSERT/UPDATE/DELETE policy exists for ANY role on any of the three â€”
-- deliberately. Every mutation goes through the SECURITY DEFINER functions in
-- 6.9, which validate, gate COMMAND and audit. app_api therefore cannot create
-- a COMMAND assignment by any path: it holds no write grant and no write
-- policy. Same posture as security.access_role_assignments.

ALTER TABLE geo.incident_operational_zone_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.incident_operational_zone_assignments FORCE ROW LEVEL SECURITY;
-- Readable by an actor who actually commands the incident, or by a persisted
-- governance/audit clearance. fn_has_command_role is SECURITY DEFINER, so its
-- own read of this table is not re-filtered by this policy â€” no recursion.
CREATE POLICY ioza_command_or_governance ON geo.incident_operational_zone_assignments
  FOR SELECT USING (
    security.fn_has_command_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, incident_id)
    OR security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid,
                                   ARRAY['OPERATIONAL','ADMIN','AUDIT','SECURITY'])
  );

ALTER TABLE geo.operational_zone_jurisdiction_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.operational_zone_jurisdiction_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY ozja_governance ON geo.operational_zone_jurisdiction_assignments
  FOR SELECT USING (
    security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid,
                                ARRAY['OPERATIONAL','ADMIN','AUDIT','SECURITY'])
  );

ALTER TABLE command.command_role_jurisdiction_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE command.command_role_jurisdiction_scopes FORCE ROW LEVEL SECURITY;
-- An actor may see the territorial scope of its OWN command role; ADMIN/
-- AUDIT/SECURITY may see all. Nothing else.
CREATE POLICY crjs_own_or_governance ON command.command_role_jurisdiction_scopes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM command.command_roles cr
             WHERE cr.id = command_role_id
               AND cr.actor_id = NULLIF(current_setting('argus.actor_id', true), '')::uuid)
    OR security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid,
                                   ARRAY['ADMIN','AUDIT','SECURITY'])
  );

-- ------------------------------------------------------------
-- 6.13 Grants for the R31 relations
-- ------------------------------------------------------------
REVOKE ALL ON geo.incident_operational_zone_assignments FROM PUBLIC;
REVOKE ALL ON geo.operational_zone_jurisdiction_assignments FROM PUBLIC;
REVOKE ALL ON command.command_role_jurisdiction_scopes FROM PUBLIC;

-- audit_reader and access_admin need USAGE on geo to reach the relation and
-- its functions AT ALL: "permission denied for schema geo" fires before RLS
-- or any EXECUTE grant is even consulted. Neither role had it — audit_reader
-- because Wave 080 never granted it, access_admin because it is created in
-- Wave 020 and no geo object existed for it until now. Found by the real
-- non-superuser suites, not by inspection.
GRANT USAGE ON SCHEMA geo TO audit_reader, access_admin;
-- access_admin additionally needs to RESOLVE the one type in these signatures
-- that does not live in geo (`evidence.confidence_level_enum`), which the
-- caller must name to disambiguate the overload. Schema USAGE confers name
-- resolution ONLY: access_admin holds no grant on any evidence table, so this
-- does not widen what it can read by a single row. The alternative — retyping
-- the parameter as `text` and casting inside the function — would move the
-- type check off the boundary where it belongs, so the narrower-looking option
-- is the weaker one.
GRANT USAGE ON SCHEMA evidence TO access_admin;

-- SELECT only. No role â€” not app_api, not ingest_worker, not jobs_worker â€”
-- holds INSERT, UPDATE or DELETE on any of the three.
GRANT SELECT ON geo.incident_operational_zone_assignments
  TO app_api, ingest_worker, jobs_worker, readonly_inspector, audit_reader;
GRANT SELECT ON geo.operational_zone_jurisdiction_assignments
  TO app_api, ingest_worker, jobs_worker, readonly_inspector, audit_reader;
GRANT SELECT ON command.command_role_jurisdiction_scopes
  TO app_api, readonly_inspector;

-- Read helpers: available to the runtime so it can display effective
-- jurisdictions, but they answer questions, they never grant.
REVOKE ALL ON FUNCTION geo.fn_incident_effective_jurisdictions(uuid, geo.incident_zone_assignment_kind_enum) FROM PUBLIC;
REVOKE ALL ON FUNCTION geo.fn_incident_command_jurisdictions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION geo.fn_resolve_zones_for_geography(geography, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION geo.fn_resolve_incident_operational_zones(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION geo.fn_resolve_candidate_operational_zones(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION geo.fn_incident_resolution_geography(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION geo.fn_candidate_resolution_geography(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION geo.fn_incident_effective_jurisdictions(uuid, geo.incident_zone_assignment_kind_enum)
  TO app_api, jobs_worker, readonly_inspector, audit_reader, access_admin;
GRANT EXECUTE ON FUNCTION geo.fn_incident_command_jurisdictions(uuid)
  TO app_api, jobs_worker, readonly_inspector, audit_reader, access_admin;
GRANT EXECUTE ON FUNCTION geo.fn_resolve_incident_operational_zones(uuid, numeric)
  TO app_api, ingest_worker, jobs_worker, readonly_inspector, access_admin;
GRANT EXECUTE ON FUNCTION geo.fn_resolve_candidate_operational_zones(uuid, numeric)
  TO app_api, ingest_worker, jobs_worker, readonly_inspector, access_admin;

-- WRITE path. The proposal writers are reachable by the workers that actually
-- run resolution and promotion; they can only ever produce AFFECTED/
-- MONITORING (fn_persist) or PRIMARY/AFFECTED/MONITORING (fn_inherit),
-- because the methods they hard-code are rejected for COMMAND by
-- ck_ioza_spatial_never_command / ck_ioza_inherited_never_command.
REVOKE ALL ON FUNCTION geo.fn_persist_incident_zone_resolution(uuid, uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION geo.fn_inherit_candidate_zone_assignments(uuid, uuid, uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION geo.fn_persist_incident_zone_resolution(uuid, uuid, uuid, numeric)
  TO ingest_worker, jobs_worker, access_admin;
GRANT EXECUTE ON FUNCTION geo.fn_inherit_candidate_zone_assignments(uuid, uuid, uuid, uuid, numeric)
  TO jobs_worker, access_admin;

-- CONFIRMING COMMAND. The generic assignment/revocation/supersession
-- functions are the only path that can produce a COMMAND row, and they are
-- executable ONLY by access_admin â€” the minimal administrative principal.
-- Never app_api (the connection that consumes command scope), never
-- migration_owner as a runtime, never a superuser.
REVOKE ALL ON FUNCTION geo.fn_assign_incident_operational_zone(
  uuid, uuid, geo.incident_zone_assignment_kind_enum, geo.incident_zone_resolution_method_enum,
  uuid, uuid, evidence.confidence_level_enum, geo.zone_assignment_review_status_enum,
  timestamptz, timestamptz, uuid, uuid, varchar, varchar, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION geo.fn_revoke_incident_operational_zone_assignment(uuid, varchar, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION geo.fn_supersede_incident_operational_zone_assignment(
  uuid, uuid, geo.incident_zone_assignment_kind_enum, geo.incident_zone_resolution_method_enum,
  varchar, uuid, uuid, evidence.confidence_level_enum, geo.zone_assignment_review_status_enum,
  timestamptz, varchar, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION geo.fn_audit_incident_zone_change(
  varchar, uuid, uuid, uuid, geo.incident_zone_assignment_kind_enum,
  geo.incident_zone_resolution_method_enum, varchar, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION geo.fn_incident_zone_idempotency_key(
  uuid, uuid, geo.incident_zone_assignment_kind_enum, geo.incident_zone_resolution_method_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION geo.fn_incident_zone_idempotency_key(
  uuid, uuid, geo.incident_zone_assignment_kind_enum, geo.incident_zone_resolution_method_enum)
  TO app_api, ingest_worker, jobs_worker, readonly_inspector, access_admin;

GRANT EXECUTE ON FUNCTION geo.fn_assign_incident_operational_zone(
  uuid, uuid, geo.incident_zone_assignment_kind_enum, geo.incident_zone_resolution_method_enum,
  uuid, uuid, evidence.confidence_level_enum, geo.zone_assignment_review_status_enum,
  timestamptz, timestamptz, uuid, uuid, varchar, varchar, uuid, uuid, uuid) TO access_admin;
GRANT EXECUTE ON FUNCTION geo.fn_revoke_incident_operational_zone_assignment(uuid, varchar, uuid, uuid) TO access_admin;
GRANT EXECUTE ON FUNCTION geo.fn_supersede_incident_operational_zone_assignment(
  uuid, uuid, geo.incident_zone_assignment_kind_enum, geo.incident_zone_resolution_method_enum,
  varchar, uuid, uuid, evidence.confidence_level_enum, geo.zone_assignment_review_status_enum,
  timestamptz, varchar, uuid, uuid) TO access_admin;

