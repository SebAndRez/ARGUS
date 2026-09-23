-- scripts/migration-rehearsal/sql/sync-principal-checks.sql
--
-- Paso 6A point 4: the runtime principal for the shadow-write is sync_worker,
-- not the migration owner. This file proves — against the fully applied local
-- database, as sync_worker itself — that:
--
--   1. sync_worker can EXECUTE every migration_meta.fn_sync_* function;
--   2. sync_worker can read NOTHING directly: not a target table, not a legacy
--      table, not migration_meta's own tables;
--   3. sync_worker can write NOTHING directly: no INSERT / UPDATE / DELETE on
--      any target table, including the ones its own sync function writes;
--   4. the functions are SECURITY DEFINER with a fixed search_path, which is
--      what makes (1) possible while (2) and (3) hold;
--   5. no other runtime role (app_api, ingest_worker, jobs_worker,
--      audit_reader, readonly_inspector) can call them at all;
--   6. sync_worker holds no role-level power: no SUPERUSER, no BYPASSRLS, no
--      CREATEROLE, no CREATEDB.
--
-- Every failure raises, so the phase that runs this file cannot pass quietly.
-- Markers: SYNC_PRINCIPAL_OK | ... on success, SYNC_PRINCIPAL_FAIL on failure.

\set ON_ERROR_STOP on

-- ============================================================
-- 0. The role exists and is as weak as it claims to be.
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin
    INTO r FROM pg_roles WHERE rolname = 'sync_worker';
  IF r IS NULL THEN
    RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: role sync_worker does not exist';
  END IF;
  IF r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb THEN
    RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: sync_worker holds role-level power (super=% bypassrls=% createrole=% createdb=%)',
      r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb;
  END IF;
  IF NOT r.rolcanlogin THEN
    RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: sync_worker cannot log in, so no runtime process could use it';
  END IF;
  RAISE NOTICE 'SYNC_PRINCIPAL_OK | role | sync_worker exists, LOGIN, NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB';
END $$;

-- ============================================================
-- 1. Every fn_sync_* is SECURITY DEFINER, has a pinned search_path, and is
--    executable by sync_worker and by no other runtime role.
-- ============================================================
DO $$
DECLARE
  fn record;
  v_count int := 0;
  v_role text;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname, p.prosecdef, p.proconfig, p.proacl,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'migration_meta' AND p.proname LIKE 'fn_sync_%'
  LOOP
    v_count := v_count + 1;

    IF NOT fn.prosecdef THEN
      RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: migration_meta.%(%) is not SECURITY DEFINER, so sync_worker could never run it without table grants',
        fn.proname, fn.args;
    END IF;

    -- A SECURITY DEFINER function without a pinned search_path is the classic
    -- privilege-escalation shape; every one of these sets it in its own body.
    IF fn.proconfig IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(fn.proconfig) AS c(v) WHERE c.v LIKE 'search_path=%'
    ) THEN
      RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: migration_meta.%(%) is SECURITY DEFINER with no pinned search_path',
        fn.proname, fn.args;
    END IF;

    -- PUBLIC is not a role name has_function_privilege accepts, so the ACL is
    -- read directly: an entry whose grantee is empty ('=X/owner') IS the PUBLIC
    -- grant. A NULL acl means the default, which for a function INCLUDES
    -- PUBLIC EXECUTE — so a NULL acl is a failure here, not a pass.
    IF fn.proacl IS NULL THEN
      RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: migration_meta.%(%) has a default ACL, which grants EXECUTE to PUBLIC', fn.proname, fn.args;
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(fn.proacl::text[]) AS a(entry) WHERE a.entry LIKE '=%') THEN
      RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: PUBLIC can execute migration_meta.%(%)', fn.proname, fn.args;
    END IF;

    IF NOT has_function_privilege('sync_worker', fn.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: sync_worker cannot execute migration_meta.%(%)', fn.proname, fn.args;
    END IF;

    FOREACH v_role IN ARRAY ARRAY['app_api','ingest_worker','jobs_worker','audit_reader','readonly_inspector','access_admin'] LOOP
      IF has_function_privilege(v_role, fn.oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: % can execute migration_meta.%(%) — the shadow-write must not be reachable from a request or worker role',
          v_role, fn.proname, fn.args;
      END IF;
    END LOOP;
  END LOOP;

  IF v_count < 11 THEN
    RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: expected at least 11 fn_sync_* functions, found %', v_count;
  END IF;
  RAISE NOTICE 'SYNC_PRINCIPAL_OK | grants | % fn_sync_* functions: SECURITY DEFINER, pinned search_path, EXECUTE only for sync_worker', v_count;
END $$;

-- ============================================================
-- 2. sync_worker has NO table privilege anywhere. Checked over every table in
--    every target schema plus migration_meta, not a sample.
-- ============================================================
DO $$
DECLARE
  t record;
  v_priv text;
  v_checked int := 0;
BEGIN
  FOR t IN
    SELECT c.oid, n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','p')
      AND n.nspname IN ('identity','institution','capability','governance','security','ingest',
                        'evidence','incident','risk','help','mission','resource','alert','comms',
                        'geo','knowledge','community','ice','media','proj','migration_meta')
  LOOP
    v_checked := v_checked + 1;
    FOREACH v_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('sync_worker', t.oid, v_priv) THEN
        RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: sync_worker holds % on %.% — its only surface must be EXECUTE on fn_sync_*',
          v_priv, t.nspname, t.relname;
      END IF;
    END LOOP;
  END LOOP;

  IF v_checked < 100 THEN
    RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: only % tables inspected; the schema set looks wrong, so this proof would be vacuous', v_checked;
  END IF;
  RAISE NOTICE 'SYNC_PRINCIPAL_OK | no_table_privilege | % tables inspected, zero privileges for sync_worker', v_checked;
END $$;

-- ============================================================
-- 3. The same, for the LEGACY tables the functions read. A compromised sync
--    credential must not be able to read the legacy database either.
-- ============================================================
DO $$
DECLARE
  t record;
  v_priv text;
  v_checked int := 0;
BEGIN
  FOR t IN
    SELECT c.oid, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public'
  LOOP
    v_checked := v_checked + 1;
    FOREACH v_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF has_table_privilege('sync_worker', t.oid, v_priv) THEN
        RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: sync_worker holds % on legacy public.%', v_priv, t.relname;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'SYNC_PRINCIPAL_OK | no_legacy_privilege | % legacy tables inspected, zero privileges for sync_worker', v_checked;
END $$;

-- ============================================================
-- 4. Now run AS sync_worker: the function works, and nothing else does.
--    Each negative case is wrapped so the expected denial is proven, not
--    merely hoped for — an unexpected success raises.
-- ============================================================
BEGIN;
SET LOCAL ROLE sync_worker;

-- 4.1 A direct read is denied.
DO $$
BEGIN
  PERFORM 1 FROM identity.people LIMIT 1;
  RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: sync_worker read identity.people directly';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'SYNC_PRINCIPAL_OK | negative | sync_worker cannot SELECT identity.people';
END $$;

-- 4.2 A direct write to a table its own sync function writes is denied.
DO $$
BEGIN
  INSERT INTO identity.people (legal_name, display_alias, updated_at)
  VALUES ('SYNC_PRINCIPAL_PROBE', 'probe', now());
  RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: sync_worker inserted into identity.people directly';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'SYNC_PRINCIPAL_OK | negative | sync_worker cannot INSERT into identity.people';
END $$;

-- 4.3 A direct read of the legacy source is denied.
DO $$
BEGIN
  PERFORM 1 FROM public."User" LIMIT 1;
  RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: sync_worker read legacy public."User" directly';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'SYNC_PRINCIPAL_OK | negative | sync_worker cannot SELECT legacy public."User"';
END $$;

-- 4.4 The audit log stays out of reach even though fn_sync_audit_logs writes it.
DO $$
BEGIN
  PERFORM 1 FROM security.audit_logs LIMIT 1;
  RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: sync_worker read security.audit_logs directly';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'SYNC_PRINCIPAL_OK | negative | sync_worker cannot SELECT security.audit_logs';
END $$;

-- 4.5 ...and the positive case: the mapping runs, and it is idempotent. The
--     whole legacy set is re-synced with NULL, which after the backfill must
--     report no INSERTED row anywhere: the sync converges, it does not
--     duplicate.
DO $$
DECLARE
  v_rows int;
  v_inserted int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE action = 'INSERTED')
    INTO v_rows, v_inserted
  FROM migration_meta.fn_sync_users(NULL);

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: fn_sync_users returned no rows as sync_worker, so nothing was proven';
  END IF;
  IF v_inserted > 0 THEN
    RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: fn_sync_users inserted % row(s) on a re-run — not idempotent', v_inserted;
  END IF;
  RAISE NOTICE 'SYNC_PRINCIPAL_OK | positive | sync_worker ran fn_sync_users: % row report, 0 inserted (idempotent)', v_rows;
END $$;

-- 4.6 A second domain, to show 4.5 is not a one-function accident.
DO $$
DECLARE v_rows int; v_inserted int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE action = 'INSERTED')
    INTO v_rows, v_inserted
  FROM migration_meta.fn_sync_help_requests(NULL);
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: fn_sync_help_requests returned no rows as sync_worker';
  END IF;
  IF v_inserted > 0 THEN
    RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: fn_sync_help_requests inserted % row(s) on a re-run', v_inserted;
  END IF;
  RAISE NOTICE 'SYNC_PRINCIPAL_OK | positive | sync_worker ran fn_sync_help_requests: % row report, 0 inserted', v_rows;
END $$;

-- 4.7 The escalation that must NOT work: a SECURITY DEFINER function does not
--     let its caller reach anything else the definer owns.
DO $$
BEGIN
  EXECUTE 'CREATE TABLE migration_meta.sync_principal_probe (x int)';
  RAISE EXCEPTION 'SYNC_PRINCIPAL_FAIL: sync_worker created a table in migration_meta';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'SYNC_PRINCIPAL_OK | negative | sync_worker cannot create objects in migration_meta';
END $$;

ROLLBACK;

-- Nothing above committed, and the positive cases only re-ran a converged
-- mapping, so this file leaves the database exactly as it found it.
SELECT 'SYNC_PRINCIPAL_CHECKS_PASS' AS result;
