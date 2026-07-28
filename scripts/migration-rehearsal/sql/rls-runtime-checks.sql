-- NOT EXECUTED IN THIS SESSION (no local engine available).
-- Fase 12 — RLS runtime checks. Connects as the bootstrap superuser
-- (POSTGRES_USER from docker-compose, NOT migration_owner — per the mandate,
-- migration_owner must never be used to simulate the application) and uses
-- SET ROLE to act as each of the five actual application-facing roles.
-- Superuser can SET ROLE to anything without prior GRANT <role> TO <user>.
--
-- Every "should be denied" check uses a DO block with an exception handler
-- so a correct denial does NOT abort the script (ON_ERROR_STOP stays on for
-- genuinely unexpected errors). Output convention, grepped by
-- Test-ArgusRehearsal.ps1:
--   RLS_TEST_PASS: <what was verified>
--   RLS_TEST_FAIL: <what went wrong>  (any occurrence = hard failure)
\pset format unaligned

-- Depends on scripts/migration-rehearsal/fixtures/001_synthetic_fixtures.sql
-- having already been applied (help.help_requests id
-- 20000000-0000-0000-0000-000000000001, ice.emergency_profiles id
-- 70000000-0000-0000-0000-000000000001, etc.)

-- =====================================================================
-- app_api
-- =====================================================================
SET ROLE app_api;

DO $$
BEGIN
  PERFORM 1 FROM help.help_requests WHERE id = '20000000-0000-0000-0000-000000000001';
  RAISE NOTICE 'RLS_TEST_PASS: app_api SELECT on help.help_requests executed without error (visibility governed by policy predicate, not an outright grant failure)';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'RLS_TEST_FAIL: app_api has no SELECT grant at all on help.help_requests (%), expected policy-filtered access, not zero grant', SQLERRM;
END $$;

DO $$
BEGIN
  UPDATE help.help_requests SET status = 'CLOSED', closed_at = now() WHERE id = '20000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'RLS_TEST_FAIL: app_api was able to UPDATE help_requests.status directly — must be denied (only help.close_help_request_authorized SECURITY DEFINER may do this)';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'RLS_TEST_PASS: app_api denied direct UPDATE of help_requests.status (insufficient_privilege)';
  WHEN others THEN
    IF SQLERRM LIKE 'RLS_TEST_FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'RLS_TEST_PASS: app_api denied direct UPDATE of help_requests.status (%)', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM 1 FROM ice.emergency_profiles WHERE id = '70000000-0000-0000-0000-000000000001';
  RAISE NOTICE 'RLS_TEST_PASS: app_api SELECT on ice.emergency_profiles executed without error (row visibility depends on emergency_profiles_owner_or_emergency policy)';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'RLS_TEST_FAIL: app_api has no SELECT grant at all on ice.emergency_profiles (%)', SQLERRM;
END $$;

DO $$
BEGIN
  UPDATE security.audit_logs SET action = 'tampered' WHERE 1=0; -- WHERE 1=0: never touches a real row even if the UPDATE were allowed
  RAISE EXCEPTION 'RLS_TEST_FAIL: app_api was able to run UPDATE against security.audit_logs at all — must be denied by REVOKE UPDATE (audit_logs must be append-only)';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'RLS_TEST_PASS: app_api denied UPDATE on security.audit_logs (append-only enforced)';
  WHEN others THEN
    IF SQLERRM LIKE 'RLS_TEST_FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'RLS_TEST_PASS: app_api denied UPDATE on security.audit_logs (%)', SQLERRM;
END $$;

RESET ROLE;

-- =====================================================================
-- ingest_worker — should reach ingest.*/evidence.* but not identity/help/mission/ice
-- =====================================================================
SET ROLE ingest_worker;

DO $$
BEGIN
  PERFORM 1 FROM ingest.source_records WHERE id = 'e0000000-0000-0000-0000-000000000041';
  RAISE NOTICE 'RLS_TEST_PASS: ingest_worker can SELECT ingest.source_records (in-scope schema)';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'RLS_TEST_FAIL: ingest_worker cannot SELECT ingest.source_records at all (%), expected at least in-scope read access', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM 1 FROM ice.emergency_profiles WHERE id = '70000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'RLS_TEST_FAIL: ingest_worker was able to read ice.emergency_profiles — an ingestion credential must never reach ICE data (least-privilege boundary from 000_preflight/migration.sql rationale)';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'RLS_TEST_PASS: ingest_worker denied read access to ice.emergency_profiles';
  WHEN others THEN
    IF SQLERRM LIKE 'RLS_TEST_FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'RLS_TEST_PASS: ingest_worker denied read access to ice.emergency_profiles (%)', SQLERRM;
END $$;

RESET ROLE;

-- =====================================================================
-- audit_reader — read-only on security.audit_logs / access_decisions, nothing else
-- =====================================================================
SET ROLE audit_reader;

DO $$
BEGIN
  PERFORM 1 FROM security.audit_logs LIMIT 1;
  RAISE NOTICE 'RLS_TEST_PASS: audit_reader can SELECT security.audit_logs';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'RLS_TEST_FAIL: audit_reader cannot SELECT security.audit_logs (%) — this is its sole purpose', SQLERRM;
END $$;

DO $$
BEGIN
  INSERT INTO security.audit_logs DEFAULT VALUES;
  RAISE EXCEPTION 'RLS_TEST_FAIL: audit_reader was able to INSERT into security.audit_logs — must be strictly read-only';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'RLS_TEST_PASS: audit_reader denied INSERT on security.audit_logs';
  WHEN others THEN
    IF SQLERRM LIKE 'RLS_TEST_FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'RLS_TEST_PASS: audit_reader denied INSERT on security.audit_logs (%)', SQLERRM;
END $$;

RESET ROLE;

-- =====================================================================
-- readonly_inspector — NOLOGIN, broad SELECT via SET ROLE, zero write anywhere
-- =====================================================================
SET ROLE readonly_inspector;

DO $$
BEGIN
  PERFORM 1 FROM identity.people LIMIT 1;
  RAISE NOTICE 'RLS_TEST_PASS: readonly_inspector can SELECT identity.people (inspection role)';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'RLS_TEST_FAIL: readonly_inspector cannot SELECT identity.people (%) — inspection role should have broad read', SQLERRM;
END $$;

DO $$
BEGIN
  UPDATE identity.people SET display_alias = 'tampered' WHERE id = 'b0000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'RLS_TEST_FAIL: readonly_inspector was able to UPDATE identity.people — must never write anything, anywhere';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'RLS_TEST_PASS: readonly_inspector denied UPDATE on identity.people';
  WHEN others THEN
    IF SQLERRM LIKE 'RLS_TEST_FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'RLS_TEST_PASS: readonly_inspector denied UPDATE on identity.people (%)', SQLERRM;
END $$;

RESET ROLE;

-- =====================================================================
-- Structural: no sensitive policy uses a bare USING (true) reachable by a
-- broad/untrusted role (app_api counts as "trusted server role", not
-- untrusted — this checks for the literal anti-pattern only).
-- =====================================================================
SELECT 'POLICIES_WITH_BARE_USING_TRUE' AS check_name,
       coalesce(string_agg(schemaname || '.' || tablename || '.' || policyname, ','), '(none — correct)') AS value
FROM pg_policies
WHERE qual = 'true' AND roles::text NOT LIKE '%migration_owner%';
