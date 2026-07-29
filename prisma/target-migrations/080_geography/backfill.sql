-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 080 — Geography — Backfill draft.
-- Origen: geo.administrative_areas has NO current-database source (D-07,
-- EXTERNAL_SOURCE_REQUIRED). geo.meeting_points/.extraction_points/
-- .reception_points draw from the SAME CriticalPoi route-(B) subset as
-- Wave 060's resource.* route (A) — until the human-reviewed classification
-- rule table exists, every candidate row defaults to MIGRATION_REVIEW_QUEUE
-- (D-06's "never guess" mandate, continued from Wave 060).

ALTER TABLE geo.meeting_points ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE geo.meeting_points ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE geo.meeting_points ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE geo.meeting_points ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
ALTER TABLE geo.extraction_points ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE geo.extraction_points ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE geo.extraction_points ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE geo.extraction_points ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
ALTER TABLE geo.reception_points ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE geo.reception_points ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE geo.reception_points ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE geo.reception_points ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;

-- ============================================================
-- 1. geo.administrative_areas — D-07, EXTERNAL_SOURCE_REQUIRED. No SELECT
--    FROM any current table — there is no polygon data anywhere to
--    migrate, and constructing one from CriticalPoi/KnowledgeIncident/etc.
--    lat/lng pairs would be fabricated geometry presented as official.
--    Table is created empty, deliberately, by migration.sql's DDL alone —
--    no INSERT statement of any kind belongs in this file.
-- ============================================================

-- ============================================================
-- 2. geo.meeting_points / .extraction_points / .reception_points — every
--    candidate is currently sitting in migration_meta.critical_poi_review_
--    queue (Wave 060) with candidate_routes containing 'B' — none has been
--    promoted out of REQUIRES_REVIEW because the classification rule table
--    does not exist yet. This wave's INSERT statements are therefore
--    intentionally 0-effect until Wave 060's classification is approved —
--    kept executable (not commented out) so they activate the moment that
--    approval lands, consistent with D-06's precedent.
-- ============================================================
-- none of geo.meeting_points/.extraction_points/.reception_points has a
-- "name" column (migration.sql:92-138) - removed from all three INSERTs below.
INSERT INTO geo.meeting_points (location,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT NULL::geography, -- SQL_COMPLEMENTARY_REQUIRED: ST_MakePoint(cp.longitude, cp.latitude)::geography, deferred until row is approved out of review
  'CriticalPoi', cp.id, 'LOW', 'REQUIRES_REVIEW'
FROM "CriticalPoi" cp
JOIN migration_meta.critical_poi_review_queue q ON q.critical_poi_id = cp.id AND q.candidate_routes LIKE '%B%'
WHERE q.review_status = 'REVIEWED_APPROVED' -- never true until a human approves the classification rule
ON CONFLICT DO NOTHING;

INSERT INTO geo.extraction_points (location,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT NULL::geography,
  'CriticalPoi', cp.id, 'LOW', 'REQUIRES_REVIEW'
FROM "CriticalPoi" cp
JOIN migration_meta.critical_poi_review_queue q ON q.critical_poi_id = cp.id AND q.candidate_routes LIKE '%B%'
WHERE q.review_status = 'REVIEWED_APPROVED'
ON CONFLICT DO NOTHING;

INSERT INTO geo.reception_points (location,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT NULL::geography,
  'CriticalPoi', cp.id, 'LOW', 'REQUIRES_REVIEW'
FROM "CriticalPoi" cp
JOIN migration_meta.critical_poi_review_queue q ON q.critical_poi_id = cp.id AND q.candidate_routes LIKE '%B%'
WHERE q.review_status = 'REVIEWED_APPROVED'
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. geo.operational_zones / .operational_sectors / .operational_routes /
--    .perimeters — CREATE_EMPTY, no current-database source. No INSERT.
-- ============================================================

-- ============================================================
-- 4. Row counts (before/after)
-- ============================================================
SELECT COUNT(*) AS critical_poi_route_b_candidates FROM migration_meta.critical_poi_review_queue WHERE candidate_routes LIKE '%B%';
-- "no verificado" exact count until classification rule runs — this is the
-- ceiling on how many rows COULD move into meeting/extraction/reception points.

SELECT
  (SELECT COUNT(*) FROM geo.administrative_areas) AS administrative_areas_after, -- expect 0 (D-07, always)
  (SELECT COUNT(*) FROM geo.meeting_points) AS meeting_points_after, -- expect 0 until classification approved
  (SELECT COUNT(*) FROM geo.extraction_points) AS extraction_points_after,
  (SELECT COUNT(*) FROM geo.reception_points) AS reception_points_after;

-- ============================================================
-- 5. Validation query — D-07: administrative_areas must remain 0; any
--    nonzero value means synthetic geometry was inserted in violation of
--    D-07 and must be investigated immediately.
-- ============================================================
SELECT COUNT(*) FROM geo.administrative_areas;
-- Expected: 0, always, unconditionally, in this migration.

-- ============================================================
-- 6. MIGRATION_REVIEW_QUEUE — shares the Wave 060 staging table
--    (migration_meta.critical_poi_review_queue) rather than duplicating it,
--    since the same CriticalPoi row is the review unit for both waves'
--    route classification.
-- ============================================================
CREATE OR REPLACE VIEW geo.vw_migration_review_queue AS
SELECT 'CriticalPoi (route B candidates)'::text AS target_table, id, critical_poi_id AS legacy_record_id, review_status AS migration_review_status
FROM migration_meta.critical_poi_review_queue WHERE candidate_routes LIKE '%B%' AND review_status = 'REQUIRES_REVIEW';

-- ============================================================
-- 7. Checkpoints
-- ============================================================
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
VALUES ('080_geography', NULL, 'geo.administrative_areas', 0, 0, 'PASS', 'D-07 CREATE_EMPTY — must always read 0.');
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
SELECT '080_geography', 'CriticalPoi', 'geo.meeting_points + .extraction_points + .reception_points',
  (SELECT COUNT(*) FROM migration_meta.critical_poi_review_queue WHERE candidate_routes LIKE '%B%'),
  (SELECT COUNT(*) FROM geo.meeting_points) + (SELECT COUNT(*) FROM geo.extraction_points) + (SELECT COUNT(*) FROM geo.reception_points),
  'SKIPPED_NO_ROWS', 'Blocked on Wave 060''s classification rule table being human-reviewed and approved — not yet run.';
