-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 050 — Rollback. Must run after 060-100 rollbacks (resource/comms/alert
-- and later waves FK into mission.missions/help.help_requests), before
-- 040-010 rollbacks.

ALTER TABLE security.audit_logs DROP CONSTRAINT IF EXISTS fk_audit_logs_mission;

REVOKE EXECUTE ON FUNCTION help.close_help_request_authorized(uuid, security.actor_type_enum, uuid, help.help_request_status_enum, text, uuid) FROM app_api;
DROP FUNCTION IF EXISTS help.close_help_request_authorized(uuid, security.actor_type_enum, uuid, help.help_request_status_enum, text, uuid);

REVOKE SELECT ON ALL TABLES IN SCHEMA mission FROM readonly_inspector, jobs_worker;
REVOKE SELECT ON ALL TABLES IN SCHEMA help FROM readonly_inspector;
REVOKE SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA mission FROM app_api;
REVOKE SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA help FROM app_api;

DROP TABLE IF EXISTS mission.mission_meeting_point_assignments;
DROP TABLE IF EXISTS mission.mission_communication_channels;
DROP TABLE IF EXISTS mission.mission_outcomes;
DROP TABLE IF EXISTS mission.support_requests;
DROP TABLE IF EXISTS mission.mission_reassignments;
DROP TABLE IF EXISTS mission.mission_rejections;
DROP TABLE IF EXISTS mission.mission_acceptances;
DROP TABLE IF EXISTS mission.mission_offers;
DROP TABLE IF EXISTS mission.mission_assignments;
DROP TABLE IF EXISTS mission.missions;

DROP TABLE IF EXISTS help.collaboration_invitations;
DROP TABLE IF EXISTS help.situation_updates;
DROP TABLE IF EXISTS help.rescue_assessments;
DROP TABLE IF EXISTS help.affected_people;
DROP TABLE IF EXISTS help.operational_needs;
DROP TABLE IF EXISTS help.help_requests;

DO $$ BEGIN DROP TYPE IF EXISTS mission.assignment_activity_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS mission.channel_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS mission.channel_kind_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS mission.support_request_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS mission.rejection_actor_type_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS mission.mission_offer_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS mission.assignment_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS mission.assignment_kind_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS mission.assignee_type_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS mission.mission_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS help.collaboration_invitation_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS help.resolution_claim_review_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS help.situation_update_type_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS help.affectation_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS help.operational_need_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS help.help_request_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP SCHEMA IF EXISTS mission;
DROP SCHEMA IF EXISTS help;
