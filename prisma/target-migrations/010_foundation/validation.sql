-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 010 — Foundation — Validation
-- SELECT-only. Safe to run repeatedly.

-- 1. Schemas exist
SELECT nspname FROM pg_namespace WHERE nspname IN ('governance','security');
-- Expected: 2 rows.

-- 2. Extensions installed
SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto','postgis');
-- Expected: 2 rows.

-- 3. Table counts per schema (corrects P3-02-style miscounts by direct count,
--    not by trusting prose)
SELECT table_schema, COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema IN ('governance','security') AND table_type = 'BASE TABLE'
GROUP BY table_schema
ORDER BY table_schema;
-- Expected: governance=15 (includes 1 partitioned-child-free count; audit_logs
-- lives in security), security=10 LOGICAL tables PLUS one physical row per
-- security.audit_logs partition. information_schema.tables lists every
-- partition as its own BASE TABLE, so this query's `security` number is
-- 10 + (number of audit_logs partitions) and is therefore install-date and
-- source-data dependent — see query 4 for the partition list and query 4.bis
-- for the assertion that actually blocks. This is why the number here is
-- documented as a composition, not as a fixed constant: the earlier "10"
-- silently assumed audit_logs would forever have exactly one partition.

-- 4. security.audit_logs partitioning confirmed
SELECT
  parent.relname AS parent_table,
  child.relname AS partition_name,
  pg_get_expr(child.relpartbound, child.oid) AS partition_bound
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child ON pg_inherits.inhrelid = child.oid
WHERE parent.relname = 'audit_logs'
ORDER BY child.relname;
-- Expected: >=5 rows — audit_logs_y2026m07 (the historical partition this
-- wave has always declared) plus the operational window
-- fn_ensure_audit_log_partition_window(now(), 1, 3) creates at install time,
-- plus one partition per distinct UTC month present in the legacy AuditLog
-- source (created by backfill.sql). Exact names/count depend on the install
-- date and on the source data, which is why query 4.bis asserts the CONTRACT
-- rather than a hardcoded list.

-- 4.bis security.audit_logs partition lifecycle — BLOCKING.
--
-- Unlike query 4 above (informational listing), everything below RAISES on
-- violation, so a wave whose partition contract is broken cannot report
-- green. Each block emits exactly one AUDIT_PARTITION_*_PASS marker on
-- success; the rehearsal harness greps for all six
-- (scripts/migration-rehearsal/sql/audit-partition-checks.sql re-asserts the
-- same contract independently, under the same markers).
--
-- Every block is a no-op with an explicit SKIPPED notice when
-- security.audit_logs does not exist yet, because Invoke-Wave.ps1 runs this
-- file once BEFORE migration.sql as a smoke check (see its header) — a
-- pre-migration run must not abort the file, and a post-migration run must
-- assert everything.

-- 4.bis.1 Parent shape: partitioned, RANGE, single key column = occurred_at.
DO $$
DECLARE
  v_strategy "char";
  v_natts    smallint;
  v_keydef   text;
BEGIN
  IF to_regclass('security.audit_logs') IS NULL THEN
    RAISE NOTICE 'AUDIT_PARTITION_VALIDATION_SKIPPED (pre-migration: security.audit_logs does not exist yet)';
    RETURN;
  END IF;

  SELECT pt.partstrat, pt.partnatts, pg_get_partkeydef(pt.partrelid)
  INTO v_strategy, v_natts, v_keydef
  FROM pg_partitioned_table pt
  WHERE pt.partrelid = 'security.audit_logs'::regclass;

  IF v_strategy IS NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_PARENT_FAIL: security.audit_logs is not a partitioned table';
  END IF;
  IF v_strategy <> 'r' THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_PARENT_FAIL: security.audit_logs partition strategy is %, expected RANGE', v_strategy;
  END IF;
  IF v_natts <> 1 OR v_keydef <> 'RANGE (occurred_at)' THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_PARENT_FAIL: partition key is %, expected exactly RANGE (occurred_at)', v_keydef;
  END IF;

  -- All six lifecycle functions must be installed.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'security'
        AND p.proname IN ('fn_audit_log_month_start','fn_audit_log_next_month_start',
                          'fn_audit_log_partition_name','fn_assert_audit_log_partition',
                          'fn_ensure_audit_log_partition','fn_ensure_audit_log_partition_window')) <> 6 THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_PARENT_FAIL: the 6 partition-lifecycle functions are not all installed in schema security';
  END IF;

  RAISE NOTICE 'AUDIT_PARTITION_PARENT_PASS';
END $$;

-- 4.bis.2 No DEFAULT partition, ever.
DO $$
DECLARE v_default text;
BEGIN
  IF to_regclass('security.audit_logs') IS NULL THEN
    RAISE NOTICE 'AUDIT_PARTITION_VALIDATION_SKIPPED (pre-migration)';
    RETURN;
  END IF;

  SELECT c.relname INTO v_default
  FROM pg_inherits i
  JOIN pg_class c ON c.oid = i.inhrelid
  WHERE i.inhparent = 'security.audit_logs'::regclass
    AND pg_get_expr(c.relpartbound, c.oid) = 'DEFAULT'
  LIMIT 1;

  IF v_default IS NOT NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_NO_DEFAULT_FAIL: security.% is a DEFAULT partition; audit_logs must never have one (it would silently absorb mis-routed rows)', v_default;
  END IF;

  RAISE NOTICE 'AUDIT_PARTITION_NO_DEFAULT_PASS';
END $$;

-- 4.bis.3 Names, exact UTC bounds, zero overlaps.
DO $$
DECLARE
  r          record;
  v_month    timestamptz;
  v_count    integer := 0;
  v_overlaps integer;
BEGIN
  IF to_regclass('security.audit_logs') IS NULL THEN
    RAISE NOTICE 'AUDIT_PARTITION_VALIDATION_SKIPPED (pre-migration)';
    RETURN;
  END IF;

  FOR r IN
    SELECT c.oid, c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'security.audit_logs'::regclass
    ORDER BY c.relname
  LOOP
    IF r.relname !~ '^audit_logs_y[0-9]{4}m(0[1-9]|1[0-2])$' THEN
      RAISE EXCEPTION 'AUDIT_PARTITION_BOUNDS_FAIL: partition name % does not match audit_logs_yYYYYmMM', r.relname;
    END IF;

    -- The month is re-derived FROM THE NAME, then the bounds are asserted
    -- against it: that catches both a correct name with wrong bounds and
    -- correct bounds under a misleading name.
    v_month := (substr(r.relname, 13, 4) || '-' || substr(r.relname, 18, 2) || '-01 00:00:00+00')::timestamptz;

    IF security.fn_audit_log_partition_name(v_month) <> r.relname THEN
      RAISE EXCEPTION 'AUDIT_PARTITION_BOUNDS_FAIL: % is not the canonical name for its own month (canonical: %)',
        r.relname, security.fn_audit_log_partition_name(v_month);
    END IF;

    PERFORM security.fn_assert_audit_log_partition(
      r.oid,
      security.fn_audit_log_month_start(v_month),
      security.fn_audit_log_next_month_start(v_month)
    );

    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_BOUNDS_FAIL: security.audit_logs has zero partitions';
  END IF;

  -- Overlap: PostgreSQL rejects overlapping RANGE partitions at creation
  -- time, so this is a belt-and-braces check against a partition attached by
  -- some other path. Compared as real timestamptz ranges derived from names.
  SELECT count(*) INTO v_overlaps
  FROM (
    SELECT tstzrange(
             (substr(c.relname, 13, 4) || '-' || substr(c.relname, 18, 2) || '-01 00:00:00+00')::timestamptz,
             (substr(c.relname, 13, 4) || '-' || substr(c.relname, 18, 2) || '-01 00:00:00+00')::timestamptz + interval '1 month',
             '[)') AS rng
    FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'security.audit_logs'::regclass
  ) a
  JOIN (
    SELECT tstzrange(
             (substr(c.relname, 13, 4) || '-' || substr(c.relname, 18, 2) || '-01 00:00:00+00')::timestamptz,
             (substr(c.relname, 13, 4) || '-' || substr(c.relname, 18, 2) || '-01 00:00:00+00')::timestamptz + interval '1 month',
             '[)') AS rng
    FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'security.audit_logs'::regclass
  ) b ON a.rng && b.rng AND a.rng <> b.rng;

  IF v_overlaps > 0 THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_BOUNDS_FAIL: % overlapping partition range pair(s) found', v_overlaps;
  END IF;

  RAISE NOTICE 'AUDIT_PARTITION_BOUNDS_PASS (% partitions)', v_count;
END $$;

-- 4.bis.4 Operational window complete and gap-free: previous month, current
-- month, next 3 months, relative to now().
DO $$
DECLARE
  v_offset  integer;
  v_month   timestamptz;
  v_name    text;
  v_missing text[] := '{}';
  v_prev_end timestamptz;
  v_start   timestamptz;
BEGIN
  IF to_regclass('security.audit_logs') IS NULL THEN
    RAISE NOTICE 'AUDIT_PARTITION_VALIDATION_SKIPPED (pre-migration)';
    RETURN;
  END IF;

  FOR v_offset IN -1 .. 3 LOOP
    v_month := ((security.fn_audit_log_month_start(now()) AT TIME ZONE 'UTC') + make_interval(months => v_offset)) AT TIME ZONE 'UTC';
    v_name  := security.fn_audit_log_partition_name(v_month);
    v_start := security.fn_audit_log_month_start(v_month);

    IF NOT EXISTS (
      SELECT 1 FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
      WHERE i.inhparent = 'security.audit_logs'::regclass AND c.relname = v_name
    ) THEN
      v_missing := v_missing || v_name;
    END IF;

    -- Contiguity: this month must start exactly where the previous one ended.
    IF v_prev_end IS NOT NULL AND v_start <> v_prev_end THEN
      RAISE EXCEPTION 'AUDIT_PARTITION_WINDOW_FAIL: gap/overlap in the operational window - % starts at % but the previous month ended at %',
        v_name, v_start, v_prev_end;
    END IF;
    v_prev_end := security.fn_audit_log_next_month_start(v_month);
  END LOOP;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_WINDOW_FAIL: operational window incomplete, missing %', array_to_string(v_missing, ',');
  END IF;

  RAISE NOTICE 'AUDIT_PARTITION_WINDOW_PASS (previous month + current + next 3, zero gaps)';
END $$;

-- 4.bis.5 Every partition carries every index the parent declares, ATTACHED
-- to the parent's partitioned index (not a stray local duplicate).
DO $$
DECLARE
  v_parent_indexes integer;
  r record;
BEGIN
  IF to_regclass('security.audit_logs') IS NULL THEN
    RAISE NOTICE 'AUDIT_PARTITION_VALIDATION_SKIPPED (pre-migration)';
    RETURN;
  END IF;

  SELECT count(*) INTO v_parent_indexes
  FROM pg_index WHERE indrelid = 'security.audit_logs'::regclass;

  IF v_parent_indexes < 5 THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_INDEX_FAIL: parent declares only % index(es); expected at least 5 (audit_logs_pkey, ix_audit_logs_target, ix_audit_logs_actor, ix_audit_logs_occurred_at, uq_audit_logs_legacy)', v_parent_indexes;
  END IF;

  FOR r IN
    SELECT c.relname,
           (SELECT count(*)
              FROM pg_index ci
              JOIN pg_inherits ii ON ii.inhrelid = ci.indexrelid
             WHERE ci.indrelid = c.oid
               AND ii.inhparent IN (SELECT indexrelid FROM pg_index WHERE indrelid = 'security.audit_logs'::regclass)
           ) AS attached
    FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'security.audit_logs'::regclass
    ORDER BY c.relname
  LOOP
    IF r.attached <> v_parent_indexes THEN
      RAISE EXCEPTION 'AUDIT_PARTITION_INDEX_FAIL: partition security.% has % attached index(es), parent declares %',
        r.relname, r.attached, v_parent_indexes;
    END IF;
  END LOOP;

  -- NOT NULL on the partition key is what makes routing total; classification
  -- and result are the two other NOT NULL columns the audit contract depends
  -- on. Checked on the parent (partitions inherit column definitions).
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'security.audit_logs'::regclass
      AND attname IN ('occurred_at','classification','result','integrity_value','sequence_number')
      AND NOT attnotnull
  ) THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_INDEX_FAIL: one of occurred_at/classification/result/integrity_value/sequence_number lost its NOT NULL';
  END IF;

  RAISE NOTICE 'AUDIT_PARTITION_INDEX_PASS (% index(es) attached per partition)', v_parent_indexes;
END $$;

-- 4.bis.6 Security posture of the lifecycle itself.
DO $$
DECLARE
  v_bad text;
BEGIN
  IF to_regclass('security.audit_logs') IS NULL THEN
    RAISE NOTICE 'AUDIT_PARTITION_VALIDATION_SKIPPED (pre-migration)';
    RETURN;
  END IF;

  -- (a) No lifecycle function is executable by PUBLIC.
  SELECT string_agg(p.proname, ',') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'security'
    AND p.proname IN ('fn_audit_log_month_start','fn_audit_log_next_month_start',
                      'fn_audit_log_partition_name','fn_assert_audit_log_partition',
                      'fn_ensure_audit_log_partition','fn_ensure_audit_log_partition_window')
    AND has_function_privilege('public', p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_SECURITY_FAIL: PUBLIC still holds EXECUTE on %', v_bad;
  END IF;

  -- (b) app_api / ingest_worker hold EXECUTE on nothing in the lifecycle.
  SELECT string_agg(r.rolname || ':' || p.proname, ',') INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN (SELECT rolname FROM pg_roles WHERE rolname IN ('app_api','ingest_worker')) r
  WHERE n.nspname = 'security'
    AND p.proname IN ('fn_audit_log_month_start','fn_audit_log_next_month_start',
                      'fn_audit_log_partition_name','fn_assert_audit_log_partition',
                      'fn_ensure_audit_log_partition','fn_ensure_audit_log_partition_window')
    AND has_function_privilege(r.rolname, p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_SECURITY_FAIL: an application role holds EXECUTE it must not have: %', v_bad;
  END IF;

  -- (c) jobs_worker holds EXECUTE on the window maintenance function and on
  --     nothing else in the lifecycle.
  IF NOT has_function_privilege('jobs_worker', 'security.fn_ensure_audit_log_partition_window(timestamptz,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_SECURITY_FAIL: jobs_worker cannot execute the authorized maintenance function';
  END IF;
  IF has_function_privilege('jobs_worker', 'security.fn_ensure_audit_log_partition(timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_SECURITY_FAIL: jobs_worker holds EXECUTE on the single-month DDL entry point; only the window maintenance function is authorized';
  END IF;

  -- (d) No application role holds CREATE on schema security.
  SELECT string_agg(rolname, ',') INTO v_bad
  FROM pg_roles
  WHERE rolname IN ('app_api','ingest_worker','jobs_worker','audit_reader','readonly_inspector')
    AND has_schema_privilege(rolname, 'security', 'CREATE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_SECURITY_FAIL: role(s) % hold CREATE ON SCHEMA security', v_bad;
  END IF;

  -- (e) Ownership: every partition is owned by whoever owns the parent, and
  --     never by a runtime role.
  SELECT string_agg(c.relname || ':' || pg_get_userbyid(c.relowner), ',') INTO v_bad
  FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
  WHERE i.inhparent = 'security.audit_logs'::regclass
    AND c.relowner <> (SELECT relowner FROM pg_class WHERE oid = 'security.audit_logs'::regclass);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_SECURITY_FAIL: partition ownership diverges from the parent: %', v_bad;
  END IF;

  SELECT string_agg(c.relname, ',') INTO v_bad
  FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
  WHERE i.inhparent = 'security.audit_logs'::regclass
    AND pg_get_userbyid(c.relowner) IN ('app_api','ingest_worker','jobs_worker');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_SECURITY_FAIL: partition(s) % owned by a runtime role', v_bad;
  END IF;

  -- (f) Parent RLS + FORCE RLS still on, and no partition is a side door
  --     (RLS enabled on every child, zero policies of its own).
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'security.audit_logs'::regclass AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_SECURITY_FAIL: security.audit_logs lost ENABLE/FORCE ROW LEVEL SECURITY';
  END IF;

  SELECT string_agg(c.relname, ',') INTO v_bad
  FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
  WHERE i.inhparent = 'security.audit_logs'::regclass
    AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_SECURITY_FAIL: partition(s) % do not have ENABLE + FORCE ROW LEVEL SECURITY', v_bad;
  END IF;

  -- (g) No partition carries a direct grant to a runtime role: audit access
  --     goes through the parent, which is where the policies live.
  SELECT string_agg(DISTINCT g.grantee || ':' || g.table_name, ',') INTO v_bad
  FROM information_schema.role_table_grants g
  JOIN pg_inherits i ON i.inhrelid = ('security.' || quote_ident(g.table_name))::regclass
  WHERE g.table_schema = 'security'
    AND i.inhparent = 'security.audit_logs'::regclass
    AND g.grantee IN ('app_api','ingest_worker','jobs_worker','audit_reader','readonly_inspector','PUBLIC');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_SECURITY_FAIL: direct grant(s) on a partition: %', v_bad;
  END IF;

  RAISE NOTICE 'AUDIT_PARTITION_SECURITY_PASS';
END $$;

-- 5. security.audit_logs REVOKE (D-03) confirmed
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'security' AND table_name = 'audit_logs'
  AND grantee IN ('app_api','ingest_worker','jobs_worker')
  AND privilege_type IN ('UPDATE','DELETE');
-- Expected: 0 rows — if any row appears, D-03's append-only guarantee for
-- audit_logs did not apply correctly.

-- 6. All governance/security FKs declared in migration.sql actually exist
SELECT tc.table_schema, tc.table_name, tc.constraint_name, ccu.table_schema AS references_schema, ccu.table_name AS references_table
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema IN ('governance','security')
ORDER BY tc.table_schema, tc.table_name;

-- 7. CHECK constraints present (spot check the two structural ones)
SELECT conname, conrelid::regclass AS table_name, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname IN ('ck_jurisdiction_scopes_table_whitelist','ck_legal_holds_table_whitelist',
                  'ck_rrr_extension_count_positive','ck_rrr_ttl_positive','ck_rrr_degraded_ge_connected');
-- Expected: 5 rows.

-- 8. Deferred-FK columns exist as plain uuid columns (not yet FK-constrained
--    — confirms this wave did NOT prematurely add a forward FK)
SELECT table_schema, table_name, column_name, is_nullable, data_type
FROM information_schema.columns
WHERE (table_schema, table_name, column_name) IN (
  ('governance','jurisdictions','declaring_organization_id'),
  ('governance','resource_reservation_rules','institution_id'),
  ('security','audit_logs','device_id'),
  ('security','audit_logs','operational_session_id'),
  ('security','audit_logs','incident_id'),
  ('security','audit_logs','mission_id')
);
-- Expected: 6 rows, all data_type='uuid', all is_nullable='YES' (no FK
-- constraint should show up for these in query 6 until the wave that adds it).

-- 9. Enum inventory: confirm the two migrated-to-table enums (hazard_type_enum,
--    administrative_area_kind_enum) do NOT exist as pg types (Enums Reference
--    v1.1 §1, migrated to governance.hazard_types/administrative_area_kinds)
SELECT typname FROM pg_type WHERE typname IN ('hazard_type_enum','administrative_area_kind_enum');
-- Expected: 0 rows.

-- 10. Process check (not SQL) — confirm prisma/schema.prisma and
--     prisma/migrations/ untouched via `git status`/`git diff` outside this file.
