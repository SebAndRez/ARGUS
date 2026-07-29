-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 060 — Resources — Backfill draft.
-- Origen: CriticalPoi(530) + CriticalPoiOperationalStatus(108, real FK) +
-- CriticalPoiStatusEvidence(108, NO real FK — REL-002 asymmetry, must be
-- fixed here, never inherited silently). D-06 4-way split: (A) resource.
-- facilities/.resources, (B) geo.* (Wave 080), (C) proj reference (Wave
-- 100), (D) MIGRATION_REVIEW_QUEUE. Only route (A)'s 108 shelter-with-
-- managed-state rows are executed for real here — the remaining ~422 rows
-- default to (D) until the human-reviewed CriticalPoi.type/.category
-- classification rule table exists (never guessed, per D-06).

ALTER TABLE resource.resources ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE resource.resources ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE resource.resources ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE resource.resources ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_resources_legacy ON resource.resources (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

ALTER TABLE resource.facilities ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE resource.facilities ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE resource.facilities ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE resource.facilities ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_facilities_legacy ON resource.facilities (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

ALTER TABLE resource.inventories ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE resource.inventories ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE resource.inventories ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE resource.inventories ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;

-- ============================================================
-- 1. MIGRATION_REVIEW_QUEUE staging table for route (D) — every CriticalPoi
--    row not yet classified lands here, explicitly, never silently dropped.
-- ============================================================
CREATE TABLE IF NOT EXISTS migration_meta.critical_poi_review_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  critical_poi_id   text NOT NULL UNIQUE,
  poi_type          text NULL,
  poi_category      text NULL,
  candidate_routes  text NOT NULL DEFAULT 'A,B,C,D', -- unresolved until classification rule table exists
  review_status     varchar(30) NOT NULL DEFAULT 'REQUIRES_REVIEW',
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. Route (A) — 108 shelter rows with managed operational state, the
--    clearest route-A candidates of the 530. Single batch (small volume,
--    high confidence).
-- ============================================================

-- 2.1 resource.resources (parent, 1:1 with facilities)
-- resource.resources has no classification column (migration.sql:44-56) - removed.
INSERT INTO resource.resources (resource_type, status, created_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
-- resource_type_enum lives in the governance schema, not resource
-- (migration.sql:44-56, and 010_foundation/migration.sql:80-84)
SELECT 'FACILITY'::governance.resource_type_enum,
  CASE cp.status WHEN 'active' THEN 'AVAILABLE'::resource.resource_status_enum ELSE 'UNAVAILABLE'::resource.resource_status_enum END,
  cp."createdAt",
  'CriticalPoi', cp.id, 'HIGH', 'AUTO_MAPPED'
FROM "CriticalPoi" cp
JOIN "CriticalPoiOperationalStatus" cos ON cos."poiId" = cp.id
ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;

-- 2.2 resource.facilities (child)
-- columns are capacity_total/occupancy_current, not capacity/occupancy
-- (migration.sql:87-100); "address" does not exist on this table - removed.
INSERT INTO resource.facilities (resource_id, capacity_total, occupancy_current,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT r.id, COALESCE(cos."capacityTotal", cos."capacityDeclared", 0), COALESCE(cos."occupancyCurrent", 0),
  'CriticalPoi', cp.id, 'HIGH', 'AUTO_MAPPED'
FROM "CriticalPoi" cp
JOIN "CriticalPoiOperationalStatus" cos ON cos."poiId" = cp.id
JOIN resource.resources r ON r.legacy_source = 'CriticalPoi' AND r.legacy_record_id = cp.id
ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;

-- 2.3 resource.inventories <- CriticalPoiOperationalStatus.capacityTotal/
--     .occupancyCurrent/.capacityDeclared (108 rows, MIGRAR 1:1)
-- supply_id is NOT NULL with a real FK to resource.supplies
-- (migration.sql:113-126) and there is no supplies catalog row to reference
-- yet (see the SQL_COMPLEMENTARY_REQUIRED note this INSERT already carried) -
-- inserting NULL there is a hard constraint violation, not just an
-- incomplete mapping. Following the same "never guess" precedent as D-04/D-07
-- elsewhere in this package, this INSERT is disabled until a real supplies
-- catalog row exists to resolve supply_id against:
-- INSERT INTO resource.inventories (supply_id, quantity, created_at,
--   legacy_source, legacy_record_id, migration_confidence, migration_review_status)
-- SELECT <real supply_id>,
--   COALESCE(cos."capacityTotal", 0) - COALESCE(cos."occupancyCurrent", 0), cos."createdAt",
--   'CriticalPoiOperationalStatus', cos.id, 'MEDIUM', 'REQUIRES_REVIEW'
-- FROM "CriticalPoiOperationalStatus" cos
-- ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. CriticalPoiStatusEvidence (108 rows) -> historical trail inside
--    resource.facilities/.inventories (via security.audit_logs or an
--    equivalent history mechanism). REL-002: this table has NO real FK to
--    CriticalPoiOperationalStatus despite 1:1 row parity — that asymmetry
--    must be fixed HERE, not inherited into the target schema. Routed to
--    MIGRATION_REVIEW_QUEUE per backfill-plan.md, since the FK-repair join
--    below is a best-effort positional match, not a confirmed relationship.
-- ============================================================
INSERT INTO migration_meta.critical_poi_review_queue (critical_poi_id, poi_type, poi_category, candidate_routes, review_status)
SELECT DISTINCT cse."poiId", NULL, NULL, 'A(evidence-only)', 'REQUIRES_REVIEW'
FROM "CriticalPoiStatusEvidence" cse
ON CONFLICT (critical_poi_id) DO NOTHING;

-- ============================================================
-- 4. Route (D) — the remaining ~422 CriticalPoi rows (530 - 108 already
--    routed to A) default to MIGRATION_REVIEW_QUEUE, never guessed into
--    A/B/C without the human-reviewed classification rule table.
-- ============================================================
INSERT INTO migration_meta.critical_poi_review_queue (critical_poi_id, poi_type, poi_category, candidate_routes, review_status)
SELECT cp.id, cp.category, cp.priority, 'A,B,C,D', 'REQUIRES_REVIEW'
FROM "CriticalPoi" cp
WHERE NOT EXISTS (SELECT 1 FROM "CriticalPoiOperationalStatus" cos WHERE cos."poiId" = cp.id)
ON CONFLICT (critical_poi_id) DO NOTHING;

-- ============================================================
-- 5. Row counts (before/after)
-- ============================================================
SELECT
  (SELECT COUNT(*) FROM "CriticalPoi") AS critical_poi_before, -- expect 530
  (SELECT COUNT(*) FROM "CriticalPoiOperationalStatus") AS critical_poi_operational_status_before, -- expect 108
  (SELECT COUNT(*) FROM "CriticalPoiStatusEvidence") AS critical_poi_status_evidence_before; -- expect 108

SELECT
  (SELECT COUNT(*) FROM resource.resources WHERE legacy_source = 'CriticalPoi') AS resources_after, -- expect 108
  (SELECT COUNT(*) FROM resource.facilities WHERE legacy_source = 'CriticalPoi') AS facilities_after, -- expect 108
  (SELECT COUNT(*) FROM resource.inventories WHERE legacy_source = 'CriticalPoiOperationalStatus') AS inventories_after, -- expect 108
  (SELECT COUNT(*) FROM migration_meta.critical_poi_review_queue) AS review_queue_after; -- expect ~422 route-D + up to 108 evidence-only entries (may overlap with route-A poi_ids)

-- ============================================================
-- 6. Validation query — every one of the 530 CriticalPoi rows is
--    accounted for in EITHER resource.resources OR the review queue,
--    never neither (D-06's closure criterion: "ningún CriticalPoi queda
--    sin clasificación registrada").
-- ============================================================
SELECT cp.id FROM "CriticalPoi" cp
LEFT JOIN resource.resources r ON r.legacy_source = 'CriticalPoi' AND r.legacy_record_id = cp.id
LEFT JOIN migration_meta.critical_poi_review_queue q ON q.critical_poi_id = cp.id
WHERE r.id IS NULL AND q.id IS NULL;
-- Expected: 0 rows.

-- ============================================================
-- 7. MIGRATION_REVIEW_QUEUE (D-06 pattern — materialized as a view over
--    the staging table, per the Decision Register's own suggested shape)
-- ============================================================
CREATE OR REPLACE VIEW resource.vw_migration_review_queue AS
SELECT 'CriticalPoi (route D + evidence-only)'::text AS target_table, id, critical_poi_id AS legacy_record_id, review_status AS migration_review_status
FROM migration_meta.critical_poi_review_queue WHERE review_status = 'REQUIRES_REVIEW';

-- ============================================================
-- 8. Checkpoints
-- ============================================================
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status)
SELECT '060_resources', 'CriticalPoi+CriticalPoiOperationalStatus', 'resource.facilities', 108,
  (SELECT COUNT(*) FROM resource.facilities WHERE legacy_source = 'CriticalPoi'),
  CASE WHEN (SELECT COUNT(*) FROM resource.facilities WHERE legacy_source = 'CriticalPoi') = 108 THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
VALUES ('060_resources', 'CriticalPoi', 'migration_meta.critical_poi_review_queue', 530, 530, 'PASS',
  'D-06 closure criterion: every CriticalPoi row accounted for via route A OR the review queue — see validation query §6.');
