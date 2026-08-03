-- scripts/migration-rehearsal/sql/audit-partition-residue.sql
--
-- Post-rollback residue probe for the security.audit_logs partition
-- lifecycle. Emits ONE `AUDIT_PARTITION_RESIDUE|<kind>|<name>` line per
-- surviving object and nothing at all when the rollback was complete, so the
-- caller's assertion is simply "zero matching lines".
--
-- 100% SELECT, safe to run at any point. Shared by
-- Invoke-ArgusFullRehearsal.ps1 and .github/workflows/argus-database-
-- rehearsal.yml so the two cannot drift apart.
--
-- Why by name and not only via classify-catalog-residue.mjs: the partition set
-- is dynamic (created on demand for whatever months the data and the
-- operational window require), so a rollback that only knew how to drop
-- `audit_logs_y2026m07` would leave orphans the generic classifier reports as
-- anonymous "unexpected objects". Naming them makes a regression
-- self-describing.

\pset format unaligned
\pset tuples_only on

SELECT 'AUDIT_PARTITION_RESIDUE|TABLE|' || schemaname || '.' || tablename
FROM pg_tables
WHERE tablename LIKE 'audit_logs%'
ORDER BY 1;

SELECT 'AUDIT_PARTITION_RESIDUE|FUNCTION|' || n.nspname || '.' || p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'fn_audit_log_month_start',
  'fn_audit_log_next_month_start',
  'fn_audit_log_partition_name',
  'fn_assert_audit_log_partition',
  'fn_ensure_audit_log_partition',
  'fn_ensure_audit_log_partition_window'
)
ORDER BY 1;

SELECT 'AUDIT_PARTITION_RESIDUE|SEQUENCE|' || sequence_schema || '.' || sequence_name
FROM information_schema.sequences
WHERE sequence_name LIKE 'audit_logs%'
ORDER BY 1;

SELECT 'AUDIT_PARTITION_RESIDUE|INDEX|' || schemaname || '.' || indexname
FROM pg_indexes
WHERE indexname LIKE '%audit_log%'
ORDER BY 1;

SELECT 'AUDIT_PARTITION_RESIDUE|POLICY|' || schemaname || '.' || tablename || '.' || policyname
FROM pg_policies
WHERE policyname LIKE '%audit_log%'
ORDER BY 1;
