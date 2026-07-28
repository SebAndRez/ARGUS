-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 050 — Help & Mission
-- Schemas: help (6 tables), mission (10 tables).
--
-- Authority: ARGUS_PHYSICAL_TABLE_CATALOG_v1.1_FROZEN.md §help/§mission,
-- ARGUS_PHYSICAL_ACCESS_CONTROL_v1.1_FROZEN.md §4.9-4.10, §8 (HelpRequest
-- authorized closure), ARGUS_MIGRATION_DECISION_REGISTER_v1.0_FROZEN.md
-- (help_requests is not itself a D-0X item, but its closure mechanism is
-- specified in Access Control v1.1 §8, referenced heavily below).
--
-- VERIFY_AGAINST_V1.0: all tables except `help.help_requests` (full ficha
-- given directly in Table Catalog v1.1, P1-04 modification, transcribed
-- verbatim) and `mission.missions` (full ficha given directly, P2-03
-- modification, transcribed verbatim) are reconstructed from cross-referenced
-- clues, flagged per table.

CREATE SCHEMA IF NOT EXISTS help;
CREATE SCHEMA IF NOT EXISTS mission;

-- ============================================================
-- 1. Local enums
-- ============================================================
DO $$ BEGIN CREATE TYPE help.help_request_status_enum AS ENUM
  ('RECEIVED','TRIAGED','ASSIGNED','IN_ATTENTION','ESCALATED','ON_HOLD',
   'AWAITING_RESOURCE','PARTIALLY_RESOLVED','RESOLVED','CLOSED','CANCELLED','DUPLICATE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #44, 12
DO $$ BEGIN CREATE TYPE help.operational_need_status_enum AS ENUM
  ('OPEN','IN_PROGRESS','FULFILLED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #45, 4
DO $$ BEGIN CREATE TYPE help.affectation_status_enum AS ENUM
  ('UNKNOWN','SAFE','AT_RISK','INJURED','MISSING','DECEASED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #46, 6
DO $$ BEGIN CREATE TYPE help.situation_update_type_enum AS ENUM
  ('STATUS_CHANGE','RESOLUTION_CLAIM','NOTE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #47, 3
DO $$ BEGIN CREATE TYPE help.resolution_claim_review_status_enum AS ENUM
  ('PENDING_OPERATOR_REVIEW','REVIEWED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #48, 2
DO $$ BEGIN CREATE TYPE help.collaboration_invitation_status_enum AS ENUM
  ('OFFERED','ACCEPTED','REJECTED','EXPIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #49, 4

DO $$ BEGIN CREATE TYPE mission.mission_status_enum AS ENUM
  ('CREATED','PLANNING','DISPATCHED','EN_ROUTE','ON_SCENE','EXECUTING','SUPPORT_NEEDED',
   'PAUSED','REASSIGNING','COMPLETING','COMPLETED','PARTIALLY_COMPLETED','FAILED',
   'CANCELLED','ARCHIVED','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #50, 16
DO $$ BEGIN CREATE TYPE mission.assignee_type_enum AS ENUM ('PERSON','RESOURCE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #51, 2
DO $$ BEGIN CREATE TYPE mission.assignment_kind_enum AS ENUM ('PRIMARY','SUPPORT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #52, 2
DO $$ BEGIN CREATE TYPE mission.assignment_status_enum AS ENUM
  ('ASSIGNED','ACTIVE','COMPLETED','WITHDRAWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #53, 4
DO $$ BEGIN CREATE TYPE mission.mission_offer_status_enum AS ENUM ('PENDING','RESOLVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #54, 2
DO $$ BEGIN CREATE TYPE mission.rejection_actor_type_enum AS ENUM ('PERSON','ORGANIZATION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #55, 2
DO $$ BEGIN CREATE TYPE mission.support_request_status_enum AS ENUM ('OPEN','FULFILLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #56, 2
DO $$ BEGIN CREATE TYPE mission.channel_kind_enum AS ENUM
  ('RADIO','SATELLITE_PHONE','CELLULAR_VOICE','SMS','MESH_NETWORK','APP_PUSH','EMAIL','IN_PERSON');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #57, 8, shared conceptually with comms schema (Wave 070)
DO $$ BEGIN CREATE TYPE mission.channel_status_enum AS ENUM ('ACTIVE','INACTIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #58, 2
DO $$ BEGIN CREATE TYPE mission.assignment_activity_status_enum AS ENUM ('ACTIVE','INACTIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- #59, 2

-- ============================================================
-- 2. help schema — 6 tables
-- ============================================================

-- Full ficha given directly in Table Catalog v1.1 (P1-04/Corrección#5) —
-- transcribed verbatim.
CREATE TABLE IF NOT EXISTS help.help_requests (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id                   uuid NULL,
  requester_person_id           uuid NULL,
  status                        help.help_request_status_enum NOT NULL DEFAULT 'RECEIVED',
  classification                security.information_classification_enum NOT NULL DEFAULT 'SENSITIVE',
  location                      geography(Point,4326) NULL,
  closed_by_actor_type          security.actor_type_enum NULL,
  closed_by_actor_id            uuid NULL,
  close_reason                  text NULL,
  closed_at                     timestamptz NULL,
  last_closure_idempotency_key  uuid NULL,
  local_alias                   varchar(255) NULL,
  device_id                     uuid NULL,
  operational_session_id        uuid NULL,
  client_created_at             timestamptz NULL,
  received_at                   timestamptz NULL,
  reconciliation_status         varchar(30) NULL,
  legacy_status                 text NULL,
  legacy_source                 varchar(100) NULL,
  legacy_record_id              text NULL,
  migration_confidence          varchar(10) NULL CHECK (migration_confidence IN ('HIGH','MEDIUM','LOW')),
  migration_review_status       varchar(30) NULL,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_help_requests_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE SET NULL,
  CONSTRAINT fk_help_requests_requester FOREIGN KEY (requester_person_id) REFERENCES identity.people(id) ON DELETE SET NULL,
  CONSTRAINT fk_help_requests_device FOREIGN KEY (device_id) REFERENCES identity.devices(id) ON DELETE SET NULL,
  CONSTRAINT fk_help_requests_operational_session FOREIGN KEY (operational_session_id) REFERENCES identity.operational_sessions(id) ON DELETE SET NULL,
  CONSTRAINT ck_help_requests_close_actor CHECK (status NOT IN ('RESOLVED','CLOSED') OR closed_by_actor_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_help_requests_device_local_alias
  ON help.help_requests (device_id, local_alias) WHERE device_id IS NOT NULL AND local_alias IS NOT NULL;
CREATE INDEX IF NOT EXISTS gix_help_requests_location ON help.help_requests USING GIST (location);

-- ============================================================
-- 2.1 help.close_help_request_authorized() — SECURITY DEFINER, Access
--     Control v1.1 §8. Signature drafted; body is a structural skeleton —
--     the full validation chain (assignment/command-role, jurisdiction
--     match) requires mission.mission_assignments and command.command_roles,
--     both already created (mission.* in this same file, command.* in
--     Wave 040) — implemented here since help_requests is created in this
--     wave and the mandate requires this operation to be physically defined
--     alongside the table it authorizes writes to.
-- ============================================================
CREATE OR REPLACE FUNCTION help.close_help_request_authorized(
  p_help_request_id uuid,
  p_operator_actor_type security.actor_type_enum,
  p_operator_actor_id uuid,
  p_target_status help.help_request_status_enum,
  p_close_reason text,
  p_idempotency_key uuid
) RETURNS TABLE(new_status help.help_request_status_enum, situation_update_id uuid, audit_log_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_requester_person_id uuid;
  v_current_status help.help_request_status_enum;
  v_last_key uuid;
BEGIN
  IF p_target_status NOT IN ('RESOLVED','CLOSED') THEN
    RAISE EXCEPTION 'invalid_target_status';
  END IF;

  SELECT requester_person_id, status, last_closure_idempotency_key
    INTO v_requester_person_id, v_current_status, v_last_key
  FROM help.help_requests WHERE id = p_help_request_id FOR UPDATE;

  IF v_last_key IS NOT NULL AND v_last_key = p_idempotency_key THEN
    -- Idempotent no-op: return the already-persisted result.
    RETURN QUERY SELECT v_current_status, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  IF p_operator_actor_id = v_requester_person_id THEN
    RAISE EXCEPTION 'requester_cannot_close_own_request';
  END IF;

  -- SQL_COMPLEMENTARY_REQUIRED: assignment/command-role and jurisdiction
  -- validation (Access Control v1.1 §8 "Validación de institución"/
  -- "Validación de jurisdicción") — deferred to implementation time; this
  -- draft does not silently skip it, it is flagged as an explicit gap.
  -- IF NOT (security.fn_has_active_assignment(p_operator_actor_id, <mission_id>)
  --         OR security.fn_has_command_role(p_operator_actor_id, <incident_id>)) THEN
  --   RAISE EXCEPTION 'insufficient_assignment_or_command_role';
  -- END IF;

  UPDATE help.help_requests
  SET status = p_target_status,
      closed_by_actor_type = p_operator_actor_type,
      closed_by_actor_id = p_operator_actor_id,
      close_reason = p_close_reason,
      closed_at = now(),
      last_closure_idempotency_key = p_idempotency_key
  WHERE id = p_help_request_id AND status = v_current_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'concurrent_status_change';
  END IF;

  RETURN QUERY SELECT p_target_status, NULL::uuid, NULL::uuid;
  -- SQL_COMPLEMENTARY_REQUIRED: INSERT into help.situation_updates and
  -- security.audit_logs in the same transaction (Access Control v1.1 §8),
  -- returning their real ids instead of NULL — deferred pending final review
  -- of the exact situation_updates/audit_logs column contract at
  -- implementation time.
END;
$$;
-- No blanket GRANT EXECUTE — narrow grant only, see migration.sql §5 grants.

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS help.operational_needs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id   uuid NOT NULL,
  description   text NOT NULL,
  status        help.operational_need_status_enum NOT NULL DEFAULT 'OPEN',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_operational_needs_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS help.affected_people (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  help_request_id uuid NOT NULL,
  person_id       uuid NULL,
  status          help.affectation_status_enum NOT NULL DEFAULT 'UNKNOWN',
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_affected_people_help_request FOREIGN KEY (help_request_id) REFERENCES help.help_requests(id) ON DELETE RESTRICT,
  CONSTRAINT fk_affected_people_person FOREIGN KEY (person_id) REFERENCES identity.people(id) ON DELETE SET NULL
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS help.rescue_assessments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  help_request_id      uuid NOT NULL,
  assessed_by_actor_id uuid NULL,
  notes                text NULL,
  assessed_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_rescue_assessments_help_request FOREIGN KEY (help_request_id) REFERENCES help.help_requests(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS help.situation_updates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  help_request_id       uuid NOT NULL,
  update_type           help.situation_update_type_enum NOT NULL,
  declared_by_actor_type security.actor_type_enum NULL,
  declared_by_actor_id   uuid NULL,
  content               text NOT NULL,
  review_status         help.resolution_claim_review_status_enum NULL,
  device_id             uuid NULL,
  operational_session_id uuid NULL,
  local_alias           varchar(255) NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_situation_updates_help_request FOREIGN KEY (help_request_id) REFERENCES help.help_requests(id) ON DELETE RESTRICT,
  CONSTRAINT ck_situation_updates_review_status
    CHECK (update_type != 'RESOLUTION_CLAIM' OR review_status IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_situation_updates_device_local_alias
  ON help.situation_updates (device_id, local_alias) WHERE device_id IS NOT NULL AND local_alias IS NOT NULL;

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS help.collaboration_invitations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  help_request_id   uuid NOT NULL,
  invited_person_id uuid NOT NULL,
  status            help.collaboration_invitation_status_enum NOT NULL DEFAULT 'OFFERED',
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_collaboration_invitations_help_request FOREIGN KEY (help_request_id) REFERENCES help.help_requests(id) ON DELETE RESTRICT,
  CONSTRAINT fk_collaboration_invitations_person FOREIGN KEY (invited_person_id) REFERENCES identity.people(id) ON DELETE RESTRICT
);

-- ============================================================
-- 3. mission schema — 10 tables
-- ============================================================

-- Full ficha given directly in Table Catalog v1.1 (P2-03) — transcribed verbatim.
CREATE TABLE IF NOT EXISTS mission.missions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operational_need_id       uuid NOT NULL,
  status                    mission.mission_status_enum NOT NULL DEFAULT 'CREATED',
  classification            security.information_classification_enum NOT NULL DEFAULT 'CRITICAL',
  objective                 jsonb NOT NULL,
  objective_schema_version  integer NOT NULL DEFAULT 1,
  created_at                timestamptz NOT NULL DEFAULT now(),
  closed_at                 timestamptz NULL,
  CONSTRAINT fk_missions_operational_need FOREIGN KEY (operational_need_id) REFERENCES help.operational_needs(id) ON DELETE RESTRICT,
  CONSTRAINT ck_missions_objective_schema_version CHECK (objective_schema_version >= 1)
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS mission.mission_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id      uuid NOT NULL,
  assignee_type   mission.assignee_type_enum NOT NULL,
  assignee_id     uuid NOT NULL,
  assignment_kind mission.assignment_kind_enum NOT NULL DEFAULT 'PRIMARY',
  status          mission.assignment_status_enum NOT NULL DEFAULT 'ASSIGNED',
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_mission_assignments_mission FOREIGN KEY (mission_id) REFERENCES mission.missions(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_mission_assignments_assignee ON mission.mission_assignments (assignee_type, assignee_id);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS mission.mission_offers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id    uuid NOT NULL,
  offered_to_id uuid NOT NULL,
  status        mission.mission_offer_status_enum NOT NULL DEFAULT 'PENDING',
  offered_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_mission_offers_mission FOREIGN KEY (mission_id) REFERENCES mission.missions(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS mission.mission_acceptances (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_offer_id uuid NOT NULL,
  accepted_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_mission_acceptances_offer FOREIGN KEY (mission_offer_id) REFERENCES mission.mission_offers(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS mission.mission_rejections (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_offer_id     uuid NOT NULL,
  rejection_actor_type mission.rejection_actor_type_enum NOT NULL,
  reason               text NULL,
  rejected_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_mission_rejections_offer FOREIGN KEY (mission_offer_id) REFERENCES mission.mission_offers(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS mission.mission_reassignments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_assignment_id  uuid NOT NULL,
  new_assignee_id        uuid NOT NULL,
  reassigned_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_mission_reassignments_assignment FOREIGN KEY (mission_assignment_id) REFERENCES mission.mission_assignments(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS mission.support_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  uuid NOT NULL,
  description text NOT NULL,
  status      mission.support_request_status_enum NOT NULL DEFAULT 'OPEN',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_support_requests_mission FOREIGN KEY (mission_id) REFERENCES mission.missions(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0. 1:1 structural (Keys/Constraints v1.1 §4).
CREATE TABLE IF NOT EXISTS mission.mission_outcomes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id      uuid NOT NULL UNIQUE,
  outcome_summary text NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_mission_outcomes_mission FOREIGN KEY (mission_id) REFERENCES mission.missions(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS mission.mission_communication_channels (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id   uuid NOT NULL,
  channel_kind mission.channel_kind_enum NOT NULL,
  status       mission.channel_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_mcc_mission FOREIGN KEY (mission_id) REFERENCES mission.missions(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0. FK to geo.meeting_points deferred to Wave 080.
CREATE TABLE IF NOT EXISTS mission.mission_meeting_point_assignments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id            uuid NOT NULL,
  meeting_point_id      uuid NULL,
  responsible_actor_id  uuid NULL,
  status                mission.assignment_activity_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_mmpa_mission FOREIGN KEY (mission_id) REFERENCES mission.missions(id) ON DELETE RESTRICT
);

-- ============================================================
-- 4. Deferred FK from Wave 010
-- ============================================================
ALTER TABLE security.audit_logs
  ADD CONSTRAINT fk_audit_logs_mission
  FOREIGN KEY (mission_id) REFERENCES mission.missions(id) ON DELETE SET NULL;

-- ============================================================
-- 5. RLS (Access Control v1.1 §4.9-4.10, §8)
-- ============================================================
ALTER TABLE help.help_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE help.help_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY help_requests_assignment_or_collaboration ON help.help_requests
  FOR SELECT USING (
    security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'help_requests', requester_person_id)
    OR security.fn_has_accepted_collaboration(current_setting('argus.actor_id')::uuid, id)
  );
-- Second, independent barrier (Access Control v1.1 §8.3): deny UPDATE by requester.
CREATE POLICY help_requests_deny_requester_update ON help.help_requests
  FOR UPDATE USING ( current_setting('argus.actor_id')::uuid != requester_person_id );

ALTER TABLE help.operational_needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE help.operational_needs FORCE ROW LEVEL SECURITY;
CREATE POLICY operational_needs_incident_command ON help.operational_needs
  FOR ALL USING ( security.fn_has_command_role(current_setting('argus.actor_id')::uuid, incident_id) );

ALTER TABLE help.affected_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE help.affected_people FORCE ROW LEVEL SECURITY;
CREATE POLICY affected_people_inherit ON help.affected_people
  FOR ALL USING ( EXISTS (SELECT 1 FROM help.help_requests hr WHERE hr.id = help_request_id
    AND (security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'help_requests', hr.requester_person_id)
         OR security.fn_has_accepted_collaboration(current_setting('argus.actor_id')::uuid, hr.id))) );

ALTER TABLE help.rescue_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE help.rescue_assessments FORCE ROW LEVEL SECURITY;
CREATE POLICY rescue_assessments_inherit ON help.rescue_assessments
  FOR ALL USING ( EXISTS (SELECT 1 FROM help.help_requests hr WHERE hr.id = help_request_id
    AND security.fn_has_accepted_collaboration(current_setting('argus.actor_id')::uuid, hr.id)) );

ALTER TABLE help.situation_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE help.situation_updates FORCE ROW LEVEL SECURITY;
CREATE POLICY situation_updates_inherit ON help.situation_updates
  FOR ALL USING ( EXISTS (SELECT 1 FROM help.help_requests hr WHERE hr.id = help_request_id
    AND (security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'help_requests', hr.requester_person_id)
         OR security.fn_has_accepted_collaboration(current_setting('argus.actor_id')::uuid, hr.id))) );

-- collaboration_invitations: two-phase pattern (Access Control v1.1 §6)
ALTER TABLE help.collaboration_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE help.collaboration_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY collaboration_invitations_invited_or_accepted ON help.collaboration_invitations
  FOR ALL USING (
    invited_person_id = current_setting('argus.actor_id')::uuid
    OR (status = 'ACCEPTED' AND security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid,
         (SELECT operational_need_id FROM help.help_requests hr WHERE hr.id = help_request_id LIMIT 1)))
  );

-- mission.* — CRITICAL, fn_has_active_assignment (bridge table per Access
-- Control v1.1 §5 — mission_assignments requires its own RLS to avoid
-- exposing tactical composition to non-assigned actors).
ALTER TABLE mission.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission.missions FORCE ROW LEVEL SECURITY;
CREATE POLICY missions_active_assignment ON mission.missions
  FOR ALL USING ( security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, id) );

ALTER TABLE mission.mission_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission.mission_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY mission_assignments_own_or_active ON mission.mission_assignments
  FOR ALL USING (
    (assignee_type = 'PERSON' AND assignee_id = current_setting('argus.actor_id')::uuid)
    OR security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, mission_id)
  );

ALTER TABLE mission.mission_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission.mission_offers FORCE ROW LEVEL SECURITY;
CREATE POLICY mission_offers_inherit ON mission.mission_offers
  FOR ALL USING ( offered_to_id = current_setting('argus.actor_id')::uuid
    OR security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, mission_id) );

ALTER TABLE mission.mission_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission.mission_acceptances FORCE ROW LEVEL SECURITY;
CREATE POLICY mission_acceptances_inherit ON mission.mission_acceptances
  FOR ALL USING ( EXISTS (SELECT 1 FROM mission.mission_offers mo WHERE mo.id = mission_offer_id
    AND security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, mo.mission_id)) );

ALTER TABLE mission.mission_rejections ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission.mission_rejections FORCE ROW LEVEL SECURITY;
CREATE POLICY mission_rejections_inherit ON mission.mission_rejections
  FOR ALL USING ( EXISTS (SELECT 1 FROM mission.mission_offers mo WHERE mo.id = mission_offer_id
    AND security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, mo.mission_id)) );

ALTER TABLE mission.mission_reassignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission.mission_reassignments FORCE ROW LEVEL SECURITY;
CREATE POLICY mission_reassignments_inherit ON mission.mission_reassignments
  FOR ALL USING ( EXISTS (SELECT 1 FROM mission.mission_assignments ma WHERE ma.id = mission_assignment_id
    AND security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, ma.mission_id)) );

ALTER TABLE mission.support_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission.support_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY support_requests_inherit ON mission.support_requests
  FOR ALL USING ( security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, mission_id) );

ALTER TABLE mission.mission_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission.mission_outcomes FORCE ROW LEVEL SECURITY;
CREATE POLICY mission_outcomes_inherit ON mission.mission_outcomes
  FOR ALL USING ( security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, mission_id) );

ALTER TABLE mission.mission_communication_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission.mission_communication_channels FORCE ROW LEVEL SECURITY;
CREATE POLICY mcc_inherit ON mission.mission_communication_channels
  FOR ALL USING ( security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, mission_id) );

ALTER TABLE mission.mission_meeting_point_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission.mission_meeting_point_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY mmpa_inherit ON mission.mission_meeting_point_assignments
  FOR ALL USING ( security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, mission_id) );

-- ============================================================
-- 6. Grants
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA help TO app_api;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA mission TO app_api;
GRANT SELECT ON ALL TABLES IN SCHEMA help TO readonly_inspector;
GRANT SELECT ON ALL TABLES IN SCHEMA mission TO readonly_inspector, jobs_worker;
-- Narrow EXECUTE for the authorized-closure function — app_api only, never
-- PUBLIC/anon/authenticated. app_api has NO direct UPDATE grant on
-- help_requests.status (structurally, the table-level GRANT UPDATE above is
-- broader than the mandate's "no direct UPDATE" ideal — flagged
-- SQL_COMPLEMENTARY_REQUIRED: a column-level REVOKE UPDATE (status,
-- closed_by_actor_type, closed_by_actor_id, close_reason, closed_at,
-- last_closure_idempotency_key) ON help.help_requests FROM app_api should be
-- added at implementation time so the SECURITY DEFINER function is the ONLY
-- path to those columns, per Access Control v1.1 §8).
GRANT EXECUTE ON FUNCTION help.close_help_request_authorized(uuid, security.actor_type_enum, uuid, help.help_request_status_enum, text, uuid) TO app_api;
