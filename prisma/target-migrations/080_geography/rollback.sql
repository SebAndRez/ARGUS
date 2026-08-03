-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 080 — Rollback. Must run after 090-100 rollbacks, before 070-010
-- rollbacks (070's operational_routes references mission.missions which is
-- fine; this wave's own deferred-FK ALTERs on governance/risk/mission must
-- be dropped before those waves roll back).

-- ============================================================
-- R31 — reverse the incident -> zone -> jurisdiction -> command chain FIRST
-- ============================================================
-- Ordered before everything else in this file because these objects depend on
-- geo.operational_zones (dropped below) AND on incident.incidents /
-- command.command_roles (dropped by Wave 040, which runs AFTER this file).
-- Dropping the relation here is what lets Wave 040 drop incident.incidents
-- without a dependency error — the reverse of why the relation was created in
-- this wave rather than in 040.
--
-- security.fn_has_command_role is RESTORED to its Wave 040 body rather than
-- dropped: waves 040-070 still have live RLS policies that call it, and a
-- rollback that left it pointing at a dropped geo.* table would break every
-- one of them between this wave's rollback and Wave 040's. The restored body
-- is byte-for-byte the one 040_incident/migration.sql installs, so a
-- rollback-then-reapply of THIS wave alone is a true round trip.
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

DROP FUNCTION IF EXISTS geo.fn_inherit_candidate_zone_assignments(uuid, uuid, uuid, uuid, numeric);
DROP FUNCTION IF EXISTS geo.fn_persist_incident_zone_resolution(uuid, uuid, uuid, numeric);
DROP FUNCTION IF EXISTS geo.fn_supersede_incident_operational_zone_assignment(
  uuid, uuid, geo.incident_zone_assignment_kind_enum, geo.incident_zone_resolution_method_enum,
  varchar, uuid, uuid, evidence.confidence_level_enum, geo.zone_assignment_review_status_enum,
  timestamptz, varchar, uuid, uuid);
DROP FUNCTION IF EXISTS geo.fn_revoke_incident_operational_zone_assignment(uuid, varchar, uuid, uuid);
DROP FUNCTION IF EXISTS geo.fn_assign_incident_operational_zone(
  uuid, uuid, geo.incident_zone_assignment_kind_enum, geo.incident_zone_resolution_method_enum,
  uuid, uuid, evidence.confidence_level_enum, geo.zone_assignment_review_status_enum,
  timestamptz, timestamptz, uuid, uuid, varchar, varchar, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS geo.fn_audit_incident_zone_change(
  varchar, uuid, uuid, uuid, geo.incident_zone_assignment_kind_enum,
  geo.incident_zone_resolution_method_enum, varchar, uuid, uuid, text);
DROP FUNCTION IF EXISTS geo.fn_resolve_candidate_operational_zones(uuid, numeric);
DROP FUNCTION IF EXISTS geo.fn_resolve_incident_operational_zones(uuid, numeric);
DROP FUNCTION IF EXISTS geo.fn_resolve_zones_for_geography(geography, numeric);
DROP FUNCTION IF EXISTS geo.fn_candidate_resolution_geography(uuid);
DROP FUNCTION IF EXISTS geo.fn_incident_resolution_geography(uuid);
DROP FUNCTION IF EXISTS geo.fn_incident_zone_idempotency_key(
  uuid, uuid, geo.incident_zone_assignment_kind_enum, geo.incident_zone_resolution_method_enum);
DROP FUNCTION IF EXISTS geo.fn_incident_command_jurisdictions(uuid);
DROP FUNCTION IF EXISTS geo.fn_incident_effective_jurisdictions(uuid, geo.incident_zone_assignment_kind_enum);

-- Policies and grants go with their tables (DROP TABLE removes both), but the
-- schema-level USAGE granted to audit_reader by this wave does not, so it is
-- revoked explicitly.
DROP TABLE IF EXISTS command.command_role_jurisdiction_scopes;
DROP TABLE IF EXISTS geo.incident_operational_zone_assignments;
DROP TABLE IF EXISTS geo.operational_zone_jurisdiction_assignments;

ALTER TABLE governance.automation_rules DROP COLUMN IF EXISTS command_scope_authorized;

DO $$ BEGIN DROP TYPE IF EXISTS command.command_role_scope_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS geo.spatial_resolution_outcome_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS geo.zone_jurisdiction_assignment_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS geo.zone_jurisdiction_relation_kind_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS geo.zone_assignment_review_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS geo.incident_zone_assignment_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS geo.incident_zone_resolution_method_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS geo.incident_zone_assignment_kind_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;

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
REVOKE USAGE ON SCHEMA geo FROM audit_reader, access_admin;
REVOKE USAGE ON SCHEMA evidence FROM access_admin;

-- Drop the MIGRATION_REVIEW_QUEUE view (backfill.sql, shares Wave 060's
-- migration_meta.critical_poi_review_queue staging table).
DROP VIEW IF EXISTS geo.vw_migration_review_queue;

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
