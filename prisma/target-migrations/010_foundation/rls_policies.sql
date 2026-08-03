-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- RLS policy templates — concrete, reusable patterns for the 8 access
-- dimensions named in the mandate (ownership, institution-scoped,
-- jurisdiction-scoped, incident-scoped, mission-scoped, assignment-scoped,
-- accepted-collaboration, EmergencyBasis) plus the governance/security
-- tables created in THIS wave. Later waves' migration.sql files apply the
-- same named function calls to their own tables — this file is the single
-- place the 6 SECURITY DEFINER dimension functions are defined, so no later
-- wave re-defines them differently.
--
-- Authority: ARGUS_PHYSICAL_ACCESS_CONTROL_v1.1_FROZEN.md (principle §1,
-- threshold §2, six dimensions §3, matrix §4, bridge tables §5, two-phase
-- pattern §6, exemptions §7, HelpRequest closure §8, materialized views §9).
--
-- Global rule restated (§1): ENABLE ROW LEVEL SECURITY + FORCE ROW LEVEL
-- SECURITY on every OPERATIONAL+ table, NEVER a bare USING (true) fallback
-- policy on a sensitive table. Where a table is genuinely PUBLIC
-- (geo.administrative_areas, the governance catalogs in Access Control v1.1
-- §7, proj.public_map_feed), that is achieved by NOT enabling RLS at all and
-- relying on GRANT-only protection (write restricted to migration_owner/a
-- governance-admin role) — never by an RLS policy that reads USING (true).

-- ============================================================
-- 0. Six SECURITY DEFINER dimension functions (Access Control v1.1 §3)
-- ============================================================
-- Defined once, here, in the first wave whose tables need them. Every later
-- wave's rls_policies-equivalent (embedded inline in that wave's
-- migration.sql comments, since only 010_foundation carries a dedicated
-- rls_policies.sql per the mandate) calls these same six functions by name.

-- STUB in this wave, deliberately: a real body cannot be defined here — it
-- must dispatch to identity.*/institution.*/help.*/incident.* tables that
-- do not exist yet at wave 010 time (confirmed empirically: `CREATE
-- FUNCTION ... LANGUAGE sql` DOES validate table references against the
-- catalog at creation time in this Postgres version, unlike `plpgsql`'s
-- fully-deferred validation — a `CREATE OR REPLACE` referencing
-- `identity.people` here fails wave 010 outright with
-- "relation does not exist"). The REAL implementation (corrective
-- session) is defined via a second `CREATE OR REPLACE FUNCTION` in
-- `050_help_mission/migration.sql`, once every table it dispatches on
-- (identity/institution from wave 020, incident.* from wave 040,
-- help.help_requests from this same wave 050) already exists — see that
-- wave's own copy for the real body and its documentation.
CREATE OR REPLACE FUNCTION security.fn_is_owner(p_actor_id uuid, p_target_table text, p_target_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT false;
$$;

CREATE OR REPLACE FUNCTION security.fn_has_active_membership(p_actor_id uuid, p_organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  -- Real body (once institution.institutional_memberships exists, Wave 020):
  -- SELECT EXISTS (
  --   SELECT 1 FROM institution.institutional_memberships
  --   WHERE person_id = p_actor_id AND organization_id = p_organization_id
  --     AND status = 'ACTIVE'
  -- );
  SELECT false;
$$;

CREATE OR REPLACE FUNCTION security.fn_has_active_assignment(p_actor_id uuid, p_mission_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  -- Real body (once mission.mission_assignments exists, Wave 050):
  -- SELECT EXISTS (
  --   SELECT 1 FROM mission.mission_assignments
  --   WHERE mission_id = p_mission_id AND assignee_id = p_actor_id
  --     AND status = 'ACTIVE'
  -- );
  SELECT false;
$$;

-- STUB in this wave, deliberately: same reason as fn_is_owner above — a
-- real body would reference command.command_roles/incident_command_structures,
-- which do not exist until Wave 040, and `CREATE FUNCTION ... LANGUAGE sql`
-- validates table references at creation time. The REAL implementation
-- (corrective session) is defined via a second `CREATE OR REPLACE FUNCTION`
-- at the end of `040_incident/migration.sql`, once those tables (and
-- institution.institutional_memberships, from wave 020) exist — see that
-- wave's own copy for the real body and its documentation.
CREATE OR REPLACE FUNCTION security.fn_has_command_role(p_actor_id uuid, p_incident_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT false;
$$;

CREATE OR REPLACE FUNCTION security.fn_has_accepted_collaboration(p_actor_id uuid, p_help_request_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  -- Real body (once help.collaboration_invitations exists, Wave 050):
  -- SELECT EXISTS (
  --   SELECT 1 FROM help.collaboration_invitations
  --   WHERE help_request_id = p_help_request_id AND invited_person_id = p_actor_id
  --     AND status = 'ACCEPTED'
  -- );
  SELECT false;
$$;

-- ------------------------------------------------------------
-- Persisted-clearance resolution (this session)
-- ------------------------------------------------------------
-- The previous body resolved clearance from the `argus.actor_role` session
-- GUC. That was a real authorization defect, not a stylistic one: a GUC is
-- set by whoever holds the connection, so any principal able to run
-- `SET argus.actor_role = 'ADMIN'` granted itself CRITICAL clearance. There
-- was no physical actor->AccessRole relationship to consult, which is the
-- gap now closed by security.access_subjects and
-- security.access_role_assignments (Wave 020).
--
-- `argus.*` GUCs keep their job — TRANSPORTING request context (which subject,
-- which institution, which purpose, which emergency basis). They are no
-- longer an authority: every one of them is now a LOOKUP KEY whose claim must
-- be matched by a persisted row, and `argus.actor_role` is not read by this
-- function at all.
--
-- Resolution order, all of it fail-closed:
--   session context -> access_subjects -> access_role_assignments
--   -> access_roles -> classification_ceiling
--
-- Deliberately LANGUAGE plpgsql, not sql: a `LANGUAGE sql` body is validated
-- against the catalog at CREATE time (empirically confirmed in this Postgres
-- version — see the stub comments above), so it could not reference the Wave
-- 020 tables from Wave 010. plpgsql defers that resolution to call time,
-- which lets the single real definition live here, next to every policy that
-- calls it, instead of being a stub here plus a silent CREATE OR REPLACE
-- somewhere later. The `to_regclass IS NULL` guard below is what makes that
-- safe: between Wave 010 and Wave 020 the function exists and returns false
-- for everything above PUBLIC rather than raising.

-- Resolves the canonical authorization identity for an actor id. The same
-- uuid space the existing policies already pass (`argus.actor_id`) is
-- matched against whichever identity column the subject actually points at,
-- so no policy signature changes. `argus.access_subject_id`, when present,
-- takes precedence and is validated the same way — it is a shortcut, never a
-- bypass.
CREATE OR REPLACE FUNCTION security.fn_resolve_access_subject(p_actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, security
AS $$
DECLARE
  v_declared text;
  v_subject_id uuid;
BEGIN
  IF to_regclass('security.access_subjects') IS NULL THEN
    RETURN NULL;   -- Wave 020 not applied yet: nothing can be authorized
  END IF;

  v_declared := current_setting('argus.access_subject_id', true);
  IF v_declared IS NOT NULL AND v_declared <> '' THEN
    BEGIN
      v_subject_id := v_declared::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN NULL;   -- malformed context is never "close enough"
    END;
    -- The declared subject must exist, be ACTIVE, and — when an actor id is
    -- also supplied — actually BE that actor. A session cannot name someone
    -- else's subject.
    SELECT s.id INTO v_subject_id
    FROM security.access_subjects s
    WHERE s.id = v_subject_id
      AND s.status = 'ACTIVE'
      AND s.subject_type <> 'ANONYMOUS'
      AND (
        p_actor_id IS NULL
        OR s.person_id = p_actor_id
        OR s.organization_id = p_actor_id
        OR s.automation_rule_id = p_actor_id
        -- A SYSTEM subject has no person/organization/automation_rule id to
        -- match on (its identity is a controlled system_key), so for machine
        -- identities the subject's OWN id is its actor id. Matching on s.id is
        -- not a bypass: it still has to be an ACTIVE, non-ANONYMOUS row.
        OR s.id = p_actor_id
      );
    RETURN v_subject_id;
  END IF;

  IF p_actor_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.id INTO v_subject_id
  FROM security.access_subjects s
  WHERE s.status = 'ACTIVE'
    AND s.subject_type <> 'ANONYMOUS'
    AND (s.person_id = p_actor_id OR s.organization_id = p_actor_id
         OR s.automation_rule_id = p_actor_id OR s.id = p_actor_id);
  RETURN v_subject_id;
END
$$;

-- THE single place where "is this actor currently authorized, and how far"
-- is decided. Every other authorization helper below is a thin projection of
-- this one, so there is exactly one implementation of validity, institution
-- scope, purpose matching and emergency justification to review or get wrong.
--
-- Returns one row per access role that is authorizing RIGHT NOW for this
-- actor in this session context. An empty result means "no authorization",
-- which is the outcome for every failure mode: no subject, disabled subject,
-- ANONYMOUS, no assignment, future assignment, expired assignment, revoked or
-- suspended assignment, disabled/not-yet-effective role, wrong institution,
-- incompatible purpose, missing or inactive emergency basis, malformed
-- context.
CREATE OR REPLACE FUNCTION security.fn_active_access_roles(p_actor_id uuid)
RETURNS TABLE (access_role_id uuid, code text, classification_ceiling security.information_classification_enum)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, security
AS $$
DECLARE
  v_subject_id   uuid;
  v_institution  uuid;
  v_purpose      security.access_purpose_enum;
  v_purpose_text text;
  v_basis_text   text;
  v_basis_id     uuid;
  v_basis_active boolean := false;
BEGIN
  IF to_regclass('security.access_role_assignments') IS NULL THEN
    RETURN;   -- Wave 020 not applied: no persisted authorization exists yet
  END IF;

  -- SESSION BINDING. This function is SECURITY DEFINER and readable by
  -- PUBLIC (RLS policy expressions are evaluated as the querying role, so
  -- the policies below could not call it otherwise), which without this check
  -- would let any role enumerate ANOTHER subject's access roles by passing
  -- their actor id. It answers only about the actor the session itself
  -- declares — which is exactly what every policy in this package passes.
  IF coalesce(current_setting('argus.actor_id', true), '') = '' THEN
    RETURN;
  END IF;
  BEGIN
    IF p_actor_id IS DISTINCT FROM current_setting('argus.actor_id', true)::uuid THEN
      RETURN;
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN;
  END;

  v_subject_id := security.fn_resolve_access_subject(p_actor_id);
  IF v_subject_id IS NULL THEN
    RETURN;   -- unknown / disabled / ANONYMOUS subject authorizes nothing
  END IF;

  -- Institution scope. A NULL institution_id on the assignment is a global
  -- grant; a non-NULL one authorizes only inside that institution, and the
  -- session must declare which institution it is acting in.
  BEGIN
    IF coalesce(current_setting('argus.institution_id', true), '') <> '' THEN
      v_institution := current_setting('argus.institution_id', true)::uuid;
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN;   -- malformed context is a denial, never a wildcard
  END;

  -- Purpose. GENERAL grants carry no purpose restriction; any other value
  -- must be declared by the session, exactly.
  v_purpose_text := coalesce(current_setting('argus.purpose', true), '');
  IF v_purpose_text <> '' THEN
    BEGIN
      v_purpose := v_purpose_text::security.access_purpose_enum;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN;
    END;
  END IF;

  -- EmergencyBasis. Only relevant to assignments granted FOR
  -- EMERGENCY_ASSISTANCE: those authorize nothing unless the session names a
  -- real, ACTIVE governance.emergency_bases row. It never RAISES a ceiling —
  -- an emergency justifies USING a grant, it does not manufacture clearance,
  -- so the worst an attacker gains by forging a basis id is nothing.
  v_basis_text := coalesce(current_setting('argus.emergency_basis_id', true), '');
  IF v_basis_text <> '' THEN
    BEGIN
      v_basis_id := v_basis_text::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_basis_id := NULL;
    END;
    IF v_basis_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM governance.emergency_bases eb
        WHERE eb.id = v_basis_id AND eb.status = 'ACTIVE'
      ) INTO v_basis_active;
    END IF;
  END IF;

  RETURN QUERY
  SELECT r.id, r.code::text, r.classification_ceiling
  FROM security.access_role_assignments a
  JOIN security.access_roles r ON r.id = a.access_role_id
  WHERE a.access_subject_id = v_subject_id
    AND a.status = 'ACTIVE'
    AND a.valid_from <= now()
    AND (a.valid_until IS NULL OR a.valid_until > now())
    AND r.status = 'ACTIVE'
    AND r.effective_from <= now()
    AND (a.institution_id IS NULL OR a.institution_id = v_institution)
    AND (a.purpose = 'GENERAL' OR a.purpose = v_purpose)
    AND (a.purpose <> 'EMERGENCY_ASSISTANCE' OR v_basis_active);
END
$$;

-- Does this actor currently hold ANY of the named access roles? Replaces every
-- role-name-equality clause this package used to write against the session
-- GUC (`... IN ('OPERATIONAL','ADMIN')`).
-- The role CODE is still the vocabulary the policies speak — what changed is
-- that the claim is now matched against security.access_role_assignments
-- instead of being asserted by the session itself.
CREATE OR REPLACE FUNCTION security.fn_has_access_role(p_actor_id uuid, p_role_codes text[])
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, security
AS $$
  SELECT p_role_codes IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM security.fn_active_access_roles(p_actor_id) ar
       WHERE ar.code = ANY (p_role_codes)
     );
$$;

-- Does this actor hold any authorizing access role at all? Replaces the
-- former `<session role GUC> IS NOT NULL` clause, which asserted nothing more
-- than "the session set a string".
CREATE OR REPLACE FUNCTION security.fn_has_any_access_role(p_actor_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, security
AS $$
  SELECT EXISTS (SELECT 1 FROM security.fn_active_access_roles(p_actor_id));
$$;

CREATE OR REPLACE FUNCTION security.fn_classification_allowed(p_actor_id uuid, p_classification security.information_classification_enum)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, security
AS $$
  -- Enum comparison follows declaration order
  -- (PUBLIC < OPERATIONAL < SENSITIVE < RESTRICTED < CRITICAL), so `<=` IS
  -- the ceiling check — no separate rank table to keep in sync.
  SELECT p_classification IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM security.fn_active_access_roles(p_actor_id) ar
       WHERE p_classification <= ar.classification_ceiling
     );
$$;

CREATE OR REPLACE FUNCTION security.fn_has_emergency_access(p_actor_id uuid, p_emergency_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  -- Real body (once ice.emergency_accesses exists, Wave 090):
  -- SELECT EXISTS (
  --   SELECT 1 FROM ice.emergency_accesses
  --   WHERE emergency_profile_id = p_emergency_profile_id AND actor_id = p_actor_id
  --     AND revoked_at IS NULL AND expires_at > now()
  -- );
  SELECT false;
$$;

-- No role gets EXECUTE on these 7 functions here — RLS policies invoke
-- SECURITY DEFINER functions implicitly as part of policy evaluation, which
-- does not require the connecting role to hold EXECUTE separately (functions
-- used only inside USING/WITH CHECK clauses run under the policy evaluation
-- context). If any of these functions is ever called directly (not via a
-- policy), grant EXECUTE narrowly at that time — never PUBLIC.

-- ============================================================
-- 1. Ownership-scoped template
-- ============================================================
-- Applies to any table with a direct owning-actor column (e.g.
-- identity.people.id itself, help.help_requests.requester_person_id,
-- identity.emergency_contacts.person_id).
--
-- CREATE POLICY <table>_owner ON <schema>.<table>
--   FOR ALL
--   USING ( security.fn_is_owner(current_setting('argus.actor_id')::uuid, '<table>', <owning_column>) )
--   WITH CHECK ( security.fn_is_owner(current_setting('argus.actor_id')::uuid, '<table>', <owning_column>) );
--
-- `current_setting('argus.actor_id')` is the session-local GUC the
-- application sets once per request/connection (SET LOCAL argus.actor_id = ...)
-- after authenticating the actor — never trusted from an application-supplied
-- column, always set server-side by app_api after its own auth check.

-- ============================================================
-- 2. Institution-scoped template
-- ============================================================
-- CREATE POLICY <table>_institution ON <schema>.<table>
--   FOR SELECT
--   USING ( security.fn_has_active_membership(current_setting('argus.actor_id')::uuid, <organization_id_column>) );

-- ============================================================
-- 3. Jurisdiction-scoped template
-- ============================================================
-- Jurisdiction resolution is never a direct column comparison — it is always
-- via governance.jurisdiction_scopes(scoped_table=<table>, scoped_id=<row id>)
-- joined to governance.jurisdictions, then to the actor's own jurisdiction
-- membership (resolved via their organization's jurisdiction_scopes row).
-- CREATE POLICY <table>_jurisdiction ON <schema>.<table>
--   FOR SELECT
--   USING ( EXISTS (
--     SELECT 1 FROM governance.jurisdiction_scopes js
--     WHERE js.scoped_table = '<table>' AND js.scoped_id = <table>.id
--       AND EXISTS (
--         SELECT 1 FROM governance.jurisdiction_scopes actor_js
--         JOIN institution.institutional_memberships im
--           ON im.organization_id = actor_js.scoped_id AND actor_js.scoped_table = 'organizations'
--         WHERE im.person_id = current_setting('argus.actor_id')::uuid
--           AND im.status = 'ACTIVE' AND actor_js.jurisdiction_id = js.jurisdiction_id
--       )
--   ) );

-- ============================================================
-- 4. Incident-scoped template
-- ============================================================
-- CREATE POLICY <table>_incident ON <schema>.<table>
--   FOR ALL
--   USING ( security.fn_has_command_role(current_setting('argus.actor_id')::uuid, <incident_id_column>) );

-- ============================================================
-- 5. Mission-scoped template
-- ============================================================
-- CREATE POLICY <table>_mission ON <schema>.<table>
--   FOR ALL
--   USING ( security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, <mission_id_column>) );

-- ============================================================
-- 6. Assignment-scoped template (specialization of mission-scoped, direct FK)
-- ============================================================
-- CREATE POLICY <table>_assignment ON <schema>.<table>
--   FOR ALL
--   USING ( assignee_id = current_setting('argus.actor_id')::uuid
--           OR security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, mission_id) );

-- ============================================================
-- 7. Accepted-collaboration template (two-phase pattern, Access Control v1.1 §6)
-- ============================================================
-- Phase 1 (proximity/offer visible, before acceptance):
-- CREATE POLICY <table>_offered ON <schema>.<table>
--   FOR SELECT
--   USING ( fn_has_offered_invitation(current_setting('argus.actor_id')::uuid, id) );
-- Phase 2 (after acceptance, full access):
-- CREATE POLICY <table>_accepted ON <schema>.<table>
--   FOR ALL
--   USING ( security.fn_has_accepted_collaboration(current_setting('argus.actor_id')::uuid, id)
--           AND security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, mission_id) );
-- Never "distance alone" — proximity without an accepted invitation and an
-- active assignment is never sufficient (Access Control v1.1 §6).

-- ============================================================
-- 8. EmergencyBasis template (ice.* tables, Access Control v1.1 §4.14)
-- ============================================================
-- CREATE POLICY <table>_emergency_basis ON ice.<table>
--   FOR SELECT
--   USING (
--     security.fn_is_owner(current_setting('argus.actor_id')::uuid, '<table>', person_id)
--     OR (security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, <mission_id>) AND current_setting('argus.access_purpose', true) IS NOT NULL)
--     OR security.fn_has_emergency_access(current_setting('argus.actor_id')::uuid, id)
--   );
-- `argus.access_purpose` is a second session-local GUC the application must
-- set explicitly before any medical-personnel read of ICE data ("purpose
-- declared" condition in Access Control v1.1 §4.14) — its absence denies
-- access even for an otherwise-qualifying active mission assignment.

-- ============================================================
-- 9. THIS wave's own tables — governance/security
-- ============================================================
-- governance.* PUBLIC/OPERATIONAL catalogs (Access Control v1.1 §7): RLS is
-- NOT enabled on territorial_configurations, operational_rules,
-- automation_rules, automation_rule_incident_types, policies,
-- doctrine_versions, feature_flags, incident_types, incident_categories,
-- hazard_types, administrative_area_kinds, jurisdictions — protected by
-- GRANT only (read: app_api/ingest_worker/jobs_worker/readonly_inspector;
-- write: migration_owner only, see 010_foundation/migration.sql §5).

-- governance.emergency_bases: RESTRICTED, actor_role IN ('ADMIN','AUDIT').
ALTER TABLE governance.emergency_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.emergency_bases FORCE ROW LEVEL SECURITY;
CREATE POLICY emergency_bases_admin_audit ON governance.emergency_bases
  FOR ALL
  USING ( security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['ADMIN','AUDIT']) );

-- governance.resource_reservation_rules: OPERATIONAL, read open, write ADMIN.
ALTER TABLE governance.resource_reservation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.resource_reservation_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY rrr_read_authenticated ON governance.resource_reservation_rules
  FOR SELECT
  USING ( security.fn_has_any_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid) );
CREATE POLICY rrr_write_admin ON governance.resource_reservation_rules
  FOR INSERT WITH CHECK ( security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['ADMIN']) );
CREATE POLICY rrr_update_admin ON governance.resource_reservation_rules
  FOR UPDATE USING ( security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['ADMIN']) );

-- governance.jurisdiction_scopes: OPERATIONAL, open read, write restricted to
-- the service that owns the referenced entity (Access Control v1.1 §5 —
-- bridge table, prevents bypass). Application-layer enforcement of "which
-- service" is required in addition to this policy (flagged
-- SQL_COMPLEMENTARY_REQUIRED — RLS alone cannot know "which microservice/
-- code path" issued the write, only which DB role did).
ALTER TABLE governance.jurisdiction_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.jurisdiction_scopes FORCE ROW LEVEL SECURITY;
CREATE POLICY jurisdiction_scopes_read_open ON governance.jurisdiction_scopes
  FOR SELECT USING ( security.fn_has_any_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid) );
CREATE POLICY jurisdiction_scopes_write_owning_service ON governance.jurisdiction_scopes
  FOR INSERT WITH CHECK ( security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['ADMIN','SYSTEM']) );

-- security.access_policies / permissions / access_roles / access_role_permissions:
-- RESTRICTED, actor_role IN ('AUDIT','ADMIN').
ALTER TABLE security.access_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.access_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY access_policies_audit ON security.access_policies
  FOR ALL USING ( security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['AUDIT']) );

ALTER TABLE security.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY permissions_audit_admin ON security.permissions
  FOR ALL USING ( security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['AUDIT','ADMIN']) );

ALTER TABLE security.access_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.access_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY access_roles_audit_admin ON security.access_roles
  FOR ALL USING ( security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['AUDIT','ADMIN']) );

ALTER TABLE security.access_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.access_role_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY access_role_permissions_audit_admin ON security.access_role_permissions
  FOR ALL USING ( security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['AUDIT','ADMIN']) );

-- security.contextual_accesses: bridge table (Access Control v1.1 §5) — actor
-- sees own grants; AUDIT sees all.
ALTER TABLE security.contextual_accesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.contextual_accesses FORCE ROW LEVEL SECURITY;
CREATE POLICY contextual_accesses_own_or_audit ON security.contextual_accesses
  FOR SELECT
  USING ( actor_id = current_setting('argus.actor_id')::uuid
          OR security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['AUDIT']) );

-- security.access_decisions: same as audit_logs, AUDIT exclusive.
ALTER TABLE security.access_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.access_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY access_decisions_audit_only ON security.access_decisions
  FOR ALL USING ( security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['AUDIT']) );

-- security.audit_logs: CRITICAL, actor_role='AUDIT' exclusively, not delegable.
ALTER TABLE security.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_audit_only ON security.audit_logs
  FOR SELECT USING ( security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['AUDIT']) );
-- No UPDATE/DELETE policy at all (append-only, D-03) — combined with the
-- explicit REVOKE UPDATE, DELETE already issued in migration.sql, this is
-- defense-in-depth: even if a future GRANT mistakenly restored UPDATE/DELETE
-- privilege, no policy authorizes those operations for any role.
CREATE POLICY audit_logs_insert_service_roles ON security.audit_logs
  FOR INSERT WITH CHECK ( security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['SYSTEM','ADMIN']) );

-- security.security_events: RESTRICTED-CRITICAL, actor_role IN ('AUDIT','SECURITY').
ALTER TABLE security.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.security_events FORCE ROW LEVEL SECURITY;
CREATE POLICY security_events_audit_security ON security.security_events
  FOR ALL USING ( security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['AUDIT','SECURITY']) );

-- security.retention_policies / legal_holds: RESTRICTED, actor_role IN ('AUDIT','ADMIN').
ALTER TABLE security.retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.retention_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_policies_audit_admin ON security.retention_policies
  FOR ALL USING ( security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['AUDIT','ADMIN']) );

ALTER TABLE security.legal_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.legal_holds FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_holds_audit_admin ON security.legal_holds
  FOR ALL USING ( security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['AUDIT','ADMIN']) );

-- ============================================================
-- 10. Explicit non-exemption note
-- ============================================================
-- No policy in this file (or referenced as a template) ever reads
-- `USING (true)` unqualified. Every `USING (true)`-shaped exemption
-- discussed elsewhere in this package (000_preflight/rls_auto_enable_remediation.sql
-- Option 1, illustrative interim containment for the CURRENT 33-table
-- database) is explicitly scoped `TO <single named server role>`, never to
-- PUBLIC/anon/authenticated, and is not part of the TARGET schema's design —
-- it is a CURRENT-database interim containment measure only.
