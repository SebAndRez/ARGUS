-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 090 — ICE, Media & Community
-- Schemas: ice (8 tables), media (8 tables), community (4 tables). D-08
-- applies to ice.*: all 8 tables CREATE_EMPTY, emergency access independent
-- of ordinary consent, fully auditable.
--
-- Authority: ARGUS_PHYSICAL_TABLE_CATALOG_v1.1_FROZEN.md §ice/§media/§community,
-- ARGUS_PHYSICAL_ACCESS_CONTROL_v1.1_FROZEN.md §4.14-4.16,
-- ARGUS_MIGRATION_DECISION_REGISTER_v1.0_FROZEN.md D-08, D-03 (community,
-- name-collision note vs. VESTA).
--
-- VERIFY_AGAINST_V1.0: `ice.emergency_profiles`'s PK-generation note (P2-09,
-- UUIDv4) is given directly in Table Catalog v1.1. Every other table in
-- this wave is reconstructed from cross-referenced clues, flagged per table.

CREATE SCHEMA IF NOT EXISTS ice;
CREATE SCHEMA IF NOT EXISTS media;
CREATE SCHEMA IF NOT EXISTS community;

-- ============================================================
-- 1. Local enums
-- ============================================================
DO $$ BEGIN CREATE TYPE ice.clinical_item_status_enum AS ENUM ('ACTIVE','RESOLVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #74, 2
DO $$ BEGIN CREATE TYPE ice.designation_status_enum AS ENUM ('ACTIVE','REVOKED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #75, 2

DO $$ BEGIN CREATE TYPE community.family_network_status_enum AS ENUM ('ACTIVE','INACTIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #78, 2
DO $$ BEGIN CREATE TYPE community.dependent_status_enum AS ENUM ('ACTIVE','INACTIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #79, 2
DO $$ BEGIN CREATE TYPE community.community_group_status_enum AS ENUM ('ACTIVE','INACTIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #80, 2
DO $$ BEGIN CREATE TYPE community.volunteer_status_enum AS ENUM ('ACTIVE','INACTIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #81, 2

DO $$ BEGIN CREATE TYPE media.publication_status_enum AS ENUM
  ('DRAFT','PENDING_REVIEW','APPROVED','PUBLIC','RETRACTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #82, 5
DO $$ BEGIN CREATE TYPE media.live_stream_status_enum AS ENUM
  ('SCHEDULED','LIVE','ENDED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #83, 4
DO $$ BEGIN CREATE TYPE media.usage_license_status_enum AS ENUM ('ACTIVE','REVOKED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$; -- #84, 2

-- ============================================================
-- 2. ice schema — 8 tables (D-08: all CREATE_EMPTY)
-- ============================================================

-- P2-09: id is UUIDv4 (gen_random_uuid()), NOT UUIDv7 — avoids temporal
-- metadata leak on the most sensitive table in the system. Table Catalog
-- v1.1 confirms this is the ONLY structural change from v1.0 for this table.
CREATE TABLE IF NOT EXISTS ice.emergency_profiles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_emergency_profiles_person FOREIGN KEY (person_id) REFERENCES identity.people(id) ON DELETE RESTRICT,
  CONSTRAINT uq_emergency_profiles_person UNIQUE (person_id)
);

-- VERIFY_AGAINST_V1.0. P3-03: kept as 5 separate tables, never fused into a
-- polymorphic clinical_items(kind, ...) — justified explicitly in Table
-- Catalog v1.1 (distinct validation semantics per clinical type, and the
-- cost of a discriminator JOIN on the lowest-latency-tolerance path of the
-- whole system — emergency medical access — is not acceptable).
CREATE TABLE IF NOT EXISTS ice.medical_conditions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_profile_id  uuid NOT NULL,
  condition_name        varchar(255) NOT NULL,
  status                ice.clinical_item_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_medical_conditions_profile FOREIGN KEY (emergency_profile_id) REFERENCES ice.emergency_profiles(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS ice.allergies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_profile_id  uuid NOT NULL,
  allergen              varchar(255) NOT NULL,
  severity              varchar(50) NULL,
  status                ice.clinical_item_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_allergies_profile FOREIGN KEY (emergency_profile_id) REFERENCES ice.emergency_profiles(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS ice.current_medications (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_profile_id  uuid NOT NULL,
  medication_name       varchar(255) NOT NULL,
  dose                  varchar(100) NULL,
  frequency             varchar(100) NULL,
  status                ice.clinical_item_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_current_medications_profile FOREIGN KEY (emergency_profile_id) REFERENCES ice.emergency_profiles(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS ice.medical_devices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_profile_id  uuid NOT NULL,
  device_name           varchar(255) NOT NULL,
  manufacturer          varchar(255) NULL,
  model                 varchar(255) NULL,
  status                ice.clinical_item_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_medical_devices_profile FOREIGN KEY (emergency_profile_id) REFERENCES ice.emergency_profiles(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS ice.special_needs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_profile_id  uuid NOT NULL,
  description           text NOT NULL,
  status                ice.clinical_item_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_special_needs_profile FOREIGN KEY (emergency_profile_id) REFERENCES ice.emergency_profiles(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0. D-08: 10 audit-grade concepts required — actor,
-- purpose, basis, incident, mission, data disclosed, start, expiry,
-- revocation, plus this table's own row being the audit record itself
-- (correlatable to security.audit_logs by actor/target_id).
CREATE TABLE IF NOT EXISTS ice.emergency_accesses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_profile_id  uuid NOT NULL,
  actor_type            security.actor_type_enum NOT NULL,
  actor_id              uuid NOT NULL,
  purpose               text NOT NULL,
  emergency_basis_id    uuid NULL,
  incident_id           uuid NULL,
  mission_id            uuid NULL,
  data_disclosed        jsonb NULL,
  granted_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,
  revoked_at            timestamptz NULL,
  CONSTRAINT fk_emergency_accesses_profile FOREIGN KEY (emergency_profile_id) REFERENCES ice.emergency_profiles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_emergency_accesses_basis FOREIGN KEY (emergency_basis_id) REFERENCES governance.emergency_bases(id) ON DELETE SET NULL,
  CONSTRAINT fk_emergency_accesses_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE SET NULL,
  CONSTRAINT fk_emergency_accesses_mission FOREIGN KEY (mission_id) REFERENCES mission.missions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_emergency_accesses_profile ON ice.emergency_accesses (emergency_profile_id);
CREATE INDEX IF NOT EXISTS ix_emergency_accesses_actor ON ice.emergency_accesses (actor_type, actor_id);

-- VERIFY_AGAINST_V1.0. D-08 corrects v1.0: NOT fed by EmergencyContact(VESTA).priority.
CREATE TABLE IF NOT EXISTS ice.emergency_contact_designations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_profile_id  uuid NOT NULL,
  contact_name          varchar(255) NOT NULL,
  contact_info          jsonb NOT NULL,
  priority              smallint NOT NULL DEFAULT 1,
  status                ice.designation_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_emergency_contact_designations_profile FOREIGN KEY (emergency_profile_id) REFERENCES ice.emergency_profiles(id) ON DELETE RESTRICT
);

-- ============================================================
-- 3. community schema — 4 tables (D-03: NOT fed by VESTA)
-- ============================================================

-- VERIFY_AGAINST_V1.0. D-03 corrects v1.0: NOT fed by FamilyPlan/PreparednessProfile.
CREATE TABLE IF NOT EXISTS community.family_networks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status     community.family_network_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS community.dependents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_network_id   uuid NULL,
  guardian_person_id  uuid NOT NULL,
  status              community.dependent_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_dependents_family_network FOREIGN KEY (family_network_id) REFERENCES community.family_networks(id) ON DELETE SET NULL,
  CONSTRAINT fk_dependents_guardian FOREIGN KEY (guardian_person_id) REFERENCES identity.people(id) ON DELETE RESTRICT,
  CONSTRAINT ck_dependents_has_guardian CHECK (guardian_person_id IS NOT NULL)
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS community.community_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  help_request_id uuid NULL,
  name            varchar(255) NOT NULL,
  status          community.community_group_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_community_groups_help_request FOREIGN KEY (help_request_id) REFERENCES help.help_requests(id) ON DELETE SET NULL
);

-- VERIFY_AGAINST_V1.0. Derived from User.role subset (volunteer-related values).
CREATE TABLE IF NOT EXISTS community.volunteers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id            uuid NOT NULL,
  status               community.volunteer_status_enum NOT NULL DEFAULT 'ACTIVE',
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL,
  migration_review_status varchar(30) NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_volunteers_person FOREIGN KEY (person_id) REFERENCES identity.people(id) ON DELETE RESTRICT,
  CONSTRAINT uq_volunteers_person UNIQUE (person_id)
);

-- ============================================================
-- 4. media schema — 8 tables
-- ============================================================

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS media.publications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NULL,
  status      media.publication_status_enum NOT NULL DEFAULT 'DRAFT',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_publications_evidence FOREIGN KEY (evidence_id) REFERENCES evidence.evidence_records(id) ON DELETE SET NULL
);

-- VERIFY_AGAINST_V1.0. 1:1 structural.
CREATE TABLE IF NOT EXISTS media.live_streams (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL UNIQUE,
  status         media.live_stream_status_enum NOT NULL DEFAULT 'SCHEDULED',
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_live_streams_publication FOREIGN KEY (publication_id) REFERENCES media.publications(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS media.content_moderations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id        uuid NOT NULL,
  moderated_by_actor_id uuid NULL,
  decision              varchar(50) NULL,
  moderated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_content_moderations_publication FOREIGN KEY (publication_id) REFERENCES media.publications(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0. Logical analog to toPublicReport()'s redaction
-- pattern, never persisted today.
CREATE TABLE IF NOT EXISTS media.anonymizations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL,
  method         varchar(100) NULL,
  applied_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_anonymizations_publication FOREIGN KEY (publication_id) REFERENCES media.publications(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS media.redactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id  uuid NOT NULL,
  redacted_fields jsonb NULL,
  applied_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_redactions_publication FOREIGN KEY (publication_id) REFERENCES media.publications(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS media.visual_maskings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL,
  mask_kind      varchar(100) NULL,
  applied_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_visual_maskings_publication FOREIGN KEY (publication_id) REFERENCES media.publications(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS media.usage_licenses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL,
  license_kind   varchar(100) NULL,
  status         media.usage_license_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_usage_licenses_publication FOREIGN KEY (publication_id) REFERENCES media.publications(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS media.publication_authorizations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id        uuid NOT NULL,
  authorized_by_actor_id uuid NULL,
  authorized_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_publication_authorizations_publication FOREIGN KEY (publication_id) REFERENCES media.publications(id) ON DELETE RESTRICT
);

-- ============================================================
-- 5. RLS (Access Control v1.1 §4.14-4.16 — ice is CRITICAL, the strictest
--    tier after audit_logs)
-- ============================================================
ALTER TABLE ice.emergency_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ice.emergency_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY emergency_profiles_owner_or_emergency ON ice.emergency_profiles
  FOR ALL USING (
    security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', person_id)
    OR (security.fn_has_active_assignment(current_setting('argus.actor_id')::uuid,
        current_setting('argus.access_mission_id', true)::uuid)
        AND current_setting('argus.access_purpose', true) IS NOT NULL)
    OR security.fn_has_emergency_access(current_setting('argus.actor_id')::uuid, id)
  );

ALTER TABLE ice.medical_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ice.medical_conditions FORCE ROW LEVEL SECURITY;
CREATE POLICY medical_conditions_inherit ON ice.medical_conditions
  FOR ALL USING ( EXISTS (SELECT 1 FROM ice.emergency_profiles ep WHERE ep.id = emergency_profile_id
    AND (security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', ep.person_id)
         OR security.fn_has_emergency_access(current_setting('argus.actor_id')::uuid, ep.id))) );

ALTER TABLE ice.allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ice.allergies FORCE ROW LEVEL SECURITY;
CREATE POLICY allergies_inherit ON ice.allergies
  FOR ALL USING ( EXISTS (SELECT 1 FROM ice.emergency_profiles ep WHERE ep.id = emergency_profile_id
    AND (security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', ep.person_id)
         OR security.fn_has_emergency_access(current_setting('argus.actor_id')::uuid, ep.id))) );

ALTER TABLE ice.current_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ice.current_medications FORCE ROW LEVEL SECURITY;
CREATE POLICY current_medications_inherit ON ice.current_medications
  FOR ALL USING ( EXISTS (SELECT 1 FROM ice.emergency_profiles ep WHERE ep.id = emergency_profile_id
    AND (security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', ep.person_id)
         OR security.fn_has_emergency_access(current_setting('argus.actor_id')::uuid, ep.id))) );

ALTER TABLE ice.medical_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE ice.medical_devices FORCE ROW LEVEL SECURITY;
CREATE POLICY medical_devices_inherit ON ice.medical_devices
  FOR ALL USING ( EXISTS (SELECT 1 FROM ice.emergency_profiles ep WHERE ep.id = emergency_profile_id
    AND (security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', ep.person_id)
         OR security.fn_has_emergency_access(current_setting('argus.actor_id')::uuid, ep.id))) );

ALTER TABLE ice.special_needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ice.special_needs FORCE ROW LEVEL SECURITY;
CREATE POLICY special_needs_inherit ON ice.special_needs
  FOR ALL USING ( EXISTS (SELECT 1 FROM ice.emergency_profiles ep WHERE ep.id = emergency_profile_id
    AND (security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', ep.person_id)
         OR security.fn_has_emergency_access(current_setting('argus.actor_id')::uuid, ep.id))) );

-- ice.emergency_accesses: audit role exclusive, read-only for everyone else.
ALTER TABLE ice.emergency_accesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ice.emergency_accesses FORCE ROW LEVEL SECURITY;
CREATE POLICY emergency_accesses_audit_only ON ice.emergency_accesses
  FOR SELECT USING ( current_setting('argus.actor_role', true) = 'AUDIT'
    OR actor_id = current_setting('argus.actor_id')::uuid );
CREATE POLICY emergency_accesses_insert_service ON ice.emergency_accesses
  FOR INSERT WITH CHECK ( true );  -- INSERT always allowed (recording an access is never blocked); no UPDATE/DELETE policy at all (append-only)

ALTER TABLE ice.emergency_contact_designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ice.emergency_contact_designations FORCE ROW LEVEL SECURITY;
CREATE POLICY ecd_inherit ON ice.emergency_contact_designations
  FOR ALL USING ( EXISTS (SELECT 1 FROM ice.emergency_profiles ep WHERE ep.id = emergency_profile_id
    AND security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', ep.person_id)) );

-- community.*
ALTER TABLE community.family_networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE community.family_networks FORCE ROW LEVEL SECURITY;
CREATE POLICY family_networks_member ON community.family_networks
  FOR ALL USING ( EXISTS (SELECT 1 FROM community.dependents d WHERE d.family_network_id = family_networks.id
    AND security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', d.guardian_person_id)) );

ALTER TABLE community.dependents ENABLE ROW LEVEL SECURITY;
ALTER TABLE community.dependents FORCE ROW LEVEL SECURITY;
CREATE POLICY dependents_guardian ON community.dependents
  FOR ALL USING ( security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', guardian_person_id) );

ALTER TABLE community.community_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE community.community_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY community_groups_institutional_or_open ON community.community_groups
  FOR ALL USING ( current_setting('argus.actor_role', true) IS NOT NULL );

ALTER TABLE community.volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE community.volunteers FORCE ROW LEVEL SECURITY;
CREATE POLICY volunteers_owner_or_institutional ON community.volunteers
  FOR ALL USING ( security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', person_id)
    OR current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

-- media.* — variable until PUBLIC
ALTER TABLE media.publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE media.publications FORCE ROW LEVEL SECURITY;
CREATE POLICY publications_public_or_membership ON media.publications
  FOR SELECT USING ( status = 'PUBLIC' OR current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE media.live_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE media.live_streams FORCE ROW LEVEL SECURITY;
CREATE POLICY live_streams_inherit ON media.live_streams
  FOR ALL USING ( EXISTS (SELECT 1 FROM media.publications p WHERE p.id = publication_id
    AND (p.status = 'PUBLIC' OR current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN'))) );

ALTER TABLE media.content_moderations ENABLE ROW LEVEL SECURITY;
ALTER TABLE media.content_moderations FORCE ROW LEVEL SECURITY;
CREATE POLICY content_moderations_inherit ON media.content_moderations
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE media.anonymizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE media.anonymizations FORCE ROW LEVEL SECURITY;
CREATE POLICY anonymizations_inherit ON media.anonymizations
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE media.redactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE media.redactions FORCE ROW LEVEL SECURITY;
CREATE POLICY redactions_inherit ON media.redactions
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE media.visual_maskings ENABLE ROW LEVEL SECURITY;
ALTER TABLE media.visual_maskings FORCE ROW LEVEL SECURITY;
CREATE POLICY visual_maskings_inherit ON media.visual_maskings
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE media.usage_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE media.usage_licenses FORCE ROW LEVEL SECURITY;
CREATE POLICY usage_licenses_inherit ON media.usage_licenses
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE media.publication_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE media.publication_authorizations FORCE ROW LEVEL SECURITY;
CREATE POLICY publication_authorizations_inherit ON media.publication_authorizations
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

-- ============================================================
-- 6. Grants
-- ============================================================
-- GRANT ... ON ALL TABLES IN SCHEMA ice alone is not reachable without
-- schema USAGE too (rls-runtime-checks.sql Fase 12: "permission denied for
-- schema ice" without this).
-- SCHEMA-LEVEL USAGE (corrective session): table grants below are
-- unreachable without USAGE on their schema ("permission denied for
-- schema <x>" fires before RLS is even consulted). Proven by the real
-- non-superuser RLS matrix, scripts/migration-rehearsal/sql/rls-matrix-checks.sql.
GRANT USAGE ON SCHEMA ice TO readonly_inspector;
GRANT USAGE ON SCHEMA community TO app_api, jobs_worker, readonly_inspector;
GRANT USAGE ON SCHEMA media TO app_api, jobs_worker, readonly_inspector;
GRANT USAGE ON SCHEMA ice TO app_api;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA ice TO app_api;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA community TO app_api;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA media TO app_api;
GRANT SELECT ON ALL TABLES IN SCHEMA ice TO readonly_inspector;
GRANT SELECT ON ALL TABLES IN SCHEMA community TO readonly_inspector, jobs_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA media TO readonly_inspector, jobs_worker;
