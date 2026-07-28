-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 050 — Validation. SELECT-only.

SELECT table_schema, COUNT(*) FROM information_schema.tables
WHERE table_schema IN ('help','mission') AND table_type = 'BASE TABLE'
GROUP BY table_schema ORDER BY table_schema;
-- Expected: help=6, mission=10.

-- Authorized-closure function exists, SECURITY DEFINER, search_path fixed
SELECT p.proname, p.prosecdef, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'help' AND p.proname = 'close_help_request_authorized';
-- Expected: 1 row, prosecdef=true, proconfig containing search_path=pg_catalog, public.

-- No role except app_api has EXECUTE on the closure function
SELECT grantee, privilege_type FROM information_schema.routine_privileges
WHERE routine_schema = 'help' AND routine_name = 'close_help_request_authorized';
-- Expected: exactly 1 row, grantee='app_api'.

-- ck_help_requests_close_actor present
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ck_help_requests_close_actor';
-- Expected: 1 row.

-- Deferred FK resolved
SELECT conname FROM pg_constraint WHERE conname = 'fk_audit_logs_mission';
-- Expected: 1 row.

-- RLS coverage
SELECT n.nspname, c.relname, c.relrowsecurity, COUNT(p.polname) AS policy_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname IN ('help','mission') AND c.relkind = 'r'
GROUP BY n.nspname, c.relname, c.relrowsecurity
HAVING c.relrowsecurity = false OR COUNT(p.polname) = 0;
-- Expected: 0 rows.

-- Requester-cannot-update-own-status double-barrier confirmed (2 policies on help_requests)
SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'help' AND tablename = 'help_requests';
-- Expected: >=2 rows, including one FOR UPDATE with requester-denial logic.
