-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 050 — Help & Mission — Backfill draft.
-- Origen: HelpRequest (0 rows in production — feature has a real writer/
-- endpoint but zero rows ever created, per Baseline §5). All 10 mission.*
-- tables and the rest of help.* are CREATE_EMPTY (no persisted dispatch
-- domain today). This file documents the mapping so that data is never
-- lost once HelpRequest gains real rows before cutover (same precedent as
-- D-04's Telecom tables in Wave 030).

ALTER TABLE help.help_requests ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE help.help_requests ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE help.help_requests ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE help.help_requests ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_help_requests_legacy ON help.help_requests (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

ALTER TABLE help.affected_people ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE help.affected_people ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE help.affected_people ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE help.affected_people ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;

-- ============================================================
-- 1. help.help_requests <- HelpRequest (0 rows). Structural mapping only —
--    the INSERT below is the documented shape, never executed for real at
--    this row count. Batch/idempotency: N/A at 0 rows.
-- ============================================================
INSERT INTO help.help_requests (requester_person_id, status, classification, created_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT p.id,
  CASE hr.status WHEN 'RECEIVED' THEN 'RECEIVED'::help.help_request_status_enum ELSE 'RECEIVED'::help.help_request_status_enum END,
  'SENSITIVE'::security.information_classification_enum, hr."createdAt",
  'HelpRequest', hr.id, 'HIGH', 'AUTO_MAPPED'
FROM "HelpRequest" hr
JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = hr."userId"
ON CONFLICT (legacy_source, legacy_record_id) DO NOTHING;
-- 0 rows in "HelpRequest" today — this INSERT is a no-op by construction,
-- kept executable (not commented out) so it is ready the moment real rows
-- exist, per the D-04 precedent.

-- ============================================================
-- 2. help.affected_people <- HelpRequest (origin, distinguishing requester
--    from affected — DIVIDIR, 0 rows).
-- ============================================================
INSERT INTO help.affected_people (help_request_id, person_id, affectation_status, created_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT hreq.id, p.id, 'UNKNOWN'::help.affectation_status_enum, hr."createdAt",
  'HelpRequest', hr.id, 'MEDIUM', 'REQUIRES_REVIEW'
FROM "HelpRequest" hr
JOIN help.help_requests hreq ON hreq.legacy_source = 'HelpRequest' AND hreq.legacy_record_id = hr.id
JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = hr."userId"
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. All mission.* (10 tables) and remaining help.* (operational_needs,
--    rescue_assessments, collaboration_invitations, situation_updates) —
--    CREATE_EMPTY, no INSERT statement (nothing to migrate).
-- ============================================================

-- ============================================================
-- 4. Row counts (before/after)
-- ============================================================
SELECT COUNT(*) AS help_request_before FROM "HelpRequest"; -- expect 0
SELECT COUNT(*) AS help_requests_after FROM help.help_requests WHERE legacy_source = 'HelpRequest'; -- expect 0
SELECT COUNT(*) AS affected_people_after FROM help.affected_people WHERE legacy_source = 'HelpRequest'; -- expect 0

-- ============================================================
-- 5. Validation query
-- ============================================================
SELECT COUNT(*) FROM help.help_requests hreq
LEFT JOIN help.affected_people ap ON ap.help_request_id = hreq.id
WHERE hreq.legacy_source = 'HelpRequest' AND ap.id IS NULL;
-- Expected: 0 rows either way (0 source rows -> 0 orphans possible).

-- ============================================================
-- 6. MIGRATION_REVIEW_QUEUE
-- ============================================================
CREATE OR REPLACE VIEW help.vw_migration_review_queue AS
SELECT 'help.affected_people'::text AS target_table, id, legacy_source, legacy_record_id, migration_review_status
FROM help.affected_people WHERE migration_review_status = 'REQUIRES_REVIEW';

-- ============================================================
-- 7. Checkpoint
-- ============================================================
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
VALUES ('050_help_mission', 'HelpRequest', 'help.help_requests + help.affected_people + mission.*', 0, 0, 'SKIPPED_NO_ROWS',
  'Structural readiness only — help.close_help_request_authorized() function and its RLS reinforcement exist ahead of any real usage (migration.sql).');
