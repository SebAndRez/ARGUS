-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 020 — Identity — Validation
-- SELECT-only. Safe to run repeatedly.

-- 1. Table counts
SELECT table_schema, COUNT(*) FROM information_schema.tables
WHERE table_schema IN ('identity','institution','capability') AND table_type = 'BASE TABLE'
GROUP BY table_schema ORDER BY table_schema;
-- Expected: identity=9, institution=4, capability=4.

-- 2. D-01 zero-membership rule: institution.institutional_memberships MUST be
--    empty immediately after this wave's backfill (no synthetic rows created)
SELECT COUNT(*) AS membership_count FROM institution.institutional_memberships;
-- Expected: 0 immediately post-migration (before any human declares real
-- membership) — a nonzero count here right after migration indicates D-01
-- was violated by an over-eager backfill script.

-- 3. D-01 derivation query — confirm every migrated person is correctly
--    classified UNASSIGNED (this is the actual application-layer derivation,
--    restated here as a read-only check, not a stored column)
SELECT p.id, p.legal_name,
  NOT EXISTS (
    SELECT 1 FROM institution.institutional_memberships im
    WHERE im.person_id = p.id AND im.effective_to IS NULL
  ) AS is_unassigned
FROM identity.people p
WHERE p.legacy_source = 'User';
-- Expected: is_unassigned = true for all 7 migrated rows, immediately post-migration.

-- 4. Deferred FKs from Wave 010 now resolved
SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint
WHERE conname IN ('fk_jurisdictions_declaring_organization','fk_rrr_institution',
                  'fk_audit_logs_device','fk_audit_logs_operational_session');
-- Expected: 4 rows.

-- 5. RLS coverage for this wave's 17 tables
SELECT n.nspname, c.relname, c.relrowsecurity, COUNT(p.polname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname IN ('identity','institution','capability') AND c.relkind = 'r'
GROUP BY n.nspname, c.relname, c.relrowsecurity
HAVING c.relrowsecurity = false OR COUNT(p.polname) = 0;
-- Expected: 0 rows (every table in this wave is OPERATIONAL+ per Access
-- Control v1.1 §4.1-4.3 — none is exempted in §7).

-- 6. Legacy provenance columns present on backfilled tables (D-02)
SELECT table_name FROM information_schema.columns
WHERE table_schema = 'identity' AND column_name = 'legacy_record_id'
  AND table_name IN ('people','user_accounts','verified_identities','reputation_events','consents');
-- Expected: 5 rows.

-- ============================================================
-- 7. security.access_subjects / security.access_role_assignments — BLOCKING
-- ============================================================
-- Everything below RAISES on violation, so a broken authorization substrate
-- cannot report green. Markers: ACCESS_SUBJECT_INTEGRITY_PASS,
-- ACCESS_ROLE_ASSIGNMENT_PASS, ACCESS_ROLE_RLS_PASS.
--
-- Each block is a no-op with an explicit SKIPPED notice before the wave has
-- applied, because Invoke-Wave.ps1 runs this file once as a pre-migration smoke
-- check (see its header).

-- 7.1 Structure and integrity constraints of access_subjects.
DO $$
DECLARE
  v_missing text;
BEGIN
  IF to_regclass('security.access_subjects') IS NULL THEN
    RAISE NOTICE 'ACCESS_SUBJECT_VALIDATION_SKIPPED (pre-migration)';
    RETURN;
  END IF;

  -- The three identity references are REAL foreign keys, not polymorphic uuids.
  SELECT string_agg(expected, ',') INTO v_missing
  FROM (VALUES
    ('fk_access_subjects_person'),
    ('fk_access_subjects_organization'),
    ('fk_access_subjects_automation_rule')
  ) t(expected)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = t.expected AND contype = 'f' AND conrelid = 'security.access_subjects'::regclass
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_SUBJECT_INTEGRITY_FAIL: missing foreign key(s) % - a polymorphic uuid without referential integrity is exactly what this design forbids', v_missing;
  END IF;

  SELECT string_agg(expected, ',') INTO v_missing
  FROM (VALUES
    ('ck_access_subjects_exactly_one_identity'),
    ('ck_access_subjects_type_matches_identity'),
    ('ck_access_subjects_no_anonymous'),
    ('ck_access_subjects_system_key_shape'),
    ('ck_access_subjects_disabled_consistency')
  ) t(expected)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = t.expected AND contype = 'c' AND conrelid = 'security.access_subjects'::regclass
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_SUBJECT_INTEGRITY_FAIL: missing CHECK constraint(s) %', v_missing;
  END IF;

  -- At most one ACTIVE subject per identity, per identity kind.
  SELECT string_agg(expected, ',') INTO v_missing
  FROM (VALUES
    ('uq_access_subjects_active_person'),
    ('uq_access_subjects_active_organization'),
    ('uq_access_subjects_active_automation_rule'),
    ('uq_access_subjects_active_system_key')
  ) t(expected)
  WHERE NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'security' AND indexname = t.expected);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_SUBJECT_INTEGRITY_FAIL: missing partial unique index(es) %', v_missing;
  END IF;

  -- No PII duplicated into the authorization substrate.
  SELECT string_agg(column_name, ',') INTO v_missing
  FROM information_schema.columns
  WHERE table_schema = 'security' AND table_name = 'access_subjects'
    AND column_name ~* '(email|phone|legal_name|display_alias|national_id|address|birth)';
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_SUBJECT_INTEGRITY_FAIL: personal-data column(s) % must not be duplicated here', v_missing;
  END IF;

  -- No ANONYMOUS row can exist, now or ever.
  IF EXISTS (SELECT 1 FROM security.access_subjects WHERE subject_type = 'ANONYMOUS') THEN
    RAISE EXCEPTION 'ACCESS_SUBJECT_INTEGRITY_FAIL: an ANONYMOUS subject is persisted';
  END IF;

  RAISE NOTICE 'ACCESS_SUBJECT_INTEGRITY_PASS';
END $$;

-- 7.2 Structure and invariants of access_role_assignments.
DO $$
DECLARE v_missing text;
BEGIN
  IF to_regclass('security.access_role_assignments') IS NULL THEN
    RAISE NOTICE 'ACCESS_ROLE_ASSIGNMENT_VALIDATION_SKIPPED (pre-migration)';
    RETURN;
  END IF;

  SELECT string_agg(expected, ',') INTO v_missing
  FROM (VALUES
    ('fk_access_role_assignments_subject'),
    ('fk_access_role_assignments_role'),
    ('fk_access_role_assignments_institution'),
    ('fk_access_role_assignments_granted_by'),
    ('fk_access_role_assignments_revoked_by')
  ) t(expected)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = t.expected AND contype = 'f' AND conrelid = 'security.access_role_assignments'::regclass
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: missing foreign key(s) %', v_missing;
  END IF;

  -- The role is a real FK, never a free-text role name.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'security' AND table_name = 'access_role_assignments'
      AND column_name IN ('role','role_name','role_code','access_role_name')
  ) THEN
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: a free-text role column exists; the role must reference security.access_roles';
  END IF;

  -- R31 is not modelled anywhere, so no jurisdiction column may be invented here.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'security' AND table_name = 'access_role_assignments'
      AND column_name ~* 'jurisdiction'
  ) THEN
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: a jurisdiction column was introduced while R31 remains unmodelled';
  END IF;

  SELECT string_agg(expected, ',') INTO v_missing
  FROM (VALUES
    ('ck_access_role_assignments_validity_window'),
    ('ck_access_role_assignments_revocation_consistency'),
    ('ck_access_role_assignments_no_self_grant'),
    ('ck_access_role_assignments_source_shape')
  ) t(expected)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = t.expected AND contype = 'c' AND conrelid = 'security.access_role_assignments'::regclass
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: missing CHECK constraint(s) %', v_missing;
  END IF;

  -- Idempotency and no-silent-overlap are physical, not conventional.
  SELECT string_agg(expected, ',') INTO v_missing
  FROM (VALUES
    ('uq_access_role_assignments_idempotency'),
    ('uq_access_role_assignments_active_scoped'),
    ('uq_access_role_assignments_active_global')
  ) t(expected)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'security' AND indexname = t.expected
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = t.expected AND conrelid = 'security.access_role_assignments'::regclass
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: missing unique index/constraint(s) %', v_missing;
  END IF;

  -- No row may be REVOKED without who/when/why, or carry those while not revoked.
  IF EXISTS (
    SELECT 1 FROM security.access_role_assignments
    WHERE (status = 'REVOKED' AND (revoked_at IS NULL OR revocation_reason_code IS NULL))
       OR (status <> 'REVOKED' AND (revoked_at IS NOT NULL OR revocation_reason_code IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: revocation bookkeeping is inconsistent with status';
  END IF;

  -- security.access_roles must carry the persisted ceiling clearance resolves against.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'security' AND table_name = 'access_roles' AND column_name = 'classification_ceiling'
  ) THEN
    RAISE EXCEPTION 'ACCESS_ROLE_ASSIGNMENT_FAIL: security.access_roles has no classification_ceiling; clearance would have nowhere to come from';
  END IF;

  RAISE NOTICE 'ACCESS_ROLE_ASSIGNMENT_PASS';
END $$;

-- 7.3 RLS/privilege posture, and the removal of the session GUC as authority.
DO $$
DECLARE v_bad text;
BEGIN
  IF to_regclass('security.access_role_assignments') IS NULL THEN
    RAISE NOTICE 'ACCESS_ROLE_RLS_VALIDATION_SKIPPED (pre-migration)';
    RETURN;
  END IF;

  -- ENABLE + FORCE on both.
  SELECT string_agg(c.relname, ',') INTO v_bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'security' AND c.relname IN ('access_subjects','access_role_assignments')
    AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: % missing ENABLE + FORCE ROW LEVEL SECURITY', v_bad;
  END IF;

  -- Zero bare USING (true), and zero write policies (mutation goes through the
  -- controlled SECURITY DEFINER functions only).
  SELECT string_agg(policyname, ',') INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'security' AND tablename IN ('access_subjects','access_role_assignments')
    AND (coalesce(qual, '') ~* '^\s*true\s*$' OR coalesce(with_check, '') ~* '^\s*true\s*$' OR cmd <> 'SELECT');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: policy % is a bare USING (true) or a write policy', v_bad;
  END IF;

  -- No runtime role holds ANY grant on the substrate; PUBLIC holds nothing.
  SELECT string_agg(DISTINCT grantee || ':' || table_name || ':' || privilege_type, ',') INTO v_bad
  FROM information_schema.role_table_grants
  WHERE table_schema = 'security' AND table_name IN ('access_subjects','access_role_assignments')
    AND grantee IN ('PUBLIC','app_api','ingest_worker','jobs_worker','readonly_inspector');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: unexpected grant(s) on the authorization substrate: %', v_bad;
  END IF;

  -- Administration is executable ONLY by access_admin, never by PUBLIC or a
  -- runtime role.
  SELECT string_agg(r.rolname || ':' || p.proname, ',') INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN (SELECT rolname FROM pg_roles WHERE rolname IN ('app_api','ingest_worker','jobs_worker','readonly_inspector','audit_reader')) r
  WHERE n.nspname = 'security'
    AND p.proname IN ('fn_register_access_subject','fn_grant_access_role','fn_revoke_access_role','fn_audit_access_role_change')
    AND has_function_privilege(r.rolname, p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: non-admin role(s) hold EXECUTE on administration function(s): %', v_bad;
  END IF;

  SELECT string_agg(p.proname, ',') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'security'
    AND p.proname IN ('fn_register_access_subject','fn_grant_access_role','fn_revoke_access_role','fn_audit_access_role_change')
    AND has_function_privilege('public', p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: PUBLIC holds EXECUTE on administration function(s): %', v_bad;
  END IF;

  IF NOT has_function_privilege('access_admin', 'security.fn_grant_access_role(uuid,varchar,uuid,security.access_purpose_enum,timestamptz,timestamptz,uuid,varchar,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: access_admin cannot execute the authorized grant function';
  END IF;

  -- THE regression this whole wave exists to prevent: no RLS policy anywhere
  -- may read the session role GUC as an authority again.
  SELECT string_agg(schemaname || '.' || tablename || '.' || policyname, ',') INTO v_bad
  FROM pg_policies
  WHERE coalesce(qual, '') LIKE '%argus.actor_role%' OR coalesce(with_check, '') LIKE '%argus.actor_role%';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: policy/policies % still read argus.actor_role as an authority', v_bad;
  END IF;

  -- ...and neither may fn_classification_allowed.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'security' AND p.proname IN ('fn_classification_allowed','fn_active_access_roles','fn_resolve_access_subject')
      AND p.prosrc LIKE '%argus.actor_role%'
  ) THEN
    RAISE EXCEPTION 'ACCESS_ROLE_RLS_FAIL: an authorization function still reads argus.actor_role';
  END IF;

  RAISE NOTICE 'ACCESS_ROLE_RLS_PASS';
END $$;
