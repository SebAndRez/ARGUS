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
