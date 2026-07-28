-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 000 — Preflight — Validation
-- SELECT-only. Safe to run repeatedly. Verifies the wave applied correctly
-- before Wave 010 begins.

-- 1. All 6 roles exist
SELECT rolname,
       rolsuper       AS is_superuser,      -- expect false for all 6
       rolcreaterole  AS can_create_role,   -- expect false for all 6
       rolcreatedb    AS can_create_db,     -- expect false for all 6
       rolcanlogin    AS can_login,         -- expect true for app_api/ingest_worker/jobs_worker/audit_reader; false for migration_owner/readonly_inspector
       rolbypassrls   AS bypasses_rls       -- expect false for ALL 6 — load-bearing check
FROM pg_roles
WHERE rolname IN ('migration_owner','app_api','ingest_worker','jobs_worker','audit_reader','readonly_inspector')
ORDER BY rolname;

-- Expected row count: 6. If fewer, migration.sql's role creation did not
-- fully apply. If any rolbypassrls = true, STOP — this violates D-03 and
-- the Access Control v1.1 §1 deny-by-default principle and must be fixed
-- before any later wave grants privileges to that role.

-- 2. No role above has been granted BYPASSRLS or superuser after the fact
--    by a later, unreviewed change (defense-in-depth re-check, identical
--    query to #1, intended to be re-run periodically, not just once).
SELECT rolname
FROM pg_roles
WHERE rolname IN ('migration_owner','app_api','ingest_worker','jobs_worker','audit_reader','readonly_inspector')
  AND (rolbypassrls OR rolsuper);
-- Expected: 0 rows.

-- 3. Drift-check re-verification: current 33-table RLS-enabled-no-policy
--    count against the last documented baseline
--    (ARGUS_CURRENT_RLS_CONTAINMENT_PLAN_v1.0.md §1-2: 26 tables with 0
--    policies, 8 tables with >=1 unexplained policy). This query does not
--    assume the baseline is still accurate — it re-derives it.
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       COUNT(p.polname) AS policy_count
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity
ORDER BY policy_count, c.relname;

-- 4. Confirm public.rls_auto_enable() status (existence + security type +
--    grantees) has not changed since ARGUS_RLS_AUTO_ENABLE_REMEDIATION_v1.0.md
--    was written, before assuming that document's findings still hold.
SELECT r.routine_name, r.security_type, r.routine_body
FROM information_schema.routines r
WHERE r.routine_schema = 'public' AND r.routine_name = 'rls_auto_enable';

SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'rls_auto_enable' AND routine_schema = 'public';

-- 5. Confirm prisma/schema.prisma and prisma/migrations/ were not touched
--    by this wave (process check, not SQL — verify via `git status` /
--    `git diff` outside the database, not inside this file).
