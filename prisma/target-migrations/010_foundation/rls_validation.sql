-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- RLS validation — SELECT-only checks confirming every OPERATIONAL+ table
-- has RLS enabled AND at least one policy. This is the single most important
-- check in the entire target-migration package: it must NEVER reproduce the
-- current production drift documented in
-- ARGUS_CURRENT_RLS_CONTAINMENT_PLAN_v1.0.md (RLS enabled, zero policies, on
-- 26 of 33 current tables) in the TARGET schema. Re-run after every wave's
-- migration.sql (each wave enables RLS on its own OPERATIONAL+ tables — this
-- query is schema-wide, not wave-scoped, so it becomes more complete as more
-- waves are applied, and is safe/idempotent to re-run at any point).

-- 1. Every table with RLS enabled has >=1 policy (the exact drift to avoid)
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  COUNT(p.polname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname IN ('governance','security','identity','institution','capability',
                     'ingest','evidence','incident','risk','command','help','mission',
                     'resource','comms','alert','geo','ice','community','media','knowledge')
  AND c.relkind = 'r'
GROUP BY n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
HAVING c.relrowsecurity = true AND COUNT(p.polname) = 0
ORDER BY n.nspname, c.relname;
-- Expected: 0 rows, always. Any row returned here is the exact drift this
-- migration package exists to prevent — STOP and fix before proceeding.

-- 2. Every table classified OPERATIONAL+ in Access Control v1.1 §4 (not
--    listed as exempt in §7) has RLS enabled at all (catches the opposite
--    failure mode: forgetting to enable RLS, not just forgetting a policy).
--    This list is maintained by hand against the frozen authority and grows
--    as each wave's migration.sql lands — reconciled against §4's 143-table
--    count and §7's 25-table exemption list as a completeness check, not
--    auto-derived (the frozen doc is prose+tables, not machine-readable).
WITH expected_rls AS (
  SELECT unnest(ARRAY[
    'governance.emergency_bases','governance.resource_reservation_rules',
    'governance.jurisdiction_scopes',
    'security.access_policies','security.permissions','security.access_roles',
    'security.access_role_permissions','security.contextual_accesses',
    'security.access_decisions','security.audit_logs','security.security_events',
    'security.retention_policies','security.legal_holds'
    -- Later waves append their own OPERATIONAL+ table list here as they land;
    -- this file is re-run, not rewritten, at each wave boundary.
  ]) AS qualified_name
)
SELECT e.qualified_name
FROM expected_rls e
WHERE NOT EXISTS (
  SELECT 1 FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname || '.' || c.relname = e.qualified_name AND c.relrowsecurity = true
);
-- Expected: 0 rows.

-- 3. Every RLS-enabled table also has FORCE ROW LEVEL SECURITY (Access
--    Control v1.1 §1 principle — without FORCE, the table owner silently
--    bypasses every policy, defeating rls_roles.sql's NOBYPASSRLS posture
--    for migration_owner specifically).
SELECT n.nspname, c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relrowsecurity = true AND c.relforcerowsecurity = false
  AND n.nspname IN ('governance','security');
-- Expected: 0 rows.

-- 4. No policy anywhere reads a bare `USING (true)` (grep-equivalent check
--    against pg_policies.qual, since a permissive true-policy is functionally
--    equivalent to no policy at all for any role not already blocked by
--    ownership/BYPASSRLS — the exact ambiguity flagged in
--    000_preflight/rls_auto_enable_remediation.sql §3 Option 1).
SELECT schemaname, tablename, policyname, roles, qual
FROM pg_policies
WHERE qual = 'true' AND schemaname IN ('governance','security');
-- Expected: 0 rows in the TARGET schema (a scoped, single-named-role
-- USING (true) as illustrated for CURRENT-database interim containment is
-- explicitly out of scope of this query, which only checks target schemas).

-- 5. app_api/ingest_worker/jobs_worker/audit_reader/readonly_inspector all
--    confirmed NOBYPASSRLS (restates rls_roles.sql's assertion as a live check)
SELECT rolname, rolbypassrls
FROM pg_roles
WHERE rolname IN ('migration_owner','app_api','ingest_worker','jobs_worker','audit_reader','readonly_inspector')
  AND rolbypassrls = true;
-- Expected: 0 rows.
