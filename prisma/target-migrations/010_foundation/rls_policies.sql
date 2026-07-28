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

CREATE OR REPLACE FUNCTION security.fn_is_owner(p_actor_id uuid, p_target_table text, p_target_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  -- Placeholder body: real implementation dispatches on p_target_table to the
  -- correct owning-column comparison (e.g. 'people' -> people.id = p_actor_id,
  -- 'help_requests' -> requester_person_id = p_actor_id). A single generic
  -- function cannot express this without dynamic SQL against an
  -- application-validated whitelist of target_table values (same pattern as
  -- governance.jurisdiction_scopes.scoped_table's CHECK whitelist) — the
  -- exact dispatch table is a human design decision deferred to
  -- implementation time, flagged SQL_COMPLEMENTARY_REQUIRED.
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

CREATE OR REPLACE FUNCTION security.fn_has_command_role(p_actor_id uuid, p_incident_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  -- Real body (once command.command_roles/incident_command_structures exist,
  -- Wave 040):
  -- SELECT EXISTS (
  --   SELECT 1 FROM command.command_roles cr
  --   JOIN command.incident_command_structures ics ON ics.id = cr.incident_command_structure_id
  --   WHERE ics.incident_id = p_incident_id AND cr.actor_id = p_actor_id
  --     AND cr.revoked_at IS NULL
  -- );
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

CREATE OR REPLACE FUNCTION security.fn_classification_allowed(p_actor_id uuid, p_classification security.information_classification_enum)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  -- Real body (once security.access_roles/access_role_permissions carry a
  -- max-classification concept — deferred design detail, flagged
  -- SQL_COMPLEMENTARY_REQUIRED): resolves the actor's current AccessRole and
  -- compares its authorized maximum information_classification_enum against
  -- p_classification using the enum's declared ordering
  -- (PUBLIC < OPERATIONAL < SENSITIVE < RESTRICTED < CRITICAL).
  SELECT false;
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
  USING ( current_setting('argus.actor_role', true) IN ('ADMIN','AUDIT') );

-- governance.resource_reservation_rules: OPERATIONAL, read open, write ADMIN.
ALTER TABLE governance.resource_reservation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.resource_reservation_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY rrr_read_authenticated ON governance.resource_reservation_rules
  FOR SELECT
  USING ( current_setting('argus.actor_role', true) IS NOT NULL );
CREATE POLICY rrr_write_admin ON governance.resource_reservation_rules
  FOR INSERT WITH CHECK ( current_setting('argus.actor_role', true) = 'ADMIN' );
CREATE POLICY rrr_update_admin ON governance.resource_reservation_rules
  FOR UPDATE USING ( current_setting('argus.actor_role', true) = 'ADMIN' );

-- governance.jurisdiction_scopes: OPERATIONAL, open read, write restricted to
-- the service that owns the referenced entity (Access Control v1.1 §5 —
-- bridge table, prevents bypass). Application-layer enforcement of "which
-- service" is required in addition to this policy (flagged
-- SQL_COMPLEMENTARY_REQUIRED — RLS alone cannot know "which microservice/
-- code path" issued the write, only which DB role did).
ALTER TABLE governance.jurisdiction_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.jurisdiction_scopes FORCE ROW LEVEL SECURITY;
CREATE POLICY jurisdiction_scopes_read_open ON governance.jurisdiction_scopes
  FOR SELECT USING ( current_setting('argus.actor_role', true) IS NOT NULL );
CREATE POLICY jurisdiction_scopes_write_owning_service ON governance.jurisdiction_scopes
  FOR INSERT WITH CHECK ( current_setting('argus.actor_role', true) IN ('ADMIN','SYSTEM') );

-- security.access_policies / permissions / access_roles / access_role_permissions:
-- RESTRICTED, actor_role IN ('AUDIT','ADMIN').
ALTER TABLE security.access_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.access_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY access_policies_audit ON security.access_policies
  FOR ALL USING ( current_setting('argus.actor_role', true) = 'AUDIT' );

ALTER TABLE security.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY permissions_audit_admin ON security.permissions
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('AUDIT','ADMIN') );

ALTER TABLE security.access_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.access_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY access_roles_audit_admin ON security.access_roles
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('AUDIT','ADMIN') );

ALTER TABLE security.access_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.access_role_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY access_role_permissions_audit_admin ON security.access_role_permissions
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('AUDIT','ADMIN') );

-- security.contextual_accesses: bridge table (Access Control v1.1 §5) — actor
-- sees own grants; AUDIT sees all.
ALTER TABLE security.contextual_accesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.contextual_accesses FORCE ROW LEVEL SECURITY;
CREATE POLICY contextual_accesses_own_or_audit ON security.contextual_accesses
  FOR SELECT
  USING ( actor_id = current_setting('argus.actor_id')::uuid
          OR current_setting('argus.actor_role', true) = 'AUDIT' );

-- security.access_decisions: same as audit_logs, AUDIT exclusive.
ALTER TABLE security.access_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.access_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY access_decisions_audit_only ON security.access_decisions
  FOR ALL USING ( current_setting('argus.actor_role', true) = 'AUDIT' );

-- security.audit_logs: CRITICAL, actor_role='AUDIT' exclusively, not delegable.
ALTER TABLE security.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_audit_only ON security.audit_logs
  FOR SELECT USING ( current_setting('argus.actor_role', true) = 'AUDIT' );
-- No UPDATE/DELETE policy at all (append-only, D-03) — combined with the
-- explicit REVOKE UPDATE, DELETE already issued in migration.sql, this is
-- defense-in-depth: even if a future GRANT mistakenly restored UPDATE/DELETE
-- privilege, no policy authorizes those operations for any role.
CREATE POLICY audit_logs_insert_service_roles ON security.audit_logs
  FOR INSERT WITH CHECK ( current_setting('argus.actor_role', true) IN ('SYSTEM','ADMIN') );

-- security.security_events: RESTRICTED-CRITICAL, actor_role IN ('AUDIT','SECURITY').
ALTER TABLE security.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.security_events FORCE ROW LEVEL SECURITY;
CREATE POLICY security_events_audit_security ON security.security_events
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('AUDIT','SECURITY') );

-- security.retention_policies / legal_holds: RESTRICTED, actor_role IN ('AUDIT','ADMIN').
ALTER TABLE security.retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.retention_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_policies_audit_admin ON security.retention_policies
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('AUDIT','ADMIN') );

ALTER TABLE security.legal_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.legal_holds FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_holds_audit_admin ON security.legal_holds
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('AUDIT','ADMIN') );

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
