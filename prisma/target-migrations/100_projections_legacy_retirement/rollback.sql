-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 100 — Rollback. This is the LAST wave in migration order, so its
-- rollback runs FIRST of all 11 waves' rollbacks (reverse of application
-- order: 100, 090, 080, ..., 010, 000). No later wave depends on anything
-- created here.

REVOKE EXECUTE ON FUNCTION proj.incident_cards(uuid) FROM app_api;
REVOKE EXECUTE ON FUNCTION proj.operational_context(uuid, uuid) FROM app_api;
REVOKE EXECUTE ON FUNCTION proj.requester_view(uuid) FROM app_api;
REVOKE EXECUTE ON FUNCTION proj.assigned_unit_view(uuid) FROM app_api;
REVOKE EXECUTE ON FUNCTION proj.institutional_view(uuid, uuid) FROM app_api;
REVOKE EXECUTE ON FUNCTION proj.nearby_professional_feed(uuid) FROM app_api;
-- proj.notification_feed_for_actor(uuid) is disabled in migration.sql (no
-- recipient identity column exists to support it) - it was never granted,
-- so nothing to revoke; unlike DROP FUNCTION IF EXISTS below, REVOKE has no
-- safe no-op form for a function that was never created.
REVOKE SELECT ON ALL TABLES IN SCHEMA proj FROM app_api, ingest_worker, jobs_worker, readonly_inspector;
REVOKE SELECT ON ALL TABLES IN SCHEMA knowledge FROM readonly_inspector, jobs_worker;
REVOKE SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA knowledge FROM app_api;

DROP FUNCTION IF EXISTS proj.incident_cards(uuid);
DROP FUNCTION IF EXISTS proj.operational_context(uuid, uuid);
DROP FUNCTION IF EXISTS proj.requester_view(uuid);
DROP FUNCTION IF EXISTS proj.assigned_unit_view(uuid);
DROP FUNCTION IF EXISTS proj.institutional_view(uuid, uuid);
DROP FUNCTION IF EXISTS proj.nearby_professional_feed(uuid);
DROP FUNCTION IF EXISTS proj.notification_feed_for_actor(uuid);
DROP MATERIALIZED VIEW IF EXISTS proj._notification_feed_internal;
DROP VIEW IF EXISTS proj.legacy_vesta_preparedness_profiles;
DROP VIEW IF EXISTS proj.operational_unit_member_counts;
DROP VIEW IF EXISTS proj.public_alert_feed;
DROP MATERIALIZED VIEW IF EXISTS proj.public_map_feed;
DROP VIEW IF EXISTS proj.mission_timelines;
DROP VIEW IF EXISTS proj.incident_timelines;
DROP VIEW IF EXISTS proj.trust_profile_detail;
DROP MATERIALIZED VIEW IF EXISTS proj.trust_profiles;

-- Drop the MIGRATION_REVIEW_QUEUE view (backfill.sql) before any table it
-- depends on, or those DROP TABLE statements fail with "other objects depend on it".
DROP VIEW IF EXISTS knowledge.vw_migration_review_queue;

-- knowledge.* — children before parents
DROP TABLE IF EXISTS knowledge.simulation_results;
DROP TABLE IF EXISTS knowledge.simulations;
DROP TABLE IF EXISTS knowledge.knowledge_facts;
DROP TABLE IF EXISTS knowledge.knowledge_documents;
DROP TABLE IF EXISTS knowledge.procedures;
DROP TABLE IF EXISTS knowledge.lesson_learned_findings;
DROP TABLE IF EXISTS knowledge.corrective_actions;
DROP TABLE IF EXISTS knowledge.lessons_learned;
DROP TABLE IF EXISTS knowledge.improvement_recommendations;
DROP TABLE IF EXISTS knowledge.findings;
DROP TABLE IF EXISTS knowledge.after_action_reviews;

DO $$ BEGIN DROP TYPE IF EXISTS knowledge.simulation_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS knowledge.fact_kind_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS knowledge.knowledge_document_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS knowledge.procedure_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS knowledge.lesson_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS knowledge.corrective_action_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS knowledge.recommendation_review_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS knowledge.finding_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS knowledge.aar_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP SCHEMA IF EXISTS proj;
DROP SCHEMA IF EXISTS knowledge;

-- NOTE: pg_trgm is left installed on rollback of this wave — other waves/
-- future features may depend on it; only 000_preflight-adjacent extension
-- teardown would consider dropping it, and even then only after confirming
-- no other index depends on it (none does elsewhere in this package today).

-- NOTE: §5 of migration.sql (ExternalEventCorrelation/KnowledgeEmbeddingRecord
-- retirement) is documentary only in this wave and was never executed here,
-- so there is nothing to roll back for it.
