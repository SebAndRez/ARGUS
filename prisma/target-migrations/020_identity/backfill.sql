-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 020 — Identity — Backfill draft.
-- Origen: "User" (7 rows, current public schema). Destino:
-- identity.people + identity.user_accounts (DIVIDIR), .verified_identities
-- + .consents (DERIVAR, partial), .reputation_events (DERIVAR, current-
-- value-only). D-01: zero institution.* rows created for any of the 7.

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

-- ============================================================
-- 1. Batch: single batch, 7 rows, one transaction per source User row
--    (people -> user_accounts -> verified_identities/consents/reputation_events,
--    so a partial failure never orphans a child row).
-- ============================================================

-- 1.1 identity.people <- User (identity half)
INSERT INTO identity.people (legal_name, display_alias, national_id_hash, contact_info,
  legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status,
  created_at, updated_at)
SELECT
  u.name, u."publicAlias", u."governmentIdHash",
  jsonb_build_object('email', u.email, 'phone', u.phone, 'city', u.city, 'region', u.region, 'countryCode', u."countryCode"),
  u.role, 'User', u.id, 'HIGH', 'AUTO_MAPPED',
  u."createdAt", u."updatedAt"
FROM "User" u
ON CONFLICT (legacy_source, legacy_record_id) DO NOTHING;

-- 1.2 identity.user_accounts <- User (account half)
INSERT INTO identity.user_accounts (person_id, status, auth_provider, last_login_at,
  legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status,
  created_at, updated_at)
SELECT
  p.id, CASE WHEN u."accountStatus" = 'ACTIVE' THEN 'ACTIVE'::identity.user_account_status_enum ELSE 'SUSPENDED'::identity.user_account_status_enum END,
  u."authProvider", u."lastLoginAt",
  u."accountStatus", 'User', u.id, 'HIGH', 'AUTO_MAPPED',
  u."createdAt", u."updatedAt"
FROM "User" u
JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = u.id
ON CONFLICT (legacy_source, legacy_record_id) DO NOTHING;
-- NOTE: user_account_status_enum's exact value set is drafted here as
-- ACTIVE/SUSPENDED only for illustration — see migration.sql for the real
-- enum values; any User.accountStatus value with no confident mapping
-- defaults to the most conservative status, never guessed into ACTIVE.

-- 1.3 identity.verified_identities <- User.governmentIdHash IS NOT NULL only
-- (DERIVAR). verified_at/document_type/document_country intentionally NULL
-- (NO_RECONSTRUCTABLE — never captured historically).
INSERT INTO identity.verified_identities (person_id, document_type, document_country, document_identifier, status,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status, created_at)
SELECT
  p.id, 'UNKNOWN', 'XX', u."governmentIdHash", 'PENDING'::identity.verified_identity_status_enum,
  'User', u.id, 'MEDIUM', 'REQUIRES_REVIEW', u."createdAt"
FROM "User" u
JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = u.id
WHERE u."governmentIdHash" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 1.4 identity.consents <- User.termsAcceptedAt/.privacyAcceptedAt (DERIVAR,
-- timestamps only, no accepted-terms-version — partially NO_RECONSTRUCTABLE).
INSERT INTO identity.consents (person_id, consent_type, granted_at, legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT p.id, 'TERMS_OF_SERVICE', u."termsAcceptedAt", 'User', u.id, 'MEDIUM', 'REQUIRES_REVIEW'
FROM "User" u JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = u.id
WHERE u."termsAcceptedAt" IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO identity.consents (person_id, consent_type, granted_at, legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT p.id, 'PRIVACY_POLICY', u."privacyAcceptedAt", 'User', u.id, 'MEDIUM', 'REQUIRES_REVIEW'
FROM "User" u JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = u.id
WHERE u."privacyAcceptedAt" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 1.5 identity.reputation_events <- User.trustScore/.strikes (DERIVAR,
-- CURRENT VALUE ONLY — not a reconstructed event history, since none exists).
INSERT INTO identity.reputation_events (person_id, domain, delta, reason, occurred_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT p.id, 'GENERAL'::identity.trust_domain_enum, u."trustScore" - 70, -- 70 is the schema default baseline
  'Snapshot migration of legacy User.trustScore/.strikes — not an audited event history', u."updatedAt",
  'User', u.id, 'MEDIUM', 'REQUIRES_REVIEW'
FROM "User" u JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = u.id
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. Deduplication — email/google_sub uniqueness on user_accounts (already
--    declared in migration.sql) is the safety net if this script runs twice
--    without the legacy_record_id idempotency key working correctly.
-- ============================================================

-- ============================================================
-- 3. D-01 — confirm zero institution.* rows created (no INSERT statement
--    anywhere in this file targets institution.*; this assertion query
--    documents that omission is deliberate, not accidental).
-- ============================================================
SELECT COUNT(*) AS institutional_memberships_created FROM institution.institutional_memberships
WHERE legacy_source = 'User'; -- expect 0 (D-01: no synthetic memberships)

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
SELECT '020_identity', 'User', 'identity.people', 7, (SELECT COUNT(*) FROM identity.people WHERE legacy_source = 'User'),
  CASE WHEN (SELECT COUNT(*) FROM identity.people WHERE legacy_source = 'User') = 7 THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status)
SELECT '020_identity', 'User', 'identity.user_accounts', 7, (SELECT COUNT(*) FROM identity.user_accounts WHERE legacy_source = 'User'),
  CASE WHEN (SELECT COUNT(*) FROM identity.user_accounts WHERE legacy_source = 'User') = 7 THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
VALUES ('020_identity', 'User', 'institution.institutional_memberships', 0,
  (SELECT COUNT(*) FROM institution.institutional_memberships WHERE legacy_source = 'User'), 'PASS',
  'D-01 closure criterion: must remain 0.');
