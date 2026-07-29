-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 020 — Identity — Rollback
-- Must run AFTER every later wave's (030-100) rollback (they may reference
-- identity.people/institution.organizations), and BEFORE 010_foundation's
-- rollback (this wave's deferred-FK ALTERs on governance/security must be
-- dropped first).

-- 1. Drop the 4 deferred-FK resolutions added to Wave 010's tables
ALTER TABLE security.audit_logs DROP CONSTRAINT IF EXISTS fk_audit_logs_operational_session;
ALTER TABLE security.audit_logs DROP CONSTRAINT IF EXISTS fk_audit_logs_device;
ALTER TABLE governance.resource_reservation_rules DROP CONSTRAINT IF EXISTS fk_rrr_institution;
ALTER TABLE governance.jurisdictions DROP CONSTRAINT IF EXISTS fk_jurisdictions_declaring_organization;

-- 2. Revoke grants
REVOKE SELECT ON ALL TABLES IN SCHEMA capability FROM readonly_inspector;
REVOKE SELECT ON ALL TABLES IN SCHEMA institution FROM readonly_inspector;
REVOKE SELECT ON ALL TABLES IN SCHEMA identity FROM readonly_inspector;
REVOKE SELECT, INSERT, UPDATE ON capability.capabilities, capability.accreditations, capability.licenses,
  capability.availability_declarations FROM app_api;
REVOKE SELECT ON institution.organizations, institution.organizational_units FROM ingest_worker, jobs_worker;
REVOKE SELECT, INSERT, UPDATE ON institution.organizations, institution.organizational_units,
  institution.institutional_memberships, institution.institutional_credentials FROM app_api;
REVOKE SELECT ON identity.people, identity.user_accounts FROM ingest_worker, jobs_worker;
REVOKE SELECT, INSERT, UPDATE ON identity.people, identity.user_accounts, identity.verified_identities,
  identity.liveness_checks, identity.devices, identity.operational_sessions, identity.reputation_events,
  identity.emergency_contacts, identity.consents FROM app_api;

-- 2b. Drop the MIGRATION_REVIEW_QUEUE view (backfill.sql) before any table
--     it depends on, or those DROP TABLE statements fail with "other
--     objects depend on it".
DROP VIEW IF EXISTS identity.vw_migration_review_queue;

-- 3. Drop capability schema tables (children first)
DROP TABLE IF EXISTS capability.availability_declarations;
DROP TABLE IF EXISTS capability.licenses;
DROP TABLE IF EXISTS capability.accreditations;
DROP TABLE IF EXISTS capability.capabilities;

-- 4. Drop institution schema tables (children first)
-- people_owner_or_membership (a policy ON identity.people) references
-- institution.institutional_memberships in its USING clause, which blocks
-- dropping institutional_memberships while that policy still exists
-- (circular with the FK direction, which requires institutional_memberships
-- dropped before people) - drop the policy explicitly first, same pattern
-- as Wave 090/060's family_networks_member/resources_institution_or_reservation fixes.
DROP POLICY IF EXISTS people_owner_or_membership ON identity.people;
DROP TABLE IF EXISTS institution.institutional_credentials;
DROP TABLE IF EXISTS institution.institutional_memberships;
DROP TABLE IF EXISTS institution.organizational_units;
DROP TABLE IF EXISTS institution.organizations;

-- 5. Drop identity schema tables (children first)
DROP TABLE IF EXISTS identity.consents;
DROP TABLE IF EXISTS identity.emergency_contacts;
DROP TABLE IF EXISTS identity.reputation_events;
DROP TABLE IF EXISTS identity.operational_sessions;
DROP TABLE IF EXISTS identity.devices;
DROP TABLE IF EXISTS identity.liveness_checks;
DROP TABLE IF EXISTS identity.verified_identities;
DROP TABLE IF EXISTS identity.user_accounts;
DROP TABLE IF EXISTS identity.people;

-- 6. Drop local enums (guarded)
DO $$ BEGIN DROP TYPE IF EXISTS capability.capability_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS institution.organizational_unit_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS institution.organization_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS capability.availability_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS capability.license_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS capability.license_permit_kind_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS capability.accreditation_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS capability.accreditation_subject_type_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS institution.credential_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS institution.institutional_membership_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS identity.trust_domain_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS identity.operational_session_end_reason_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS identity.operational_session_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS identity.verified_identity_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS identity.user_account_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 7. Drop schemas (only if empty)
DROP SCHEMA IF EXISTS capability;
DROP SCHEMA IF EXISTS institution;
DROP SCHEMA IF EXISTS identity;
