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
--
-- ONE MAPPING, TWO CALLERS (Paso 5): the CriticalPoi transform lives in
-- migration_meta.fn_sync_critical_pois(p_ids) — NULL = every row. This file
-- calls it with NULL (the backfill); the application's shadow-write
-- (criticalPoiPersistenceService / the shelter-status writers) calls it with
-- the ids it just committed. See 030's header for the shared contract.

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
-- 2. Route (A) + route (D) + status evidence, in one function
-- ============================================================
-- Route (A): a POI with managed operational state (the 1:1
-- CriticalPoiOperationalStatus row) becomes resource.resources +
-- resource.facilities — the clearest route-A candidates of the 530.
-- Route (D): every other POI lands in the review queue with its legacy
-- category as the D-06 classifier input. Legacy CriticalPoi has no "type"
-- column, so poi_type stays NULL; the earlier draft wrote category into
-- poi_type and PRIORITY into poi_category.
-- CriticalPoiStatusEvidence: one disposition per EVIDENCE ROW (an earlier
-- draft only flagged the parent POI, and did it FIRST, so a POI with
-- evidence and no operational status entered the queue with a NULL category
-- and its real category was then skipped by ON CONFLICT). Status evidence has
-- no target home until D-06 decides the route of its POI.
--
-- Mutable in legacy (the shelter-status writers update these continuously):
-- CriticalPoi.status -> resources.status; CriticalPoiOperationalStatus
-- capacity/occupancy -> facilities.capacity_total/.occupancy_current;
-- CriticalPoi.category -> the queue row's poi_category.
-- A POI that CROSSES between route A and the queue (operational status
-- appears or disappears after the first sync) is a disposition change: it is
-- never moved automatically, it returns BLOCKED_RECLASSIFICATION, and
-- dual-read reports it. D-06 owns that call, not this function.
-- p_ids NULL = every CriticalPoi row.
-- ============================================================
-- Paso 6A: sync_worker is the runtime principal for every fn_sync_* in
-- this file. Each function is declared SECURITY DEFINER and granted
-- EXECUTE to sync_worker alone (PUBLIC is revoked first, and app_api /
-- ingest_worker / jobs_worker are never granted). sync_worker holds no
-- table privilege in any target schema, so this EXECUTE is its only way
-- in, and what it can do through it is exactly the mapping written here —
-- for legacy ids that already exist, with no caller-supplied SQL.
-- ============================================================

CREATE OR REPLACE FUNCTION migration_meta.fn_sync_critical_pois(p_ids text[])
RETURNS TABLE (source_table text, legacy_record_id text, target_table text, action text, detail text)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
#variable_conflict use_column
BEGIN
  -- 2.1 resource.resources (parent, 1:1 with facilities)
  -- resource.resources has no classification column (migration.sql:44-56).
  -- resource_type_enum lives in the governance schema, not resource
  -- (migration.sql:44-56, and 010_foundation/migration.sql:80-84).
  RETURN QUERY
  WITH scope AS (
    SELECT cp.id,
      CASE lower(cp.status) WHEN 'active' THEN 'AVAILABLE'::resource.resource_status_enum ELSE 'UNAVAILABLE'::resource.resource_status_enum END AS status,
      cp."createdAt" AT TIME ZONE 'UTC' AS created_at
    FROM "CriticalPoi" cp
    JOIN "CriticalPoiOperationalStatus" cos ON cos."poiId" = cp.id
    WHERE (p_ids IS NULL OR cp.id = ANY(p_ids))
      AND NOT EXISTS (SELECT 1 FROM migration_meta.critical_poi_review_queue q WHERE q.critical_poi_id = cp.id)
  ), up AS (
    INSERT INTO resource.resources AS t (resource_type, status, created_at,
      legacy_source, legacy_record_id, migration_confidence, migration_review_status)
    SELECT 'FACILITY'::resource.resource_type_enum, s.status, s.created_at,
      'CriticalPoi', s.id, 'HIGH', 'AUTO_MAPPED'
    FROM scope s
    ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO UPDATE SET
      status = EXCLUDED.status
    WHERE t.status IS DISTINCT FROM EXCLUDED.status
    RETURNING t.legacy_record_id AS lid, (t.xmax = 0) AS ins
  )
  SELECT 'CriticalPoi'::text, s.id, 'resource.resources'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' WHEN up.ins THEN 'INSERTED' ELSE 'UPDATED' END, NULL::text
  FROM scope s LEFT JOIN up ON up.lid = s.id;

  -- 2.2 resource.facilities (child)
  -- columns are capacity_total/occupancy_current, not capacity/occupancy
  -- (migration.sql:87-100); "address" does not exist on this table.
  RETURN QUERY
  WITH scope AS (
    SELECT cp.id, r.id AS resource_id,
      COALESCE(cos."capacityTotal", cos."capacityDeclared", 0) AS capacity_total,
      COALESCE(cos."occupancyCurrent", 0) AS occupancy_current
    FROM "CriticalPoi" cp
    JOIN "CriticalPoiOperationalStatus" cos ON cos."poiId" = cp.id
    JOIN resource.resources r ON r.legacy_source = 'CriticalPoi' AND r.legacy_record_id = cp.id
    WHERE p_ids IS NULL OR cp.id = ANY(p_ids)
  ), up AS (
    INSERT INTO resource.facilities AS t (resource_id, capacity_total, occupancy_current,
      legacy_source, legacy_record_id, migration_confidence, migration_review_status)
    SELECT s.resource_id, s.capacity_total, s.occupancy_current,
      'CriticalPoi', s.id, 'HIGH', 'AUTO_MAPPED'
    FROM scope s
    ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO UPDATE SET
      capacity_total = EXCLUDED.capacity_total, occupancy_current = EXCLUDED.occupancy_current
    WHERE (t.capacity_total, t.occupancy_current) IS DISTINCT FROM (EXCLUDED.capacity_total, EXCLUDED.occupancy_current)
    RETURNING t.legacy_record_id AS lid, (t.xmax = 0) AS ins
  )
  SELECT 'CriticalPoi'::text, s.id, 'resource.facilities'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' WHEN up.ins THEN 'INSERTED' ELSE 'UPDATED' END, NULL::text
  FROM scope s LEFT JOIN up ON up.lid = s.id;

  -- 2.3 resource.inventories <- CriticalPoiOperationalStatus.capacityTotal/
  --     .occupancyCurrent/.capacityDeclared (MIGRAR 1:1)
  -- supply_id is NOT NULL with a real FK to resource.supplies
  -- (migration.sql:113-126) and there is no supplies catalog row to reference
  -- yet — inserting NULL there is a hard constraint violation, not just an
  -- incomplete mapping. Following the same "never guess" precedent as
  -- D-04/D-07 elsewhere in this package, that INSERT stays disabled until a
  -- real supplies catalog row exists to resolve supply_id against.

  -- 2.4 Route (D) — the remaining POIs default to MIGRATION_REVIEW_QUEUE,
  --     never guessed into A/B/C without the human-reviewed rule table.
  RETURN QUERY
  WITH scope AS (
    SELECT cp.id, cp.category AS poi_category
    FROM "CriticalPoi" cp
    WHERE (p_ids IS NULL OR cp.id = ANY(p_ids))
      AND NOT EXISTS (SELECT 1 FROM "CriticalPoiOperationalStatus" cos WHERE cos."poiId" = cp.id)
      AND NOT EXISTS (SELECT 1 FROM resource.resources r WHERE r.legacy_source = 'CriticalPoi' AND r.legacy_record_id = cp.id)
  ), up AS (
    INSERT INTO migration_meta.critical_poi_review_queue AS t (critical_poi_id, poi_type, poi_category, candidate_routes, review_status)
    SELECT s.id, NULL, s.poi_category, 'A,B,C,D', 'REQUIRES_REVIEW' FROM scope s
    ON CONFLICT (critical_poi_id) DO UPDATE SET poi_category = EXCLUDED.poi_category
    WHERE t.poi_category IS DISTINCT FROM EXCLUDED.poi_category
    RETURNING t.critical_poi_id AS lid, (t.xmax = 0) AS ins
  )
  SELECT 'CriticalPoi'::text, s.id, 'migration_meta.critical_poi_review_queue'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' WHEN up.ins THEN 'INSERTED' ELSE 'UPDATED' END, 'D-06'::text
  FROM scope s LEFT JOIN up ON up.lid = s.id;

  -- 2.5 Disposition changes between route A and the queue: reported, never applied.
  RETURN QUERY
  SELECT 'CriticalPoi'::text, cp.id,
    CASE WHEN has_op THEN 'resource.resources' ELSE 'migration_meta.critical_poi_review_queue' END,
    'BLOCKED_RECLASSIFICATION'::text,
    CASE WHEN has_op THEN 'OPERATIONAL_STATUS_APPEARED_AFTER_QUEUEING' ELSE 'OPERATIONAL_STATUS_REMOVED_AFTER_ROUTE_A' END
  FROM (
    SELECT cp.id,
      EXISTS (SELECT 1 FROM "CriticalPoiOperationalStatus" cos WHERE cos."poiId" = cp.id) AS has_op,
      EXISTS (SELECT 1 FROM resource.resources r WHERE r.legacy_source = 'CriticalPoi' AND r.legacy_record_id = cp.id) AS in_route_a,
      EXISTS (SELECT 1 FROM migration_meta.critical_poi_review_queue q WHERE q.critical_poi_id = cp.id) AS in_queue
    FROM "CriticalPoi" cp
    WHERE p_ids IS NULL OR cp.id = ANY(p_ids)
  ) cp
  WHERE (cp.has_op AND cp.in_queue) OR (NOT cp.has_op AND cp.in_route_a);

  -- 2.6 CriticalPoiStatusEvidence — one deferral per evidence row.
  RETURN QUERY
  WITH scope AS (
    SELECT cse.id FROM "CriticalPoiStatusEvidence" cse
    WHERE p_ids IS NULL OR cse."poiId" = ANY(p_ids)
  ), def AS (
    INSERT INTO migration_meta.legacy_deferred_rows AS t (source_table, legacy_record_id, wave, reason, pending_decision)
    SELECT 'CriticalPoiStatusEvidence', s.id, '060_resources', 'STATUS_EVIDENCE_PENDING_ROUTE', 'D-06 CriticalPoi route classification'
    FROM scope s
    ON CONFLICT (source_table, legacy_record_id) DO NOTHING
    RETURNING t.legacy_record_id AS lid
  )
  SELECT 'CriticalPoiStatusEvidence'::text, s.id, 'migration_meta.legacy_deferred_rows'::text,
    CASE WHEN def.lid IS NULL THEN 'ALREADY_DEFERRED' ELSE 'DEFERRED' END, 'D-06'::text
  FROM scope s LEFT JOIN def ON def.lid = s.id;

  RETURN QUERY
  SELECT 'CriticalPoi'::text, u.id, NULL::text, 'LEGACY_NOT_FOUND'::text, NULL::text
  FROM unnest(p_ids) AS u(id)
  WHERE NOT EXISTS (SELECT 1 FROM "CriticalPoi" cp WHERE cp.id = u.id);
END
$fn$;
REVOKE ALL ON FUNCTION migration_meta.fn_sync_critical_pois(text[]) FROM PUBLIC;
ALTER FUNCTION migration_meta.fn_sync_critical_pois(text[]) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION migration_meta.fn_sync_critical_pois(text[]) TO sync_worker;

SELECT source_table, target_table, action, count(*) AS rows FROM migration_meta.fn_sync_critical_pois(NULL) GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

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
  (SELECT COUNT(*) FROM resource.inventories WHERE legacy_source = 'CriticalPoiOperationalStatus') AS inventories_after, -- expect 0: operational status lands in resource.facilities (capacity/occupancy), no inventory rows
  (SELECT COUNT(*) FROM migration_meta.critical_poi_review_queue) AS review_queue_after; -- expect ~422 route-D entries

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
-- Expected counts come from the source, never constants; the 530-row
-- "PASS" an earlier draft inserted as a literal is now actually measured.
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status)
SELECT '060_resources', 'CriticalPoiOperationalStatus', 'resource.facilities', e.n, a.n, CASE WHEN a.n = e.n THEN 'PASS' ELSE 'FAIL' END
FROM (SELECT COUNT(DISTINCT cos."poiId") AS n FROM "CriticalPoiOperationalStatus" cos) e,
     (SELECT COUNT(*) AS n FROM resource.facilities WHERE legacy_source = 'CriticalPoi') a;
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
SELECT '060_resources', 'CriticalPoi', 'resource.resources + migration_meta.critical_poi_review_queue', e.n, a.n,
  CASE WHEN a.n = e.n THEN 'PASS' ELSE 'FAIL' END,
  'D-06 closure criterion: every CriticalPoi row accounted for exactly once, via route A OR the review queue.'
FROM (SELECT COUNT(*) AS n FROM "CriticalPoi") e,
     (SELECT COUNT(*) AS n FROM "CriticalPoi" cp
      WHERE (EXISTS (SELECT 1 FROM resource.resources r WHERE r.legacy_source = 'CriticalPoi' AND r.legacy_record_id = cp.id))
          <> (EXISTS (SELECT 1 FROM migration_meta.critical_poi_review_queue q WHERE q.critical_poi_id = cp.id))) a;
