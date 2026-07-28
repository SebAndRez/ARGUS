-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 070 — Rollback. Must run after 080-100 rollbacks, before 060-010
-- rollbacks. The circular FK requires its forward constraint dropped BEFORE
-- critical_instruction_versions itself is dropped.

REVOKE SELECT ON ALL TABLES IN SCHEMA alert FROM jobs_worker, readonly_inspector;
REVOKE SELECT ON ALL TABLES IN SCHEMA comms FROM jobs_worker, readonly_inspector;
REVOKE SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA alert FROM app_api;
REVOKE SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA comms FROM app_api;

DROP TRIGGER IF EXISTS trg_critical_instructions_version_consistency ON alert.critical_instructions;
DROP FUNCTION IF EXISTS alert.fn_critical_instructions_version_consistency();
ALTER TABLE alert.critical_instructions DROP CONSTRAINT IF EXISTS fk_critical_instructions_current_version;

DROP TABLE IF EXISTS alert.instruction_compliance_records;
DROP TABLE IF EXISTS alert.instruction_authorizations;
DROP TABLE IF EXISTS alert.critical_instruction_versions;
DROP TABLE IF EXISTS alert.critical_instructions;
DROP TABLE IF EXISTS alert.alert_supersessions;
DROP TABLE IF EXISTS alert.alert_cancellations;
DROP TABLE IF EXISTS alert.alert_authorizations;
DROP TABLE IF EXISTS alert.alerts;

DROP TABLE IF EXISTS comms.communication_losses;
DROP TABLE IF EXISTS comms.offline_communication_plans;
DROP TABLE IF EXISTS comms.comprehension_confirmations;
DROP TABLE IF EXISTS comms.acknowledgements;
DROP TABLE IF EXISTS comms.delivery_attempts;
DROP TRIGGER IF EXISTS trg_messages_content_kind_consistency ON comms.messages;
DROP FUNCTION IF EXISTS comms.fn_messages_content_kind_consistency();
DROP TABLE IF EXISTS comms.messages;
DROP TABLE IF EXISTS comms.communication_plans;

DO $$ BEGIN DROP TYPE IF EXISTS alert.version_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS alert.directive_kind_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS alert.critical_instruction_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS alert.alert_kind_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS comms.offline_plan_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS comms.delivery_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS comms.delivery_content_kind_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS comms.message_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS comms.communication_plan_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP SCHEMA IF EXISTS alert;
DROP SCHEMA IF EXISTS comms;
