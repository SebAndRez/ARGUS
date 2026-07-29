-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 020 — Identity
-- Schemas: identity (9 tables), institution (4 tables), capability (4 tables).
-- Decision D-01 (Migration Decision Register v1.0 FROZEN) governs this wave:
-- no synthetic "default organization" is ever created; institution.* is
-- populated CREATE_EMPTY, and identity.people/user_accounts migrate with a
-- derived institution_assignment_status = UNASSIGNED (computed, not stored).
--
-- Authority: ARGUS_PHYSICAL_TABLE_CATALOG_v1.1_FROZEN.md §identity/§institution/
-- §capability, ARGUS_PHYSICAL_ENUMS_REFERENCE_DATA_v1.1_FROZEN.md,
-- ARGUS_PHYSICAL_ACCESS_CONTROL_v1.1_FROZEN.md §4.1-4.3,
-- ARGUS_MIGRATION_DECISION_REGISTER_v1.0_FROZEN.md D-01.
--
-- VERIFY_AGAINST_V1.0: Table Catalog v1.1 explicitly defers the full 40-field
-- fichas for identity.*/institution.*/capability.* (unmodified in v1.1) to
-- ARGUS_PHYSICAL_TABLE_CATALOG_v1.0.md, a document NOT available in this
-- session. The column sets below are reconstructed from cross-referenced
-- clues in the v1.1 frozen documents that ARE available (Access Control
-- v1.1 §4.1-4.3 ownership-column names, Enums Reference v1.1 §1 enum
-- names/value-counts per table, Target-Current Mapping v1.1 §1 field names
-- cited for the User-split), structurally consistent with those documents
-- but NOT independently confirmed field-for-field against v1.0. Every table
-- in this file is flagged VERIFY_AGAINST_V1.0 in its own comment as a
-- reminder to reconcile against the v1.0 ficha before this draft is treated
-- as final DDL. `capability.accreditations` is the one exception — its full
-- ficha IS given directly in Table Catalog v1.1 (modified by P2-03) and is
-- transcribed verbatim, not reconstructed.

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS institution;
CREATE SCHEMA IF NOT EXISTS capability;

-- ============================================================
-- 1. Local enums (Enums Reference v1.1 §1, rows 4-15)
-- ============================================================
DO $$ BEGIN CREATE TYPE identity.user_account_status_enum AS ENUM
  ('PENDING_VERIFICATION','ACTIVE','SUSPENDED','LOCKED','DEACTIVATED','DELETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- 6 values (#4)
DO $$ BEGIN CREATE TYPE identity.verified_identity_status_enum AS ENUM
  ('UNVERIFIED','PENDING','VERIFIED','REJECTED','EXPIRED','REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- 6 values (#5)
DO $$ BEGIN CREATE TYPE identity.operational_session_status_enum AS ENUM
  ('ACTIVE','IDLE','ENDED','EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- 4 values (#6)
DO $$ BEGIN CREATE TYPE identity.operational_session_end_reason_enum AS ENUM
  ('LOGOUT','TIMEOUT','REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- 3 values (#7)
DO $$ BEGIN CREATE TYPE identity.trust_domain_enum AS ENUM
  ('GENERAL','TERRITORIAL','WITNESS','MEDICAL','LOGISTICS','COMMAND','VOLUNTEER','INSTITUTIONAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- 8 values (#8), placeholder labels flagged for review
DO $$ BEGIN CREATE TYPE institution.institutional_membership_status_enum AS ENUM
  ('ACTIVE','SUSPENDED','ENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- 3 values (#9)
DO $$ BEGIN CREATE TYPE institution.credential_status_enum AS ENUM
  ('ACTIVE','EXPIRED','REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- 3 values (#10)
DO $$ BEGIN CREATE TYPE capability.accreditation_subject_type_enum AS ENUM
  ('PERSON','ORGANIZATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- 2 values (#11)
DO $$ BEGIN CREATE TYPE capability.accreditation_status_enum AS ENUM
  ('ACTIVE','EXPIRED','REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- 3 values (#12)
DO $$ BEGIN CREATE TYPE capability.license_permit_kind_enum AS ENUM
  ('LICENSE','PERMIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- 2 values (#13)
DO $$ BEGIN CREATE TYPE capability.license_status_enum AS ENUM
  ('ACTIVE','EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- 2 values (#14)
DO $$ BEGIN CREATE TYPE capability.availability_status_enum AS ENUM
  ('AVAILABLE','UNAVAILABLE','ON_MISSION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- 3 values (#15)
DO $$ BEGIN CREATE TYPE institution.organization_status_enum AS ENUM
  ('ACTIVE','INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- 2 values (#113)
DO $$ BEGIN CREATE TYPE institution.organizational_unit_status_enum AS ENUM
  ('ACTIVE','INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- 2 values (#114)
DO $$ BEGIN CREATE TYPE capability.capability_status_enum AS ENUM
  ('ACTIVE','DEPRECATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;   -- 2 values (#115)

-- ============================================================
-- 2. identity schema — 9 tables
-- ============================================================

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS identity.people (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name           varchar(255) NOT NULL,
  display_alias        varchar(255) NULL,
  national_id_hash     text NULL,           -- hashed, never plaintext national ID
  contact_info         jsonb NULL,
  -- D-02 legacy provenance (backfilled from User, 7 rows):
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL CHECK (migration_confidence IN ('HIGH','MEDIUM','LOW')),
  migration_review_status varchar(30) NULL CHECK (migration_review_status IN
    ('AUTO_MAPPED','REQUIRES_REVIEW','REVIEWED_APPROVED','REVIEWED_REJECTED')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
-- D-01: institution_assignment_status is NEVER a stored column — derived as
-- NOT EXISTS (SELECT 1 FROM institution.institutional_memberships WHERE
-- person_id = people.id AND effective_to IS NULL) => 'UNASSIGNED'.

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS identity.user_accounts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id            uuid NOT NULL UNIQUE,
  email                varchar(320) NOT NULL,
  password_hash        text NULL,
  google_sub           varchar(255) NULL,
  auth_provider        varchar(50) NOT NULL DEFAULT 'LOCAL',
  status               identity.user_account_status_enum NOT NULL DEFAULT 'PENDING_VERIFICATION',
  last_login_at        timestamptz NULL,
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL CHECK (migration_confidence IN ('HIGH','MEDIUM','LOW')),
  migration_review_status varchar(30) NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_user_accounts_person FOREIGN KEY (person_id) REFERENCES identity.people(id) ON DELETE RESTRICT,
  CONSTRAINT uq_user_accounts_email UNIQUE (email),
  CONSTRAINT uq_user_accounts_google_sub UNIQUE (google_sub)
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS identity.verified_identities (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id            uuid NOT NULL,
  status               identity.verified_identity_status_enum NOT NULL DEFAULT 'UNVERIFIED',
  verified_at          timestamptz NULL,
  document_type        varchar(50) NULL,
  document_country     varchar(2) NULL,
  document_identifier  text NULL,
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL,
  migration_review_status varchar(30) NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_verified_identities_person FOREIGN KEY (person_id) REFERENCES identity.people(id) ON DELETE RESTRICT
);
-- Partial unique: at most one ACTIVE/VERIFIED row per person (Keys/Constraints
-- v1.1 §4 "máximo una fila activa"):
CREATE UNIQUE INDEX IF NOT EXISTS uq_verified_identities_person_active
  ON identity.verified_identities (person_id) WHERE status = 'VERIFIED';

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS identity.liveness_checks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verified_identity_id  uuid NOT NULL,
  performed_at          timestamptz NOT NULL DEFAULT now(),
  result                boolean NOT NULL,
  CONSTRAINT fk_liveness_checks_verified_identity
    FOREIGN KEY (verified_identity_id) REFERENCES identity.verified_identities(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS identity.devices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id           uuid NOT NULL,
  device_fingerprint  text NOT NULL,
  label               varchar(255) NULL,
  registered_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NULL,
  CONSTRAINT fk_devices_person FOREIGN KEY (person_id) REFERENCES identity.people(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS identity.operational_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_account_id    uuid NOT NULL,
  device_id          uuid NULL,
  status             identity.operational_session_status_enum NOT NULL DEFAULT 'ACTIVE',
  end_reason         identity.operational_session_end_reason_enum NULL,
  started_at         timestamptz NOT NULL DEFAULT now(),
  ended_at           timestamptz NULL,
  CONSTRAINT fk_operational_sessions_user_account
    FOREIGN KEY (user_account_id) REFERENCES identity.user_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_operational_sessions_device
    FOREIGN KEY (device_id) REFERENCES identity.devices(id) ON DELETE SET NULL
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS identity.reputation_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id            uuid NOT NULL,
  trust_domain         identity.trust_domain_enum NOT NULL DEFAULT 'GENERAL',
  delta                numeric(6,2) NOT NULL,
  reason               text NULL,
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL,
  migration_review_status varchar(30) NULL,
  occurred_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_reputation_events_person FOREIGN KEY (person_id) REFERENCES identity.people(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_reputation_events_person_id ON identity.reputation_events (person_id);

-- VERIFY_AGAINST_V1.0. Note (D-03 collision warning): this is DISTINCT from
-- ice.emergency_contact_designations (Wave 090) and from EmergencyContact
-- (VESTA, current database, LEGACY_READ_ONLY) — never conflate the three.
CREATE TABLE IF NOT EXISTS identity.emergency_contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL,
  contact_name  varchar(255) NOT NULL,
  contact_info  jsonb NOT NULL,
  priority      smallint NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_emergency_contacts_person FOREIGN KEY (person_id) REFERENCES identity.people(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS identity.consents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id            uuid NOT NULL,
  purpose              text NOT NULL,
  granted_at           timestamptz NOT NULL DEFAULT now(),
  revoked_at           timestamptz NULL,
  version              integer NOT NULL DEFAULT 1,
  legacy_status        text NULL,
  legacy_source        varchar(100) NULL,
  legacy_record_id     text NULL,
  migration_confidence varchar(10) NULL,
  migration_review_status varchar(30) NULL,
  CONSTRAINT fk_consents_person FOREIGN KEY (person_id) REFERENCES identity.people(id) ON DELETE RESTRICT
);

-- ============================================================
-- 3. institution schema — 4 tables (D-01: all CREATE_EMPTY, 0 synthetic rows)
-- ============================================================

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS institution.organizations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     varchar(255) NOT NULL,
  registration_identifier  varchar(100) NULL,
  status                   institution.organization_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_organizations_registration_identifier UNIQUE (registration_identifier)
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS institution.organizational_units (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name            varchar(255) NOT NULL,
  status          institution.organizational_unit_status_enum NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT fk_organizational_units_organization
    FOREIGN KEY (organization_id) REFERENCES institution.organizations(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS institution.institutional_memberships (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id        uuid NOT NULL,
  organization_id  uuid NOT NULL,
  role_label       varchar(100) NULL,
  status           institution.institutional_membership_status_enum NOT NULL DEFAULT 'ACTIVE',
  effective_from   timestamptz NOT NULL DEFAULT now(),
  effective_to     timestamptz NULL,
  CONSTRAINT fk_institutional_memberships_person
    FOREIGN KEY (person_id) REFERENCES identity.people(id) ON DELETE RESTRICT,
  CONSTRAINT fk_institutional_memberships_organization
    FOREIGN KEY (organization_id) REFERENCES institution.organizations(id) ON DELETE RESTRICT
);
-- Partial unique: at most one ACTIVE membership per (person, organization):
CREATE UNIQUE INDEX IF NOT EXISTS uq_institutional_memberships_active
  ON institution.institutional_memberships (person_id, organization_id) WHERE effective_to IS NULL;

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS institution.institutional_credentials (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institutional_membership_id uuid NOT NULL,
  credential_kind             varchar(100) NOT NULL,
  status                      institution.credential_status_enum NOT NULL DEFAULT 'ACTIVE',
  issued_at                   timestamptz NOT NULL DEFAULT now(),
  expires_at                  timestamptz NULL,
  CONSTRAINT fk_institutional_credentials_membership
    FOREIGN KEY (institutional_membership_id) REFERENCES institution.institutional_memberships(id) ON DELETE RESTRICT
);

-- ============================================================
-- 4. capability schema — 4 tables
-- ============================================================

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS capability.capabilities (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code    varchar(100) NOT NULL,
  name    varchar(255) NOT NULL,
  status  capability.capability_status_enum NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT uq_capabilities_code UNIQUE (code)
);

-- Full ficha given directly in Table Catalog v1.1 (P2-03 modification) —
-- transcribed verbatim, not reconstructed.
CREATE TABLE IF NOT EXISTS capability.accreditations (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type                capability.accreditation_subject_type_enum NOT NULL,
  subject_id                  uuid NOT NULL,
  capability_id               uuid NOT NULL,
  issuer_organization_id      uuid NULL,
  status                      capability.accreditation_status_enum NOT NULL DEFAULT 'ACTIVE',
  effective_from              timestamptz NOT NULL DEFAULT now(),
  effective_to                timestamptz NULL,
  restrictions                jsonb NULL,
  restrictions_schema_version integer NOT NULL DEFAULT 1,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_accreditations_capability
    FOREIGN KEY (capability_id) REFERENCES capability.capabilities(id) ON DELETE RESTRICT,
  CONSTRAINT fk_accreditations_issuer_organization
    FOREIGN KEY (issuer_organization_id) REFERENCES institution.organizations(id) ON DELETE SET NULL,
  CONSTRAINT ck_accreditations_restrictions_schema_version
    CHECK (restrictions IS NULL OR restrictions_schema_version >= 1)
);
CREATE INDEX IF NOT EXISTS ix_accreditations_subject ON capability.accreditations (subject_type, subject_id);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS capability.licenses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accreditation_id uuid NOT NULL,
  permit_kind      capability.license_permit_kind_enum NOT NULL,
  status           capability.license_status_enum NOT NULL DEFAULT 'ACTIVE',
  issued_at        timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NULL,
  CONSTRAINT fk_licenses_accreditation
    FOREIGN KEY (accreditation_id) REFERENCES capability.accreditations(id) ON DELETE RESTRICT
);

-- VERIFY_AGAINST_V1.0
CREATE TABLE IF NOT EXISTS capability.availability_declarations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type    capability.accreditation_subject_type_enum NOT NULL,
  subject_id      uuid NOT NULL,
  status          capability.availability_status_enum NOT NULL DEFAULT 'AVAILABLE',
  declared_at     timestamptz NOT NULL DEFAULT now(),
  effective_from  timestamptz NOT NULL DEFAULT now(),
  effective_to    timestamptz NULL
);
CREATE INDEX IF NOT EXISTS ix_availability_declarations_subject
  ON capability.availability_declarations (subject_type, subject_id);

-- ============================================================
-- 5. Deferred FKs from Wave 010 — now resolvable
-- ============================================================
ALTER TABLE governance.jurisdictions
  ADD CONSTRAINT fk_jurisdictions_declaring_organization
  FOREIGN KEY (declaring_organization_id) REFERENCES institution.organizations(id) ON DELETE SET NULL;

ALTER TABLE governance.resource_reservation_rules
  ADD CONSTRAINT fk_rrr_institution
  FOREIGN KEY (institution_id) REFERENCES institution.organizations(id) ON DELETE SET NULL;

ALTER TABLE security.audit_logs
  ADD CONSTRAINT fk_audit_logs_device
  FOREIGN KEY (device_id) REFERENCES identity.devices(id) ON DELETE SET NULL;

ALTER TABLE security.audit_logs
  ADD CONSTRAINT fk_audit_logs_operational_session
  FOREIGN KEY (operational_session_id) REFERENCES identity.operational_sessions(id) ON DELETE SET NULL;

-- ============================================================
-- 6. RLS — enable + policy per Access Control v1.1 §4.1-4.3 (D-08 pattern
--    reused: ownership template from 010_foundation/rls_policies.sql)
-- ============================================================
ALTER TABLE identity.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.people FORCE ROW LEVEL SECURITY;
CREATE POLICY people_owner_or_membership ON identity.people
  FOR SELECT USING (
    security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', id)
    OR EXISTS (SELECT 1 FROM institution.institutional_memberships im WHERE im.person_id = people.id
               AND security.fn_has_active_membership(current_setting('argus.actor_id')::uuid, im.organization_id))
    OR current_setting('argus.actor_role', true) = 'ADMIN'
  );

ALTER TABLE identity.user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.user_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY user_accounts_owner ON identity.user_accounts
  FOR ALL USING ( security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', person_id) );

ALTER TABLE identity.verified_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.verified_identities FORCE ROW LEVEL SECURITY;
CREATE POLICY verified_identities_owner_or_issuer ON identity.verified_identities
  FOR SELECT USING ( security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', person_id) );

ALTER TABLE identity.liveness_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.liveness_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY liveness_checks_inherit ON identity.liveness_checks
  FOR SELECT USING ( EXISTS (
    SELECT 1 FROM identity.verified_identities vi WHERE vi.id = verified_identity_id
      AND security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', vi.person_id)
  ) );

ALTER TABLE identity.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.devices FORCE ROW LEVEL SECURITY;
CREATE POLICY devices_owner ON identity.devices
  FOR ALL USING ( security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', person_id) );

ALTER TABLE identity.operational_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.operational_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY operational_sessions_owner ON identity.operational_sessions
  FOR ALL USING ( EXISTS (
    SELECT 1 FROM identity.user_accounts ua WHERE ua.id = user_account_id
      AND security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', ua.person_id)
  ) );

ALTER TABLE identity.reputation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.reputation_events FORCE ROW LEVEL SECURITY;
CREATE POLICY reputation_events_owner_or_admin ON identity.reputation_events
  FOR SELECT USING (
    security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', person_id)
    OR current_setting('argus.actor_role', true) = 'ADMIN'
  );

ALTER TABLE identity.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.emergency_contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY emergency_contacts_owner ON identity.emergency_contacts
  FOR ALL USING ( security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', person_id) );

ALTER TABLE identity.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.consents FORCE ROW LEVEL SECURITY;
CREATE POLICY consents_owner ON identity.consents
  FOR ALL USING ( security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', person_id) );

-- institution.organizations: OPERATIONAL-RESTRICTED, membership OR classification-allowed
ALTER TABLE institution.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organizations_membership_or_public_summary ON institution.organizations
  FOR SELECT USING (
    security.fn_has_active_membership(current_setting('argus.actor_id')::uuid, id)
    OR current_setting('argus.actor_role', true) IS NOT NULL   -- public-summary read for any authenticated actor
  );

ALTER TABLE institution.organizational_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.organizational_units FORCE ROW LEVEL SECURITY;
CREATE POLICY organizational_units_membership ON institution.organizational_units
  FOR ALL USING ( security.fn_has_active_membership(current_setting('argus.actor_id')::uuid, organization_id) );

ALTER TABLE institution.institutional_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.institutional_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY institutional_memberships_owner_or_institution ON institution.institutional_memberships
  FOR ALL USING (
    security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', person_id)
    OR security.fn_has_active_membership(current_setting('argus.actor_id')::uuid, organization_id)
  );

ALTER TABLE institution.institutional_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.institutional_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY institutional_credentials_inherit ON institution.institutional_credentials
  FOR ALL USING ( EXISTS (
    SELECT 1 FROM institution.institutional_memberships im WHERE im.id = institutional_membership_id
      AND (security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', im.person_id)
           OR security.fn_has_active_membership(current_setting('argus.actor_id')::uuid, im.organization_id))
  ) );

-- capability.capabilities: OPERATIONAL, read for any authenticated actor, write ADMIN.
ALTER TABLE capability.capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE capability.capabilities FORCE ROW LEVEL SECURITY;
CREATE POLICY capabilities_read_open_write_admin ON capability.capabilities
  FOR SELECT USING ( current_setting('argus.actor_role', true) IS NOT NULL );
CREATE POLICY capabilities_write_admin ON capability.capabilities
  FOR INSERT WITH CHECK ( current_setting('argus.actor_role', true) = 'ADMIN' );

ALTER TABLE capability.accreditations ENABLE ROW LEVEL SECURITY;
ALTER TABLE capability.accreditations FORCE ROW LEVEL SECURITY;
CREATE POLICY accreditations_owner_or_issuer ON capability.accreditations
  FOR ALL USING (
    (subject_type = 'PERSON' AND security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', subject_id))
    OR security.fn_has_active_membership(current_setting('argus.actor_id')::uuid, issuer_organization_id)
  );

ALTER TABLE capability.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE capability.licenses FORCE ROW LEVEL SECURITY;
CREATE POLICY licenses_inherit ON capability.licenses
  FOR ALL USING ( EXISTS (
    SELECT 1 FROM capability.accreditations a WHERE a.id = accreditation_id
      AND (a.subject_type = 'PERSON' AND security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', a.subject_id))
  ) );

ALTER TABLE capability.availability_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE capability.availability_declarations FORCE ROW LEVEL SECURITY;
CREATE POLICY availability_declarations_owner_or_institution ON capability.availability_declarations
  FOR ALL USING (
    (subject_type = 'PERSON' AND security.fn_is_owner(current_setting('argus.actor_id')::uuid, 'people', subject_id))
  );

-- ============================================================
-- 7. Grants
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON identity.people, identity.user_accounts, identity.verified_identities,
  identity.liveness_checks, identity.devices, identity.operational_sessions, identity.reputation_events,
  identity.emergency_contacts, identity.consents TO app_api;
GRANT SELECT ON identity.people, identity.user_accounts TO ingest_worker, jobs_worker;
GRANT SELECT, INSERT, UPDATE ON institution.organizations, institution.organizational_units,
  institution.institutional_memberships, institution.institutional_credentials TO app_api;
GRANT SELECT ON institution.organizations, institution.organizational_units TO ingest_worker, jobs_worker;
GRANT SELECT, INSERT, UPDATE ON capability.capabilities, capability.accreditations, capability.licenses,
  capability.availability_declarations TO app_api;
-- GRANT SELECT ON ... alone is not reachable without schema USAGE too
-- (rls-runtime-checks.sql Fase 12: "permission denied for schema identity"
-- without this).
GRANT USAGE ON SCHEMA identity TO readonly_inspector;
GRANT SELECT ON ALL TABLES IN SCHEMA identity TO readonly_inspector;
GRANT SELECT ON ALL TABLES IN SCHEMA institution TO readonly_inspector;
GRANT SELECT ON ALL TABLES IN SCHEMA capability TO readonly_inspector;
