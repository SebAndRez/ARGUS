-- scripts/migration-rehearsal/sql/incident-zone-residue.sql
--
-- Post-rollback residue probe for the R31 substrate: the two geo relations,
-- the command role jurisdiction scope, the 13 functions, the 7 enums, the
-- indexes, the policies, and the `command_scope_authorized` column added to
-- governance.automation_rules.
--
-- Emits ONE `INCIDENT_ZONE_RESIDUE|<kind>|<name>` line per surviving object
-- and nothing at all when the rollback was complete, so the caller's
-- assertion is simply "zero matching lines". Named explicitly rather than
-- relying on the generic catalog-inventory diff for the same reason the audit
-- partition and access-role probes exist: the generic classifier reports a
-- survivor as an anonymous "unexpected object", and a rollback that forgot
-- one of the SIX object kinds involved (table, function, type, index, policy,
-- added column) is the realistic failure mode.
--
-- security.fn_has_command_role is deliberately NOT probed as residue: this
-- wave's rollback RESTORES its Wave 040 body rather than dropping it (waves
-- 040-070 still have live policies calling it). Wave 010's rollback is what
-- finally drops it, and access-role-residue.sql already covers that.
--
-- 100% SELECT, safe at any point. Shared by Invoke-ArgusFullRehearsal.ps1 and
-- .github/workflows/argus-database-rehearsal.yml so the two cannot drift.

\pset format unaligned
\pset tuples_only on

SELECT 'INCIDENT_ZONE_RESIDUE|TABLE|' || schemaname || '.' || tablename
FROM pg_tables
WHERE tablename IN (
  'incident_operational_zone_assignments',
  'operational_zone_jurisdiction_assignments',
  'command_role_jurisdiction_scopes'
)
ORDER BY 1;

SELECT 'INCIDENT_ZONE_RESIDUE|FUNCTION|' || n.nspname || '.' || p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'fn_incident_effective_jurisdictions',
  'fn_incident_command_jurisdictions',
  'fn_resolve_zones_for_geography',
  'fn_resolve_incident_operational_zones',
  'fn_resolve_candidate_operational_zones',
  'fn_incident_resolution_geography',
  'fn_candidate_resolution_geography',
  'fn_incident_zone_idempotency_key',
  'fn_audit_incident_zone_change',
  'fn_assign_incident_operational_zone',
  'fn_revoke_incident_operational_zone_assignment',
  'fn_supersede_incident_operational_zone_assignment',
  'fn_persist_incident_zone_resolution',
  'fn_inherit_candidate_zone_assignments'
)
ORDER BY 1;

SELECT 'INCIDENT_ZONE_RESIDUE|TYPE|' || n.nspname || '.' || t.typname
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE t.typname IN (
  'incident_zone_assignment_kind_enum',
  'incident_zone_resolution_method_enum',
  'incident_zone_assignment_status_enum',
  'zone_assignment_review_status_enum',
  'zone_jurisdiction_relation_kind_enum',
  'zone_jurisdiction_assignment_status_enum',
  'spatial_resolution_outcome_enum',
  'command_role_scope_status_enum'
)
ORDER BY 1;

SELECT 'INCIDENT_ZONE_RESIDUE|INDEX|' || schemaname || '.' || indexname
FROM pg_indexes
WHERE indexname LIKE 'ix_ioza_%' OR indexname LIKE 'uq_ioza_%'
   OR indexname LIKE 'ix_ozja_%' OR indexname LIKE 'uq_ozja_%'
   OR indexname LIKE 'ix_crjs_%' OR indexname LIKE 'uq_crjs_%'
ORDER BY 1;

SELECT 'INCIDENT_ZONE_RESIDUE|POLICY|' || schemaname || '.' || tablename || '.' || policyname
FROM pg_policies
WHERE policyname IN ('ioza_command_or_governance','ozja_governance','crjs_own_or_governance')
ORDER BY 1;

SELECT 'INCIDENT_ZONE_RESIDUE|COLUMN|' || table_schema || '.' || table_name || '.' || column_name
FROM information_schema.columns
WHERE column_name = 'command_scope_authorized'
ORDER BY 1;

-- The Wave 040 body of fn_has_command_role must be back in place: a rollback
-- that left the R31 body behind would leave every wave-040..070 policy calling
-- a function that references dropped geo.* tables.
SELECT 'INCIDENT_ZONE_RESIDUE|FUNCTION_BODY|security.fn_has_command_role still references geo.*'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'security' AND p.proname = 'fn_has_command_role'
  AND p.prosrc ~ 'fn_incident_command_jurisdictions';
