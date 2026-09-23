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
--
-- ONE MAPPING, TWO CALLERS (Paso 5): the HelpRequest transform lives in
-- migration_meta.fn_sync_help_requests(p_ids) — NULL = every row. This file
-- calls it with NULL (the backfill); the application's shadow-write calls it
-- with the id a POST/PATCH just committed. See 030's header for the contract.

ALTER TABLE help.help_requests ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE help.help_requests ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE help.help_requests ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE help.help_requests ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_help_requests_legacy ON help.help_requests (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

ALTER TABLE help.affected_people ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE help.affected_people ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE help.affected_people ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE help.affected_people ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
-- Without this, the second backfill pass duplicated every affected_people row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_affected_people_legacy ON help.affected_people (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

-- ============================================================
-- 1. D-02 mapping rows for HelpRequest.status
-- ============================================================
-- Legacy values are the ones the app writes (RECEIVED, UNDER_REVIEW,
-- ASSIGNED, RESOLVED, CANCELLED; CLOSED also appears in code). The previous
-- draft rewrote EVERY status to RECEIVED and still marked it AUTO_MAPPED/HIGH,
-- so a resolved request would have reappeared as a new one (17 of 25 rows on
-- the realistic baseline). Identical names map 1:1; UNDER_REVIEW -> TRIAGED is
-- a judgement and is flagged; anything unmapped lands in RECEIVED (the least
-- advanced state) as REQUIRES_REVIEW. The raw value is kept in legacy_status.
INSERT INTO migration_meta.legacy_status_mapping (source_table, source_status_value, target_dimension, target_value, confidence, notes) VALUES
  ('HelpRequest', 'received', 'status', 'RECEIVED', 'HIGH', NULL),
  ('HelpRequest', 'under_review', 'status', 'TRIAGED', 'MEDIUM', 'Operator review in legacy ~ triage in target; flagged for confirmation'),
  ('HelpRequest', 'assigned', 'status', 'ASSIGNED', 'HIGH', NULL),
  ('HelpRequest', 'resolved', 'status', 'RESOLVED', 'HIGH', NULL),
  ('HelpRequest', 'closed', 'status', 'CLOSED', 'HIGH', NULL),
  ('HelpRequest', 'cancelled', 'status', 'CANCELLED', 'HIGH', NULL)
ON CONFLICT (source_table, source_status_value, target_dimension) DO NOTHING;

-- ============================================================
-- 2. help.help_requests + help.affected_people <- HelpRequest
-- ============================================================
-- Two reasons a legacy row is deferred instead of migrated, and they are NOT
-- interchangeable (the previous draft labelled both as a closure problem):
--   * RESOLVED/CLOSED requires an authorized closer
--     (ck_help_requests_close_actor, Access Control v1.1 §8). Legacy never
--     recorded who closed a request and a fabricated closer would defeat that
--     control -> CLOSED_WITHOUT_AUTHORIZED_CLOSER;
--   * requester_person_id is NOT NULL with a real FK to identity.people, so a
--     request whose User has not been migrated yet has nowhere to hang ->
--     REQUESTER_NOT_MIGRATED (a shadow-write ordering condition, not a
--     closure decision).
-- Status is mutable in legacy (PATCH /api/help-requests/[id]): an open ->
-- open change is applied in place; an open -> RESOLVED/CLOSED change is NOT
-- (same missing closer), so it returns BLOCKED_REQUIRES_DECISION and
-- dual-read reports the status divergence. A deferred row is never promoted
-- into the target silently either — that is a disposition change.
-- p_ids NULL = every HelpRequest row.
-- ============================================================
-- Paso 6A: sync_worker is the runtime principal for every fn_sync_* in
-- this file. Each function is declared SECURITY DEFINER and granted
-- EXECUTE to sync_worker alone (PUBLIC is revoked first, and app_api /
-- ingest_worker / jobs_worker are never granted). sync_worker holds no
-- table privilege in any target schema, so this EXECUTE is its only way
-- in, and what it can do through it is exactly the mapping written here —
-- for legacy ids that already exist, with no caller-supplied SQL.
-- ============================================================

CREATE OR REPLACE FUNCTION migration_meta.fn_sync_help_requests(p_ids text[])
RETURNS TABLE (source_table text, legacy_record_id text, target_table text, action text, detail text)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH scope AS (
    SELECT hr.id, p.id AS person_id,
      COALESCE(m.target_value, 'RECEIVED') AS target_status,
      hr.status AS legacy_status,
      hr."createdAt" AT TIME ZONE 'UTC' AS created_at,
      COALESCE(m.confidence, 'LOW') AS conf,
      CASE WHEN m.confidence = 'HIGH' THEN 'AUTO_MAPPED' ELSE 'REQUIRES_REVIEW' END AS review,
      EXISTS (SELECT 1 FROM help.help_requests h WHERE h.legacy_source = 'HelpRequest' AND h.legacy_record_id = hr.id) AS migrated
    FROM "HelpRequest" hr
    LEFT JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = hr."userId"
    LEFT JOIN migration_meta.legacy_status_mapping m
      ON m.source_table = 'HelpRequest' AND m.target_dimension = 'status' AND m.source_status_value = lower(hr.status)
    WHERE p_ids IS NULL OR hr.id = ANY(p_ids)
  ), up AS (
    INSERT INTO help.help_requests AS t (requester_person_id, status, classification, created_at,
      legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status)
    SELECT s.person_id, s.target_status::help.help_request_status_enum,
      'SENSITIVE'::security.information_classification_enum, s.created_at,
      s.legacy_status, 'HelpRequest', s.id, s.conf, s.review
    FROM scope s
    WHERE s.person_id IS NOT NULL AND s.target_status NOT IN ('RESOLVED', 'CLOSED')
    ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO UPDATE SET
      status = EXCLUDED.status, legacy_status = EXCLUDED.legacy_status,
      migration_confidence = EXCLUDED.migration_confidence, migration_review_status = EXCLUDED.migration_review_status
    WHERE (t.status, t.legacy_status, t.migration_confidence, t.migration_review_status)
      IS DISTINCT FROM (EXCLUDED.status, EXCLUDED.legacy_status, EXCLUDED.migration_confidence, EXCLUDED.migration_review_status)
    RETURNING t.legacy_record_id AS lid, (t.xmax = 0) AS ins
  )
  SELECT 'HelpRequest'::text, s.id, 'help.help_requests'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' WHEN up.ins THEN 'INSERTED' ELSE 'UPDATED' END, NULL::text
  FROM scope s LEFT JOIN up ON up.lid = s.id
  WHERE s.person_id IS NOT NULL AND s.target_status NOT IN ('RESOLVED', 'CLOSED');

  -- A legacy row that closed after it was already migrated: the target row
  -- keeps its last open status until §8 says who the closer is.
  RETURN QUERY
  SELECT 'HelpRequest'::text, hr.id, 'help.help_requests'::text, 'BLOCKED_REQUIRES_DECISION'::text,
    'CLOSED_WITHOUT_AUTHORIZED_CLOSER'::text
  FROM "HelpRequest" hr
  LEFT JOIN migration_meta.legacy_status_mapping m
    ON m.source_table = 'HelpRequest' AND m.target_dimension = 'status' AND m.source_status_value = lower(hr.status)
  WHERE (p_ids IS NULL OR hr.id = ANY(p_ids))
    AND COALESCE(m.target_value, 'RECEIVED') IN ('RESOLVED', 'CLOSED')
    AND EXISTS (SELECT 1 FROM help.help_requests h WHERE h.legacy_source = 'HelpRequest' AND h.legacy_record_id = hr.id);

  -- 3. help.affected_people <- HelpRequest (origin, distinguishing requester
  --    from affected — DIVIDIR). One row per migrated request.
  -- The column is affectation_status since the Paso 6A reconciliation
  -- (050|help.affected_people); the written value is unchanged.
  RETURN QUERY
  WITH scope AS (
    SELECT hr.id, hreq.id AS help_request_id, p.id AS person_id, hr."createdAt" AT TIME ZONE 'UTC' AS created_at
    FROM "HelpRequest" hr
    JOIN help.help_requests hreq ON hreq.legacy_source = 'HelpRequest' AND hreq.legacy_record_id = hr.id
    JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = hr."userId"
    WHERE p_ids IS NULL OR hr.id = ANY(p_ids)
  ), up AS (
    INSERT INTO help.affected_people AS t (help_request_id, person_id, affectation_status, created_at,
      legacy_source, legacy_record_id, migration_confidence, migration_review_status)
    SELECT s.help_request_id, s.person_id, 'UNKNOWN'::help.affectation_status_enum, s.created_at,
      'HelpRequest', s.id, 'MEDIUM', 'REQUIRES_REVIEW'
    FROM scope s
    ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING
    RETURNING t.legacy_record_id AS lid
  )
  SELECT 'HelpRequest'::text, s.id, 'help.affected_people'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' ELSE 'INSERTED' END, NULL::text
  FROM scope s LEFT JOIN up ON up.lid = s.id;

  -- 4. Deferrals, with the reason that actually applies.
  RETURN QUERY
  WITH classified AS (
    SELECT hr.id,
      CASE WHEN p.id IS NULL THEN 'REQUESTER_NOT_MIGRATED' ELSE 'CLOSED_WITHOUT_AUTHORIZED_CLOSER' END AS reason,
      CASE WHEN p.id IS NULL THEN 'User -> identity.people migration of the requester (Ola 2)'
           ELSE 'Access Control §8: closer attribution for legacy closed requests' END AS pending
    FROM "HelpRequest" hr
    LEFT JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = hr."userId"
    WHERE (p_ids IS NULL OR hr.id = ANY(p_ids))
      AND NOT EXISTS (SELECT 1 FROM help.help_requests h WHERE h.legacy_source = 'HelpRequest' AND h.legacy_record_id = hr.id)
  ), def AS (
    INSERT INTO migration_meta.legacy_deferred_rows AS t (source_table, legacy_record_id, wave, reason, pending_decision)
    SELECT 'HelpRequest', c.id, '050_help_mission', c.reason, c.pending FROM classified c
    ON CONFLICT (source_table, legacy_record_id) DO NOTHING
    RETURNING t.legacy_record_id AS lid
  )
  SELECT 'HelpRequest'::text, c.id, 'migration_meta.legacy_deferred_rows'::text,
    CASE WHEN def.lid IS NULL THEN 'ALREADY_DEFERRED' ELSE 'DEFERRED' END, c.reason
  FROM classified c LEFT JOIN def ON def.lid = c.id;

  RETURN QUERY
  SELECT 'HelpRequest'::text, u.id, NULL::text, 'LEGACY_NOT_FOUND'::text, NULL::text
  FROM unnest(p_ids) AS u(id)
  WHERE NOT EXISTS (SELECT 1 FROM "HelpRequest" hr WHERE hr.id = u.id);
END
$fn$;
REVOKE ALL ON FUNCTION migration_meta.fn_sync_help_requests(text[]) FROM PUBLIC;
ALTER FUNCTION migration_meta.fn_sync_help_requests(text[]) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION migration_meta.fn_sync_help_requests(text[]) TO sync_worker;

-- Production had 0 rows at the Paso 3 preflight; the rehearsal baseline has 25
-- so this path is actually exercised.
SELECT source_table, target_table, action, count(*) AS rows FROM migration_meta.fn_sync_help_requests(NULL) GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- ============================================================
-- 5. All mission.* (10 tables) and remaining help.* (operational_needs,
--    rescue_assessments, collaboration_invitations, situation_updates) —
--    CREATE_EMPTY, no INSERT statement (nothing to migrate).
-- ============================================================

-- ============================================================
-- 6. Row counts (before/after)
-- ============================================================
SELECT COUNT(*) AS help_request_before FROM "HelpRequest"; -- production: 0 (Paso 3); rehearsal baseline: 25
SELECT COUNT(*) AS help_requests_after FROM help.help_requests WHERE legacy_source = 'HelpRequest';
SELECT COUNT(*) AS affected_people_after FROM help.affected_people WHERE legacy_source = 'HelpRequest';

-- ============================================================
-- 7. Validation query
-- ============================================================
SELECT COUNT(*) FROM help.help_requests hreq
LEFT JOIN help.affected_people ap ON ap.help_request_id = hreq.id
WHERE hreq.legacy_source = 'HelpRequest' AND ap.id IS NULL;
-- Expected: 0 rows either way (0 source rows -> 0 orphans possible).

-- ============================================================
-- 8. MIGRATION_REVIEW_QUEUE
-- ============================================================
CREATE OR REPLACE VIEW help.vw_migration_review_queue AS
SELECT 'help.affected_people'::text AS target_table, id, legacy_source, legacy_record_id, migration_review_status
FROM help.affected_people WHERE migration_review_status = 'REQUIRES_REVIEW';

-- ============================================================
-- 9. Checkpoint
-- ============================================================
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
SELECT '050_help_mission', 'HelpRequest', 'help.help_requests + legacy_deferred_rows', e.n, a.n,
  CASE WHEN e.n = 0 THEN 'SKIPPED_NO_ROWS' WHEN a.n = e.n THEN 'PASS' ELSE 'FAIL' END,
  'Expected = the source count (production had 0 rows at the Paso 3 preflight).'
FROM (SELECT COUNT(*) AS n FROM "HelpRequest") e,
     (SELECT (SELECT COUNT(*) FROM help.help_requests WHERE legacy_source = 'HelpRequest')
           + (SELECT COUNT(*) FROM migration_meta.legacy_deferred_rows WHERE source_table = 'HelpRequest') AS n) a;
