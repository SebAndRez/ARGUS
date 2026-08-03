-- scripts/migration-rehearsal/sql/incident-zone-checks.sql
--
-- R31 — Incident -> OperationalZone -> Jurisdiction -> command scope.
-- BLOCKING. Every marker this file prints is DERIVED from an assertion that
-- actually ran; a missing marker is treated by Test-ArgusRehearsal.ps1 as a
-- failure, exactly like an explicit *_FAIL line.
--
-- Two halves, deliberately:
--   * Part 0 — STRUCTURE. The physical guarantees (FKs, CHECKs, partial
--     uniques, RLS posture, "no geometry in any policy", "no PRIMARY/AFFECTED
--     fallback in the command projection") asserted against the catalog, so a
--     future edit that silently drops one of them fails here by name.
--   * Parts 1..N — BEHAVIOUR. The mandated A..J matrix, run against real rows
--     in real PostGIS, each inside BEGIN ... ROLLBACK so this file leaves ZERO
--     rows behind and is re-runnable any number of times.
--
-- A suite where everything denies proves nothing, so both directions are
-- asserted and counted: `INCIDENT_ZONE_OK | positive | ...` and
-- `INCIDENT_ZONE_OK | negative | ...`.

\pset format unaligned
\pset tuples_only on

-- ============================================================
-- PART 0 — STRUCTURE
-- ============================================================

-- ---- The relation itself exists, with both ends as REAL foreign keys ----
SELECT CASE WHEN COUNT(*) = 2 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | R31 relation tables exist (incident<->zone, zone<->jurisdiction)'
FROM information_schema.tables
WHERE table_schema = 'geo'
  AND table_name IN ('incident_operational_zone_assignments','operational_zone_jurisdiction_assignments');

SELECT CASE WHEN COUNT(*) = 1 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | command role jurisdiction scope table exists'
FROM information_schema.tables
WHERE table_schema = 'command' AND table_name = 'command_role_jurisdiction_scopes';

-- incident.incidents must NOT have acquired a scalar jurisdiction_id: the
-- relation is the authority, and a column beside it would be a second one.
SELECT CASE WHEN COUNT(*) = 0 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | incident.incidents has NO scalar jurisdiction_id column'
FROM information_schema.columns
WHERE table_schema = 'incident' AND table_name = 'incidents' AND column_name = 'jurisdiction_id';

SELECT CASE WHEN COUNT(*) = 7 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | incident<->zone assignment has all 7 mandated FKs (got ' || COUNT(*) || ')'
FROM pg_constraint
WHERE contype = 'f'
  AND conrelid = 'geo.incident_operational_zone_assignments'::regclass
  AND conname IN ('fk_ioza_incident','fk_ioza_zone','fk_ioza_assigned_by','fk_ioza_revoked_by',
                  'fk_ioza_automation_rule','fk_ioza_superseded_by','fk_ioza_source_record');

SELECT CASE WHEN COUNT(*) = 6 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | the 6 COMMAND-gating CHECK constraints exist (got ' || COUNT(*) || ')'
FROM pg_constraint
WHERE contype = 'c'
  AND conrelid = 'geo.incident_operational_zone_assignments'::regclass
  AND conname IN ('ck_ioza_spatial_never_command','ck_ioza_inherited_never_command',
                  'ck_ioza_command_requires_authorizable_method','ck_ioza_command_authority',
                  'ck_ioza_command_correlation','ck_ioza_validity_window');

SELECT CASE WHEN COUNT(*) = 2 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | the 2 partial unique indexes exist (one-PRIMARY, no-duplicate-active)'
FROM pg_indexes
WHERE schemaname = 'geo'
  AND indexname IN ('uq_ioza_active_primary_per_incident','uq_ioza_active_equivalent');

SELECT CASE WHEN COUNT(*) >= 8 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | the mandated indexes exist (got ' || COUNT(*) || ' of >=8)'
FROM pg_indexes
WHERE schemaname = 'geo' AND tablename = 'incident_operational_zone_assignments';

-- ---- RLS posture ----
SELECT CASE WHEN COUNT(*) = 2 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | both geo R31 tables have RLS ENABLED and FORCED'
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'geo'
  AND c.relname IN ('incident_operational_zone_assignments','operational_zone_jurisdiction_assignments')
  AND c.relrowsecurity AND c.relforcerowsecurity;

SELECT CASE WHEN c.relrowsecurity AND c.relforcerowsecurity THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | command.command_role_jurisdiction_scopes has RLS ENABLED and FORCED'
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'command' AND c.relname = 'command_role_jurisdiction_scopes';

SELECT CASE WHEN COUNT(*) = 3 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | all 3 R31 tables carry at least one policy'
FROM (
  SELECT p.polrelid FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE (n.nspname = 'geo' AND c.relname IN ('incident_operational_zone_assignments','operational_zone_jurisdiction_assignments'))
     OR (n.nspname = 'command' AND c.relname = 'command_role_jurisdiction_scopes')
  GROUP BY p.polrelid
) t;

-- No policy on the R31 tables may be permissive-to-everyone.
SELECT CASE WHEN COUNT(*) = 0 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | zero USING (true) on any R31 policy'
FROM pg_policies
WHERE (
        (schemaname = 'geo' AND tablename IN ('incident_operational_zone_assignments','operational_zone_jurisdiction_assignments'))
     OR (schemaname = 'command' AND tablename = 'command_role_jurisdiction_scopes')
      )
  AND (coalesce(qual,'') = 'true' OR coalesce(with_check,'') = 'true');

-- ---- THE core prohibition: no geometry inside any RLS policy, anywhere ----
SELECT CASE WHEN COUNT(*) = 0 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | zero RLS policies in the database evaluate PostGIS predicates'
FROM pg_policies
WHERE coalesce(qual,'') ~* 'st_intersects|st_covers|st_within|st_contains|st_dwithin'
   OR coalesce(with_check,'') ~* 'st_intersects|st_covers|st_within|st_contains|st_dwithin';

-- ---- No write policy / no write grant on the relation ----
SELECT CASE WHEN COUNT(*) = 0 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | no INSERT/UPDATE/DELETE policy exists on the R31 relation'
FROM pg_policies
WHERE schemaname = 'geo' AND tablename = 'incident_operational_zone_assignments'
  AND cmd <> 'SELECT';

SELECT CASE WHEN COUNT(*) = 0 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | no runtime role holds INSERT/UPDATE/DELETE on the R31 relation (got ' || COUNT(*) || ')'
FROM information_schema.role_table_grants
WHERE table_schema = 'geo' AND table_name = 'incident_operational_zone_assignments'
  AND privilege_type IN ('INSERT','UPDATE','DELETE')
  AND grantee IN ('app_api','ingest_worker','jobs_worker','audit_reader','readonly_inspector','PUBLIC');

-- app_api may not execute the only function that can mint a COMMAND row.
SELECT CASE WHEN NOT has_function_privilege('app_api', p.oid, 'EXECUTE')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | app_api cannot EXECUTE geo.fn_assign_incident_operational_zone'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'geo' AND p.proname = 'fn_assign_incident_operational_zone';

SELECT CASE WHEN has_function_privilege('access_admin', p.oid, 'EXECUTE')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | access_admin (minimal admin principal) CAN EXECUTE the assignment function'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'geo' AND p.proname = 'fn_assign_incident_operational_zone';

-- ---- fn_has_command_role really consults the R31 chain ----
SELECT CASE WHEN prosrc ~ 'fn_incident_command_jurisdictions'
                 AND prosrc ~ 'command_role_jurisdiction_scopes'
                 AND prosrc ~ 'command_roles'
                 AND prosrc ~ 'institutional_memberships'
                 AND prosrc !~* 'st_intersects'
                 AND prosrc !~ 'argus\.actor_role'
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | fn_has_command_role resolves the R31 chain, with no geometry and no role GUC'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'security' AND p.proname = 'fn_has_command_role';

-- The command projection must be hard-wired to COMMAND with no fallback.
SELECT CASE WHEN prosrc ~ 'COMMAND' AND prosrc !~ 'PRIMARY' AND prosrc !~ 'AFFECTED' AND prosrc !~ 'MONITORING'
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | fn_incident_command_jurisdictions has NO PRIMARY/AFFECTED/MONITORING fallback'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'geo' AND p.proname = 'fn_incident_command_jurisdictions';

-- The resolver is the ONLY place geometry is consulted, and it is never
-- reachable from a policy.
SELECT CASE WHEN prosrc ~* 'st_intersects' AND prosrc ~* 'st_covers'
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | the spatial resolver really uses ST_Intersects + ST_Covers'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'geo' AND p.proname = 'fn_resolve_zones_for_geography';

SELECT 'INCIDENT_ZONE_RELATION_PASS';

-- ============================================================
-- PART 1 — FIXTURES + BEHAVIOUR MATRIX
-- ============================================================
-- 2 jurisdictions, 3 operational zones, 2 institutions, 2 actors, a current
-- membership and an expired one, a valid command role and an invalid one,
-- 4 incidents. Single transaction, rolled back at the end.
BEGIN;

-- ---------------- identities & institutions ----------------
INSERT INTO identity.people (id, legal_name) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'R31 Actor One'),
  ('e1000000-0000-0000-0000-000000000002', 'R31 Actor Two');

INSERT INTO institution.organizations (id, name, status) VALUES
  ('e2000000-0000-0000-0000-000000000001', 'R31 Institution A', 'ACTIVE'),
  ('e2000000-0000-0000-0000-000000000002', 'R31 Institution B', 'ACTIVE');

-- Actor One: CURRENT membership in Institution A.
-- Actor Two: CURRENT membership in Institution B (used for the jurisdiction
-- mismatch case) plus an EXPIRED one in Institution A (case D's companion).
INSERT INTO institution.institutional_memberships
  (id, person_id, organization_id, role_label, status, effective_from, effective_to) VALUES
  ('e3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001',
   'e2000000-0000-0000-0000-000000000001', 'Coordinator', 'ACTIVE', now() - interval '2 days', NULL),
  ('e3000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002',
   'e2000000-0000-0000-0000-000000000002', 'Coordinator', 'ACTIVE', now() - interval '2 days', NULL),
  ('e3000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000002',
   'e2000000-0000-0000-0000-000000000001', 'Expired Coordinator', 'ACTIVE',
   now() - interval '20 days', now() - interval '1 day');

-- Persisted authorization (never a session string): both actors get a real
-- AccessSubject and a real ACTIVE OPERATIONAL grant, so every denial below is
-- provably about JURISDICTION and not about missing clearance.
SELECT security.fn_grant_access_role(
  security.fn_register_access_subject('PERSON', 'e1000000-0000-0000-0000-000000000001'), 'OPERATIONAL');
SELECT security.fn_grant_access_role(
  security.fn_register_access_subject('PERSON', 'e1000000-0000-0000-0000-000000000002'), 'OPERATIONAL');

-- ---------------- territory & jurisdictions ----------------
-- Two adjacent administrative areas, two jurisdictions, each declared by its
-- own institution (this is what makes the institution-compatibility clause of
-- fn_has_command_role testable).
-- The reference catalogs this fixture needs are seeded here rather than
-- assumed: governance.administrative_area_kinds and
-- governance.automation_rules are both legitimately EMPTY after a clean
-- install (D-07 leaves the cartographic catalog unpopulated), so a fixture
-- that silently skipped itself on an empty catalog would turn every case
-- below into a vacuous pass.
INSERT INTO governance.administrative_area_kinds (id, code, name, hierarchy_level, status)
VALUES ('e0000000-0000-0000-0000-000000000001', 'R31_TEST_KIND', 'R31 Test Kind', 1, 'ACTIVE');

-- One rule that is NOT authorized for command scope (the default), used to
-- prove the automation path is refused.
INSERT INTO governance.automation_rules (id, name, status, command_scope_authorized)
VALUES ('e0000000-0000-0000-0000-000000000002', 'R31 Unauthorized Rule', 'ACTIVE', false);

INSERT INTO geo.administrative_areas (id, name, area_kind_id, boundary, version)
SELECT ('e4000000-0000-0000-0000-00000000000' || s.n)::uuid,
       'R31 Area ' || s.n,
       'e0000000-0000-0000-0000-000000000001',
       ST_GeogFromText('MULTIPOLYGON(((' ||
         (s.n - 1) || ' 0, ' || (s.n - 1) || ' 1, ' || s.n || ' 1, ' || s.n || ' 0, ' || (s.n - 1) || ' 0)))'),
       1
FROM (SELECT 1 AS n UNION ALL SELECT 2) s;

INSERT INTO governance.jurisdictions
  (id, name, primary_administrative_area_id, declaring_organization_id, version, effective_from) VALUES
  ('e5000000-0000-0000-0000-000000000001', 'R31 Jurisdiction A',
   'e4000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 1, now() - interval '10 days'),
  ('e5000000-0000-0000-0000-000000000002', 'R31 Jurisdiction B',
   'e4000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002', 1, now() - interval '10 days');

-- ---------------- incidents ----------------
INSERT INTO governance.incident_categories (id, code, name)
  VALUES ('e6000000-0000-0000-0000-000000000001', 'R31_CAT', 'R31 Category');
INSERT INTO governance.incident_types (id, code, incident_category_id)
  VALUES ('e6000000-0000-0000-0000-000000000002', 'R31_TYPE', 'e6000000-0000-0000-0000-000000000001');

-- 4 incidents + 1 that merely owns the zones (geo.operational_zones.incident_id
-- is NOT NULL: every zone is created by some incident; the R31 relation is what
-- lets OTHER incidents relate to it).
INSERT INTO incident.incidents (id, incident_type_id, classification, title) VALUES
  ('e7000000-0000-0000-0000-000000000000', 'e6000000-0000-0000-0000-000000000002', 'CRITICAL', 'R31 Zone Owner'),
  ('e7000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000002', 'CRITICAL', 'R31 Incident A PRIMARY only'),
  ('e7000000-0000-0000-0000-000000000002', 'e6000000-0000-0000-0000-000000000002', 'CRITICAL', 'R31 Incident B AFFECTED only'),
  ('e7000000-0000-0000-0000-000000000003', 'e6000000-0000-0000-0000-000000000002', 'CRITICAL', 'R31 Incident C COMMAND in A'),
  ('e7000000-0000-0000-0000-000000000004', 'e6000000-0000-0000-0000-000000000002', 'CRITICAL', 'R31 Incident D spatial');

-- ---------------- operational zones ----------------
-- Z1 sits inside area 1 (jurisdiction A), Z2 inside area 2 (jurisdiction B),
-- Z3 straddles the boundary and is therefore related to BOTH jurisdictions —
-- the "zone crossing two jurisdictions" case.
INSERT INTO geo.operational_zones (id, incident_id, boundary, status) VALUES
  ('e8000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000000',
   ST_GeogFromText('POLYGON((0.1 0.1, 0.1 0.9, 0.9 0.9, 0.9 0.1, 0.1 0.1))'), 'ACTIVE'),
  ('e8000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000000',
   ST_GeogFromText('POLYGON((1.1 0.1, 1.1 0.9, 1.9 0.9, 1.9 0.1, 1.1 0.1))'), 'ACTIVE'),
  ('e8000000-0000-0000-0000-000000000003', 'e7000000-0000-0000-0000-000000000000',
   ST_GeogFromText('POLYGON((0.8 0.2, 0.8 0.8, 1.2 0.8, 1.2 0.2, 0.8 0.2))'), 'ACTIVE');

INSERT INTO geo.operational_zone_jurisdiction_assignments
  (id, operational_zone_id, jurisdiction_id, relation_kind, status, valid_from, provenance) VALUES
  ('e9000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-000000000001',
   'e5000000-0000-0000-0000-000000000001', 'PRIMARY', 'ACTIVE', now() - interval '5 days', 'OFFICIAL_SOURCE'),
  ('e9000000-0000-0000-0000-000000000002', 'e8000000-0000-0000-0000-000000000002',
   'e5000000-0000-0000-0000-000000000002', 'PRIMARY', 'ACTIVE', now() - interval '5 days', 'OFFICIAL_SOURCE'),
  ('e9000000-0000-0000-0000-000000000003', 'e8000000-0000-0000-0000-000000000003',
   'e5000000-0000-0000-0000-000000000001', 'PRIMARY', 'ACTIVE', now() - interval '5 days', 'OFFICIAL_SOURCE'),
  ('e9000000-0000-0000-0000-000000000004', 'e8000000-0000-0000-0000-000000000003',
   'e5000000-0000-0000-0000-000000000002', 'OVERLAPPING', 'ACTIVE', now() - interval '5 days', 'OFFICIAL_SOURCE');

-- ---------------- command structures & roles ----------------
INSERT INTO command.incident_command_structures (id, incident_id, status)
SELECT ('ea000000-0000-0000-0000-00000000000' || s.n)::uuid,
       ('e7000000-0000-0000-0000-00000000000' || s.n)::uuid, 'ACTIVE'
FROM (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4) s;

-- On incident C (COMMAND in jurisdiction A): Actor One holds a VALID command
-- role backed by a current Institution-A membership; Actor Two holds one
-- backed by his Institution-B membership -> institutionally incompatible.
INSERT INTO command.command_roles
  (id, incident_command_structure_id, actor_type, actor_id, institutional_membership_id, role_label) VALUES
  ('eb000000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000003', 'PERSON',
   'e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'Incident Commander'),
  ('eb000000-0000-0000-0000-000000000002', 'ea000000-0000-0000-0000-000000000003', 'PERSON',
   'e1000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000002', 'Other-Jurisdiction Commander'),
  -- Actor One also commands incidents A, B and D, so the denials for those are
  -- provably about the MISSING COMMAND ZONE and not about a missing role.
  ('eb000000-0000-0000-0000-000000000003', 'ea000000-0000-0000-0000-000000000001', 'PERSON',
   'e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'Incident Commander'),
  ('eb000000-0000-0000-0000-000000000004', 'ea000000-0000-0000-0000-000000000002', 'PERSON',
   'e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'Incident Commander'),
  ('eb000000-0000-0000-0000-000000000005', 'ea000000-0000-0000-0000-000000000004', 'PERSON',
   'e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'Incident Commander');

-- Territorial scope of the REAL role assignments (never of a role label).
-- Actor One's roles are scoped to jurisdiction A; Actor Two's to B.
INSERT INTO command.command_role_jurisdiction_scopes
  (id, command_role_id, jurisdiction_id, status, valid_from, provenance) VALUES
  ('ec000000-0000-0000-0000-000000000001', 'eb000000-0000-0000-0000-000000000001',
   'e5000000-0000-0000-0000-000000000001', 'ACTIVE', now() - interval '3 days', 'MANUAL'),
  ('ec000000-0000-0000-0000-000000000002', 'eb000000-0000-0000-0000-000000000002',
   'e5000000-0000-0000-0000-000000000002', 'ACTIVE', now() - interval '3 days', 'MANUAL'),
  ('ec000000-0000-0000-0000-000000000003', 'eb000000-0000-0000-0000-000000000003',
   'e5000000-0000-0000-0000-000000000001', 'ACTIVE', now() - interval '3 days', 'MANUAL'),
  ('ec000000-0000-0000-0000-000000000004', 'eb000000-0000-0000-0000-000000000004',
   'e5000000-0000-0000-0000-000000000001', 'ACTIVE', now() - interval '3 days', 'MANUAL'),
  ('ec000000-0000-0000-0000-000000000005', 'eb000000-0000-0000-0000-000000000005',
   'e5000000-0000-0000-0000-000000000001', 'ACTIVE', now() - interval '3 days', 'MANUAL');

-- ---------------- the R31 assignments under test ----------------
-- A: incident A gets PRIMARY only.  B: incident B gets AFFECTED only.
-- C: incident C gets COMMAND in jurisdiction A (zone Z1).
-- valid_from is set explicitly in the past so the "expired" cases below can
-- move valid_until backwards without tripping ck_ioza_validity_window on a
-- row that was created at now().
INSERT INTO geo.incident_operational_zone_assignments
  (id, incident_id, operational_zone_id, assignment_kind, resolution_method, status,
   valid_from, confidence, review_status, correlation_id, provenance, assigned_by_subject_id) VALUES
  ('ed000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001',
   'e8000000-0000-0000-0000-000000000001', 'PRIMARY', 'MANUAL', 'ACTIVE', now() - interval '4 days',
   'HIGH', 'REVIEWED_APPROVED', 'ed000000-0000-0000-0000-0000000000f1', 'MANUAL', NULL),
  ('ed000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000002',
   'e8000000-0000-0000-0000-000000000001', 'AFFECTED', 'SPATIAL_INTERSECTION', 'ACTIVE', now() - interval '4 days',
   'MEDIUM', 'REQUIRES_REVIEW', 'ed000000-0000-0000-0000-0000000000f2', 'SPATIAL_RESOLVER', NULL),
  ('ed000000-0000-0000-0000-000000000003', 'e7000000-0000-0000-0000-000000000003',
   'e8000000-0000-0000-0000-000000000001', 'COMMAND', 'MANUAL', 'ACTIVE', now() - interval '4 days',
   'CONFIRMED', 'REVIEWED_APPROVED', 'ed000000-0000-0000-0000-0000000000f3', 'MANUAL',
   (SELECT id FROM security.access_subjects WHERE person_id = 'e1000000-0000-0000-0000-000000000001' AND status = 'ACTIVE'));

-- ============================================================
-- CASE A — PRIMARY alone never grants command
-- ============================================================
SET LOCAL argus.actor_id = 'e1000000-0000-0000-0000-000000000001';

SELECT CASE WHEN NOT security.fn_has_command_role(
              'e1000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case A: incident with only PRIMARY -> fn_has_command_role false';

-- ============================================================
-- CASE B — AFFECTED alone never grants command
-- ============================================================
SELECT CASE WHEN NOT security.fn_has_command_role(
              'e1000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000002')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case B: incident with only AFFECTED -> fn_has_command_role false';

-- ============================================================
-- CASE C — COMMAND in jurisdiction A: A-scoped actor yes, B-scoped actor no
-- ============================================================
SELECT CASE WHEN security.fn_has_command_role(
              'e1000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000003')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | positive | case C: COMMAND zone in jurisdiction A + actor scoped to A -> true';

SET LOCAL argus.actor_id = 'e1000000-0000-0000-0000-000000000002';
SELECT CASE WHEN NOT security.fn_has_command_role(
              'e1000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000003')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case C: same incident, actor scoped to jurisdiction B -> false (mismatch denied)';

SELECT 'INCIDENT_COMMAND_JURISDICTION_PASS';
SELECT 'INCIDENT_COMMAND_MISMATCH_DENIED_PASS';

-- ============================================================
-- CASE I — a forged session context grants nothing
-- ============================================================
-- The session claims to be Actor Two but asks about Actor One's authority.
SELECT CASE WHEN NOT security.fn_has_command_role(
              'e1000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000003')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case I: session actor_id != queried actor -> false (no impersonation)';

-- The legacy role GUC is set to the most privileged string available and
-- changes nothing.
SET LOCAL argus.actor_id = 'e1000000-0000-0000-0000-000000000002';
SET LOCAL argus.actor_role = 'ADMIN';
SELECT CASE WHEN NOT security.fn_has_command_role(
              'e1000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000003')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case I: forged argus.actor_role=ADMIN grants no command';
SET LOCAL argus.actor_role = '';

-- An actor with no AccessSubject at all.
SET LOCAL argus.actor_id = 'e1000000-0000-0000-0000-0000000000ff';
SELECT CASE WHEN NOT security.fn_has_command_role(
              'e1000000-0000-0000-0000-0000000000ff', 'e7000000-0000-0000-0000-000000000003')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case I: unknown actor with no persisted AccessSubject -> false';

-- ============================================================
-- CASE D — an EXPIRED command scope stops authorizing
-- ============================================================
UPDATE command.command_role_jurisdiction_scopes
   SET valid_until = now() - interval '1 hour'
 WHERE id = 'ec000000-0000-0000-0000-000000000001';

SET LOCAL argus.actor_id = 'e1000000-0000-0000-0000-000000000001';
SELECT CASE WHEN NOT security.fn_has_command_role(
              'e1000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000003')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case D: expired command role scope -> false';

UPDATE command.command_role_jurisdiction_scopes
   SET valid_until = NULL
 WHERE id = 'ec000000-0000-0000-0000-000000000001';

-- An EXPIRED COMMAND assignment likewise.
UPDATE geo.incident_operational_zone_assignments
   SET valid_until = now() - interval '1 hour'
 WHERE id = 'ed000000-0000-0000-0000-000000000003';
SELECT CASE WHEN NOT security.fn_has_command_role(
              'e1000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000003')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case D: expired COMMAND zone assignment -> false';
UPDATE geo.incident_operational_zone_assignments
   SET valid_until = NULL
 WHERE id = 'ed000000-0000-0000-0000-000000000003';

-- An EXPIRED institutional membership behind an otherwise valid command role.
UPDATE institution.institutional_memberships
   SET effective_to = now() - interval '1 hour'
 WHERE id = 'e3000000-0000-0000-0000-000000000001';
SELECT CASE WHEN NOT security.fn_has_command_role(
              'e1000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000003')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case D: expired institutional membership -> false';
UPDATE institution.institutional_memberships
   SET effective_to = NULL
 WHERE id = 'e3000000-0000-0000-0000-000000000001';

-- A REVOKED command role.
UPDATE command.command_roles SET revoked_at = now() - interval '1 minute'
 WHERE id = 'eb000000-0000-0000-0000-000000000001';
SELECT CASE WHEN NOT security.fn_has_command_role(
              'e1000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000003')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case D: revoked command role -> false';
UPDATE command.command_roles SET revoked_at = NULL
 WHERE id = 'eb000000-0000-0000-0000-000000000001';

-- ============================================================
-- CASE E — a zone straddling two jurisdictions authorizes only the
--          explicitly scoped actors
-- ============================================================
INSERT INTO geo.incident_operational_zone_assignments
  (id, incident_id, operational_zone_id, assignment_kind, resolution_method, status,
   confidence, review_status, correlation_id, provenance, assigned_by_subject_id)
VALUES ('ed000000-0000-0000-0000-000000000005', 'e7000000-0000-0000-0000-000000000004',
        'e8000000-0000-0000-0000-000000000003', 'COMMAND', 'OFFICIAL_SOURCE', 'ACTIVE',
        'CONFIRMED', 'REVIEWED_APPROVED', 'ed000000-0000-0000-0000-0000000000f5', 'OFFICIAL_SOURCE',
        (SELECT id FROM security.access_subjects WHERE person_id = 'e1000000-0000-0000-0000-000000000001' AND status = 'ACTIVE'));

SELECT CASE WHEN COUNT(*) = 2 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | positive | case E: a zone crossing two jurisdictions yields BOTH as command jurisdictions'
FROM geo.fn_incident_command_jurisdictions('e7000000-0000-0000-0000-000000000004');

SELECT CASE WHEN security.fn_has_command_role(
              'e1000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000004')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | positive | case E: actor explicitly scoped to jurisdiction A commands the straddling zone';

-- Actor Two is scoped to jurisdiction B, which this zone DOES touch — but he
-- holds no command role on this incident, so the territorial overlap alone
-- grants nothing.
SET LOCAL argus.actor_id = 'e1000000-0000-0000-0000-000000000002';
SELECT CASE WHEN NOT security.fn_has_command_role(
              'e1000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000004')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case E: jurisdictional overlap without an explicit command role -> false';

SELECT 'INCIDENT_COMMAND_ZONE_PASS';

-- ============================================================
-- CASE H — revocation denies immediately
-- ============================================================
SET LOCAL argus.actor_id = 'e1000000-0000-0000-0000-000000000001';
SELECT CASE WHEN security.fn_has_command_role(
              'e1000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000003')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | positive | case H: pre-revocation baseline -> true';

UPDATE geo.incident_operational_zone_assignments
   SET status = 'REVOKED', revoked_at = now(), revocation_reason_code = 'COMMAND_WITHDRAWN'
 WHERE id = 'ed000000-0000-0000-0000-000000000003';

SELECT CASE WHEN NOT security.fn_has_command_role(
              'e1000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000003')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case H: revoked COMMAND assignment -> false immediately';

-- The revoked row is still THERE — revocation is a status transition, not a
-- delete, so the history survives.
SELECT CASE WHEN COUNT(*) = 1 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | positive | case H: the revoked assignment row is preserved as history'
FROM geo.incident_operational_zone_assignments
WHERE id = 'ed000000-0000-0000-0000-000000000003' AND status = 'REVOKED';

SELECT 'INCIDENT_COMMAND_REVOKED_DENIED_PASS';

UPDATE geo.incident_operational_zone_assignments
   SET status = 'ACTIVE', revoked_at = NULL, revocation_reason_code = NULL
 WHERE id = 'ed000000-0000-0000-0000-000000000003';

-- ============================================================
-- PRIMARY uniqueness
-- ============================================================
DO $$
BEGIN
  BEGIN
    INSERT INTO geo.incident_operational_zone_assignments
      (incident_id, operational_zone_id, assignment_kind, resolution_method, status, provenance)
    VALUES ('e7000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-000000000002',
            'PRIMARY', 'MANUAL', 'ACTIVE', 'MANUAL');
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | negative | a SECOND active PRIMARY was accepted for the same incident';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | negative | a second ACTIVE PRIMARY for the same incident is rejected';
  END;

  BEGIN
    INSERT INTO geo.incident_operational_zone_assignments
      (incident_id, operational_zone_id, assignment_kind, resolution_method, status, provenance)
    VALUES ('e7000000-0000-0000-0000-000000000002', 'e8000000-0000-0000-0000-000000000001',
            'AFFECTED', 'SPATIAL_INTERSECTION', 'ACTIVE', 'MANUAL');
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | negative | a duplicate equivalent ACTIVE assignment was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | negative | a duplicate (incident, zone, kind) ACTIVE assignment is rejected';
  END;
END $$;

SELECT 'INCIDENT_ZONE_PRIMARY_UNIQUE_PASS';

-- ============================================================
-- The CHECK constraints that make COMMAND unreachable from geometry
-- ============================================================
DO $$
BEGIN
  BEGIN
    INSERT INTO geo.incident_operational_zone_assignments
      (incident_id, operational_zone_id, assignment_kind, resolution_method, status,
       correlation_id, provenance, assigned_by_subject_id)
    VALUES ('e7000000-0000-0000-0000-000000000004', 'e8000000-0000-0000-0000-000000000001',
            'COMMAND', 'SPATIAL_INTERSECTION', 'ACTIVE',
            'ed000000-0000-0000-0000-0000000000fa', 'MANUAL',
            (SELECT id FROM security.access_subjects WHERE person_id = 'e1000000-0000-0000-0000-000000000001' AND status = 'ACTIVE'));
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | negative | SPATIAL_INTERSECTION produced a COMMAND assignment';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | negative | SPATIAL_INTERSECTION can never produce COMMAND (check constraint)';
  END;

  BEGIN
    INSERT INTO geo.incident_operational_zone_assignments
      (incident_id, operational_zone_id, assignment_kind, resolution_method, status,
       correlation_id, provenance, assigned_by_subject_id)
    VALUES ('e7000000-0000-0000-0000-000000000004', 'e8000000-0000-0000-0000-000000000001',
            'COMMAND', 'INHERITED_FROM_CANDIDATE', 'ACTIVE',
            'ed000000-0000-0000-0000-0000000000fb', 'MANUAL',
            (SELECT id FROM security.access_subjects WHERE person_id = 'e1000000-0000-0000-0000-000000000001' AND status = 'ACTIVE'));
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | negative | INHERITED_FROM_CANDIDATE produced a COMMAND assignment';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | negative | INHERITED_FROM_CANDIDATE can never produce COMMAND (check constraint)';
  END;

  BEGIN
    INSERT INTO geo.incident_operational_zone_assignments
      (incident_id, operational_zone_id, assignment_kind, resolution_method, status,
       correlation_id, provenance)
    VALUES ('e7000000-0000-0000-0000-000000000004', 'e8000000-0000-0000-0000-000000000001',
            'COMMAND', 'MANUAL', 'ACTIVE', 'ed000000-0000-0000-0000-0000000000fc', 'MANUAL');
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | negative | an anonymous COMMAND assignment was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | negative | a COMMAND assignment with neither subject nor rule is rejected';
  END;

  BEGIN
    INSERT INTO geo.incident_operational_zone_assignments
      (incident_id, operational_zone_id, assignment_kind, resolution_method, status,
       provenance, assigned_by_subject_id)
    VALUES ('e7000000-0000-0000-0000-000000000004', 'e8000000-0000-0000-0000-000000000001',
            'COMMAND', 'MANUAL', 'ACTIVE', 'MANUAL',
            (SELECT id FROM security.access_subjects WHERE person_id = 'e1000000-0000-0000-0000-000000000001' AND status = 'ACTIVE'));
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | negative | a COMMAND assignment without a correlation id was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | negative | a COMMAND assignment with no correlation id is rejected';
  END;
END $$;

SELECT 'SPATIAL_RESOLUTION_NO_COMMAND_PASS';

-- ============================================================
-- CASE F/G — spatial resolution proposes AFFECTED, then a human confirms
--            COMMAND
-- ============================================================
-- Incident D gets a real affected area overlapping Z1: the resolver must find
-- it, propose AFFECTED, and fn_has_command_role must still be false.
INSERT INTO incident.affected_area_versions (id, incident_id, version_number, geometry)
VALUES ('ee000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000002', 1,
        ST_GeogFromText('MULTIPOLYGON(((0.2 0.2, 0.2 0.6, 0.6 0.6, 0.6 0.2, 0.2 0.2)))'));

SELECT CASE WHEN COUNT(*) >= 1 AND bool_and(proposed_assignment_kind IN ('AFFECTED','MONITORING'))
                 AND bool_and(proposed_assignment_kind <> 'COMMAND')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | positive | case F: the resolver finds the intersecting zone and proposes only AFFECTED/MONITORING'
FROM geo.fn_resolve_incident_operational_zones('e7000000-0000-0000-0000-000000000002')
WHERE operational_zone_id IS NOT NULL;

-- Polygon fully inside a zone -> covered, RESOLVED, CONFIRMED.
SELECT CASE WHEN COUNT(*) = 1 AND bool_and(covered) AND bool_and(outcome = 'RESOLVED')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | positive | case F: a Polygon fully inside one zone resolves as covered/RESOLVED'
FROM geo.fn_resolve_zones_for_geography(
       ST_GeogFromText('POLYGON((0.2 0.2, 0.2 0.6, 0.6 0.6, 0.6 0.2, 0.2 0.2))'))
WHERE operational_zone_id IS NOT NULL;

-- A Point is supported (no area, so no ratio, but a real match).
SELECT CASE WHEN COUNT(*) = 1 AND bool_and(overlap_ratio IS NULL)
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | positive | case F: a Point resolves to its zone with a NULL ratio (no division by zero)'
FROM geo.fn_resolve_zones_for_geography(ST_GeogFromText('POINT(0.5 0.5)'))
WHERE operational_zone_id IS NOT NULL;

-- A MultiPolygon spanning two zones -> MULTIPLE_MATCHES.
SELECT CASE WHEN COUNT(*) = 2 AND bool_and(outcome = 'MULTIPLE_MATCHES')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | positive | case F: a MultiPolygon crossing two zones resolves as MULTIPLE_MATCHES'
FROM geo.fn_resolve_zones_for_geography(
       ST_GeogFromText('MULTIPOLYGON(((0.2 0.2, 0.2 0.6, 0.6 0.6, 0.6 0.2, 0.2 0.2)),((1.3 0.2, 1.3 0.6, 1.6 0.6, 1.6 0.2, 1.3 0.2)))'))
WHERE operational_zone_id IS NOT NULL;

-- Absent geometry.
SELECT CASE WHEN COUNT(*) = 1 AND bool_and(outcome = 'NO_MATCH') AND bool_and(operational_zone_id IS NULL)
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case F: absent geometry resolves to NO_MATCH and proposes nothing'
FROM geo.fn_resolve_zones_for_geography(NULL);

-- Geometry far from every zone.
SELECT CASE WHEN COUNT(*) = 1 AND bool_and(outcome = 'NO_MATCH')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case F: geometry outside every zone resolves to NO_MATCH'
FROM geo.fn_resolve_zones_for_geography(ST_GeogFromText('POINT(40 40)'));

-- Invalid geometry (self-intersecting bowtie) is reported, never repaired.
SELECT CASE WHEN COUNT(*) = 1 AND bool_and(outcome = 'INVALID_GEOMETRY')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case F: invalid geometry resolves to INVALID_GEOMETRY and proposes nothing'
FROM geo.fn_resolve_zones_for_geography(
       ST_GeogFromText('POLYGON((0.2 0.2, 0.6 0.6, 0.2 0.6, 0.6 0.2, 0.2 0.2))'));

-- A zone with NO jurisdiction attached forces REQUIRES_REVIEW.
INSERT INTO geo.operational_zones (id, incident_id, boundary, status)
VALUES ('e8000000-0000-0000-0000-000000000009', 'e7000000-0000-0000-0000-000000000000',
        ST_GeogFromText('POLYGON((5.1 5.1, 5.1 5.9, 5.9 5.9, 5.9 5.1, 5.1 5.1))'), 'ACTIVE');
SELECT CASE WHEN COUNT(*) = 1 AND bool_and(outcome = 'REQUIRES_REVIEW') AND bool_and(NOT jurisdiction_resolvable)
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case F: a zone with no jurisdiction in force resolves to REQUIRES_REVIEW'
FROM geo.fn_resolve_zones_for_geography(ST_GeogFromText('POINT(5.5 5.5)'))
WHERE operational_zone_id IS NOT NULL;

-- Persisting the resolution writes AFFECTED/MONITORING and NOTHING else.
SELECT geo.fn_persist_incident_zone_resolution('e7000000-0000-0000-0000-000000000002') AS persisted;

SELECT CASE WHEN COUNT(*) = 0 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case F: persisting a spatial resolution produced ZERO COMMAND rows'
FROM geo.incident_operational_zone_assignments
WHERE resolution_method = 'SPATIAL_INTERSECTION' AND assignment_kind = 'COMMAND';

SET LOCAL argus.actor_id = 'e1000000-0000-0000-0000-000000000001';
SELECT CASE WHEN NOT security.fn_has_command_role(
              'e1000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000002')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | case F: after spatial resolution, fn_has_command_role is still false';

-- Re-running the resolver is idempotent: same deterministic keys, no duplicates.
SELECT geo.fn_persist_incident_zone_resolution('e7000000-0000-0000-0000-000000000002') AS persisted_again;
SELECT CASE WHEN COUNT(*) = COUNT(DISTINCT (incident_id, operational_zone_id, assignment_kind))
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | positive | case F: re-running the resolver creates no duplicate active assignment'
FROM geo.incident_operational_zone_assignments
WHERE incident_id = 'e7000000-0000-0000-0000-000000000002' AND status = 'ACTIVE';

SELECT 'INCIDENT_ZONE_SPATIAL_RESOLUTION_PASS';

-- CASE G — a human then confirms COMMAND on the same incident, through the
-- audited function, and only now does authority appear.
SELECT geo.fn_assign_incident_operational_zone(
  p_incident_id            => 'e7000000-0000-0000-0000-000000000002',
  p_operational_zone_id    => 'e8000000-0000-0000-0000-000000000001',
  p_assignment_kind        => 'COMMAND',
  p_resolution_method      => 'MANUAL',
  p_assigned_by_subject_id => (SELECT id FROM security.access_subjects
                               WHERE person_id = 'e1000000-0000-0000-0000-000000000001' AND status = 'ACTIVE'),
  p_confidence             => 'CONFIRMED',
  p_review_status          => 'REVIEWED_APPROVED',
  p_reason_code            => 'HUMAN_COMMAND_CONFIRMATION',
  p_correlation_id         => 'ed000000-0000-0000-0000-0000000000c7'
) AS command_assignment_id;

SELECT CASE WHEN security.fn_has_command_role(
              'e1000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000002')
            THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | positive | case G: after an explicit human COMMAND confirmation -> true';

-- The confirmation wrote an audit row carrying ids and codes only.
SELECT CASE WHEN COUNT(*) = 1 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | positive | case G: the COMMAND confirmation wrote exactly one audit row'
FROM security.audit_logs
WHERE action = 'INCIDENT_ZONE_ASSIGNED'
  AND correlation_id = 'ed000000-0000-0000-0000-0000000000c7';

SELECT CASE WHEN COUNT(*) = 0 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | positive | case G: the audit row leaks no geometry, coordinates, title, name or email'
FROM security.audit_logs
WHERE action IN ('INCIDENT_ZONE_ASSIGNED','INCIDENT_ZONE_REVOKED','INCIDENT_ZONE_SUPERSEDED')
  AND (context::text ~* 'POLYGON|POINT\(|MULTIPOLYGON|@|legal_name|title|geometry|coordinates'
       OR coalesce(decision,'') ~ '[a-z ]{5,}');

-- ============================================================
-- Idempotency & the COMMAND gate on the assignment function
-- ============================================================
DO $$
DECLARE
  v_key   uuid := 'ed000000-0000-0000-0000-0000000000d1';
  v_first uuid;
  v_again uuid;
  v_subject uuid := (SELECT id FROM security.access_subjects
                      WHERE person_id = 'e1000000-0000-0000-0000-000000000001' AND status = 'ACTIVE');
BEGIN
  v_first := geo.fn_assign_incident_operational_zone(
    p_incident_id => 'e7000000-0000-0000-0000-000000000004',
    p_operational_zone_id => 'e8000000-0000-0000-0000-000000000001',
    p_assignment_kind => 'MONITORING', p_resolution_method => 'MANUAL',
    p_assigned_by_subject_id => v_subject, p_reason_code => 'MONITORING_ADDED',
    p_idempotency_key => v_key, p_correlation_id => 'ed000000-0000-0000-0000-0000000000d2');
  v_again := geo.fn_assign_incident_operational_zone(
    p_incident_id => 'e7000000-0000-0000-0000-000000000004',
    p_operational_zone_id => 'e8000000-0000-0000-0000-000000000001',
    p_assignment_kind => 'MONITORING', p_resolution_method => 'MANUAL',
    p_assigned_by_subject_id => v_subject, p_reason_code => 'MONITORING_ADDED',
    p_idempotency_key => v_key, p_correlation_id => 'ed000000-0000-0000-0000-0000000000d2');
  IF v_first = v_again THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | positive | the same idempotency key resolves to the SAME assignment row';
  ELSE
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | positive | the same idempotency key produced two rows';
  END IF;

  -- A COMMAND assignment onto a zone with no live jurisdiction is refused.
  BEGIN
    PERFORM geo.fn_assign_incident_operational_zone(
      p_incident_id => 'e7000000-0000-0000-0000-000000000004',
      p_operational_zone_id => 'e8000000-0000-0000-0000-000000000009',
      p_assignment_kind => 'COMMAND', p_resolution_method => 'MANUAL',
      p_assigned_by_subject_id => v_subject, p_reason_code => 'SHOULD_FAIL',
      p_correlation_id => 'ed000000-0000-0000-0000-0000000000d3');
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | negative | COMMAND was granted on a zone with no jurisdiction';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | negative | COMMAND on a zone with no jurisdiction in force is refused';
  END;

  -- An automation rule that is NOT expressly command-authorized is refused.
  BEGIN
    PERFORM geo.fn_assign_incident_operational_zone(
      p_incident_id => 'e7000000-0000-0000-0000-000000000004',
      p_operational_zone_id => 'e8000000-0000-0000-0000-000000000002',
      p_assignment_kind => 'COMMAND', p_resolution_method => 'AUTOMATION_RULE',
      p_automation_rule_id => 'e0000000-0000-0000-0000-000000000002',
      p_reason_code => 'SHOULD_FAIL',
      p_correlation_id => 'ed000000-0000-0000-0000-0000000000d4');
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | negative | a non-authorized automation rule created COMMAND';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | negative | an automation rule not approved for command scope is refused';
  WHEN no_data_found THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | negative | an automation rule not approved for command scope is refused';
  END;
END $$;

-- ============================================================
-- Supersession preserves history and never resurrects a revocation
-- ============================================================
DO $$
DECLARE
  v_subject uuid := (SELECT id FROM security.access_subjects
                      WHERE person_id = 'e1000000-0000-0000-0000-000000000001' AND status = 'ACTIVE');
  v_new uuid;
  v_old_status geo.incident_zone_assignment_status_enum;
  v_revoked uuid;
BEGIN
  v_new := geo.fn_supersede_incident_operational_zone_assignment(
    p_assignment_id => 'ed000000-0000-0000-0000-000000000001',
    p_operational_zone_id => 'e8000000-0000-0000-0000-000000000002',
    p_assignment_kind => 'PRIMARY', p_resolution_method => 'MANUAL',
    p_reason_code => 'ZONE_CORRECTED', p_assigned_by_subject_id => v_subject,
    p_correlation_id => 'ed000000-0000-0000-0000-0000000000e1');

  SELECT status INTO v_old_status FROM geo.incident_operational_zone_assignments
   WHERE id = 'ed000000-0000-0000-0000-000000000001';
  IF v_old_status = 'SUPERSEDED' AND EXISTS (
       SELECT 1 FROM geo.incident_operational_zone_assignments
        WHERE id = 'ed000000-0000-0000-0000-000000000001' AND superseded_by_assignment_id = v_new) THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | positive | supersession preserves the predecessor and links it to its successor';
  ELSE
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | positive | supersession did not preserve/link the predecessor';
  END IF;

  IF (SELECT count(*) FROM geo.incident_operational_zone_assignments
       WHERE incident_id = 'e7000000-0000-0000-0000-000000000001'
         AND assignment_kind = 'PRIMARY' AND status = 'ACTIVE') = 1 THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | positive | exactly one ACTIVE PRIMARY survives a supersession';
  ELSE
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | positive | supersession left more than one ACTIVE PRIMARY';
  END IF;

  -- A revoked assignment cannot be superseded back into life.
  v_revoked := 'ed000000-0000-0000-0000-000000000002';
  PERFORM geo.fn_revoke_incident_operational_zone_assignment(v_revoked, 'NO_LONGER_AFFECTED', v_subject);
  BEGIN
    PERFORM geo.fn_supersede_incident_operational_zone_assignment(
      p_assignment_id => v_revoked,
      p_operational_zone_id => 'e8000000-0000-0000-0000-000000000001',
      p_assignment_kind => 'AFFECTED', p_resolution_method => 'MANUAL',
      p_reason_code => 'SHOULD_FAIL', p_assigned_by_subject_id => v_subject,
      p_correlation_id => 'ed000000-0000-0000-0000-0000000000e2');
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | negative | a REVOKED assignment was superseded back into life';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | negative | a REVOKED assignment cannot be superseded (no resurrection)';
  END;

  -- A second revocation of the same row is a no-op, not a second history entry.
  IF geo.fn_revoke_incident_operational_zone_assignment(v_revoked, 'NO_LONGER_AFFECTED', v_subject) = false THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | negative | re-revoking an already revoked assignment is a no-op';
  ELSE
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | negative | an assignment was revoked twice';
  END IF;
END $$;

-- ============================================================
-- CASE J / RLS — real non-superuser roles, positive and negative
-- ============================================================
SELECT CASE WHEN COUNT(*) = 0 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | role_security | no runtime role is SUPERUSER or BYPASSRLS'
FROM pg_roles
WHERE rolname IN ('app_api','ingest_worker','jobs_worker','audit_reader','readonly_inspector','access_admin')
  AND (rolsuper OR rolbypassrls);

SELECT CASE WHEN COUNT(*) = 0 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | role_security | no runtime role holds CREATE on schema geo or command'
FROM (SELECT unnest(ARRAY['app_api','ingest_worker','jobs_worker','audit_reader','readonly_inspector']) AS r) x
WHERE has_schema_privilege(x.r, 'geo', 'CREATE') OR has_schema_privilege(x.r, 'command', 'CREATE');

-- app_api, holding a real command role on incident C, sees the assignment.
SET LOCAL ROLE app_api;
SET LOCAL argus.actor_id = 'e1000000-0000-0000-0000-000000000001';
SELECT CASE WHEN COUNT(*) >= 1 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | positive | app_api WITH the command role reads the COMMAND assignment'
FROM geo.incident_operational_zone_assignments
WHERE incident_id = 'e7000000-0000-0000-0000-000000000003';

-- app_api cannot write it, by any statement.
DO $$
BEGIN
  BEGIN
    INSERT INTO geo.incident_operational_zone_assignments
      (incident_id, operational_zone_id, assignment_kind, resolution_method, status,
       correlation_id, provenance, assigned_by_subject_id)
    VALUES ('e7000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-000000000002',
            'COMMAND', 'MANUAL', 'ACTIVE', 'ed000000-0000-0000-0000-0000000000f9', 'MANUAL',
            '00000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | negative | app_api INSERTed a COMMAND assignment directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | negative | app_api cannot INSERT into the R31 relation at all';
  END;

  BEGIN
    UPDATE geo.incident_operational_zone_assignments SET assignment_kind = 'COMMAND'
     WHERE id = 'ed000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | negative | app_api UPDATEd an assignment into COMMAND';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | negative | app_api cannot UPDATE the R31 relation';
  END;

  BEGIN
    PERFORM geo.fn_assign_incident_operational_zone(
      p_incident_id => 'e7000000-0000-0000-0000-000000000001',
      p_operational_zone_id => 'e8000000-0000-0000-0000-000000000002',
      p_assignment_kind => 'COMMAND', p_resolution_method => 'MANUAL',
      p_assigned_by_subject_id => '00000000-0000-0000-0000-000000000001',
      p_reason_code => 'SHOULD_FAIL', p_correlation_id => 'ed000000-0000-0000-0000-0000000000f8');
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | negative | app_api executed the COMMAND assignment function';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | negative | app_api cannot EXECUTE the COMMAND assignment function';
  END;
END $$;
RESET ROLE;

-- readonly_inspector never writes.
SET LOCAL ROLE readonly_inspector;
SET LOCAL argus.actor_id = 'e1000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  BEGIN
    UPDATE geo.incident_operational_zone_assignments SET review_status = 'REVIEWED_APPROVED'
     WHERE id = 'ed000000-0000-0000-0000-000000000003';
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | negative | readonly_inspector wrote to the R31 relation';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | negative | readonly_inspector cannot write the R31 relation';
  END;
END $$;
RESET ROLE;

-- ingest_worker may propose, but never confirm.
SET LOCAL ROLE ingest_worker;
DO $$
BEGIN
  BEGIN
    PERFORM geo.fn_assign_incident_operational_zone(
      p_incident_id => 'e7000000-0000-0000-0000-000000000001',
      p_operational_zone_id => 'e8000000-0000-0000-0000-000000000002',
      p_assignment_kind => 'COMMAND', p_resolution_method => 'MANUAL',
      p_assigned_by_subject_id => '00000000-0000-0000-0000-000000000001',
      p_reason_code => 'SHOULD_FAIL', p_correlation_id => 'ed000000-0000-0000-0000-0000000000f7');
    RAISE EXCEPTION 'INCIDENT_ZONE_FAIL | negative | ingest_worker confirmed a COMMAND assignment';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'INCIDENT_ZONE_OK | negative | ingest_worker cannot confirm COMMAND';
  END;
END $$;
RESET ROLE;

-- An authorized but UNRELATED actor sees nothing of another incident's
-- assignments through the command branch of the policy.
SET LOCAL ROLE app_api;
SET LOCAL argus.actor_id = 'e1000000-0000-0000-0000-000000000002';
SELECT CASE WHEN COUNT(*) = 0 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | negative | app_api without command scope reads no COMMAND assignment for that incident'
FROM geo.incident_operational_zone_assignments
WHERE incident_id = 'e7000000-0000-0000-0000-000000000003'
  AND assignment_kind = 'COMMAND'
  AND security.fn_has_command_role('e1000000-0000-0000-0000-000000000002', incident_id);
RESET ROLE;

SELECT 'INCIDENT_ZONE_RLS_PASS';

ROLLBACK;

-- The suite leaves nothing behind.
SELECT CASE WHEN COUNT(*) = 0 THEN 'INCIDENT_ZONE_OK' ELSE 'INCIDENT_ZONE_FAIL' END
       || ' | structure | the check suite left zero rows behind'
FROM geo.incident_operational_zone_assignments;
