-- scripts/migration-rehearsal/sql/access-role-residue.sql
--
-- Post-rollback residue probe for the persisted-authorization substrate
-- (security.access_subjects, security.access_role_assignments, the 5
-- authorization helpers, the 4 administration functions, the 3 enums, the
-- access_admin role, and the classification_ceiling column added to
-- security.access_roles).
--
-- Emits ONE `ACCESS_ROLE_RESIDUE|<kind>|<name>` line per surviving object and
-- nothing at all when the rollback was complete, so the caller's assertion is
-- simply "zero matching lines".
--
-- 100% SELECT, safe at any point. Shared by Invoke-ArgusFullRehearsal.ps1 and
-- .github/workflows/argus-database-rehearsal.yml so the two cannot drift.

\pset format unaligned
\pset tuples_only on

SELECT 'ACCESS_ROLE_RESIDUE|TABLE|' || schemaname || '.' || tablename
FROM pg_tables
WHERE tablename IN ('access_subjects', 'access_role_assignments')
ORDER BY 1;

SELECT 'ACCESS_ROLE_RESIDUE|FUNCTION|' || n.nspname || '.' || p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'fn_resolve_access_subject',
  'fn_active_access_roles',
  'fn_has_access_role',
  'fn_has_any_access_role',
  'fn_classification_allowed',
  'fn_register_access_subject',
  'fn_grant_access_role',
  'fn_revoke_access_role',
  'fn_audit_access_role_change',
  'fn_ensure_audit_log_partition_for_write'
)
ORDER BY 1;

SELECT 'ACCESS_ROLE_RESIDUE|TYPE|' || n.nspname || '.' || t.typname
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE t.typname IN ('access_subject_status_enum', 'access_role_assignment_status_enum', 'access_purpose_enum')
ORDER BY 1;

SELECT 'ACCESS_ROLE_RESIDUE|INDEX|' || schemaname || '.' || indexname
FROM pg_indexes
WHERE indexname LIKE '%access_subject%' OR indexname LIKE '%access_role_assignment%'
ORDER BY 1;

SELECT 'ACCESS_ROLE_RESIDUE|POLICY|' || schemaname || '.' || tablename || '.' || policyname
FROM pg_policies
WHERE policyname LIKE '%access_subject%' OR policyname LIKE '%access_role_assignment%'
ORDER BY 1;

SELECT 'ACCESS_ROLE_RESIDUE|ROLE|' || rolname
FROM pg_roles
WHERE rolname = 'access_admin'
ORDER BY 1;

SELECT 'ACCESS_ROLE_RESIDUE|COLUMN|' || table_schema || '.' || table_name || '.' || column_name
FROM information_schema.columns
WHERE column_name = 'classification_ceiling'
ORDER BY 1;
