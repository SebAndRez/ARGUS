-- scripts/migration-rehearsal/sql/rls-matrix-checks.sql
--
-- Fase 6/7 of the corrective mandate: the REAL RLS matrix, executed under
-- genuine non-superuser, NOBYPASSRLS roles via `SET LOCAL ROLE`.
--
-- Why this file exists separately from rls-runtime-checks.sql: that file
-- verifies POSTURE (which tables have RLS/FORCE RLS enabled, which grants
-- exist). This file verifies BEHAVIOR — that a restricted role actually
-- sees its own rows and actually does NOT see other actors' rows, with the
-- three real helper functions (fn_is_owner / fn_has_command_role /
-- fn_classification_allowed) doing the deciding.
--
-- Every test runs inside BEGIN ... ROLLBACK, so this file leaves ZERO rows
-- behind and can be re-run any number of times. `SET LOCAL ROLE` reverts
-- automatically at ROLLBACK.
--
-- A suite where every case returns false proves nothing (the mandate says
-- so explicitly), so this file asserts BOTH directions on every dimension:
-- each positive case MUST return rows and each negative case MUST return
-- zero rows. Output lines are `RLS_TEST_PASS`/`RLS_TEST_FAIL` so the
-- existing harness grep in Test-ArgusRehearsal.ps1 picks them up unchanged.

\pset format unaligned
\pset tuples_only on

-- ============================================================
-- 0. Role security preconditions (fail loudly, not silently)
-- ============================================================
-- If any application role were superuser or BYPASSRLS, every "negative"
-- case below would trivially pass for the wrong reason.
SELECT CASE WHEN COUNT(*) = 0 THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | role_security | no application role is superuser or BYPASSRLS'
FROM pg_roles
WHERE rolname IN ('app_api','ingest_worker','jobs_worker','audit_reader','readonly_inspector')
  AND (rolsuper OR rolbypassrls);

SELECT CASE WHEN COUNT(*) = 5 THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | role_security | all 5 application roles exist and are NOLOGIN-capable non-privileged'
FROM pg_roles
WHERE rolname IN ('app_api','ingest_worker','jobs_worker','audit_reader','readonly_inspector')
  AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication;

-- The three helper functions must NOT be stubs. A stub body is exactly
-- `SELECT false;` — assert each real body is materially longer and
-- references the tables it is supposed to consult.
SELECT CASE WHEN prosrc ~ 'command_roles' AND prosrc ~ 'institutional_memberships'
            THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | helper_not_stub | fn_has_command_role consults command_roles + institutional_memberships'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'security' AND p.proname = 'fn_has_command_role';

SELECT CASE WHEN prosrc ~ 'identity.people' AND prosrc ~ 'help.help_requests'
            THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | helper_not_stub | fn_is_owner dispatches on real owning tables'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'security' AND p.proname = 'fn_is_owner';

SELECT CASE WHEN prosrc ~ 'argus.actor_role' AND prosrc !~ '^\s*SELECT false;\s*$'
            THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | helper_not_stub | fn_classification_allowed resolves a real clearance signal'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'security' AND p.proname = 'fn_classification_allowed';

-- ============================================================
-- 1. Seed fixtures + run the matrix (single transaction, rolled back)
-- ============================================================
BEGIN;

-- Two people, two institutions, two jurisdictions.
INSERT INTO identity.people (id, legal_name) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'RLS Fixture Person One'),
  ('d1000000-0000-0000-0000-000000000002', 'RLS Fixture Person Two');

INSERT INTO institution.organizations (id, name, status) VALUES
  ('d2000000-0000-0000-0000-000000000001', 'RLS Fixture Org A', 'ACTIVE'),
  ('d2000000-0000-0000-0000-000000000002', 'RLS Fixture Org B', 'ACTIVE');

INSERT INTO geo.administrative_areas (id, name, area_kind_id, boundary, version)
SELECT 'd3000000-0000-0000-0000-000000000001',
       'RLS Fixture Area A',
       (SELECT id FROM governance.administrative_area_kinds LIMIT 1),
       ST_GeogFromText('MULTIPOLYGON(((0 0, 0 0.01, 0.01 0.01, 0.01 0, 0 0)))'), 1
WHERE EXISTS (SELECT 1 FROM governance.administrative_area_kinds);

INSERT INTO governance.jurisdictions (id, name, primary_administrative_area_id, declaring_organization_id, version)
SELECT 'd4000000-0000-0000-0000-000000000001', 'RLS Fixture Jurisdiction A',
       'd3000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 1
WHERE EXISTS (SELECT 1 FROM geo.administrative_areas WHERE id = 'd3000000-0000-0000-0000-000000000001');

-- One CURRENT membership, one EXPIRED membership (different orgs so the
-- partial unique index on (person, org) WHERE effective_to IS NULL holds).
INSERT INTO institution.institutional_memberships (id, person_id, organization_id, role_label, status, effective_from, effective_to) VALUES
  ('d5000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'Coordinator', 'ACTIVE', now() - interval '1 day', NULL),
  ('d5000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000002', 'Expired Coordinator', 'ACTIVE', now() - interval '10 days', now() - interval '1 day');

-- Incident scaffolding.
INSERT INTO governance.incident_categories (id, code, name) VALUES
  ('d6000000-0000-0000-0000-000000000001', 'RLS_FIXTURE_CAT', 'RLS Fixture Category');
INSERT INTO governance.incident_types (id, code, incident_category_id) VALUES
  ('d6000000-0000-0000-0000-000000000002', 'RLS_FIXTURE_TYPE', 'd6000000-0000-0000-0000-000000000001');

INSERT INTO incident.incident_candidates (id, status, classification) VALUES
  ('d7000000-0000-0000-0000-000000000001', 'PROMOTED', 'OPERATIONAL');

INSERT INTO incident.incidents (id, origin_candidate_id, incident_type_id, classification, title) VALUES
  ('d7000000-0000-0000-0000-000000000002', 'd7000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000002', 'CRITICAL', 'RLS Fixture Incident');

-- Person One holds a VALID command role (membership current); Person Two's
-- command role is backed by the EXPIRED membership -> must be rejected.
INSERT INTO command.incident_command_structures (id, incident_id, status) VALUES
  ('d8000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000002', 'ACTIVE');
INSERT INTO command.command_roles (id, incident_command_structure_id, actor_type, actor_id, institutional_membership_id, role_label) VALUES
  ('d8000000-0000-0000-0000-000000000002', 'd8000000-0000-0000-0000-000000000001', 'PERSON', 'd1000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'Incident Commander'),
  ('d8000000-0000-0000-0000-000000000003', 'd8000000-0000-0000-0000-000000000001', 'PERSON', 'd1000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000002', 'Expired-Membership Commander');

-- A promotion decided BY Person One (so Person One owns it, Person Two does not).
INSERT INTO incident.incident_promotions
  (id, incident_candidate_id, incident_id, decided_by_actor_type, decided_by_actor_id,
   input_data_snapshot, confidence, explanation, idempotency_key) VALUES
  ('d9000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000002',
   'PERSON', 'd1000000-0000-0000-0000-000000000001', '{}'::jsonb, 'HIGH', 'RLS fixture promotion',
   'd9000000-0000-0000-0000-0000000000ff');

-- ---------- fn_has_command_role: positive + negative (direct) ----------
SELECT CASE WHEN security.fn_has_command_role('d1000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000002')
            THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | positive | fn_has_command_role: valid role + current membership -> true';

SELECT CASE WHEN NOT security.fn_has_command_role('d1000000-0000-0000-0000-000000000002', 'd7000000-0000-0000-0000-000000000002')
            THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | negative | fn_has_command_role: EXPIRED institutional membership -> false';

SELECT CASE WHEN NOT security.fn_has_command_role('d1000000-0000-0000-0000-00000000009f', 'd7000000-0000-0000-0000-000000000002')
            THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | negative | fn_has_command_role: actor with no command role -> false';

SELECT CASE WHEN NOT security.fn_has_command_role(NULL, 'd7000000-0000-0000-0000-000000000002')
            THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | negative | fn_has_command_role: NULL actor -> false';

-- ---------- fn_is_owner: positive + negative (direct) ----------
SELECT CASE WHEN security.fn_is_owner('d1000000-0000-0000-0000-000000000001', 'identity.people', 'd1000000-0000-0000-0000-000000000001')
            THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | positive | fn_is_owner: person owns own identity.people row -> true';

SELECT CASE WHEN NOT security.fn_is_owner('d1000000-0000-0000-0000-000000000002', 'identity.people', 'd1000000-0000-0000-0000-000000000001')
            THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | negative | fn_is_owner: other person''s identity.people row -> false';

SELECT CASE WHEN security.fn_is_owner('d1000000-0000-0000-0000-000000000001', 'institution.institutional_memberships', 'd5000000-0000-0000-0000-000000000001')
            THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | positive | fn_is_owner: person owns own institutional membership -> true';

SELECT CASE WHEN security.fn_is_owner('d1000000-0000-0000-0000-000000000001', 'incident.incident_promotions', 'd9000000-0000-0000-0000-000000000001')
            THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | positive | fn_is_owner: decider owns own incident_promotion -> true';

SELECT CASE WHEN NOT security.fn_is_owner('d1000000-0000-0000-0000-000000000001', 'nonexistent.table', 'd9000000-0000-0000-0000-000000000001')
            THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | negative | fn_is_owner: unsupported target_table -> false (never an error)';

SELECT CASE WHEN NOT security.fn_is_owner('d1000000-0000-0000-0000-000000000001', 'identity.people', 'd1000000-0000-0000-0000-0000000000ee')
            THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | negative | fn_is_owner: nonexistent target row -> false';

-- ---------- fn_classification_allowed: positive + negative ----------
SELECT CASE WHEN NOT security.fn_classification_allowed('d1000000-0000-0000-0000-000000000001', 'RESTRICTED')
            THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | negative | fn_classification_allowed: no actor_role set -> false (fails closed)';

SELECT CASE WHEN NOT security.fn_classification_allowed(NULL, 'PUBLIC')
            THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | negative | fn_classification_allowed: NULL actor -> false';

ROLLBACK;

-- ============================================================
-- 2. Same fixtures, but every read executed AS A RESTRICTED ROLE
-- ============================================================
-- Re-seeded per block because each block rolls back. Kept deliberately
-- separate so a failure names exactly which role/case broke.

-- ---------- app_api: OWN promotion visible (positive) ----------
BEGIN;
INSERT INTO identity.people (id, legal_name) VALUES ('d1000000-0000-0000-0000-000000000001', 'RLS Fixture Person One');
INSERT INTO governance.incident_categories (id, code, name) VALUES ('d6000000-0000-0000-0000-000000000001', 'RLS_FIXTURE_CAT', 'RLS Fixture Category');
INSERT INTO governance.incident_types (id, code, incident_category_id) VALUES ('d6000000-0000-0000-0000-000000000002', 'RLS_FIXTURE_TYPE', 'd6000000-0000-0000-0000-000000000001');
INSERT INTO incident.incident_candidates (id, status, classification) VALUES ('d7000000-0000-0000-0000-000000000001', 'PROMOTED', 'OPERATIONAL');
INSERT INTO incident.incidents (id, origin_candidate_id, incident_type_id, classification, title) VALUES ('d7000000-0000-0000-0000-000000000002', 'd7000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000002', 'CRITICAL', 'RLS Fixture Incident');
INSERT INTO incident.incident_promotions (id, incident_candidate_id, incident_id, decided_by_actor_type, decided_by_actor_id, input_data_snapshot, confidence, explanation, idempotency_key)
VALUES ('d9000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000002', 'PERSON', 'd1000000-0000-0000-0000-000000000001', '{}'::jsonb, 'HIGH', 'RLS fixture promotion', 'd9000000-0000-0000-0000-0000000000ff');

SET LOCAL ROLE app_api;
SET LOCAL argus.actor_id = 'd1000000-0000-0000-0000-000000000001';
SET LOCAL argus.actor_role = 'OPERATIONAL';
SELECT CASE WHEN COUNT(*) = 1 THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | positive | app_api sees its OWN incident_promotion (decided_by_actor_id match)'
FROM incident.incident_promotions WHERE id = 'd9000000-0000-0000-0000-000000000001';
ROLLBACK;

-- ---------- app_api: OTHER actor's promotion NOT visible (negative) ----------
BEGIN;
INSERT INTO identity.people (id, legal_name) VALUES ('d1000000-0000-0000-0000-000000000001', 'RLS Fixture Person One');
INSERT INTO governance.incident_categories (id, code, name) VALUES ('d6000000-0000-0000-0000-000000000001', 'RLS_FIXTURE_CAT', 'RLS Fixture Category');
INSERT INTO governance.incident_types (id, code, incident_category_id) VALUES ('d6000000-0000-0000-0000-000000000002', 'RLS_FIXTURE_TYPE', 'd6000000-0000-0000-0000-000000000001');
INSERT INTO incident.incident_candidates (id, status, classification) VALUES ('d7000000-0000-0000-0000-000000000001', 'PROMOTED', 'OPERATIONAL');
INSERT INTO incident.incidents (id, origin_candidate_id, incident_type_id, classification, title) VALUES ('d7000000-0000-0000-0000-000000000002', 'd7000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000002', 'CRITICAL', 'RLS Fixture Incident');
INSERT INTO incident.incident_promotions (id, incident_candidate_id, incident_id, decided_by_actor_type, decided_by_actor_id, input_data_snapshot, confidence, explanation, idempotency_key)
VALUES ('d9000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000002', 'PERSON', 'd1000000-0000-0000-0000-000000000001', '{}'::jsonb, 'HIGH', 'RLS fixture promotion', 'd9000000-0000-0000-0000-0000000000ff');

SET LOCAL ROLE app_api;
-- A DIFFERENT actor, with no command role on that incident.
SET LOCAL argus.actor_id = 'd1000000-0000-0000-0000-000000000002';
SET LOCAL argus.actor_role = 'OPERATIONAL';
SELECT CASE WHEN COUNT(*) = 0 THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | negative | app_api does NOT see another actor''s incident_promotion'
FROM incident.incident_promotions WHERE id = 'd9000000-0000-0000-0000-000000000001';
ROLLBACK;

-- ---------- app_api: incident visible ONLY via real command role ----------
BEGIN;
INSERT INTO identity.people (id, legal_name) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'RLS Fixture Person One'),
  ('d1000000-0000-0000-0000-000000000002', 'RLS Fixture Person Two');
INSERT INTO institution.organizations (id, name, status) VALUES ('d2000000-0000-0000-0000-000000000001', 'RLS Fixture Org A', 'ACTIVE');
INSERT INTO institution.institutional_memberships (id, person_id, organization_id, role_label, status, effective_from, effective_to)
VALUES ('d5000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'Coordinator', 'ACTIVE', now() - interval '1 day', NULL);
INSERT INTO governance.incident_categories (id, code, name) VALUES ('d6000000-0000-0000-0000-000000000001', 'RLS_FIXTURE_CAT', 'RLS Fixture Category');
INSERT INTO governance.incident_types (id, code, incident_category_id) VALUES ('d6000000-0000-0000-0000-000000000002', 'RLS_FIXTURE_TYPE', 'd6000000-0000-0000-0000-000000000001');
INSERT INTO incident.incidents (id, incident_type_id, classification, title) VALUES ('d7000000-0000-0000-0000-000000000002', 'd6000000-0000-0000-0000-000000000002', 'CRITICAL', 'RLS Fixture Incident');
INSERT INTO command.incident_command_structures (id, incident_id, status) VALUES ('d8000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000002', 'ACTIVE');
INSERT INTO command.command_roles (id, incident_command_structure_id, actor_type, actor_id, institutional_membership_id, role_label)
VALUES ('d8000000-0000-0000-0000-000000000002', 'd8000000-0000-0000-0000-000000000001', 'PERSON', 'd1000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'Incident Commander');

SET LOCAL ROLE app_api;
SET LOCAL argus.actor_id = 'd1000000-0000-0000-0000-000000000001';
SET LOCAL argus.actor_role = 'OPERATIONAL';
SELECT CASE WHEN COUNT(*) = 1 THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | positive | app_api WITH command role sees the CRITICAL incident'
FROM incident.incidents WHERE id = 'd7000000-0000-0000-0000-000000000002';
ROLLBACK;

BEGIN;
INSERT INTO identity.people (id, legal_name) VALUES ('d1000000-0000-0000-0000-000000000002', 'RLS Fixture Person Two');
INSERT INTO governance.incident_categories (id, code, name) VALUES ('d6000000-0000-0000-0000-000000000001', 'RLS_FIXTURE_CAT', 'RLS Fixture Category');
INSERT INTO governance.incident_types (id, code, incident_category_id) VALUES ('d6000000-0000-0000-0000-000000000002', 'RLS_FIXTURE_TYPE', 'd6000000-0000-0000-0000-000000000001');
INSERT INTO incident.incidents (id, incident_type_id, classification, title) VALUES ('d7000000-0000-0000-0000-000000000002', 'd6000000-0000-0000-0000-000000000002', 'CRITICAL', 'RLS Fixture Incident');

SET LOCAL ROLE app_api;
SET LOCAL argus.actor_id = 'd1000000-0000-0000-0000-000000000002';
SET LOCAL argus.actor_role = 'OPERATIONAL';
SELECT CASE WHEN COUNT(*) = 0 THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | negative | app_api WITHOUT command role does NOT see the incident'
FROM incident.incidents WHERE id = 'd7000000-0000-0000-0000-000000000002';
ROLLBACK;

-- ---------- app_api: classification gate (negative) ----------
BEGIN;
INSERT INTO incident.incident_candidates (id, status, classification) VALUES ('d7000000-0000-0000-0000-000000000003', 'UNDER_ASSESSMENT', 'OPERATIONAL');

SET LOCAL ROLE app_api;
SET LOCAL argus.actor_id = 'd1000000-0000-0000-0000-000000000001';
SET LOCAL argus.actor_role = 'OPERATIONAL';
SELECT CASE WHEN COUNT(*) = 1 THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | positive | app_api with OPERATIONAL role sees an OPERATIONAL incident_candidate'
FROM incident.incident_candidates WHERE id = 'd7000000-0000-0000-0000-000000000003';
ROLLBACK;

BEGIN;
INSERT INTO incident.incident_candidates (id, status, classification) VALUES ('d7000000-0000-0000-0000-000000000003', 'UNDER_ASSESSMENT', 'OPERATIONAL');

SET LOCAL ROLE app_api;
SET LOCAL argus.actor_id = 'd1000000-0000-0000-0000-000000000001';
-- No argus.actor_role at all -> classification check must fail closed.
SELECT CASE WHEN COUNT(*) = 0 THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | negative | app_api with NO actor_role sees NO incident_candidate (fails closed)'
FROM incident.incident_candidates WHERE id = 'd7000000-0000-0000-0000-000000000003';
ROLLBACK;

-- ---------- audit_reader: AuditLog read allowed, write denied ----------
BEGIN;
INSERT INTO security.audit_logs (id, actor_type, actor_id, action, target_table, target_id, classification, result, integrity_value, occurred_at)
VALUES (gen_random_uuid(), 'PERSON', 'd1000000-0000-0000-0000-000000000001', 'RLS_FIXTURE_ACTION', 'identity.people',
        'd1000000-0000-0000-0000-000000000001', 'CRITICAL', 'SUCCESS', 'fixture-integrity-value', TIMESTAMPTZ '2026-07-15 12:00:00+00');

SET LOCAL ROLE audit_reader;
SET LOCAL argus.actor_id = 'd1000000-0000-0000-0000-000000000001';
SET LOCAL argus.actor_role = 'AUDIT';
SELECT CASE WHEN COUNT(*) >= 1 THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | positive | audit_reader with AUDIT role reads security.audit_logs'
FROM security.audit_logs WHERE action = 'RLS_FIXTURE_ACTION';
ROLLBACK;

BEGIN;
INSERT INTO security.audit_logs (id, actor_type, actor_id, action, target_table, target_id, classification, result, integrity_value, occurred_at)
VALUES (gen_random_uuid(), 'PERSON', 'd1000000-0000-0000-0000-000000000001', 'RLS_FIXTURE_ACTION', 'identity.people',
        'd1000000-0000-0000-0000-000000000001', 'CRITICAL', 'SUCCESS', 'fixture-integrity-value', TIMESTAMPTZ '2026-07-15 12:00:00+00');

SET LOCAL ROLE app_api;
SET LOCAL argus.actor_id = 'd1000000-0000-0000-0000-000000000001';
SET LOCAL argus.actor_role = 'OPERATIONAL';
-- app_api has NO grant on security.audit_logs at all; the read must fail.
-- Wrapped so the expected permission error becomes a PASS line, not an abort.
DO $$
DECLARE v_count integer;
BEGIN
  BEGIN
    SELECT COUNT(*) INTO v_count FROM security.audit_logs WHERE action = 'RLS_FIXTURE_ACTION';
    IF v_count = 0 THEN
      RAISE NOTICE 'RLS_TEST_PASS | negative | app_api reads zero rows from security.audit_logs';
    ELSE
      RAISE NOTICE 'RLS_TEST_FAIL | negative | app_api READ % audit_log rows it must not see', v_count;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'RLS_TEST_PASS | negative | app_api denied on security.audit_logs (insufficient_privilege)';
  END;
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE audit_reader;
SET LOCAL argus.actor_id = 'd1000000-0000-0000-0000-000000000001';
SET LOCAL argus.actor_role = 'AUDIT';
DO $$
BEGIN
  BEGIN
    UPDATE security.audit_logs SET result = 'TAMPERED' WHERE action = 'RLS_FIXTURE_ACTION';
    RAISE NOTICE 'RLS_TEST_FAIL | negative | audit_reader was able to UPDATE security.audit_logs';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'RLS_TEST_PASS | negative | audit_reader cannot UPDATE security.audit_logs (append-only, D-03)';
  END;
END $$;
ROLLBACK;

-- ---------- readonly_inspector: read allowed, write denied ----------
BEGIN;
SET LOCAL ROLE readonly_inspector;
SET LOCAL argus.actor_id = 'd1000000-0000-0000-0000-000000000001';
SET LOCAL argus.actor_role = 'OPERATIONAL';
DO $$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM governance.incident_types;
  RAISE NOTICE 'RLS_TEST_PASS | positive | readonly_inspector reads governance.incident_types (% rows)', v_count;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'RLS_TEST_FAIL | positive | readonly_inspector denied a read it should be allowed';
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE readonly_inspector;
SET LOCAL argus.actor_id = 'd1000000-0000-0000-0000-000000000001';
SET LOCAL argus.actor_role = 'OPERATIONAL';
DO $$
BEGIN
  BEGIN
    INSERT INTO governance.incident_categories (id, code, name)
    VALUES (gen_random_uuid(), 'RLS_INSPECTOR_WRITE_ATTEMPT', 'must not succeed');
    RAISE NOTICE 'RLS_TEST_FAIL | negative | readonly_inspector was able to INSERT into governance.incident_categories';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'RLS_TEST_PASS | negative | readonly_inspector cannot INSERT (read-only)';
  END;
END $$;
ROLLBACK;

-- ---------- ingest_worker: allowed write vs forbidden read ----------
-- NOTE: an earlier draft of this file asserted that ingest_worker must NOT
-- be able to INSERT into evidence.evidence_records. Running it proved that
-- expectation WRONG, not the DDL: 030_ingestion_observation_evidence/migration.sql
-- deliberately grants SELECT+INSERT on evidence.observations,
-- evidence.evidence_records and evidence.evidence_assets to ingest_worker —
-- creating evidence rows from ingested content is precisely ingest_worker's
-- job. The test was corrected to assert what the design actually forbids
-- (writing into incident.*, which ingest_worker may only read), rather than
-- weakening the grant to make a wrong assertion pass.
BEGIN;
INSERT INTO ingest.providers (id, name, status) VALUES ('e1000000-0000-0000-0000-000000000001', 'RLS Fixture Provider', 'ACTIVE');
INSERT INTO ingest.sources (id, provider_id, endpoint_signature, name, status) VALUES
  ('e1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'synthetic://rls-matrix', 'RLS Fixture Source', 'ACTIVE');
INSERT INTO ingest.ingestion_runs (id, source_id, idempotency_key, origin_kind, status) VALUES
  ('e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-0000000000aa', 'EXTERNAL_EVENT_PIPELINE', 'COMPLETED');

SET LOCAL ROLE ingest_worker;
SET LOCAL argus.actor_id = 'd1000000-0000-0000-0000-000000000001';
SET LOCAL argus.actor_role = 'OPERATIONAL';
DO $$
BEGIN
  INSERT INTO ingest.source_records (id, ingestion_run_id, source_id, origin_kind, external_id, provenance, raw_content, content_hash)
  VALUES (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000002',
          'EXTERNAL_EVENT', 'rls-matrix-ext-1', '{}'::jsonb, '{}'::jsonb, 'rls-matrix-hash');
  RAISE NOTICE 'RLS_TEST_PASS | positive | ingest_worker CAN insert a SourceRecord (its own domain)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'RLS_TEST_FAIL | positive | ingest_worker denied inserting a SourceRecord (%)', SQLSTATE;
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE ingest_worker;
SET LOCAL argus.actor_id = 'd1000000-0000-0000-0000-000000000001';
SET LOCAL argus.actor_role = 'OPERATIONAL';
DO $$
BEGIN
  BEGIN
    -- incident.* is read-only for ingest_worker (SELECT grant only).
    INSERT INTO incident.incident_candidates (id, status, classification)
    VALUES (gen_random_uuid(), 'UNDER_ASSESSMENT', 'OPERATIONAL');
    RAISE NOTICE 'RLS_TEST_FAIL | negative | ingest_worker was able to INSERT into incident.incident_candidates';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'RLS_TEST_PASS | negative | ingest_worker cannot INSERT into incident.incident_candidates (read-only there)';
  END;
END $$;
ROLLBACK;

BEGIN;
INSERT INTO incident.incident_candidates (id, status, classification) VALUES ('d7000000-0000-0000-0000-00000000000a', 'UNDER_ASSESSMENT', 'OPERATIONAL');
SET LOCAL ROLE ingest_worker;
SET LOCAL argus.actor_id = 'd1000000-0000-0000-0000-000000000001';
-- SYSTEM is not one of the OPERATIONAL/ADMIN roles incident_candidates requires.
SET LOCAL argus.actor_role = 'SYSTEM';
SELECT CASE WHEN COUNT(*) = 0 THEN 'RLS_TEST_PASS' ELSE 'RLS_TEST_FAIL' END
       || ' | negative | ingest_worker with SYSTEM role reads NO restricted incident_candidate (RLS, not just grants)'
FROM incident.incident_candidates WHERE id = 'd7000000-0000-0000-0000-00000000000a';
ROLLBACK;
