-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 020 — Identity — Backfill draft.
-- Origen: "User" (7 rows, current public schema). Destino:
-- identity.people + identity.user_accounts (DIVIDIR), .verified_identities
-- + .consents (DERIVAR, partial), .reputation_events (DERIVAR, current-
-- value-only). D-01: zero institution.* rows created for any of the 7.
--
-- ONE MAPPING, TWO CALLERS (Paso 5): the User transform lives in
-- migration_meta.fn_sync_users(p_ids) — NULL = every row. This file calls it
-- with NULL (the backfill); the application's shadow-write calls it with the
-- id a register/login/profile write just committed. See 030's header for the
-- contract shared by every fn_sync_* function. Identity is upstream of
-- Report/HelpRequest: those rows can only be migrated once their person
-- exists, which is why this sync exists at all rather than being
-- backfill-only.
-- Legacy `User` is NEVER written by this file in either direction — it stays
-- the authentication source of truth for the whole transition (Ola 2 §10).

-- ============================================================
-- 0. Provenance columns (D-02) — added here since backfill infra, not
--    steady-state schema (same convention as 010_foundation/backfill.sql).
-- ============================================================
ALTER TABLE identity.people ADD COLUMN IF NOT EXISTS legacy_status text NULL;
ALTER TABLE identity.people ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE identity.people ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE identity.people ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE identity.people ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_people_legacy ON identity.people (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

ALTER TABLE identity.user_accounts ADD COLUMN IF NOT EXISTS legacy_status text NULL;
ALTER TABLE identity.user_accounts ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE identity.user_accounts ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE identity.user_accounts ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE identity.user_accounts ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_accounts_legacy ON identity.user_accounts (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

ALTER TABLE identity.verified_identities ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE identity.verified_identities ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE identity.verified_identities ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE identity.verified_identities ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;

ALTER TABLE identity.consents ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE identity.consents ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE identity.consents ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE identity.consents ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;

ALTER TABLE identity.reputation_events ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE identity.reputation_events ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE identity.reputation_events ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE identity.reputation_events ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;

-- Idempotency keys for the three derived tables. Without them the harness
-- second backfill pass (and any re-run in production) duplicated every
-- consent and reputation event: `ON CONFLICT DO NOTHING` has nothing to
-- arbitrate on when no unique index covers the legacy identity. A consent is
-- identified by (legacy User, purpose) because one User yields two consents.
-- If a previous run already left duplicates, index creation fails loudly
-- instead of hiding them.
CREATE UNIQUE INDEX IF NOT EXISTS uq_verified_identities_legacy ON identity.verified_identities (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_consents_legacy ON identity.consents (legacy_source, legacy_record_id, purpose) WHERE legacy_record_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reputation_events_legacy ON identity.reputation_events (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

-- Every legacy DateTime is `timestamp without time zone` holding UTC wall
-- time (Paso 3 preflight): converted with an explicit AT TIME ZONE 'UTC',
-- never through the session TimeZone.

-- ============================================================
-- 1. identity.* <- User, one function, five target tables
--    (people -> user_accounts -> verified_identities/consents/
--    reputation_events, in that order, so a child never lands before its
--    parent person row).
-- ============================================================
-- Mutable in legacy (profile edits, login, moderation): name, publicAlias,
-- governmentIdHash, email/phone/city/region/countryCode (contact_info),
-- role, accountStatus, authProvider, lastLoginAt, trustScore.
-- The mapped target columns follow them. Nothing here ever writes a consent
-- that legacy does not have a timestamp for: a NULL termsAcceptedAt yields no
-- consent row at all, never a fabricated one.
-- ============================================================
-- Paso 6A: sync_worker is the runtime principal for every fn_sync_* in
-- this file. Each function is declared SECURITY DEFINER and granted
-- EXECUTE to sync_worker alone (PUBLIC is revoked first, and app_api /
-- ingest_worker / jobs_worker are never granted). sync_worker holds no
-- table privilege in any target schema, so this EXECUTE is its only way
-- in, and what it can do through it is exactly the mapping written here —
-- for legacy ids that already exist, with no caller-supplied SQL.
-- ============================================================

CREATE OR REPLACE FUNCTION migration_meta.fn_sync_users(p_ids text[])
RETURNS TABLE (source_table text, legacy_record_id text, target_table text, action text, detail text)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
#variable_conflict use_column
BEGIN
  -- 1.1 identity.people <- User (identity half)
  RETURN QUERY
  WITH scope AS (
    SELECT u.id, u.name AS legal_name, u."publicAlias" AS display_alias, u."governmentIdHash" AS national_id_hash,
      jsonb_build_object('email', u.email, 'phone', u.phone, 'city', u.city, 'region', u.region, 'countryCode', u."countryCode") AS contact_info,
      u.role AS legacy_status,
      u."createdAt" AT TIME ZONE 'UTC' AS created_at, u."updatedAt" AT TIME ZONE 'UTC' AS updated_at
    FROM "User" u
    WHERE p_ids IS NULL OR u.id = ANY(p_ids)
  ), up AS (
    INSERT INTO identity.people AS t (legal_name, display_alias, national_id_hash, contact_info,
      legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status,
      created_at, updated_at)
    SELECT s.legal_name, s.display_alias, s.national_id_hash, s.contact_info,
      s.legacy_status, 'User', s.id, 'HIGH', 'AUTO_MAPPED', s.created_at, s.updated_at
    FROM scope s
    ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO UPDATE SET
      legal_name = EXCLUDED.legal_name, display_alias = EXCLUDED.display_alias,
      national_id_hash = EXCLUDED.national_id_hash, contact_info = EXCLUDED.contact_info,
      legacy_status = EXCLUDED.legacy_status, updated_at = EXCLUDED.updated_at
    WHERE (t.legal_name, t.display_alias, t.national_id_hash, t.contact_info, t.legacy_status, t.updated_at)
      IS DISTINCT FROM (EXCLUDED.legal_name, EXCLUDED.display_alias, EXCLUDED.national_id_hash, EXCLUDED.contact_info, EXCLUDED.legacy_status, EXCLUDED.updated_at)
    RETURNING t.legacy_record_id AS lid, (t.xmax = 0) AS ins
  )
  SELECT 'User'::text, s.id, 'identity.people'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' WHEN up.ins THEN 'INSERTED' ELSE 'UPDATED' END, NULL::text
  FROM scope s LEFT JOIN up ON up.lid = s.id;

  -- 1.2 identity.user_accounts <- User (account half)
  -- NOTE: any User.accountStatus value with no confident mapping defaults to
  -- the most conservative status, never guessed into ACTIVE.
  --
  -- The legacy email is NOT written here: since the Paso 6A reconciliation
  -- (020|identity.user_accounts) the table has no email column — the v1.0
  -- ficha gives it none — and 1.1 above already wrote the same address into
  -- identity.people.contact_info->>'email'. One copy of the datum, not two.
  RETURN QUERY
  WITH scope AS (
    SELECT u.id, p.id AS person_id,
      CASE WHEN u."accountStatus" = 'ACTIVE' THEN 'ACTIVE'::identity.user_account_status_enum ELSE 'SUSPENDED'::identity.user_account_status_enum END AS status,
      u."authProvider" AS auth_provider, u."lastLoginAt" AT TIME ZONE 'UTC' AS last_login_at,
      u."accountStatus" AS legacy_status,
      u."createdAt" AT TIME ZONE 'UTC' AS created_at, u."updatedAt" AT TIME ZONE 'UTC' AS updated_at
    FROM "User" u
    JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = u.id
    WHERE p_ids IS NULL OR u.id = ANY(p_ids)
  ), up AS (
    INSERT INTO identity.user_accounts AS t (person_id, status, auth_provider, last_login_at,
      legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status,
      created_at, updated_at)
    SELECT s.person_id, s.status, s.auth_provider, s.last_login_at,
      s.legacy_status, 'User', s.id, 'HIGH', 'AUTO_MAPPED', s.created_at, s.updated_at
    FROM scope s
    ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO UPDATE SET
      status = EXCLUDED.status, auth_provider = EXCLUDED.auth_provider,
      last_login_at = EXCLUDED.last_login_at, legacy_status = EXCLUDED.legacy_status, updated_at = EXCLUDED.updated_at
    WHERE (t.status, t.auth_provider, t.last_login_at, t.legacy_status, t.updated_at)
      IS DISTINCT FROM (EXCLUDED.status, EXCLUDED.auth_provider, EXCLUDED.last_login_at, EXCLUDED.legacy_status, EXCLUDED.updated_at)
    RETURNING t.legacy_record_id AS lid, (t.xmax = 0) AS ins
  )
  SELECT 'User'::text, s.id, 'identity.user_accounts'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' WHEN up.ins THEN 'INSERTED' ELSE 'UPDATED' END, NULL::text
  FROM scope s LEFT JOIN up ON up.lid = s.id;

  -- 1.3 identity.verified_identities <- User.governmentIdHash IS NOT NULL only
  -- (DERIVAR). verified_at/document_type/document_country intentionally NULL
  -- or placeholder (NO_RECONSTRUCTABLE — never captured historically).
  RETURN QUERY
  WITH scope AS (
    SELECT u.id, p.id AS person_id, u."governmentIdHash" AS document_identifier,
      u."createdAt" AT TIME ZONE 'UTC' AS created_at
    FROM "User" u
    JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = u.id
    WHERE (p_ids IS NULL OR u.id = ANY(p_ids)) AND u."governmentIdHash" IS NOT NULL
  ), up AS (
    INSERT INTO identity.verified_identities AS t (person_id, document_type, document_country, document_identifier, status,
      legacy_source, legacy_record_id, migration_confidence, migration_review_status, created_at)
    SELECT s.person_id, 'UNKNOWN', 'XX', s.document_identifier, 'PENDING'::identity.verified_identity_status_enum,
      'User', s.id, 'MEDIUM', 'REQUIRES_REVIEW', s.created_at
    FROM scope s
    ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO UPDATE SET
      document_identifier = EXCLUDED.document_identifier
    WHERE t.document_identifier IS DISTINCT FROM EXCLUDED.document_identifier
    RETURNING t.legacy_record_id AS lid, (t.xmax = 0) AS ins
  )
  SELECT 'User'::text, s.id, 'identity.verified_identities'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' WHEN up.ins THEN 'INSERTED' ELSE 'UPDATED' END, NULL::text
  FROM scope s LEFT JOIN up ON up.lid = s.id;

  -- 1.4 identity.consents <- User.termsAcceptedAt/.privacyAcceptedAt (DERIVAR,
  -- timestamps only, no accepted-terms-version — partially NO_RECONSTRUCTABLE).
  RETURN QUERY
  WITH scope AS (
    SELECT u.id, p.id AS person_id, 'TERMS_OF_SERVICE' AS purpose, u."termsAcceptedAt" AT TIME ZONE 'UTC' AS granted_at
    FROM "User" u JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = u.id
    WHERE (p_ids IS NULL OR u.id = ANY(p_ids)) AND u."termsAcceptedAt" IS NOT NULL
    UNION ALL
    SELECT u.id, p.id, 'PRIVACY_POLICY', u."privacyAcceptedAt" AT TIME ZONE 'UTC'
    FROM "User" u JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = u.id
    WHERE (p_ids IS NULL OR u.id = ANY(p_ids)) AND u."privacyAcceptedAt" IS NOT NULL
  ), up AS (
    INSERT INTO identity.consents AS t (person_id, purpose, granted_at, legacy_source, legacy_record_id, migration_confidence, migration_review_status)
    SELECT s.person_id, s.purpose, s.granted_at, 'User', s.id, 'MEDIUM', 'REQUIRES_REVIEW'
    FROM scope s
    ON CONFLICT (legacy_source, legacy_record_id, purpose) WHERE legacy_record_id IS NOT NULL DO UPDATE SET
      granted_at = EXCLUDED.granted_at
    WHERE t.granted_at IS DISTINCT FROM EXCLUDED.granted_at
    RETURNING t.legacy_record_id AS lid, t.purpose AS lpurpose, (t.xmax = 0) AS ins
  )
  SELECT 'User'::text, s.id, 'identity.consents'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' WHEN up.ins THEN 'INSERTED' ELSE 'UPDATED' END, s.purpose
  FROM scope s LEFT JOIN up ON up.lid = s.id AND up.lpurpose = s.purpose;

  -- 1.5 identity.reputation_events <- User.trustScore/.strikes (DERIVAR,
  -- CURRENT VALUE ONLY — not a reconstructed event history, since none exists).
  RETURN QUERY
  WITH scope AS (
    SELECT u.id, p.id AS person_id, u."trustScore" - 70 AS delta, -- 70 is the schema default baseline
      u."updatedAt" AT TIME ZONE 'UTC' AS occurred_at
    FROM "User" u JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = u.id
    WHERE p_ids IS NULL OR u.id = ANY(p_ids)
  ), up AS (
    INSERT INTO identity.reputation_events AS t (person_id, domain, delta, reason, occurred_at,
      legacy_source, legacy_record_id, migration_confidence, migration_review_status)
    SELECT s.person_id, 'GENERAL'::identity.trust_domain_enum, s.delta,
      'Snapshot migration of legacy User.trustScore/.strikes — not an audited event history', s.occurred_at,
      'User', s.id, 'MEDIUM', 'REQUIRES_REVIEW'
    FROM scope s
    ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO UPDATE SET
      delta = EXCLUDED.delta, occurred_at = EXCLUDED.occurred_at
    WHERE (t.delta, t.occurred_at) IS DISTINCT FROM (EXCLUDED.delta, EXCLUDED.occurred_at)
    RETURNING t.legacy_record_id AS lid, (t.xmax = 0) AS ins
  )
  SELECT 'User'::text, s.id, 'identity.reputation_events'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' WHEN up.ins THEN 'INSERTED' ELSE 'UPDATED' END, NULL::text
  FROM scope s LEFT JOIN up ON up.lid = s.id;

  RETURN QUERY
  SELECT 'User'::text, u.id, NULL::text, 'LEGACY_NOT_FOUND'::text, NULL::text
  FROM unnest(p_ids) AS u(id)
  WHERE NOT EXISTS (SELECT 1 FROM "User" lu WHERE lu.id = u.id);
END
$fn$;
REVOKE ALL ON FUNCTION migration_meta.fn_sync_users(text[]) FROM PUBLIC;
ALTER FUNCTION migration_meta.fn_sync_users(text[]) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION migration_meta.fn_sync_users(text[]) TO sync_worker;

SELECT source_table, target_table, action, count(*) AS rows FROM migration_meta.fn_sync_users(NULL) GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- ============================================================
-- 2. Deduplication — the idempotency key is the partial unique index over
--    (legacy_source, legacy_record_id) on every backfilled table, created at
--    the top of this file. It used to be backed up by unique indexes over
--    user_accounts.email / .google_sub; those columns no longer exist (Paso 6A,
--    020|identity.user_accounts), and `person_id uuid NOT NULL UNIQUE` on
--    user_accounts still makes a second account for the same person impossible.
-- ============================================================

-- ============================================================
-- 3. D-01 — confirm zero institution.* rows created (no INSERT statement
--    anywhere in this file targets institution.*; this assertion query
--    documents that omission is deliberate, not accidental).
-- ============================================================
-- institution.institutional_memberships has no legacy_source/legacy_record_id
-- columns (migration.sql:261-273) - this wave never inserts into it, so the
-- D-01 check is simply "this table has zero rows", not a legacy_source filter.
SELECT COUNT(*) AS institutional_memberships_created FROM institution.institutional_memberships; -- expect 0 (D-01: no synthetic memberships)

-- ============================================================
-- 4. Row counts (before/after)
-- ============================================================
SELECT COUNT(*) AS user_before FROM "User"; -- expect 7
SELECT COUNT(*) AS people_after FROM identity.people WHERE legacy_source = 'User'; -- expect 7
SELECT COUNT(*) AS user_accounts_after FROM identity.user_accounts WHERE legacy_source = 'User'; -- expect 7
SELECT COUNT(*) AS verified_identities_after FROM identity.verified_identities WHERE legacy_source = 'User'; -- expect <=7
SELECT COUNT(*) AS reputation_events_after FROM identity.reputation_events WHERE legacy_source = 'User'; -- expect 7

-- ============================================================
-- 5. Validation query — every User row has exactly 1 people + 1 user_accounts row
-- ============================================================
SELECT u.id
FROM "User" u
LEFT JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = u.id
LEFT JOIN identity.user_accounts ua ON ua.legacy_source = 'User' AND ua.legacy_record_id = u.id
WHERE p.id IS NULL OR ua.id IS NULL;
-- Expected: 0 rows (every one of the 7 User rows has both).

-- ============================================================
-- 6. MIGRATION_REVIEW_QUEUE (D-06 convention) — verified_identities/
--    consents/reputation_events rows flagged REQUIRES_REVIEW (D-02
--    conservative-default: current-value-only history, no version capture).
-- ============================================================
CREATE OR REPLACE VIEW identity.vw_migration_review_queue AS
SELECT 'identity.verified_identities'::text AS target_table, id, legacy_source, legacy_record_id, migration_review_status FROM identity.verified_identities WHERE migration_review_status = 'REQUIRES_REVIEW'
UNION ALL
SELECT 'identity.consents', id, legacy_source, legacy_record_id, migration_review_status FROM identity.consents WHERE migration_review_status = 'REQUIRES_REVIEW'
UNION ALL
SELECT 'identity.reputation_events', id, legacy_source, legacy_record_id, migration_review_status FROM identity.reputation_events WHERE migration_review_status = 'REQUIRES_REVIEW';

-- ============================================================
-- 7. Checkpoint
-- ============================================================
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status)
SELECT '020_identity', 'User', 'identity.people', (SELECT COUNT(*) FROM "User"), (SELECT COUNT(*) FROM identity.people WHERE legacy_source = 'User'),
  CASE WHEN (SELECT COUNT(*) FROM identity.people WHERE legacy_source = 'User') = (SELECT COUNT(*) FROM "User") THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status)
SELECT '020_identity', 'User', 'identity.user_accounts', (SELECT COUNT(*) FROM "User"), (SELECT COUNT(*) FROM identity.user_accounts WHERE legacy_source = 'User'),
  CASE WHEN (SELECT COUNT(*) FROM identity.user_accounts WHERE legacy_source = 'User') = (SELECT COUNT(*) FROM "User") THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
VALUES ('020_identity', 'User', 'institution.institutional_memberships', 0,
  (SELECT COUNT(*) FROM institution.institutional_memberships), 'PASS',
  'D-01 closure criterion: must remain 0.');
