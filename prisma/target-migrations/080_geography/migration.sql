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
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE geo.reception_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.reception_points FORCE ROW LEVEL SECURITY;
CREATE POLICY reception_points_operational ON geo.reception_points
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE geo.meeting_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.meeting_points FORCE ROW LEVEL SECURITY;
CREATE POLICY meeting_points_served_via_assignment ON geo.meeting_points
  FOR ALL USING ( EXISTS (SELECT 1 FROM mission.mission_meeting_point_assignments mmpa
    WHERE mmpa.meeting_point_id = meeting_points.id
      AND security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, mmpa.mission_id))
    OR current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

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
GRANT SELECT ON geo.administrative_areas TO app_api, ingest_worker, jobs_worker, readonly_inspector;
-- Write to administrative_areas is exclusive to migration_owner (no GRANT to
-- any runtime role) — enforces the PUBLIC-catalog "write exclusive to
-- governance" pattern from Access Control v1.1 §7.
GRANT SELECT, INSERT, UPDATE ON geo.operational_zones, geo.operational_sectors, geo.extraction_points,
  geo.reception_points, geo.meeting_points, geo.operational_routes, geo.perimeters TO app_api;
GRANT SELECT ON geo.operational_zones, geo.operational_sectors, geo.extraction_points,
  geo.reception_points, geo.meeting_points, geo.operational_routes, geo.perimeters
  TO jobs_worker, readonly_inspector;
