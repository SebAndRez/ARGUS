-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 060 — Resources
-- Schema: resource (10 tables per Table Catalog v1.1 — the mandate's own
-- wave-assignment text says "9", undercounting `operational_unit_members`,
-- a new v1.1 table introduced by P1-01; the 10-table enumeration from the
-- frozen catalog is authoritative, matching the pattern already reconciled
-- in 010_foundation for governance's 13-vs-15 mismatch).
-- D-06 applies: CriticalPoi (530 rows) splits into 4 routes (A/B/C/D).
--
-- Authority: ARGUS_PHYSICAL_TABLE_CATALOG_v1.1_FROZEN.md §resource,
-- ARGUS_PHYSICAL_ACCESS_CONTROL_v1.1_FROZEN.md §4.11,
-- ARGUS_MIGRATION_DECISION_REGISTER_v1.0_FROZEN.md D-06.
--
-- VERIFY_AGAINST_V1.0: all tables except `resource.operational_unit_members`
-- (full ficha given directly, P1-01) and `resource.uncrewed_vehicle_profiles`/
-- `resource.resource_reservations` (full fichas given directly, P2-03/P2-10)
-- are reconstructed from cross-referenced clues, flagged per table.

CREATE SCHEMA IF NOT EXISTS resource;

-- ============================================================
-- 1. Local enums (resource_type_enum already created in governance schema,
--    Wave 010, reused unchanged here per that file's own note)
-- ============================================================
DO $$ BEGIN CREATE TYPE resource.resource_status_enum AS ENUM
  ('AVAILABLE','RESERVED','DEPLOYED','UNAVAILABLE','MAINTENANCE','OUT_OF_SERVICE',
   'DECOMMISSIONED','PENDING_VERIFICATION','LOST','DAMAGED','UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #61, 11
DO $$ BEGIN CREATE TYPE resource.inventory_movement_kind_enum AS ENUM
  ('RESTOCK','CONSUMPTION','ADJUSTMENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #62, 3
DO $$ BEGIN CREATE TYPE resource.comms_link_status_enum AS ENUM
  ('CONNECTED','DEGRADED','LOST'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #63, 3
DO $$ BEGIN CREATE TYPE resource.reservation_status_enum AS ENUM
  ('PENDING_CONFIRMATION','CONFIRMED','RELEASED','EXPIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #64, 4

-- ============================================================
-- 2. Tables
-- ============================================================

-- VERIFY_AGAINST_V1.0. D-06: destination for CriticalPoi route (A).
CREATE TABLE IF NOT EXISTS resource.resources (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type           governance.resource_type_enum NOT NULL,
  owner_organization_id   uuid NULL,
  status                  resource.resource_status_enum NOT NULL DEFAULT 'AVAILABLE',
  legacy_status           text NULL,
  legacy_source           varchar(100) NULL,
  legacy_record_id        text NULL,
  migration_confidence    varchar(10) NULL CHECK (migration_confidence IN ('HIGH','MEDIUM','LOW')),
  migration_review_status varchar(30) NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_resources_owner_organization FOREIGN KEY (owner_organization_id) REFERENCES institution.organizations(id) ON DELETE SET NULL
);

-- VERIFY_AGAINST_V1.0. 1:1 structural.
CREATE TABLE IF NOT EXISTS resource.operational_units (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL UNIQUE,
  name        varchar(255) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_operational_units_resource FOREIGN KEY (resource_id) REFERENCES resource.resources(id) ON DELETE RESTRICT
);
-- Note P2-12: operational_units.member_count is deliberately NOT a stored
-- column — served exclusively via proj.operational_unit_member_counts
-- (Wave 100), COUNT(*) over operational_unit_members WHERE left_at IS NULL.

-- Full ficha given directly in Table Catalog v1.1 (P1-01) — transcribed verbatim.
CREATE TABLE IF NOT EXISTS resource.operational_unit_members (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operational_unit_id uuid NOT NULL,
  member_type         varchar(20) NOT NULL,
  member_id           uuid NOT NULL,
  joined_at           timestamptz NOT NULL DEFAULT now(),
  left_at             timestamptz NULL,
  CONSTRAINT fk_oum_operational_unit FOREIGN KEY (operational_unit_id) REFERENCES resource.operational_units(id) ON DELETE CASCADE,
  CONSTRAINT ck_oum_member_type_whitelist CHECK (member_type IN ('PERSON','RESOURCE'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_oum_unit_member_active
  ON resource.operational_unit_members (operational_unit_id, member_type, member_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_oum_operational_unit_id ON resource.operational_unit_members (operational_unit_id);

-- VERIFY_AGAINST_V1.0. D-06: destination for CriticalPoi route (A), joined
-- with CriticalPoiOperationalStatus (108 rows, shelter category).
CREATE TABLE IF NOT EXISTS resource.facilities (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id             uuid NOT NULL UNIQUE,
  capacity_total          integer NULL,
  occupancy_current       integer NULL,
  legacy_status           text NULL,
  legacy_source           varchar(100) NULL,
  legacy_record_id        text NULL,
  migration_confidence    varchar(10) NULL,
  migration_review_status varchar(30) NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_facilities_resource FOREIGN KEY (resource_id) REFERENCES resource.resources(id) ON DELETE RESTRICT,
  CONSTRAINT ck_facilities_occupancy_le_capacity CHECK (occupancy_current IS NULL OR capacity_total IS NULL OR occupancy_current <= capacity_total)
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS resource.supplies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL UNIQUE,
  supply_kind varchar(100) NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_supplies_resource FOREIGN KEY (resource_id) REFERENCES resource.resources(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0. Destination for CriticalPoiOperationalStatus.capacityTotal/
-- .occupancyCurrent/.capacityDeclared (108 rows).
CREATE TABLE IF NOT EXISTS resource.inventories (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_id               uuid NOT NULL,
  quantity                numeric(12,2) NOT NULL DEFAULT 0,
  movement_kind           resource.inventory_movement_kind_enum NULL,
  legacy_status           text NULL,
  legacy_source           varchar(100) NULL,
  legacy_record_id        text NULL,
  migration_confidence    varchar(10) NULL,
  migration_review_status varchar(30) NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_inventories_supply FOREIGN KEY (supply_id) REFERENCES resource.supplies(id) ON DELETE RESTRICT,
  CONSTRAINT ck_inventories_quantity_non_negative CHECK (quantity >= 0)
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS resource.vehicle_profiles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id  uuid NOT NULL UNIQUE,
  vehicle_kind varchar(100) NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_vehicle_profiles_resource FOREIGN KEY (resource_id) REFERENCES resource.resources(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS resource.aircraft_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id   uuid NOT NULL UNIQUE,
  aircraft_kind varchar(100) NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_aircraft_profiles_resource FOREIGN KEY (resource_id) REFERENCES resource.resources(id) ON DELETE RESTRICT
);

-- Full ficha given directly in Table Catalog v1.1 (P2-03) — transcribed verbatim.
CREATE TABLE IF NOT EXISTS resource.uncrewed_vehicle_profiles (
  id                                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id                              uuid NOT NULL UNIQUE,
  vehicle_profile_id                       uuid NOT NULL,
  comms_link_status                        resource.comms_link_status_enum NULL,
  regulatory_restrictions                  jsonb NULL,
  regulatory_restrictions_schema_version   integer NOT NULL DEFAULT 1,
  CONSTRAINT fk_uvp_resource FOREIGN KEY (resource_id) REFERENCES resource.resources(id) ON DELETE RESTRICT,
  CONSTRAINT fk_uvp_vehicle_profile FOREIGN KEY (vehicle_profile_id) REFERENCES resource.vehicle_profiles(id) ON DELETE RESTRICT,
  CONSTRAINT ck_uvp_regulatory_restrictions_schema_version
    CHECK (regulatory_restrictions IS NULL OR regulatory_restrictions_schema_version >= 1)
);

-- Full ficha given directly in Table Catalog v1.1 (P2-10, refuerzo de P1-01)
-- — transcribed verbatim. Sustains Decisión Humana #3 congelada via
-- governance.resource_reservation_rules (Wave 010) — never codifies 5/15 min
-- thresholds here.
CREATE TABLE IF NOT EXISTS resource.resource_reservations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id        uuid NOT NULL,
  resource_id       uuid NOT NULL,
  status            resource.reservation_status_enum NOT NULL DEFAULT 'PENDING_CONFIRMATION',
  expires_at        timestamptz NOT NULL,
  extended_once     boolean NOT NULL DEFAULT false,
  extension_ceiling timestamptz NULL,
  idempotency_key   uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  released_at       timestamptz NULL,
  CONSTRAINT fk_resource_reservations_mission FOREIGN KEY (mission_id) REFERENCES mission.missions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_resource_reservations_resource FOREIGN KEY (resource_id) REFERENCES resource.resources(id) ON DELETE RESTRICT,
  CONSTRAINT uq_resource_reservations_idempotency_key UNIQUE (idempotency_key),
  CONSTRAINT ck_resource_reservations_extension_bounds
    CHECK (extended_once = false OR expires_at <= extension_ceiling)
);
-- Anti double-reservation partial unique index (Keys/Constraints v1.1 §4):
CREATE UNIQUE INDEX IF NOT EXISTS uq_resource_reservations_active_resource
  ON resource.resource_reservations (resource_id) WHERE status IN ('PENDING_CONFIRMATION','CONFIRMED');

-- Single-extension enforcement trigger (Keys/Constraints v1.1 §7.1):
CREATE OR REPLACE FUNCTION resource.fn_reservation_single_extension() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.extended_once = true AND NEW.extended_once = true THEN
    RAISE EXCEPTION 'resource_reservation_already_extended';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_resource_reservations_single_extension ON resource.resource_reservations;
CREATE TRIGGER trg_resource_reservations_single_extension
  BEFORE UPDATE ON resource.resource_reservations
  FOR EACH ROW
  WHEN (OLD.extended_once = true AND NEW.extended_once = true)
  EXECUTE FUNCTION resource.fn_reservation_single_extension();

-- ============================================================
-- 3. RLS (Access Control v1.1 §4.11)
-- ============================================================
ALTER TABLE resource.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource.resources FORCE ROW LEVEL SECURITY;
CREATE POLICY resources_institution_or_reservation ON resource.resources
  FOR ALL USING (
    security.fn_has_active_membership(current_setting('argus.actor_id')::uuid, owner_organization_id)
    OR EXISTS (SELECT 1 FROM resource.resource_reservations rr WHERE rr.resource_id = resources.id
      AND security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, rr.mission_id))
  );

ALTER TABLE resource.operational_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource.operational_units FORCE ROW LEVEL SECURITY;
CREATE POLICY operational_units_inherit ON resource.operational_units
  FOR ALL USING ( EXISTS (SELECT 1 FROM resource.resources r WHERE r.id = resource_id
    AND security.fn_has_active_membership(current_setting('argus.actor_id')::uuid, r.owner_organization_id)) );

ALTER TABLE resource.operational_unit_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource.operational_unit_members FORCE ROW LEVEL SECURITY;
CREATE POLICY oum_inherit ON resource.operational_unit_members
  FOR ALL USING (
    (member_type = 'PERSON' AND member_id = current_setting('argus.actor_id')::uuid)
    OR EXISTS (SELECT 1 FROM resource.operational_units ou JOIN resource.resources r ON r.id = ou.resource_id
      WHERE ou.id = operational_unit_id
        AND security.fn_has_active_membership(current_setting('argus.actor_id')::uuid, r.owner_organization_id))
  );

ALTER TABLE resource.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource.facilities FORCE ROW LEVEL SECURITY;
CREATE POLICY facilities_inherit ON resource.facilities
  FOR ALL USING ( EXISTS (SELECT 1 FROM resource.resources r WHERE r.id = resource_id
    AND security.fn_has_active_membership(current_setting('argus.actor_id')::uuid, r.owner_organization_id)) );

ALTER TABLE resource.supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource.supplies FORCE ROW LEVEL SECURITY;
CREATE POLICY supplies_inherit ON resource.supplies
  FOR ALL USING ( EXISTS (SELECT 1 FROM resource.resources r WHERE r.id = resource_id
    AND security.fn_has_active_membership(current_setting('argus.actor_id')::uuid, r.owner_organization_id)) );

ALTER TABLE resource.inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource.inventories FORCE ROW LEVEL SECURITY;
CREATE POLICY inventories_inherit ON resource.inventories
  FOR ALL USING ( EXISTS (SELECT 1 FROM resource.supplies s JOIN resource.resources r ON r.id = s.resource_id
    WHERE s.id = supply_id AND security.fn_has_active_membership(current_setting('argus.actor_id')::uuid, r.owner_organization_id)) );

ALTER TABLE resource.vehicle_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource.vehicle_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY vehicle_profiles_inherit ON resource.vehicle_profiles
  FOR ALL USING ( EXISTS (SELECT 1 FROM resource.resources r WHERE r.id = resource_id
    AND security.fn_has_active_membership(current_setting('argus.actor_id')::uuid, r.owner_organization_id)) );

ALTER TABLE resource.aircraft_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource.aircraft_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY aircraft_profiles_inherit ON resource.aircraft_profiles
  FOR ALL USING ( EXISTS (SELECT 1 FROM resource.resources r WHERE r.id = resource_id
    AND security.fn_has_active_membership(current_setting('argus.actor_id')::uuid, r.owner_organization_id)) );

ALTER TABLE resource.uncrewed_vehicle_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource.uncrewed_vehicle_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY uvp_inherit ON resource.uncrewed_vehicle_profiles
  FOR ALL USING ( EXISTS (SELECT 1 FROM resource.resources r WHERE r.id = resource_id
    AND security.fn_has_active_membership(current_setting('argus.actor_id')::uuid, r.owner_organization_id)) );

ALTER TABLE resource.resource_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource.resource_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY resource_reservations_assignment_or_ownership ON resource.resource_reservations
  FOR ALL USING (
    security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, mission_id)
    OR EXISTS (SELECT 1 FROM resource.resources r WHERE r.id = resource_id
      AND security.fn_has_active_membership(current_setting('argus.actor_id')::uuid, r.owner_organization_id))
  );

-- ============================================================
-- 4. Grants
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA resource TO app_api;
GRANT SELECT ON ALL TABLES IN SCHEMA resource TO jobs_worker, readonly_inspector;
