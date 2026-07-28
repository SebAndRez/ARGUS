-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 080 — Rollback. Must run after 090-100 rollbacks, before 070-010
-- rollbacks (070's operational_routes references mission.missions which is
-- fine; this wave's own deferred-FK ALTERs on governance/risk/mission must
-- be dropped before those waves roll back).

ALTER TABLE mission.mission_meeting_point_assignments DROP CONSTRAINT IF EXISTS fk_mmpa_meeting_point;
ALTER TABLE risk.exposed_populations DROP CONSTRAINT IF EXISTS fk_exposed_populations_operational_zone;
ALTER TABLE risk.exposed_populations DROP CONSTRAINT IF EXISTS fk_exposed_populations_administrative_area;
ALTER TABLE governance.jurisdictions DROP CONSTRAINT IF EXISTS fk_jurisdictions_primary_administrative_area;

REVOKE SELECT ON geo.operational_zones, geo.operational_sectors, geo.extraction_points,
  geo.reception_points, geo.meeting_points, geo.operational_routes, geo.perimeters
  FROM jobs_worker, readonly_inspector;
REVOKE SELECT, INSERT, UPDATE ON geo.operational_zones, geo.operational_sectors, geo.extraction_points,
  geo.reception_points, geo.meeting_points, geo.operational_routes, geo.perimeters FROM app_api;
REVOKE SELECT ON geo.administrative_areas FROM app_api, ingest_worker, jobs_worker, readonly_inspector;

DROP TABLE IF EXISTS geo.perimeters;
DROP TABLE IF EXISTS geo.operational_routes;
DROP TABLE IF EXISTS geo.meeting_points;
DROP TABLE IF EXISTS geo.reception_points;
DROP TABLE IF EXISTS geo.extraction_points;
DROP TABLE IF EXISTS geo.operational_sectors;
DROP TABLE IF EXISTS geo.operational_zones;
DROP TABLE IF EXISTS geo.administrative_areas;

DO $$ BEGIN DROP TYPE IF EXISTS geo.perimeter_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS geo.route_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS geo.meeting_point_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS geo.extraction_reception_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS geo.operational_sector_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS geo.operational_zone_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP SCHEMA IF EXISTS geo;
