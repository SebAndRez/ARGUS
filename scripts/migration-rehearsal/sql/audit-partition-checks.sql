-- scripts/migration-rehearsal/sql/audit-partition-checks.sql
--
-- security.audit_logs monthly-partition lifecycle checks, run by
-- Test-ArgusRehearsal.ps1 against the fully-migrated (waves 000..100) local
-- rehearsal database.
--
-- Relationship to prisma/target-migrations/010_foundation/validation.sql:
-- that file asserts the same structural contract at WAVE level (and blocks
-- the wave when it is broken). This file asserts BEHAVIOR on the fully
-- assembled database — real inserts routed by real timestamps, verified via
-- tableoid, under real non-superuser roles — and emits the marker vocabulary
-- the rehearsal summary greps for:
--
--   AUDIT_PARTITION_PARENT_PASS
--   AUDIT_PARTITION_NO_DEFAULT_PASS
--   AUDIT_PARTITION_BOUNDS_PASS
--   AUDIT_PARTITION_INDEX_PASS
--   AUDIT_PARTITION_WINDOW_PASS
--   AUDIT_PARTITION_SECURITY_PASS
--   AUDIT_PARTITION_BACKFILL_PASS
--   AUDIT_PARTITION_RLS_PASS
--
-- (AUDIT_PARTITION_CONCURRENCY_PASS needs several simultaneous connections,
-- so it is produced by Test-ArgusRehearsal.ps1 driving parallel psql
-- sessions; AUDIT_PARTITION_ROLLBACK_PASS is produced by
-- Invoke-ArgusFullRehearsal.ps1 after the 100->000 rollback.)
--
-- Every mutation happens inside BEGIN ... ROLLBACK, so this file leaves ZERO
-- rows and ZERO partitions behind and is safe to re-run any number of times.
-- Anything that fails emits an `AUDIT_PARTITION_..._FAIL` line AND raises, so
-- neither a missing PASS nor a non-zero exit can be mistaken for green.

\pset format unaligned
\pset tuples_only on

-- ============================================================
-- 1. Structure: parent, no DEFAULT, bounds, indexes, window, security
-- ============================================================
-- Reuses the wave-010 validation logic by invoking the same canonical
-- assertion function, rather than restating the bound arithmetic a third
-- time.

DO $$
DECLARE
  v_keydef text;
BEGIN
  SELECT pg_get_partkeydef(partrelid) INTO v_keydef
  FROM pg_partitioned_table WHERE partrelid = 'security.audit_logs'::regclass;
  IF v_keydef IS DISTINCT FROM 'RANGE (occurred_at)' THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_PARENT_FAIL: partition key is %', coalesce(v_keydef, '(not partitioned)');
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'security' AND p.proname IN (
        'fn_audit_log_month_start','fn_audit_log_next_month_start','fn_audit_log_partition_name',
        'fn_assert_audit_log_partition','fn_ensure_audit_log_partition','fn_ensure_audit_log_partition_window')) <> 6 THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_PARENT_FAIL: lifecycle functions missing';
  END IF;
  RAISE NOTICE 'AUDIT_PARTITION_PARENT_PASS';
END $$;

DO $$
DECLARE v_default text;
BEGIN
  SELECT c.relname INTO v_default
  FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
  WHERE i.inhparent = 'security.audit_logs'::regclass
    AND pg_get_expr(c.relpartbound, c.oid) = 'DEFAULT';
  IF v_default IS NOT NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_NO_DEFAULT_FAIL: % is a DEFAULT partition', v_default;
  END IF;
  RAISE NOTICE 'AUDIT_PARTITION_NO_DEFAULT_PASS';
END $$;

DO $$
DECLARE
  r        record;
  v_month  timestamptz;
  v_count  integer := 0;
BEGIN
  FOR r IN
    SELECT c.oid, c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'security.audit_logs'::regclass ORDER BY c.relname
  LOOP
    IF r.relname !~ '^audit_logs_y[0-9]{4}m(0[1-9]|1[0-2])$' THEN
      RAISE EXCEPTION 'AUDIT_PARTITION_BOUNDS_FAIL: bad partition name %', r.relname;
    END IF;
    v_month := (substr(r.relname, 13, 4) || '-' || substr(r.relname, 18, 2) || '-01 00:00:00+00')::timestamptz;
    PERFORM security.fn_assert_audit_log_partition(
      r.oid,
      security.fn_audit_log_month_start(v_month),
      security.fn_audit_log_next_month_start(v_month));
    v_count := v_count + 1;
  END LOOP;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_BOUNDS_FAIL: zero partitions';
  END IF;
  RAISE NOTICE 'AUDIT_PARTITION_BOUNDS_PASS (% partitions)', v_count;
END $$;

DO $$
DECLARE
  v_parent_indexes integer;
  r record;
BEGIN
  SELECT count(*) INTO v_parent_indexes FROM pg_index WHERE indrelid = 'security.audit_logs'::regclass;
  FOR r IN
    SELECT c.relname,
           (SELECT count(*) FROM pg_index ci JOIN pg_inherits ii ON ii.inhrelid = ci.indexrelid
             WHERE ci.indrelid = c.oid
               AND ii.inhparent IN (SELECT indexrelid FROM pg_index WHERE indrelid = 'security.audit_logs'::regclass)) AS attached
    FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'security.audit_logs'::regclass
  LOOP
    IF r.attached <> v_parent_indexes THEN
      RAISE EXCEPTION 'AUDIT_PARTITION_INDEX_FAIL: % has % of % parent indexes attached', r.relname, r.attached, v_parent_indexes;
    END IF;
  END LOOP;
  RAISE NOTICE 'AUDIT_PARTITION_INDEX_PASS (% per partition)', v_parent_indexes;
END $$;

DO $$
DECLARE
  v_offset  integer;
  v_name    text;
  v_missing text[] := '{}';
BEGIN
  FOR v_offset IN -1 .. 3 LOOP
    v_name := security.fn_audit_log_partition_name(
      ((security.fn_audit_log_month_start(now()) AT TIME ZONE 'UTC') + make_interval(months => v_offset)) AT TIME ZONE 'UTC');
    IF NOT EXISTS (
      SELECT 1 FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
      WHERE i.inhparent = 'security.audit_logs'::regclass AND c.relname = v_name
    ) THEN
      v_missing := v_missing || v_name;
    END IF;
  END LOOP;
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_WINDOW_FAIL: missing %', array_to_string(v_missing, ',');
  END IF;
  RAISE NOTICE 'AUDIT_PARTITION_WINDOW_PASS (prev + current + next 3, zero gaps)';
END $$;

DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(p.proname, ',') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'security' AND p.proname LIKE 'fn_%audit_log%partition%'
    AND has_function_privilege('public', p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_SECURITY_FAIL: PUBLIC holds EXECUTE on %', v_bad;
  END IF;

  SELECT string_agg(rolname, ',') INTO v_bad FROM pg_roles
  WHERE rolname IN ('app_api','ingest_worker','jobs_worker','audit_reader','readonly_inspector')
    AND has_schema_privilege(rolname, 'security', 'CREATE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_SECURITY_FAIL: % hold CREATE ON SCHEMA security', v_bad;
  END IF;

  SELECT string_agg(c.relname, ',') INTO v_bad
  FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
  WHERE i.inhparent = 'security.audit_logs'::regclass
    AND (pg_get_userbyid(c.relowner) IN ('app_api','ingest_worker','jobs_worker')
         OR NOT (c.relrowsecurity AND c.relforcerowsecurity));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_SECURITY_FAIL: partition(s) % owned by a runtime role or missing ENABLE/FORCE RLS', v_bad;
  END IF;
  RAISE NOTICE 'AUDIT_PARTITION_SECURITY_PASS';
END $$;

-- ============================================================
-- 2. Backfill: every distinct UTC month of the legacy source has a partition,
--    and every backfilled row physically LIVES in the partition its own
--    occurred_at demands (verified via tableoid, never by name guessing).
-- ============================================================
DO $$
DECLARE
  v_missing_months text;
  v_misrouted      bigint;
  v_legacy_rows    bigint;
  v_target_rows    bigint;
BEGIN
  SELECT string_agg(to_char(m, 'YYYY-MM'), ',') INTO v_missing_months
  FROM (
    SELECT DISTINCT date_trunc('month', al."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS m
    FROM "AuditLog" al WHERE al."createdAt" IS NOT NULL
  ) s
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'security.audit_logs'::regclass
      AND c.relname = security.fn_audit_log_partition_name(s.m)
  );
  IF v_missing_months IS NOT NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_BACKFILL_FAIL: legacy month(s) % have no partition', v_missing_months;
  END IF;

  SELECT count(*) INTO v_misrouted
  FROM security.audit_logs a
  WHERE a.tableoid::regclass::text <> 'security.' || security.fn_audit_log_partition_name(a.occurred_at);
  IF v_misrouted > 0 THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_BACKFILL_FAIL: % row(s) live in a partition their occurred_at does not belong to', v_misrouted;
  END IF;

  SELECT count(*) INTO v_legacy_rows FROM "AuditLog";
  SELECT count(*) INTO v_target_rows FROM security.audit_logs WHERE legacy_source = 'AuditLog';
  IF v_target_rows <> v_legacy_rows THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_BACKFILL_FAIL: legacy AuditLog has % row(s), target has % backfilled row(s)', v_legacy_rows, v_target_rows;
  END IF;
  IF v_legacy_rows = 0 THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_BACKFILL_FAIL: legacy AuditLog is empty - this check would prove nothing';
  END IF;

  -- The fixtures must genuinely span more than one month, otherwise a
  -- July-2026-only source would let a single-partition database pass.
  IF (SELECT count(DISTINCT date_trunc('month', occurred_at AT TIME ZONE 'UTC'))
      FROM security.audit_logs WHERE legacy_source = 'AuditLog') < 4 THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_BACKFILL_FAIL: backfilled audit rows span fewer than 4 distinct UTC months - the fixtures are still pinned to a single month';
  END IF;

  RAISE NOTICE 'AUDIT_PARTITION_BACKFILL_PASS (% rows, % distinct UTC months, zero misrouted)',
    v_target_rows,
    (SELECT count(DISTINCT date_trunc('month', occurred_at AT TIME ZONE 'UTC')) FROM security.audit_logs WHERE legacy_source = 'AuditLog');
END $$;

-- ============================================================
-- 3. Real inserts at the exact instants the mandate names, routed by
--    tableoid. Includes offset-bearing inputs (routed by UTC instant, not
--    wall clock), a year boundary, and a leap day.
-- ============================================================
BEGIN;
DO $$
DECLARE
  v_probe   timestamptz;
  v_landed  text;
  v_expected text;
BEGIN
  FOR v_probe IN SELECT * FROM (VALUES
      (TIMESTAMPTZ '2026-04-15 12:00:00+00'),
      (TIMESTAMPTZ '2026-07-31 23:59:59+00'),
      (TIMESTAMPTZ '2026-08-01 00:00:00+00'),
      (TIMESTAMPTZ '2026-12-31 23:59:59+00'),
      (TIMESTAMPTZ '2027-01-01 00:00:00+00'),
      (TIMESTAMPTZ '2028-02-29 12:00:00+00'),
      (TIMESTAMPTZ '2026-08-01 00:30:00+02:00'),
      (TIMESTAMPTZ '2026-07-31 23:30:00-03:00')
    ) v(t)
  LOOP
    PERFORM security.fn_ensure_audit_log_partition(v_probe);
    INSERT INTO security.audit_logs
      (id, actor_type, actor_id, action, target_table, target_id, classification, result, integrity_value, occurred_at)
    VALUES (gen_random_uuid(), 'SYSTEM', gen_random_uuid(), 'AUDIT_PARTITION_PROBE', 'security.audit_logs',
            gen_random_uuid(), 'RESTRICTED', 'SUCCESS', 'rehearsal-probe', v_probe);

    SELECT a.tableoid::regclass::text INTO v_landed
    FROM security.audit_logs a
    WHERE a.action = 'AUDIT_PARTITION_PROBE' AND a.occurred_at = v_probe
    LIMIT 1;

    v_expected := 'security.' || security.fn_audit_log_partition_name(v_probe);
    IF v_landed IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'AUDIT_PARTITION_ROUTING_FAIL: % landed in %, expected %', v_probe, coalesce(v_landed, '(nowhere)'), v_expected;
    END IF;
    RAISE NOTICE 'AUDIT_PARTITION_ROUTING_OK % -> %', v_probe, v_landed;
  END LOOP;
END $$;
ROLLBACK;

-- ============================================================
-- 4. RLS / privilege behavior under REAL non-superuser roles.
-- ============================================================
-- Positive AND negative, both required: a suite where every role is denied
-- everything proves nothing.
-- Role switching happens at TOP LEVEL via `SET LOCAL ROLE` between DO blocks,
-- the same proven pattern rls-matrix-checks.sql uses in this repo, rather
-- than inside a single plpgsql block.

BEGIN;

-- PERSISTED authorization for this block's actors. The audit-write policy now
-- requires a real security.access_role_assignments row: the session role GUC no
-- longer authorizes anything, so `SET LOCAL argus.actor_role = 'SYSTEM'` (what
-- this block used to do) is denied. The service identity is a SYSTEM subject —
-- for a machine identity the subject's own id IS its actor id.
CREATE TEMP TABLE audit_partition_actors (k text PRIMARY KEY, v uuid);
GRANT SELECT ON audit_partition_actors TO app_api, audit_reader, readonly_inspector;
INSERT INTO identity.people (id, legal_name)
VALUES ('d1000000-0000-0000-0000-0000000000a7', 'Audit Partition Fixture Reader')
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_partition_actors (k, v)
VALUES ('service', security.fn_register_access_subject('SYSTEM', NULL, NULL, NULL, 'ARGUS_AUDIT_PARTITION_PROBE')),
       ('reader',  security.fn_register_access_subject('PERSON', 'd1000000-0000-0000-0000-0000000000a7'));
SELECT security.fn_grant_access_role((SELECT v FROM audit_partition_actors WHERE k = 'service'), 'SYSTEM');
SELECT security.fn_grant_access_role((SELECT v FROM audit_partition_actors WHERE k = 'reader'), 'AUDIT');

-- app_api: the AUTHORIZED server-side audit write, through the parent, as a
-- persisted SYSTEM subject. Two defects had to be fixed for this to be
-- reachable at all: the sequence behind audit_logs.sequence_number had no USAGE
-- grant, and the writer used to connect as the schema owner rather than as
-- app_api.
SET LOCAL ROLE app_api;
SELECT set_config('argus.actor_id', (SELECT v::text FROM audit_partition_actors WHERE k = 'service'), true);
DO $$
BEGIN
  INSERT INTO security.audit_logs
    (id, actor_type, actor_id, action, target_table, target_id, classification, result, integrity_value, occurred_at)
  VALUES (gen_random_uuid(), 'SYSTEM', gen_random_uuid(), 'AUDIT_PARTITION_RLS_PROBE', 'security.audit_logs',
          gen_random_uuid(), 'RESTRICTED', 'SUCCESS', 'rehearsal-probe', now());
  RAISE NOTICE 'AUDIT_PARTITION_RLS_OK | positive | app_api performs the authorized audit write through the parent';
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'AUDIT_PARTITION_RLS_FAIL: app_api could not perform the AUTHORIZED audit write (% %)', SQLSTATE, SQLERRM;
END $$;

DO $$
DECLARE v_n bigint;
BEGIN
  -- app_api must not be able to create a table in schema security at all.
  BEGIN
    EXECUTE 'CREATE TABLE security.audit_partition_probe_evil (x integer)';
    RAISE EXCEPTION 'AUDIT_PARTITION_RLS_FAIL: app_api was able to CREATE TABLE in schema security';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'AUDIT_PARTITION_RLS_OK | negative | app_api denied CREATE TABLE in schema security';
  END;

  -- ...nor to fabricate a partition by hand.
  BEGIN
    EXECUTE 'CREATE TABLE security.audit_logs_y2099m01 PARTITION OF security.audit_logs FOR VALUES FROM (''2099-01-01'') TO (''2099-02-01'')';
    RAISE EXCEPTION 'AUDIT_PARTITION_RLS_FAIL: app_api was able to attach an arbitrary partition to security.audit_logs';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'AUDIT_PARTITION_RLS_OK | negative | app_api denied attaching an arbitrary partition';
  END;

  -- ...nor to call the internal lifecycle functions it was never granted.
  BEGIN
    PERFORM security.fn_ensure_audit_log_partition(TIMESTAMPTZ '2099-01-01 00:00:00+00');
    RAISE EXCEPTION 'AUDIT_PARTITION_RLS_FAIL: app_api executed security.fn_ensure_audit_log_partition';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'AUDIT_PARTITION_RLS_OK | negative | app_api denied EXECUTE on fn_ensure_audit_log_partition';
  END;
  BEGIN
    PERFORM security.fn_ensure_audit_log_partition_window(now(), 1, 3);
    RAISE EXCEPTION 'AUDIT_PARTITION_RLS_FAIL: app_api executed the window maintenance function';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'AUDIT_PARTITION_RLS_OK | negative | app_api denied EXECUTE on fn_ensure_audit_log_partition_window';
  END;

  -- Direct access to a partition is not granted to app_api. Either the
  -- privilege check denies it outright, or (defence in depth) the partition's
  -- own RLS returns zero rows. Both are a pass; seeing rows is not.
  BEGIN
    EXECUTE format('SELECT count(*) FROM security.%I', security.fn_audit_log_partition_name(now())) INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'AUDIT_PARTITION_RLS_FAIL: app_api read % row(s) directly from a partition', v_n;
    END IF;
    RAISE NOTICE 'AUDIT_PARTITION_RLS_OK | negative | app_api reads zero rows directly from a partition';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'AUDIT_PARTITION_RLS_OK | negative | app_api denied direct access to a partition';
  END;
END $$;
RESET ROLE;

-- ingest_worker gains nothing new from this lifecycle.
SET LOCAL ROLE ingest_worker;
DO $$
BEGIN
  BEGIN
    PERFORM security.fn_ensure_audit_log_partition_window(now(), 1, 3);
    RAISE EXCEPTION 'AUDIT_PARTITION_RLS_FAIL: ingest_worker executed the window maintenance function';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'AUDIT_PARTITION_RLS_OK | negative | ingest_worker denied the maintenance function';
  END;
END $$;
RESET ROLE;

-- jobs_worker: the ONE authorized maintenance caller, and only for the window
-- function - not for the single-month DDL entry point.
SET LOCAL ROLE jobs_worker;
DO $$
BEGIN
  BEGIN
    PERFORM security.fn_ensure_audit_log_partition_window(now(), 1, 3);
    RAISE NOTICE 'AUDIT_PARTITION_RLS_OK | positive | jobs_worker executes the authorized window maintenance function';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_RLS_FAIL: jobs_worker could not run the authorized maintenance (% %)', SQLSTATE, SQLERRM;
  END;
  BEGIN
    PERFORM security.fn_ensure_audit_log_partition(TIMESTAMPTZ '2099-03-01 00:00:00+00');
    RAISE EXCEPTION 'AUDIT_PARTITION_RLS_FAIL: jobs_worker executed the single-month DDL entry point it was never granted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'AUDIT_PARTITION_RLS_OK | negative | jobs_worker denied the single-month DDL entry point';
  END;
END $$;
RESET ROLE;

-- audit_reader: reads across partitions through the parent, never writes.
SET LOCAL ROLE audit_reader;
SELECT set_config('argus.actor_id', (SELECT v::text FROM audit_partition_actors WHERE k = 'reader'), true);
DO $$
DECLARE v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM security.audit_logs;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_RLS_FAIL: audit_reader read zero rows through the parent - a deny-everything result is not RLS validation';
  END IF;
  RAISE NOTICE 'AUDIT_PARTITION_RLS_OK | positive | audit_reader reads % row(s) across partitions through the parent', v_n;
  BEGIN
    UPDATE security.audit_logs SET result = 'TAMPERED' WHERE action = 'AUDIT_PARTITION_RLS_PROBE';
    RAISE EXCEPTION 'AUDIT_PARTITION_RLS_FAIL: audit_reader was able to UPDATE security.audit_logs';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'AUDIT_PARTITION_RLS_OK | negative | audit_reader cannot UPDATE (append-only, D-03)';
  END;
END $$;
RESET ROLE;

-- readonly_inspector cannot write.
-- readonly_inspector deliberately gets NO persisted assignment: an inspection
-- role has none, and the write below must be denied for that reason as much as
-- for its missing grant.
SET LOCAL ROLE readonly_inspector;
DO $$
BEGIN
  BEGIN
    INSERT INTO security.audit_logs
      (id, actor_type, actor_id, action, target_table, target_id, classification, result, integrity_value, occurred_at)
    VALUES (gen_random_uuid(), 'SYSTEM', gen_random_uuid(), 'AUDIT_PARTITION_RLS_PROBE', 'security.audit_logs',
            gen_random_uuid(), 'RESTRICTED', 'SUCCESS', 'rehearsal-probe', now());
    RAISE EXCEPTION 'AUDIT_PARTITION_RLS_FAIL: readonly_inspector was able to INSERT into security.audit_logs';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'AUDIT_PARTITION_RLS_OK | negative | readonly_inspector cannot INSERT';
  END;
END $$;
RESET ROLE;

-- Reaching this statement means no block above raised: every positive case
-- succeeded and every negative case was denied.
DO $$ BEGIN RAISE NOTICE 'AUDIT_PARTITION_RLS_PASS'; END $$;
ROLLBACK;

-- ============================================================
-- 5. Idempotency of the maintenance window: running it twice leaves the
--    exact same catalog.
-- ============================================================
DO $$
DECLARE
  v_before text;
  v_after  text;
  v_created integer;
BEGIN
  SELECT string_agg(c.relname, ',' ORDER BY c.relname) INTO v_before
  FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
  WHERE i.inhparent = 'security.audit_logs'::regclass;

  PERFORM security.fn_ensure_audit_log_partition_window(now(), 1, 3);
  SELECT count(*) INTO v_created
  FROM security.fn_ensure_audit_log_partition_window(now(), 1, 3) w
  WHERE w.result = 'CREATED';

  SELECT string_agg(c.relname, ',' ORDER BY c.relname) INTO v_after
  FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
  WHERE i.inhparent = 'security.audit_logs'::regclass;

  IF v_created <> 0 THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_MAINTENANCE_FAIL: a second maintenance run created % partition(s)', v_created;
  END IF;
  IF v_before IS DISTINCT FROM v_after THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_MAINTENANCE_FAIL: catalog changed across two maintenance runs (% -> %)', v_before, v_after;
  END IF;
  RAISE NOTICE 'AUDIT_PARTITION_MAINTENANCE_IDEMPOTENT_PASS (% partitions unchanged)', array_length(string_to_array(v_after, ','), 1);
END $$;
