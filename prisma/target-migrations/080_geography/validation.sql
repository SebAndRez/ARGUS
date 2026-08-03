-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 080 — Validation. SELECT-only.

SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'geo' AND table_type = 'BASE TABLE';
-- Expected: 8.

-- D-07: administrative_areas has the 6 provenance columns and is empty
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'geo' AND table_name = 'administrative_areas'
  AND column_name IN ('source_id','source_version','effective_from','effective_to',
                       'acquisition_method','geometry_validation_status');
-- Expected: 6 rows.
SELECT COUNT(*) AS row_count FROM geo.administrative_areas;
-- Expected: 0 (D-07 CREATE_EMPTY — nonzero here means synthetic geometry was
-- inserted in violation of D-07, STOP and investigate).

-- Deferred FKs resolved
SELECT conname FROM pg_constraint WHERE conname IN
  ('fk_jurisdictions_primary_administrative_area','fk_exposed_populations_administrative_area',
   'fk_exposed_populations_operational_zone','fk_mmpa_meeting_point');
-- Expected: 4 rows.

-- GIST indexes present (7 expected — administrative_areas + 6 more; meeting/
-- extraction/reception all have one each)
SELECT indexname FROM pg_indexes WHERE schemaname = 'geo' AND indexname LIKE 'gix_%';
-- Expected: 8 rows.

-- RLS coverage — administrative_areas deliberately exempt (PUBLIC, Access
-- Control v1.1 §7), the other 7 tables must all have RLS + policy
SELECT c.relname, c.relrowsecurity, COUNT(p.polname) AS policy_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'geo' AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;
-- Expected: administrative_areas shows rowsecurity=false, policy_count=0 (by
-- design); the other 7 rows show rowsecurity=true, policy_count>=1.

-- ============================================================
-- R31 — incident -> operational zone -> jurisdiction -> command scope
-- ============================================================
-- Table count above becomes 10, not 8: the two R31 relations
-- (incident_operational_zone_assignments, operational_zone_jurisdiction_assignments)
-- are created by this wave because both their endpoints only exist here.

SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'geo' AND table_type = 'BASE TABLE'
  AND table_name IN ('incident_operational_zone_assignments','operational_zone_jurisdiction_assignments');
-- Expected: 2.

SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'command' AND table_name = 'command_role_jurisdiction_scopes';
-- Expected: 1.

-- The relation is the authority: incident.incidents must NOT carry a scalar
-- jurisdiction_id beside it.
SELECT COUNT(*) FROM information_schema.columns
WHERE table_schema = 'incident' AND table_name = 'incidents' AND column_name = 'jurisdiction_id';
-- Expected: 0.

-- FKs on the R31 relation
SELECT conname FROM pg_constraint
WHERE contype = 'f' AND conrelid = 'geo.incident_operational_zone_assignments'::regclass
ORDER BY conname;
-- Expected: 8 rows (incident, zone, assigned_by, revoked_by, automation_rule,
-- source_record, evidence, superseded_by).

-- The CHECK constraints that make COMMAND unreachable from geometry
SELECT conname FROM pg_constraint
WHERE contype = 'c' AND conrelid = 'geo.incident_operational_zone_assignments'::regclass
  AND conname IN ('ck_ioza_spatial_never_command','ck_ioza_inherited_never_command',
                  'ck_ioza_command_requires_authorizable_method','ck_ioza_command_authority',
                  'ck_ioza_command_correlation');
-- Expected: 5 rows.

-- Partial uniques: one ACTIVE PRIMARY per incident, no duplicate ACTIVE triple
SELECT indexname FROM pg_indexes
WHERE schemaname = 'geo'
  AND indexname IN ('uq_ioza_active_primary_per_incident','uq_ioza_active_equivalent',
                    'uq_ozja_active_primary_per_zone','uq_ozja_active_equivalent');
-- Expected: 4 rows.

-- RLS posture on all three R31 tables
SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity, COUNT(p.polname) AS policy_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE (n.nspname = 'geo' AND c.relname IN ('incident_operational_zone_assignments','operational_zone_jurisdiction_assignments'))
   OR (n.nspname = 'command' AND c.relname = 'command_role_jurisdiction_scopes')
GROUP BY n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity;
-- Expected: 3 rows, all rowsecurity=true, forcerowsecurity=true, policy_count>=1.

-- No runtime role may write the relation: every mutation goes through the
-- SECURITY DEFINER functions.
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'geo' AND table_name = 'incident_operational_zone_assignments'
  AND privilege_type IN ('INSERT','UPDATE','DELETE');
-- Expected: 0 rows.

-- ZERO geometry in any RLS policy, database-wide. Authorization never runs a
-- spatial predicate.
SELECT schemaname, tablename, policyname FROM pg_policies
WHERE coalesce(qual,'') ~* 'st_intersects|st_covers|st_within|st_contains|st_dwithin'
   OR coalesce(with_check,'') ~* 'st_intersects|st_covers|st_within|st_contains|st_dwithin';
-- Expected: 0 rows.

-- fn_has_command_role really walks the R31 chain, with no fallback and no GUC.
SELECT p.proname,
       prosrc ~ 'fn_incident_command_jurisdictions' AS consults_command_jurisdictions,
       prosrc ~ 'command_role_jurisdiction_scopes'  AS consults_role_scope,
       prosrc !~* 'st_intersects'                   AS no_geometry,
       prosrc !~ 'argus\.actor_role'                AS no_role_guc
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'security' AND p.proname = 'fn_has_command_role';
-- Expected: 1 row, all four booleans true.

-- The command projection has no PRIMARY/AFFECTED/MONITORING fallback.
SELECT prosrc !~ 'PRIMARY' AND prosrc !~ 'AFFECTED' AND prosrc !~ 'MONITORING' AS no_fallback
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'geo' AND p.proname = 'fn_incident_command_jurisdictions';
-- Expected: 1 row, true.

-- The 8 R31 functions exist.
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'geo' AND p.proname LIKE 'fn_%zone%' OR (n.nspname = 'geo' AND p.proname LIKE 'fn_incident_%jurisdictions')
ORDER BY p.proname;
-- Expected: >= 10 rows.

-- The explicit command-scope authorization flag on automation rules.
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_schema = 'governance' AND table_name = 'automation_rules'
  AND column_name = 'command_scope_authorized';
-- Expected: 1 row, boolean, default false.
