-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 060 — Rollback. Must run after 070-100 rollbacks (comms/alert/geo/ice
-- and later waves may FK into resource.resources), before 050-010 rollbacks.

REVOKE SELECT ON ALL TABLES IN SCHEMA resource FROM jobs_worker, readonly_inspector;
REVOKE SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA resource FROM app_api;

DROP TRIGGER IF EXISTS trg_resource_reservations_single_extension ON resource.resource_reservations;
DROP FUNCTION IF EXISTS resource.fn_reservation_single_extension();

-- Drop the MIGRATION_REVIEW_QUEUE view (backfill.sql) for completeness (it
-- reads migration_meta.critical_poi_review_queue, not a resource.* table
-- directly, so this isn't blocking the DROP TABLEs below, but leaving it
-- dangling after this wave rolls back would be stale).
DROP VIEW IF EXISTS resource.vw_migration_review_queue;

-- resources_institution_or_reservation (a policy ON resource.resources)
-- references resource.resource_reservations in its USING clause, which
-- blocks dropping resource_reservations while that policy still exists
-- (circular with the FK direction, which requires resource_reservations
-- dropped before resources) - drop the policy explicitly first, same
-- pattern as Wave 090's family_networks_member fix.
DROP POLICY IF EXISTS resources_institution_or_reservation ON resource.resources;
DROP TABLE IF EXISTS resource.resource_reservations;
DROP TABLE IF EXISTS resource.uncrewed_vehicle_profiles;
DROP TABLE IF EXISTS resource.aircraft_profiles;
DROP TABLE IF EXISTS resource.vehicle_profiles;
DROP TABLE IF EXISTS resource.inventories;
DROP TABLE IF EXISTS resource.supplies;
DROP TABLE IF EXISTS resource.facilities;
DROP TABLE IF EXISTS resource.operational_unit_members;
DROP TABLE IF EXISTS resource.operational_units;
DROP TABLE IF EXISTS resource.resources;

DO $$ BEGIN DROP TYPE IF EXISTS resource.reservation_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS resource.comms_link_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS resource.inventory_movement_kind_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS resource.resource_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
-- governance.resource_type_enum is NOT dropped here — owned by 010_foundation.

DROP SCHEMA IF EXISTS resource;
