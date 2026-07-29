-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 090 — Rollback. Must run after 100's rollback (Wave 100 references
-- none of ice/media/community, so no ordering hazard there), before 080-010
-- rollbacks (this wave's FKs point backward only, to identity/security/
-- incident/mission/help/evidence — none of them deferred, all resolved at
-- CREATE TABLE time, so there is no deferred-FK ALTER to drop first here
-- unlike Wave 080/020).

REVOKE SELECT ON ALL TABLES IN SCHEMA ice FROM readonly_inspector;
REVOKE SELECT ON ALL TABLES IN SCHEMA community FROM readonly_inspector, jobs_worker;
REVOKE SELECT ON ALL TABLES IN SCHEMA media FROM readonly_inspector, jobs_worker;
REVOKE SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA ice FROM app_api;
REVOKE SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA community FROM app_api;
REVOKE SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA media FROM app_api;

-- Drop the MIGRATION_REVIEW_QUEUE view (backfill.sql) before any table it
-- depends on, or those DROP TABLE statements fail with "other objects depend on it".
DROP VIEW IF EXISTS ice.vw_migration_review_queue;

-- media.* — children of publications first
DROP TABLE IF EXISTS media.publication_authorizations;
DROP TABLE IF EXISTS media.usage_licenses;
DROP TABLE IF EXISTS media.visual_maskings;
DROP TABLE IF EXISTS media.redactions;
DROP TABLE IF EXISTS media.anonymizations;
DROP TABLE IF EXISTS media.content_moderations;
DROP TABLE IF EXISTS media.live_streams;
DROP TABLE IF EXISTS media.publications;

-- community.* — children of family_networks (and independent tables) first.
-- family_networks_member (a policy ON family_networks) references
-- community.dependents in its USING clause, which blocks dropping dependents
-- while that policy still exists (circular with the FK direction below,
-- which requires dependents dropped before family_networks) - drop the
-- policy explicitly first to break the cycle without disturbing FK order.
DROP POLICY IF EXISTS family_networks_member ON community.family_networks;
DROP TABLE IF EXISTS community.volunteers;
DROP TABLE IF EXISTS community.community_groups;
DROP TABLE IF EXISTS community.dependents;
DROP TABLE IF EXISTS community.family_networks;

-- ice.* — satellites of emergency_profiles first
DROP TABLE IF EXISTS ice.emergency_contact_designations;
DROP TABLE IF EXISTS ice.emergency_accesses;
DROP TABLE IF EXISTS ice.special_needs;
DROP TABLE IF EXISTS ice.medical_devices;
DROP TABLE IF EXISTS ice.current_medications;
DROP TABLE IF EXISTS ice.allergies;
DROP TABLE IF EXISTS ice.medical_conditions;
DROP TABLE IF EXISTS ice.emergency_profiles;

DO $$ BEGIN DROP TYPE IF EXISTS media.usage_license_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS media.live_stream_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS media.publication_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS community.volunteer_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS community.community_group_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS community.dependent_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS community.family_network_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS ice.designation_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS ice.clinical_item_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP SCHEMA IF EXISTS media;
DROP SCHEMA IF EXISTS community;
DROP SCHEMA IF EXISTS ice;
