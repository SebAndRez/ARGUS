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
-- lives in security), security=10 (audit_logs itself counts once; its monthly
-- partition audit_logs_y2026m07 is a separate physical table not counted
-- against the "10" logical tables — see query 4).

-- 4. security.audit_logs partitioning confirmed
SELECT
  parent.relname AS parent_table,
  child.relname AS partition_name,
  pg_get_expr(child.relpartbound, child.oid) AS partition_bound
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child ON pg_inherits.inhrelid = child.oid
WHERE parent.relname = 'audit_logs';
-- Expected: >=1 row (audit_logs_y2026m07).

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
