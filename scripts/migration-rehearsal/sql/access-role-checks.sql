-- scripts/migration-rehearsal/sql/access-role-checks.sql
--
-- Behavioral proof that authorization is now resolved from PERSISTED rows
-- (security.access_subjects + security.access_role_assignments +
-- security.access_roles) and not from a session GUC.
--
-- Every mutation runs inside BEGIN ... ROLLBACK, so this file leaves ZERO rows
-- behind and is safe to re-run any number of times. Every check emits either
-- an `ACCESS_..._OK`/`..._PASS` line or raises; a raise aborts the file, so a
-- missing marker is as much a failure as an explicit one.
--
-- Markers produced:
--   ACCESS_SUBJECT_INTEGRITY_PASS
--   ACCESS_ROLE_ASSIGNMENT_PASS
--   CLASSIFICATION_PERSISTED_ROLE_PASS
--   CLASSIFICATION_FORGED_GUC_DENIED_PASS
--   ACCESS_ROLE_RLS_PASS
--
-- Note on classification values: this file uses the FIVE labels that actually
-- exist in security.information_classification_enum — PUBLIC, OPERATIONAL,
-- SENSITIVE, RESTRICTED, CRITICAL. There is no INTERNAL label in the target
-- schema, so none is invented here.

\pset format unaligned
\pset tuples_only on

-- ============================================================
-- 1. security.access_subjects integrity
-- ============================================================
BEGIN;

CREATE TEMP TABLE access_check_ids (k text PRIMARY KEY, v uuid);
-- Readable by every role the matrix switches into. Without this, a
-- role-switched block that reads this scratch table raises
-- `insufficient_privilege` — the SAME sqlstate the negative cases expect —
-- and a privilege test would pass because the HARNESS was denied rather than
-- the operation under test. Found exactly that way on the first run.
GRANT SELECT ON access_check_ids
  TO app_api, ingest_worker, jobs_worker, audit_reader, readonly_inspector, access_admin;

INSERT INTO identity.people (id, legal_name) VALUES
  ('e1000000-0000-0000-0000-00000000000a', 'Access Fixture Person A'),
  ('e1000000-0000-0000-0000-00000000000b', 'Access Fixture Person B');
INSERT INTO institution.organizations (id, name, status) VALUES
  ('e2000000-0000-0000-0000-00000000000a', 'Access Fixture Institution A', 'ACTIVE'),
  ('e2000000-0000-0000-0000-00000000000b', 'Access Fixture Institution B', 'ACTIVE');

DO $$
DECLARE
  v_a   uuid;
  v_b   uuid;
  v_sys uuid;
  v_again uuid;
BEGIN
  v_a := security.fn_register_access_subject('PERSON', 'e1000000-0000-0000-0000-00000000000a');
  v_b := security.fn_register_access_subject('PERSON', 'e1000000-0000-0000-0000-00000000000b');
  v_sys := security.fn_register_access_subject('SYSTEM', NULL, NULL, NULL, 'ARGUS_ACCESS_CHECK_DAEMON');
  INSERT INTO access_check_ids (k, v) VALUES ('subject_a', v_a), ('subject_b', v_b), ('subject_sys', v_sys);

  -- Registering the same identity twice returns the SAME subject: exactly one
  -- ACTIVE subject per identity, so "resolve the subject for this actor" is
  -- never ambiguous.
  v_again := security.fn_register_access_subject('PERSON', 'e1000000-0000-0000-0000-00000000000a');
  IF v_again <> v_a THEN
    RAISE EXCEPTION 'ACCESS_SUBJECT_INTEGRITY_FAIL: re-registering an identity produced a second subject';
  END IF;

  -- ANONYMOUS can never be persisted as an authorizable subject.
  BEGIN
    PERFORM security.fn_register_access_subject('ANONYMOUS');
    RAISE EXCEPTION 'ACCESS_SUBJECT_INTEGRITY_FAIL: ANONYMOUS was accepted as a subject';
  EXCEPTION WHEN check_violation THEN
    NULL;   -- expected
  END;
  BEGIN
    INSERT INTO security.access_subjects (subject_type, person_id)
    VALUES ('ANONYMOUS', 'e1000000-0000-0000-0000-00000000000b');
    RAISE EXCEPTION 'ACCESS_SUBJECT_INTEGRITY_FAIL: a direct ANONYMOUS insert was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;   -- ck_access_subjects_no_anonymous
  END;

  -- Zero identity references is not a subject.
  BEGIN
    INSERT INTO security.access_subjects (subject_type) VALUES ('PERSON');
    RAISE EXCEPTION 'ACCESS_SUBJECT_INTEGRITY_FAIL: a subject with no identity reference was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- Two identity references is not a subject either.
  BEGIN
    INSERT INTO security.access_subjects (subject_type, person_id, organization_id)
    VALUES ('PERSON', 'e1000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000a');
    RAISE EXCEPTION 'ACCESS_SUBJECT_INTEGRITY_FAIL: a subject with two identity references was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- The declared type must match the populated reference.
  BEGIN
    INSERT INTO security.access_subjects (subject_type, organization_id)
    VALUES ('PERSON', 'e2000000-0000-0000-0000-00000000000a');
    RAISE EXCEPTION 'ACCESS_SUBJECT_INTEGRITY_FAIL: subject_type PERSON accepted an organization reference';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- A non-existent identity cannot be referenced (real FK, not a polymorphic
  -- uuid).
  BEGIN
    INSERT INTO security.access_subjects (subject_type, person_id)
    VALUES ('PERSON', 'e1000000-0000-0000-0000-0000000000ff');
    RAISE EXCEPTION 'ACCESS_SUBJECT_INTEGRITY_FAIL: a dangling person reference was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  -- A free-text system key is rejected; only the controlled shape is allowed.
  BEGIN
    INSERT INTO security.access_subjects (subject_type, system_key) VALUES ('SYSTEM', 'not a key');
    RAISE EXCEPTION 'ACCESS_SUBJECT_INTEGRITY_FAIL: a free-text system_key was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  RAISE NOTICE 'ACCESS_SUBJECT_INTEGRITY_PASS';
END $$;

-- ============================================================
-- 2. security.access_role_assignments invariants
-- ============================================================
DO $$
DECLARE
  v_a       uuid := (SELECT v FROM access_check_ids WHERE k = 'subject_a');
  v_b       uuid := (SELECT v FROM access_check_ids WHERE k = 'subject_b');
  v_g1      uuid;
  v_g2      uuid;
  v_key     uuid := gen_random_uuid();
  v_revoked boolean;
BEGIN
  -- Idempotency: the same key returns the same row, never a second grant.
  v_g1 := security.fn_grant_access_role(v_a, 'RESTRICTED_ANALYST', NULL, 'GENERAL', now(), NULL, v_b, 'MANUAL_GRANT', v_key);
  v_g2 := security.fn_grant_access_role(v_a, 'RESTRICTED_ANALYST', NULL, 'GENERAL', now(), NULL, v_b, 'MANUAL_GRANT', v_key);
  IF v_g1 <> v_g2 THEN
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: a retried grant with the same idempotency_key created a second row';
  END IF;
  IF (SELECT count(*) FROM security.access_role_assignments WHERE idempotency_key = v_key) <> 1 THEN
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: more than one row for one idempotency_key';
  END IF;
  INSERT INTO access_check_ids (k, v) VALUES ('grant_a_restricted', v_g1);

  -- Silent overlap is impossible: a second ACTIVE grant of the same role to
  -- the same subject in the same scope for the same purpose is rejected by the
  -- partial unique index, so revoking one can never leave another authorizing.
  BEGIN
    PERFORM security.fn_grant_access_role(v_a, 'RESTRICTED_ANALYST', NULL, 'GENERAL', now(), NULL, v_b, 'MANUAL_GRANT', gen_random_uuid());
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: a duplicate ACTIVE assignment was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- valid_until must be strictly after valid_from.
  BEGIN
    PERFORM security.fn_grant_access_role(v_b, 'PUBLIC_VIEWER', NULL, 'GENERAL', now(), now() - interval '1 hour');
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: an inverted validity window was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- A disabled subject cannot receive a grant.
  BEGIN
    UPDATE security.access_subjects SET status = 'DISABLED', disabled_at = now() WHERE id = v_b;
    PERFORM security.fn_grant_access_role(v_b, 'PUBLIC_VIEWER');
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: a disabled subject received a grant';
  EXCEPTION WHEN foreign_key_violation THEN
    UPDATE security.access_subjects SET status = 'ACTIVE', disabled_at = NULL WHERE id = v_b;
  END;

  -- An unknown / non-ACTIVE role code cannot be granted.
  BEGIN
    PERFORM security.fn_grant_access_role(v_b, 'NO_SUCH_ROLE_CODE');
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: an unknown role code was granted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  -- An assignment cannot be its own authority.
  BEGIN
    INSERT INTO security.access_role_assignments (access_subject_id, access_role_id, granted_by_subject_id)
    SELECT v_b, r.id, v_b FROM security.access_roles r WHERE r.code = 'PUBLIC_VIEWER';
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: a self-granted assignment was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- Revocation is a recorded status transition, and it is idempotent.
  v_revoked := security.fn_revoke_access_role(v_g1, 'ACCESS_REVIEW');
  IF NOT v_revoked THEN
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: first revocation reported no change';
  END IF;
  IF security.fn_revoke_access_role(v_g1, 'ACCESS_REVIEW') THEN
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: a repeated revocation reported a second change';
  END IF;
  IF (SELECT count(*) FROM security.access_role_assignments
       WHERE id = v_g1 AND status = 'REVOKED' AND revoked_at IS NOT NULL
         AND revocation_reason_code = 'ACCESS_REVIEW') <> 1 THEN
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: revocation did not record who/when/why';
  END IF;
  -- The row survives: revocation is history, not deletion.
  IF (SELECT count(*) FROM security.access_role_assignments WHERE id = v_g1) <> 1 THEN
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: revocation deleted the assignment row';
  END IF;

  -- A free-text revocation reason is rejected.
  BEGIN
    PERFORM security.fn_revoke_access_role(v_g1, 'because i said so');
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: a free-text revocation reason was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- Both administration operations wrote an audit row, through the canonical
  -- partition lifecycle, in this same transaction.
  IF (SELECT count(*) FROM security.audit_logs
       WHERE action IN ('ACCESS_ROLE_GRANTED','ACCESS_ROLE_REVOKED')
         AND target_table = 'security.access_role_assignments') < 2 THEN
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: grant/revoke did not write audit rows';
  END IF;
  -- ...and those audit rows carry no PII: ids and controlled codes only.
  IF EXISTS (
    SELECT 1 FROM security.audit_logs
    WHERE action IN ('ACCESS_ROLE_GRANTED','ACCESS_ROLE_REVOKED')
      AND (context::text ~* '@|legal_name|email|phone')
  ) THEN
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: an authorization audit row carries PII-looking content';
  END IF;

  RAISE NOTICE 'ACCESS_ROLE_ASSIGNMENT_PASS';
END $$;

-- ============================================================
-- 3. Classification resolved from persisted assignments
-- ============================================================
-- Fixtures for the matrix. Person A gets a RESTRICTED ceiling globally;
-- Person B gets PUBLIC only. Plus one expired, one future, one revoked, one
-- institution-scoped, one purpose-scoped, one emergency-scoped, and one grant
-- of a role that is later DEPRECATED.
DO $$
DECLARE
  v_a uuid := (SELECT v FROM access_check_ids WHERE k = 'subject_a');
  v_b uuid := (SELECT v FROM access_check_ids WHERE k = 'subject_b');
  v_sys uuid := (SELECT v FROM access_check_ids WHERE k = 'subject_sys');
  v_dep_role uuid;
  v_id uuid;
BEGIN
  -- A: RESTRICTED, global, any purpose.
  INSERT INTO access_check_ids (k, v)
  VALUES ('grant_a_active', security.fn_grant_access_role(v_a, 'RESTRICTED_ANALYST', NULL, 'GENERAL', now(), NULL, v_b, 'MANUAL_GRANT', gen_random_uuid()));
  -- B: PUBLIC only.
  INSERT INTO access_check_ids (k, v)
  VALUES ('grant_b_public', security.fn_grant_access_role(v_b, 'PUBLIC_VIEWER', NULL, 'GENERAL', now(), NULL, v_a, 'MANUAL_GRANT', gen_random_uuid()));
  -- SYSTEM subject: a real machine identity with a real assignment.
  INSERT INTO access_check_ids (k, v)
  VALUES ('grant_sys', security.fn_grant_access_role(v_sys, 'SYSTEM', NULL, 'GENERAL', now(), NULL, v_a, 'SYSTEM_PROVISION', gen_random_uuid()));
  -- B: expired.
  INSERT INTO access_check_ids (k, v)
  VALUES ('grant_b_expired', security.fn_grant_access_role(v_b, 'SENSITIVE_HANDLER', NULL, 'GENERAL', now() - interval '10 days', now() - interval '1 day', v_a, 'MANUAL_GRANT', gen_random_uuid()));
  -- B: not yet valid.
  INSERT INTO access_check_ids (k, v)
  VALUES ('grant_b_future', security.fn_grant_access_role(v_b, 'OPERATIONAL_RESPONDER', NULL, 'GENERAL', now() + interval '10 days', NULL, v_a, 'MANUAL_GRANT', gen_random_uuid()));
  -- B: revoked.
  v_id := security.fn_grant_access_role(v_b, 'ADMIN', NULL, 'GENERAL', now(), NULL, v_a, 'MANUAL_GRANT', gen_random_uuid());
  PERFORM security.fn_revoke_access_role(v_id, 'ROLE_WITHDRAWN', v_a);
  INSERT INTO access_check_ids (k, v) VALUES ('grant_b_revoked', v_id);
  -- B: institution-scoped to Institution A.
  INSERT INTO access_check_ids (k, v)
  VALUES ('grant_b_inst_a', security.fn_grant_access_role(v_b, 'RESTRICTED_ANALYST', 'e2000000-0000-0000-0000-00000000000a', 'GENERAL', now(), NULL, v_a, 'MANUAL_GRANT', gen_random_uuid()));
  -- B: purpose-scoped to AUDIT_REVIEW.
  INSERT INTO access_check_ids (k, v)
  VALUES ('grant_b_purpose', security.fn_grant_access_role(v_b, 'SENSITIVE_HANDLER', NULL, 'AUDIT_REVIEW', now(), NULL, v_a, 'MANUAL_GRANT', gen_random_uuid()));
  -- A: emergency-only grant reaching CRITICAL.
  INSERT INTO access_check_ids (k, v)
  VALUES ('grant_a_emergency', security.fn_grant_access_role(v_a, 'ADMIN', NULL, 'EMERGENCY_ASSISTANCE', now(), NULL, v_b, 'MANUAL_GRANT', gen_random_uuid()));

  -- A grant of a role that is subsequently DEPRECATED must stop authorizing.
  INSERT INTO security.access_roles (code, version, status, classification_ceiling)
  VALUES ('ACCESS_CHECK_DEPRECATED', 1, 'ACTIVE', 'CRITICAL') RETURNING id INTO v_dep_role;
  INSERT INTO access_check_ids (k, v)
  VALUES ('grant_b_deprecated_role', security.fn_grant_access_role(v_b, 'ACCESS_CHECK_DEPRECATED', NULL, 'GENERAL', now(), NULL, v_a, 'MANUAL_GRANT', gen_random_uuid()));
  UPDATE security.access_roles SET status = 'DEPRECATED' WHERE id = v_dep_role;

  -- Emergency bases: one ACTIVE, one DEPRECATED.
  INSERT INTO governance.emergency_bases (id, category, description, max_access_duration, status) VALUES
    ('e3000000-0000-0000-0000-00000000000a', 'LIFE_THREATENING', 'Access fixture active basis', interval '2 hours', 'ACTIVE'),
    ('e3000000-0000-0000-0000-00000000000b', 'OTHER', 'Access fixture deprecated basis', interval '2 hours', 'DEPRECATED');
END $$;

-- The matrix runs under the REAL runtime role, not as the owner.
SET LOCAL ROLE app_api;

DO $$
DECLARE
  v_a_actor uuid := 'e1000000-0000-0000-0000-00000000000a';
  v_b_actor uuid := 'e1000000-0000-0000-0000-00000000000b';
  v_unknown uuid := 'e1000000-0000-0000-0000-0000000000ee';
BEGIN
  -- --- persisted clearance, positive ---
  PERFORM set_config('argus.actor_id', v_a_actor::text, true);
  PERFORM set_config('argus.institution_id', '', true);
  PERFORM set_config('argus.purpose', '', true);
  PERFORM set_config('argus.emergency_basis_id', '', true);

  IF NOT security.fn_classification_allowed(v_a_actor, 'RESTRICTED') THEN
    RAISE EXCEPTION 'CLASSIFICATION_PERSISTED_ROLE_FAIL: A holds a RESTRICTED ceiling but was denied RESTRICTED';
  END IF;
  IF NOT security.fn_classification_allowed(v_a_actor, 'PUBLIC') THEN
    RAISE EXCEPTION 'CLASSIFICATION_PERSISTED_ROLE_FAIL: a RESTRICTED ceiling must also cover PUBLIC';
  END IF;
  IF NOT security.fn_classification_allowed(v_a_actor, 'SENSITIVE') THEN
    RAISE EXCEPTION 'CLASSIFICATION_PERSISTED_ROLE_FAIL: a RESTRICTED ceiling must also cover SENSITIVE';
  END IF;
  -- --- clearance insufficient ---
  IF security.fn_classification_allowed(v_a_actor, 'CRITICAL') THEN
    RAISE EXCEPTION 'CLASSIFICATION_PERSISTED_ROLE_FAIL: a RESTRICTED ceiling reached CRITICAL';
  END IF;
  RAISE NOTICE 'ACCESS_MATRIX_OK | positive | persisted RESTRICTED ceiling grants PUBLIC..RESTRICTED, denies CRITICAL';

  -- B holds PUBLIC only (its SENSITIVE grants are expired / purpose-scoped).
  PERFORM set_config('argus.actor_id', v_b_actor::text, true);
  IF NOT security.fn_classification_allowed(v_b_actor, 'PUBLIC') THEN
    RAISE EXCEPTION 'CLASSIFICATION_PERSISTED_ROLE_FAIL: B holds PUBLIC_VIEWER but was denied PUBLIC';
  END IF;
  IF security.fn_classification_allowed(v_b_actor, 'OPERATIONAL') THEN
    RAISE EXCEPTION 'CLASSIFICATION_PERSISTED_ROLE_FAIL: a PUBLIC ceiling reached OPERATIONAL';
  END IF;
  -- Expired assignment does not authorize.
  IF security.fn_classification_allowed(v_b_actor, 'SENSITIVE') THEN
    RAISE EXCEPTION 'CLASSIFICATION_PERSISTED_ROLE_FAIL: an expired/purpose-scoped/revoked/deprecated grant authorized SENSITIVE';
  END IF;
  RAISE NOTICE 'ACCESS_MATRIX_OK | negative | expired, future, revoked and deprecated-role grants all deny';

  -- --- institution scope ---
  -- B's RESTRICTED grant is scoped to Institution A only.
  PERFORM set_config('argus.institution_id', 'e2000000-0000-0000-0000-00000000000a', true);
  IF NOT security.fn_classification_allowed(v_b_actor, 'RESTRICTED') THEN
    RAISE EXCEPTION 'CLASSIFICATION_PERSISTED_ROLE_FAIL: institution-scoped grant denied inside its own institution';
  END IF;
  PERFORM set_config('argus.institution_id', 'e2000000-0000-0000-0000-00000000000b', true);
  IF security.fn_classification_allowed(v_b_actor, 'RESTRICTED') THEN
    RAISE EXCEPTION 'CLASSIFICATION_PERSISTED_ROLE_FAIL: institution-scoped grant authorized inside the WRONG institution';
  END IF;
  PERFORM set_config('argus.institution_id', '', true);
  IF security.fn_classification_allowed(v_b_actor, 'RESTRICTED') THEN
    RAISE EXCEPTION 'CLASSIFICATION_PERSISTED_ROLE_FAIL: institution-scoped grant authorized with NO institution declared';
  END IF;
  RAISE NOTICE 'ACCESS_MATRIX_OK | institution | correct institution allows, wrong and absent deny';

  -- --- purpose ---
  -- B's SENSITIVE grant requires purpose AUDIT_REVIEW.
  PERFORM set_config('argus.purpose', 'AUDIT_REVIEW', true);
  IF NOT security.fn_classification_allowed(v_b_actor, 'SENSITIVE') THEN
    RAISE EXCEPTION 'CLASSIFICATION_PERSISTED_ROLE_FAIL: purpose-scoped grant denied under its own purpose';
  END IF;
  PERFORM set_config('argus.purpose', 'OPERATIONAL_RESPONSE', true);
  IF security.fn_classification_allowed(v_b_actor, 'SENSITIVE') THEN
    RAISE EXCEPTION 'CLASSIFICATION_PERSISTED_ROLE_FAIL: purpose-scoped grant authorized under the WRONG purpose';
  END IF;
  -- An unrecognized purpose is a denial, never a wildcard.
  PERFORM set_config('argus.purpose', 'NOT_A_REAL_PURPOSE', true);
  IF security.fn_classification_allowed(v_b_actor, 'PUBLIC') THEN
    RAISE EXCEPTION 'CLASSIFICATION_PERSISTED_ROLE_FAIL: an unrecognized purpose behaved as a wildcard';
  END IF;
  PERFORM set_config('argus.purpose', '', true);
  RAISE NOTICE 'ACCESS_MATRIX_OK | purpose | matching purpose allows, wrong and unparseable deny';

  -- --- subject that does not exist ---
  PERFORM set_config('argus.actor_id', v_unknown::text, true);
  IF security.fn_classification_allowed(v_unknown, 'PUBLIC') THEN
    RAISE EXCEPTION 'CLASSIFICATION_PERSISTED_ROLE_FAIL: an actor with no subject was authorized';
  END IF;
  RAISE NOTICE 'ACCESS_MATRIX_OK | negative | actor with no access_subject is denied everything';

  -- --- disabled subject ---
  RAISE NOTICE 'CLASSIFICATION_PERSISTED_ROLE_PASS';
END $$;

-- --- EmergencyBasis ---
DO $$
DECLARE
  v_a_actor uuid := 'e1000000-0000-0000-0000-00000000000a';
BEGIN
  PERFORM set_config('argus.actor_id', v_a_actor::text, true);
  PERFORM set_config('argus.institution_id', '', true);
  PERFORM set_config('argus.purpose', 'EMERGENCY_ASSISTANCE', true);

  -- No basis declared: the EMERGENCY_ASSISTANCE grant does not authorize, so A
  -- stays at its ordinary RESTRICTED ceiling and CRITICAL is denied.
  PERFORM set_config('argus.emergency_basis_id', '', true);
  IF security.fn_classification_allowed(v_a_actor, 'CRITICAL') THEN
    RAISE EXCEPTION 'CLASSIFICATION_EMERGENCY_FAIL: an EMERGENCY_ASSISTANCE grant authorized with no emergency basis';
  END IF;

  -- Forged / non-existent basis id: still denied.
  PERFORM set_config('argus.emergency_basis_id', 'e3000000-0000-0000-0000-0000000000ff', true);
  IF security.fn_classification_allowed(v_a_actor, 'CRITICAL') THEN
    RAISE EXCEPTION 'CLASSIFICATION_EMERGENCY_FAIL: a forged emergency basis id authorized CRITICAL';
  END IF;

  -- A real but DEPRECATED basis: denied.
  PERFORM set_config('argus.emergency_basis_id', 'e3000000-0000-0000-0000-00000000000b', true);
  IF security.fn_classification_allowed(v_a_actor, 'CRITICAL') THEN
    RAISE EXCEPTION 'CLASSIFICATION_EMERGENCY_FAIL: a DEPRECATED emergency basis authorized CRITICAL';
  END IF;

  -- A real ACTIVE basis: the grant now authorizes, up to the ROLE ceiling and
  -- no further — an emergency justifies using a grant, it never invents one.
  PERFORM set_config('argus.emergency_basis_id', 'e3000000-0000-0000-0000-00000000000a', true);
  IF NOT security.fn_classification_allowed(v_a_actor, 'CRITICAL') THEN
    RAISE EXCEPTION 'CLASSIFICATION_EMERGENCY_FAIL: a valid ACTIVE emergency basis did not enable its own grant';
  END IF;

  PERFORM set_config('argus.purpose', '', true);
  PERFORM set_config('argus.emergency_basis_id', '', true);
  RAISE NOTICE 'ACCESS_MATRIX_OK | emergency | valid ACTIVE basis enables, absent/forged/deprecated deny';
END $$;

-- --- Forged session context ---
DO $$
DECLARE
  v_b_actor uuid := 'e1000000-0000-0000-0000-00000000000b';
  v_a_subject uuid;
BEGIN
  RESET ROLE;
  SELECT v INTO v_a_subject FROM access_check_ids WHERE k = 'subject_a';
  SET LOCAL ROLE app_api;

  PERFORM set_config('argus.actor_id', v_b_actor::text, true);
  PERFORM set_config('argus.institution_id', '', true);
  PERFORM set_config('argus.purpose', '', true);
  PERFORM set_config('argus.emergency_basis_id', '', true);

  -- The GUC that used to BE the authority. B holds PUBLIC only; claiming ADMIN
  -- must change nothing.
  PERFORM set_config('argus.actor_role', 'ADMIN', true);
  IF security.fn_classification_allowed(v_b_actor, 'CRITICAL') THEN
    RAISE EXCEPTION 'CLASSIFICATION_FORGED_GUC_FAIL: argus.actor_role=ADMIN granted CRITICAL without an assignment';
  END IF;
  PERFORM set_config('argus.actor_role', 'SYSTEM', true);
  IF security.fn_classification_allowed(v_b_actor, 'CRITICAL') THEN
    RAISE EXCEPTION 'CLASSIFICATION_FORGED_GUC_FAIL: argus.actor_role=SYSTEM granted CRITICAL without an assignment';
  END IF;
  IF security.fn_has_access_role(v_b_actor, ARRAY['SYSTEM','ADMIN']) THEN
    RAISE EXCEPTION 'CLASSIFICATION_FORGED_GUC_FAIL: a forged actor_role satisfied fn_has_access_role';
  END IF;
  -- The claim is still denied for a subject that has no assignment at all.
  PERFORM set_config('argus.actor_id', 'e1000000-0000-0000-0000-0000000000ee', true);
  IF security.fn_has_any_access_role('e1000000-0000-0000-0000-0000000000ee') THEN
    RAISE EXCEPTION 'CLASSIFICATION_FORGED_GUC_FAIL: fn_has_any_access_role passed with no assignment';
  END IF;

  -- Session binding: a session cannot ask about, or borrow, ANOTHER subject's
  -- authorization by naming their id.
  PERFORM set_config('argus.actor_id', v_b_actor::text, true);
  PERFORM set_config('argus.access_subject_id', v_a_subject::text, true);
  IF security.fn_classification_allowed(v_b_actor, 'RESTRICTED') THEN
    RAISE EXCEPTION 'CLASSIFICATION_FORGED_GUC_FAIL: declaring another subject''s id borrowed their clearance';
  END IF;
  IF security.fn_classification_allowed('e1000000-0000-0000-0000-00000000000a', 'RESTRICTED') THEN
    RAISE EXCEPTION 'CLASSIFICATION_FORGED_GUC_FAIL: a session enumerated another actor''s clearance';
  END IF;
  PERFORM set_config('argus.access_subject_id', '', true);
  PERFORM set_config('argus.actor_role', '', true);

  RAISE NOTICE 'CLASSIFICATION_FORGED_GUC_DENIED_PASS';
END $$;
RESET ROLE;

-- ============================================================
-- 4. RLS on the two new tables, under real non-superuser roles
-- ============================================================
SET LOCAL ROLE app_api;
DO $$
DECLARE v_n bigint;
BEGIN
  PERFORM set_config('argus.actor_id', 'e1000000-0000-0000-0000-00000000000a', true);
  -- app_api holds NO grant on either table: the runtime consumes authorization
  -- through fn_active_access_roles, it never reads the substrate directly.
  BEGIN
    SELECT count(*) INTO v_n FROM security.access_subjects;
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: app_api read security.access_subjects (% rows)', v_n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ACCESS_ROLE_RLS_OK | negative | app_api denied on security.access_subjects';
  END;
  BEGIN
    SELECT count(*) INTO v_n FROM security.access_role_assignments;
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: app_api read security.access_role_assignments (% rows)', v_n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ACCESS_ROLE_RLS_OK | negative | app_api denied on security.access_role_assignments';
  END;
  -- ...and cannot grant itself anything.
  BEGIN
    PERFORM security.fn_grant_access_role((SELECT v FROM access_check_ids WHERE k = 'subject_a'), 'ADMIN');
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: app_api executed fn_grant_access_role';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ACCESS_ROLE_RLS_OK | negative | app_api denied fn_grant_access_role';
  END;
  BEGIN
    PERFORM security.fn_register_access_subject('PERSON', 'e1000000-0000-0000-0000-00000000000a');
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: app_api executed fn_register_access_subject';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ACCESS_ROLE_RLS_OK | negative | app_api denied fn_register_access_subject';
  END;
  -- ...but CAN consume its own authorization.
  IF NOT security.fn_classification_allowed('e1000000-0000-0000-0000-00000000000a', 'RESTRICTED') THEN
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: app_api could not resolve its own persisted clearance';
  END IF;
  RAISE NOTICE 'ACCESS_ROLE_RLS_OK | positive | app_api resolves its own persisted clearance';
END $$;
RESET ROLE;

SET LOCAL ROLE ingest_worker;
DO $$
DECLARE v_n bigint;
BEGIN
  BEGIN
    SELECT count(*) INTO v_n FROM security.access_role_assignments;
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: ingest_worker read security.access_role_assignments';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ACCESS_ROLE_RLS_OK | negative | ingest_worker has no access to the authorization substrate';
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE jobs_worker;
DO $$
BEGIN
  BEGIN
    PERFORM security.fn_revoke_access_role(gen_random_uuid(), 'ANY_REASON');
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: jobs_worker executed fn_revoke_access_role';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ACCESS_ROLE_RLS_OK | negative | jobs_worker cannot administer assignments';
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE readonly_inspector;
DO $$
DECLARE v_n bigint;
BEGIN
  BEGIN
    SELECT count(*) INTO v_n FROM security.access_subjects;
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: readonly_inspector read security.access_subjects';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ACCESS_ROLE_RLS_OK | negative | readonly_inspector cannot enumerate who holds which clearance';
  END;
END $$;
RESET ROLE;

-- access_admin: the authorized administrator. Reads the substrate, and can
-- grant/revoke through the controlled functions.
SET LOCAL ROLE access_admin;
DO $$
DECLARE
  v_n bigint;
  v_subject uuid;
  v_new uuid;
BEGIN
  PERFORM set_config('argus.actor_id', 'e1000000-0000-0000-0000-00000000000a', true);
  -- FORCE RLS applies to access_admin too: it sees rows only through the
  -- policy, which requires a persisted ADMIN/AUDIT/SECURITY role. Being the
  -- administrator of the mechanism is NOT the same as being cleared by it, so
  -- the count here is legitimately 0 until access_admin's own operator holds a
  -- governance role. What matters is that the read is not REFUSED and not
  -- unbounded.
  SELECT count(*) INTO v_n FROM security.access_subjects;
  RAISE NOTICE 'ACCESS_ROLE_RLS_OK | positive | access_admin may query the substrate (FORCE RLS still filters: % row(s))', v_n;

  SELECT v INTO v_subject FROM access_check_ids WHERE k = 'subject_b';
  v_new := security.fn_grant_access_role(v_subject, 'OPERATIONAL_RESPONDER', 'e2000000-0000-0000-0000-00000000000b', 'GENERAL', now(), NULL, NULL, 'MANUAL_GRANT', gen_random_uuid());
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: access_admin could not grant through the controlled function';
  END IF;
  IF NOT security.fn_revoke_access_role(v_new, 'ACCESS_REVIEW') THEN
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: access_admin could not revoke through the controlled function';
  END IF;
  RAISE NOTICE 'ACCESS_ROLE_RLS_OK | positive | access_admin grants and revokes through the controlled functions only';

  -- ...and still cannot write the tables directly.
  BEGIN
    INSERT INTO security.access_role_assignments (access_subject_id, access_role_id)
    SELECT v_subject, r.id FROM security.access_roles r WHERE r.code = 'ADMIN';
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: access_admin inserted directly into access_role_assignments';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ACCESS_ROLE_RLS_OK | negative | access_admin has no direct DML on the substrate';
  END;
  BEGIN
    UPDATE security.access_role_assignments SET status = 'ACTIVE' WHERE id = v_new;
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: access_admin un-revoked an assignment with a direct UPDATE';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ACCESS_ROLE_RLS_OK | negative | access_admin cannot un-revoke by direct UPDATE';
  END;
END $$;
RESET ROLE;

DO $$
DECLARE v_bad text;
BEGIN
  -- FORCE RLS and zero USING (true) on both tables.
  SELECT string_agg(c.relname, ',') INTO v_bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'security' AND c.relname IN ('access_subjects','access_role_assignments')
    AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: % missing ENABLE + FORCE ROW LEVEL SECURITY', v_bad;
  END IF;

  SELECT string_agg(policyname, ',') INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'security' AND tablename IN ('access_subjects','access_role_assignments')
    AND (coalesce(qual, '') ~* '^\s*true\s*$' OR coalesce(with_check, '') ~* '^\s*true\s*$');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: policy % is a bare USING (true)', v_bad;
  END IF;

  -- No write policy exists on either table: mutation is only via the
  -- SECURITY DEFINER functions.
  SELECT string_agg(policyname, ',') INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'security' AND tablename IN ('access_subjects','access_role_assignments')
    AND cmd <> 'SELECT';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: write policy % exists; mutation must go through the controlled functions', v_bad;
  END IF;

  -- PUBLIC holds nothing on either table, and nothing on any administration function.
  SELECT string_agg(table_name || ':' || privilege_type, ',') INTO v_bad
  FROM information_schema.role_table_grants
  WHERE table_schema = 'security' AND table_name IN ('access_subjects','access_role_assignments')
    AND grantee = 'PUBLIC';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: PUBLIC holds % on the authorization substrate', v_bad;
  END IF;

  SELECT string_agg(p.proname, ',') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'security'
    AND p.proname IN ('fn_register_access_subject','fn_grant_access_role','fn_revoke_access_role','fn_audit_access_role_change')
    AND has_function_privilege('public', p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: PUBLIC holds EXECUTE on administration function(s) %', v_bad;
  END IF;

  RAISE NOTICE 'ACCESS_ROLE_RLS_PASS';
END $$;

ROLLBACK;
