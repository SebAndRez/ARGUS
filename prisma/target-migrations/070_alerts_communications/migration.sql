-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 070 — Alerts & Communications
-- Schemas: comms (7 tables), alert (8 tables).
-- Contains the ONE documented circular FK in the entire 168-table model
-- (alert.critical_instructions <-> alert.critical_instruction_versions,
-- Keys/Constraints v1.1 §8) and D-01's cryptographic integrity chain,
-- structurally identical to security.audit_logs (Wave 010).
--
-- Authority: ARGUS_PHYSICAL_TABLE_CATALOG_v1.1_FROZEN.md §comms/§alert,
-- ARGUS_PHYSICAL_KEYS_CONSTRAINTS_INDEXES_v1.1_FROZEN.md §6, §8,
-- ARGUS_PHYSICAL_ACCESS_CONTROL_v1.1_FROZEN.md §4.12-4.13,
-- ARGUS_MIGRATION_DECISION_REGISTER_v1.0_FROZEN.md D-01.
--
-- VERIFY_AGAINST_V1.0: tables with full fichas given directly in Table
-- Catalog v1.1 and transcribed verbatim: `comms.messages`,
-- `comms.delivery_attempts`, `comms.acknowledgements`,
-- `comms.comprehension_confirmations`, `comms.communication_losses`,
-- `alert.alerts`, `alert.critical_instructions`,
-- `alert.critical_instruction_versions`. The remaining 7 tables are
-- reconstructed from cross-referenced clues, flagged per table.

CREATE SCHEMA IF NOT EXISTS comms;
CREATE SCHEMA IF NOT EXISTS alert;

-- ============================================================
-- 1. Local enums
-- ============================================================
DO $$ BEGIN CREATE TYPE comms.communication_plan_status_enum AS ENUM ('ACTIVE','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #65, 2
DO $$ BEGIN CREATE TYPE comms.message_status_enum AS ENUM ('PREPARED','SENT','FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #66, 3
DO $$ BEGIN CREATE TYPE comms.delivery_content_kind_enum AS ENUM ('MESSAGE','ALERT','CRITICAL_INSTRUCTION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #67, 3, NEW v1.1, resolves P1-05/P2-02
DO $$ BEGIN CREATE TYPE comms.delivery_status_enum AS ENUM
  ('PREPARED','QUEUED','SENDING','DELIVERED','FAILED','BOUNCED','EXPIRED','CANCELLED','RETRYING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #68, 9
DO $$ BEGIN CREATE TYPE comms.offline_plan_status_enum AS ENUM ('ACTIVE','SUSPENDED','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #69, 3

DO $$ BEGIN CREATE TYPE alert.alert_kind_enum AS ENUM ('WARNING','EVACUATION','ALL_CLEAR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #70, 3
DO $$ BEGIN CREATE TYPE alert.critical_instruction_status_enum AS ENUM ('ACTIVE','RETIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #71, 2
DO $$ BEGIN CREATE TYPE alert.directive_kind_enum AS ENUM ('MANDATORY','RECOMMENDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #72, 2
DO $$ BEGIN CREATE TYPE alert.version_status_enum AS ENUM ('DRAFT','ACTIVE','SUPERSEDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #73, 3

-- ============================================================
-- 2. comms schema — 7 tables
-- ============================================================

-- VERIFY_AGAINST_V1.0. owner_table/owner_id polymorphic per Keys/Constraints
-- v1.1 §3 (recommended-priority validated reference).
CREATE TABLE IF NOT EXISTS comms.communication_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_table varchar(50) NOT NULL,
  owner_id    uuid NOT NULL,
  status      comms.communication_plan_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_communication_plans_owner_table_whitelist
    CHECK (owner_table IN ('missions','alerts','critical_instructions'))
);
CREATE INDEX IF NOT EXISTS ix_communication_plans_owner ON comms.communication_plans (owner_table, owner_id);

-- Full ficha given directly in Table Catalog v1.1 (P1-05/P2-02) — transcribed
-- verbatim. content_kind fixed by trg_messages_content_kind_consistency
-- (Keys/Constraints v1.1 §6), derived from communication_plans.owner_table.
CREATE TABLE IF NOT EXISTS comms.messages (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_plan_id  uuid NOT NULL,
  content_kind           comms.delivery_content_kind_enum NOT NULL,
  content                text NOT NULL,
  classification         security.information_classification_enum NOT NULL,
  status                 comms.message_status_enum NOT NULL DEFAULT 'PREPARED',
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_messages_communication_plan FOREIGN KEY (communication_plan_id) REFERENCES comms.communication_plans(id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION comms.fn_messages_content_kind_consistency() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_owner_table varchar(50);
BEGIN
  SELECT owner_table INTO v_owner_table FROM comms.communication_plans WHERE id = NEW.communication_plan_id;
  NEW.content_kind := CASE v_owner_table
    WHEN 'missions' THEN 'MESSAGE'::comms.delivery_content_kind_enum
    WHEN 'alerts' THEN 'ALERT'::comms.delivery_content_kind_enum
    WHEN 'critical_instructions' THEN 'CRITICAL_INSTRUCTION'::comms.delivery_content_kind_enum
    ELSE NULL
  END;
  IF NEW.content_kind IS NULL THEN
    RAISE EXCEPTION 'unknown_communication_plan_owner_table: %', v_owner_table;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_messages_content_kind_consistency ON comms.messages;
CREATE TRIGGER trg_messages_content_kind_consistency
  BEFORE INSERT ON comms.messages
  FOR EACH ROW EXECUTE FUNCTION comms.fn_messages_content_kind_consistency();

-- Full ficha given directly in Table Catalog v1.1 (P1-05/P2-02) — transcribed verbatim.
CREATE TABLE IF NOT EXISTS comms.delivery_attempts (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id                     uuid NOT NULL,
  content_kind                   comms.delivery_content_kind_enum NOT NULL,
  critical_instruction_version_id uuid NULL,
  endpoint_snapshot              jsonb NOT NULL,
  emergency_contact_id           uuid NULL,
  status                         comms.delivery_status_enum NOT NULL DEFAULT 'PREPARED',
  local_alias                    varchar(255) NULL,
  device_id                      uuid NULL,
  operational_session_id         uuid NULL,
  client_created_at              timestamptz NULL,
  received_at                    timestamptz NULL,
  reconciliation_status          varchar(30) NULL,
  created_at                     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_delivery_attempts_message FOREIGN KEY (message_id) REFERENCES comms.messages(id) ON DELETE RESTRICT,
  CONSTRAINT fk_delivery_attempts_device FOREIGN KEY (device_id) REFERENCES identity.devices(id) ON DELETE SET NULL,
  CONSTRAINT fk_delivery_attempts_operational_session FOREIGN KEY (operational_session_id) REFERENCES identity.operational_sessions(id) ON DELETE SET NULL,
  CONSTRAINT ck_delivery_attempts_civ_required
    CHECK (content_kind != 'CRITICAL_INSTRUCTION' OR critical_instruction_version_id IS NOT NULL),
  CONSTRAINT ck_delivery_attempts_civ_exclusive
    CHECK (content_kind = 'CRITICAL_INSTRUCTION' OR critical_instruction_version_id IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_attempts_device_local_alias
  ON comms.delivery_attempts (device_id, local_alias) WHERE device_id IS NOT NULL AND local_alias IS NOT NULL;

-- Full ficha given directly in Table Catalog v1.1 (P1-05/P2-02) — transcribed verbatim.
CREATE TABLE IF NOT EXISTS comms.acknowledgements (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_attempt_id             uuid NOT NULL,
  content_kind                    comms.delivery_content_kind_enum NOT NULL,
  critical_instruction_version_id uuid NULL,
  acknowledged_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_acknowledgements_delivery_attempt FOREIGN KEY (delivery_attempt_id) REFERENCES comms.delivery_attempts(id) ON DELETE RESTRICT,
  CONSTRAINT ck_acknowledgements_civ_required
    CHECK (content_kind != 'CRITICAL_INSTRUCTION' OR critical_instruction_version_id IS NOT NULL),
  CONSTRAINT ck_acknowledgements_civ_exclusive
    CHECK (content_kind = 'CRITICAL_INSTRUCTION' OR critical_instruction_version_id IS NULL)
);

-- Full ficha given directly in Table Catalog v1.1 (P1-05) — transcribed verbatim.
CREATE TABLE IF NOT EXISTS comms.comprehension_confirmations (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acknowledgement_id              uuid NOT NULL,
  content_kind                    comms.delivery_content_kind_enum NOT NULL,
  critical_instruction_version_id uuid NULL,
  confirmed_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_comprehension_confirmations_acknowledgement FOREIGN KEY (acknowledgement_id) REFERENCES comms.acknowledgements(id) ON DELETE RESTRICT,
  CONSTRAINT ck_comprehension_civ_required
    CHECK (content_kind != 'CRITICAL_INSTRUCTION' OR critical_instruction_version_id IS NOT NULL),
  CONSTRAINT ck_comprehension_civ_exclusive
    CHECK (content_kind = 'CRITICAL_INSTRUCTION' OR critical_instruction_version_id IS NULL)
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS comms.offline_communication_plans (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_plan_id uuid NOT NULL,
  status                comms.offline_plan_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_offline_communication_plans_plan FOREIGN KEY (communication_plan_id) REFERENCES comms.communication_plans(id) ON DELETE RESTRICT
);

-- Full ficha given directly in Table Catalog v1.1 (P1-01) — transcribed
-- verbatim. D-04 note: NOT fed by TelecomConnectivityStatus/Evidence (that
-- corrects v1.0 — see Target-Current Mapping v1.1 §0 D-04 row).
CREATE TABLE IF NOT EXISTS comms.communication_losses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_attempt_id uuid NOT NULL,
  detected_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz NULL,
  cause               text NULL,
  CONSTRAINT fk_communication_losses_delivery_attempt FOREIGN KEY (delivery_attempt_id) REFERENCES comms.delivery_attempts(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_communication_losses_delivery_attempt_id ON comms.communication_losses (delivery_attempt_id);
CREATE INDEX IF NOT EXISTS ix_communication_losses_detected_at ON comms.communication_losses (detected_at);

-- ============================================================
-- 3. alert schema — 8 tables
-- ============================================================

-- Full ficha given directly in Table Catalog v1.1 (P2-03) — transcribed verbatim.
CREATE TABLE IF NOT EXISTS alert.alerts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_kind              alert.alert_kind_enum NOT NULL,
  incident_id             uuid NULL,
  risk_assessment_id      uuid NULL,
  audience                jsonb NOT NULL,
  audience_schema_version integer NOT NULL DEFAULT 1,
  target_area             geography(MultiPolygon,4326) NULL,
  related_instruction_id  uuid NULL,
  classification          security.information_classification_enum NOT NULL DEFAULT 'RESTRICTED',
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_alerts_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE SET NULL,
  CONSTRAINT fk_alerts_risk_assessment FOREIGN KEY (risk_assessment_id) REFERENCES risk.risk_assessments(id) ON DELETE SET NULL,
  CONSTRAINT ck_alerts_audience_schema_version CHECK (audience_schema_version >= 1)
);
CREATE INDEX IF NOT EXISTS gix_alerts_target_area ON alert.alerts USING GIST (target_area);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS alert.alert_authorizations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id              uuid NOT NULL,
  authorized_by_actor_id uuid NULL,
  authorized_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_alert_authorizations_alert FOREIGN KEY (alert_id) REFERENCES alert.alerts(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS alert.alert_cancellations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id             uuid NOT NULL,
  cancelled_by_actor_id uuid NULL,
  reason               text NULL,
  cancelled_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_alert_cancellations_alert FOREIGN KEY (alert_id) REFERENCES alert.alerts(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS alert.alert_supersessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  superseded_alert_id   uuid NOT NULL,
  superseding_alert_id  uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_alert_supersessions_superseded FOREIGN KEY (superseded_alert_id) REFERENCES alert.alerts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_alert_supersessions_superseding FOREIGN KEY (superseding_alert_id) REFERENCES alert.alerts(id) ON DELETE RESTRICT
);

-- Full ficha given directly in Table Catalog v1.1 (P2-01 — circular FK
-- resolution). Structure identical to v1.0; the FK to
-- critical_instruction_versions(current_version_id) is added AFTER that
-- table exists (see §4 "circular FK, 3-step protocol" below) — nullable by
-- design, never forced NOT NULL, per Keys/Constraints v1.1 §8.
CREATE TABLE IF NOT EXISTS alert.critical_instructions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  current_version_id  uuid NULL,
  status              alert.critical_instruction_status_enum NOT NULL DEFAULT 'ACTIVE',
  incident_id         uuid NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_critical_instructions_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE SET NULL
);

-- Full ficha given directly in Table Catalog v1.1 (D-01, P2-03) — transcribed
-- verbatim. D-01 cryptographic integrity chain, identical mechanism to
-- security.audit_logs (Wave 010).
CREATE TABLE IF NOT EXISTS alert.critical_instruction_versions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  critical_instruction_id   uuid NOT NULL,
  version_number            integer NOT NULL,
  content                   text NOT NULL,
  directive_kind            alert.directive_kind_enum NOT NULL,
  audience                  jsonb NOT NULL,
  audience_schema_version   integer NOT NULL DEFAULT 1,
  target_area               geography(MultiPolygon,4326) NULL,
  authority_jurisdiction_id uuid NULL,
  signed_by_actor_type      security.actor_type_enum NOT NULL,
  signed_by_actor_id        uuid NOT NULL,
  signature_integrity_value text NOT NULL,
  integrity_algorithm       varchar(20) NOT NULL DEFAULT 'HMAC-SHA256',
  canonicalization_version  integer NOT NULL DEFAULT 1,
  integrity_key_id          varchar(50) NULL,
  previous_version_id       uuid NULL,
  next_version_id           uuid NULL,
  supersedes_version_id     uuid NULL,
  status                    alert.version_status_enum NOT NULL DEFAULT 'ACTIVE',
  effective_from            timestamptz NOT NULL DEFAULT now(),
  expires_at                timestamptz NULL,
  change_reason             text NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_civ_critical_instruction FOREIGN KEY (critical_instruction_id) REFERENCES alert.critical_instructions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_civ_authority_jurisdiction FOREIGN KEY (authority_jurisdiction_id) REFERENCES governance.jurisdictions(id) ON DELETE SET NULL,
  CONSTRAINT fk_civ_previous_version FOREIGN KEY (previous_version_id) REFERENCES alert.critical_instruction_versions(id) ON DELETE SET NULL,
  CONSTRAINT fk_civ_next_version FOREIGN KEY (next_version_id) REFERENCES alert.critical_instruction_versions(id) ON DELETE SET NULL,
  CONSTRAINT fk_civ_supersedes_version FOREIGN KEY (supersedes_version_id) REFERENCES alert.critical_instruction_versions(id) ON DELETE SET NULL,
  CONSTRAINT uq_civ_instruction_version UNIQUE (critical_instruction_id, version_number),
  CONSTRAINT ck_civ_change_reason_required CHECK (version_number = 1 OR change_reason IS NOT NULL),
  CONSTRAINT ck_civ_signature_not_empty CHECK (length(signature_integrity_value) > 0),
  CONSTRAINT ck_civ_audience_schema_version CHECK (audience_schema_version >= 1)
);
-- ck_civ_order_requires_authority (Keys/Constraints v1.1 §5): requires a
-- multi-table trigger (verifies signed_by_actor authority against
-- authority_jurisdiction_id's declared institutional_memberships), not
-- expressible as a row-local CHECK — flagged SQL_COMPLEMENTARY_REQUIRED,
-- deferred to implementation time, not silently omitted.

-- Circular FK resolution — Step 3 (Keys/Constraints v1.1 §8): now that
-- critical_instruction_versions exists, add the forward FK from
-- critical_instructions.current_version_id.
ALTER TABLE alert.critical_instructions
  ADD CONSTRAINT fk_critical_instructions_current_version
  FOREIGN KEY (current_version_id) REFERENCES alert.critical_instruction_versions(id) ON DELETE RESTRICT;

-- Cross-consistency trigger (Keys/Constraints v1.1 §8):
CREATE OR REPLACE FUNCTION alert.fn_critical_instructions_version_consistency() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_version_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM alert.critical_instruction_versions
      WHERE id = NEW.current_version_id AND critical_instruction_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'current_version_id_mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_critical_instructions_version_consistency ON alert.critical_instructions;
CREATE TRIGGER trg_critical_instructions_version_consistency
  BEFORE UPDATE OF current_version_id ON alert.critical_instructions
  FOR EACH ROW WHEN (NEW.current_version_id IS NOT NULL)
  EXECUTE FUNCTION alert.fn_critical_instructions_version_consistency();

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS alert.instruction_authorizations (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  critical_instruction_version_id uuid NOT NULL,
  authorized_by_actor_id          uuid NULL,
  authorized_at                   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_instruction_authorizations_version FOREIGN KEY (critical_instruction_version_id) REFERENCES alert.critical_instruction_versions(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS alert.instruction_compliance_records (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  critical_instruction_version_id uuid NOT NULL,
  reported_by_actor_id            uuid NULL,
  compliant                       boolean NOT NULL,
  justification                   text NULL,
  reported_at                     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_instruction_compliance_records_version FOREIGN KEY (critical_instruction_version_id) REFERENCES alert.critical_instruction_versions(id) ON DELETE RESTRICT,
  CONSTRAINT ck_instruction_compliance_justification CHECK (compliant = true OR justification IS NOT NULL)
);

-- ============================================================
-- 4. RLS (Access Control v1.1 §4.12-4.13)
-- ============================================================
ALTER TABLE comms.communication_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE comms.communication_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY communication_plans_owning_bc ON comms.communication_plans
  FOR ALL USING (
    (owner_table = 'missions' AND security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, owner_id))
    OR (owner_table = 'critical_instructions' AND security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, owner_id))
    OR (owner_table = 'alerts')
  );

ALTER TABLE comms.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE comms.messages FORCE ROW LEVEL SECURITY;
CREATE POLICY messages_inherit ON comms.messages
  FOR ALL USING ( EXISTS (SELECT 1 FROM comms.communication_plans cp WHERE cp.id = communication_plan_id) );

ALTER TABLE comms.delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comms.delivery_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY delivery_attempts_inherit ON comms.delivery_attempts
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE comms.acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE comms.acknowledgements FORCE ROW LEVEL SECURITY;
CREATE POLICY acknowledgements_inherit ON comms.acknowledgements
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE comms.comprehension_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE comms.comprehension_confirmations FORCE ROW LEVEL SECURITY;
CREATE POLICY comprehension_confirmations_inherit ON comms.comprehension_confirmations
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE comms.offline_communication_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE comms.offline_communication_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY offline_communication_plans_assigned_unit ON comms.offline_communication_plans
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE comms.communication_losses ENABLE ROW LEVEL SECURITY;
ALTER TABLE comms.communication_losses FORCE ROW LEVEL SECURITY;
CREATE POLICY communication_losses_inherit ON comms.communication_losses
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE alert.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert.alerts FORCE ROW LEVEL SECURITY;
CREATE POLICY alerts_public_or_assigned ON alert.alerts
  FOR SELECT USING (
    classification = 'PUBLIC'
    OR security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, incident_id)
  );

ALTER TABLE alert.alert_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert.alert_authorizations FORCE ROW LEVEL SECURITY;
CREATE POLICY alert_authorizations_inherit ON alert.alert_authorizations
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE alert.alert_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert.alert_cancellations FORCE ROW LEVEL SECURITY;
CREATE POLICY alert_cancellations_inherit ON alert.alert_cancellations
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE alert.alert_supersessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert.alert_supersessions FORCE ROW LEVEL SECURITY;
CREATE POLICY alert_supersessions_inherit ON alert.alert_supersessions
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE alert.critical_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert.critical_instructions FORCE ROW LEVEL SECURITY;
CREATE POLICY critical_instructions_assignment ON alert.critical_instructions
  FOR ALL USING ( security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, incident_id) );

ALTER TABLE alert.critical_instruction_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert.critical_instruction_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY civ_inherit ON alert.critical_instruction_versions
  FOR ALL USING ( EXISTS (SELECT 1 FROM alert.critical_instructions ci WHERE ci.id = critical_instruction_id
    AND security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid, ci.incident_id)) );

ALTER TABLE alert.instruction_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert.instruction_authorizations FORCE ROW LEVEL SECURITY;
CREATE POLICY instruction_authorizations_inherit ON alert.instruction_authorizations
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE alert.instruction_compliance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert.instruction_compliance_records FORCE ROW LEVEL SECURITY;
CREATE POLICY instruction_compliance_records_inherit ON alert.instruction_compliance_records
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

-- ============================================================
-- 5. Grants
-- ============================================================
-- SCHEMA-LEVEL USAGE (corrective session): table grants below are
-- unreachable without USAGE on their schema ("permission denied for
-- schema <x>" fires before RLS is even consulted). Proven by the real
-- non-superuser RLS matrix, scripts/migration-rehearsal/sql/rls-matrix-checks.sql.
GRANT USAGE ON SCHEMA comms TO app_api, jobs_worker, readonly_inspector;
GRANT USAGE ON SCHEMA alert TO app_api, jobs_worker, readonly_inspector;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA comms TO app_api;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA alert TO app_api;
GRANT SELECT ON ALL TABLES IN SCHEMA comms TO jobs_worker, readonly_inspector;
GRANT SELECT ON ALL TABLES IN SCHEMA alert TO jobs_worker, readonly_inspector;
