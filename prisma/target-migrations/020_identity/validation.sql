-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 020 — Identity — Validation
-- SELECT-only. Safe to run repeatedly.

-- 1. Table counts
SELECT table_schema, COUNT(*) FROM information_schema.tables
WHERE table_schema IN ('identity','institution','capability') AND table_type = 'BASE TABLE'
GROUP BY table_schema ORDER BY table_schema;
-- Expected: identity=9, institution=4, capability=4.

-- 2. D-01 zero-membership rule: institution.institutional_memberships MUST be
--    empty immediately after this wave's backfill (no synthetic rows created)
SELECT COUNT(*) AS membership_count FROM institution.institutional_memberships;
-- Expected: 0 immediately post-migration (before any human declares real
-- membership) — a nonzero count here right after migration indicates D-01
-- was violated by an over-eager backfill script.

-- 3. D-01 derivation query — confirm every migrated person is correctly
--    classified UNASSIGNED (this is the actual application-layer derivation,
--    restated here as a read-only check, not a stored column)
SELECT p.id, p.legal_name,
  NOT EXISTS (
    SELECT 1 FROM institution.institutional_memberships im
    WHERE im.person_id = p.id AND im.effective_to IS NULL
  ) AS is_unassigned
FROM identity.people p
WHERE p.legacy_source = 'User';
-- Expected: is_unassigned = true for all 7 migrated rows, immediately post-migration.

-- 4. Deferred FKs from Wave 010 now resolved
SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint
WHERE conname IN ('fk_jurisdictions_declaring_organization','fk_rrr_institution',
                  'fk_audit_logs_device','fk_audit_logs_operational_session');
-- Expected: 4 rows.

-- 5. RLS coverage for this wave's 17 tables
SELECT n.nspname, c.relname, c.relrowsecurity, COUNT(p.polname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname IN ('identity','institution','capability') AND c.relkind = 'r'
GROUP BY n.nspname, c.relname, c.relrowsecurity
HAVING c.relrowsecurity = false OR COUNT(p.polname) = 0;
-- Expected: 0 rows (every table in this wave is OPERATIONAL+ per Access
-- Control v1.1 §4.1-4.3 — none is exempted in §7).

-- 6. Legacy provenance columns present on backfilled tables (D-02)
SELECT table_name FROM information_schema.columns
WHERE table_schema = 'identity' AND column_name = 'legacy_record_id'
  AND table_name IN ('people','user_accounts','verified_identities','reputation_events','consents');
-- Expected: 5 rows.
