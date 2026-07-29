-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 040 — Rollback. Must run after 050-100 rollbacks (mission/help/alert
-- and later waves FK into incident.incidents), before 030-010 rollbacks.

ALTER TABLE security.audit_logs DROP CONSTRAINT IF EXISTS fk_audit_logs_incident;

REVOKE SELECT ON ALL TABLES IN SCHEMA command FROM readonly_inspector;
REVOKE SELECT ON ALL TABLES IN SCHEMA risk FROM jobs_worker, readonly_inspector;
REVOKE SELECT ON ALL TABLES IN SCHEMA incident FROM ingest_worker, jobs_worker, readonly_inspector;
REVOKE SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA command FROM app_api;
REVOKE SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA risk FROM app_api;
REVOKE SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA incident FROM app_api;

-- Drop the MIGRATION_REVIEW_QUEUE views (backfill.sql) before any table they
-- depend on, or those DROP TABLE statements fail with "other objects depend on it".
DROP VIEW IF EXISTS incident.vw_migration_review_queue;
DROP VIEW IF EXISTS risk.vw_migration_review_queue;

DROP TABLE IF EXISTS command.human_overrides;
DROP TABLE IF EXISTS command.automated_recommendations;
DROP TABLE IF EXISTS command.operational_decisions;
DROP TABLE IF EXISTS command.command_handovers;
DROP TABLE IF EXISTS command.command_roles;
DROP TABLE IF EXISTS command.incident_command_structures;

DROP TABLE IF EXISTS risk.risk_area_versions;
DROP TABLE IF EXISTS risk.risk_assessment_revisions;
DROP TABLE IF EXISTS risk.exposed_populations;
DROP TABLE IF EXISTS risk.risk_scenarios;
DROP TABLE IF EXISTS risk.forecasts;
DROP TABLE IF EXISTS risk.risk_assessments;

DROP TABLE IF EXISTS incident.incident_aliases;
DROP TABLE IF EXISTS incident.affected_area_versions;
DROP TABLE IF EXISTS incident.incident_evidence_links;
DROP TABLE IF EXISTS incident.incident_observation_links;
DROP TABLE IF EXISTS incident.incident_transitions;
DROP TABLE IF EXISTS incident.incident_split_targets;
DROP TABLE IF EXISTS incident.incident_splits;
DROP TABLE IF EXISTS incident.incident_merge_sources;
DROP TABLE IF EXISTS incident.incident_merges;
DROP TABLE IF EXISTS incident.incident_relations;
DROP TABLE IF EXISTS incident.sub_incidents;
DROP TABLE IF EXISTS incident.discard_decisions;
DROP TABLE IF EXISTS incident.incident_promotions;
DROP TABLE IF EXISTS incident.incidents;
DROP TABLE IF EXISTS incident.hypotheses;
DROP TABLE IF EXISTS incident.incident_candidate_observations;
DROP TABLE IF EXISTS incident.incident_candidates;

DO $$ BEGIN DROP TYPE IF EXISTS command.recommendation_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS command.command_structure_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS risk.risk_scenario_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS risk.forecast_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS risk.risk_assessment_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS incident.causality_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS incident.incident_link_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS incident.incident_link_type_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS incident.incident_state_dimension_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS incident.incident_relation_type_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS incident.sub_incident_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS incident.incident_structural_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS incident.incident_trend_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS incident.incident_preventive_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS incident.incident_operational_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS incident.incident_verification_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS incident.hypothesis_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS incident.incident_candidate_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP SCHEMA IF EXISTS command;
DROP SCHEMA IF EXISTS risk;
DROP SCHEMA IF EXISTS incident;
