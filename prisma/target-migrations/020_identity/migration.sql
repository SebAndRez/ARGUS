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
    OR security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['ADMIN'])
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
    OR security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['ADMIN'])
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
    OR security.fn_has_any_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid)   -- public-summary read for any authenticated actor
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
  FOR SELECT USING ( security.fn_has_any_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid) );
CREATE POLICY capabilities_write_admin ON capability.capabilities
  FOR INSERT WITH CHECK ( security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['ADMIN']) );

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
-- SCHEMA-LEVEL USAGE (corrective session): table grants below are
-- unreachable without USAGE on their schema ("permission denied for
-- schema <x>" fires before RLS is even consulted). Proven by the real
-- non-superuser RLS matrix, scripts/migration-rehearsal/sql/rls-matrix-checks.sql.
GRANT USAGE ON SCHEMA identity TO app_api, ingest_worker, jobs_worker;
GRANT USAGE ON SCHEMA institution TO app_api, ingest_worker, jobs_worker, readonly_inspector;
GRANT USAGE ON SCHEMA capability TO app_api, readonly_inspector;
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

-- ============================================================
-- 8. security.access_subjects / security.access_role_assignments
--    (authorized design decision, this corrective session)
-- ============================================================
-- WHY THESE LIVE IN WAVE 020 AND NOT WAVE 010
-- They are `security.*` tables, but they carry REAL foreign keys to
-- identity.people and institution.organizations, which do not exist until
-- this wave. Declaring them in Wave 010 would have forced either a
-- polymorphic uuid with no referential integrity (explicitly forbidden: "No
-- implementes una FK polimorfica directa sin integridad referencial") or a
-- forward FK added later by ALTER — the first is the defect being fixed, the
-- second hides the integrity guarantee from the table's own definition. Wave
-- 020 is the earliest wave where the invariant is expressible as a constraint
-- instead of a convention.
--
-- WHAT EACH OF THE OVERLAPPING CONCEPTS IS, AND IS NOT
--   * security.access_roles            — the DEFINITION of an authorization
--                                        (code, version, status, ceiling,
--                                        permissions). Holds no identity.
--   * security.access_subjects         — the IDENTITY that can be authorized.
--                                        Holds no privilege.
--   * security.access_role_assignments — a concrete GRANT of one role to one
--                                        subject, with validity, scope and
--                                        revocation history.
--   * a PostgreSQL role (app_api, ...) — the technical connection principal.
--                                        Never a business clearance.
--   * command.command_roles            — an OPERATIONAL command position
--                                        inside an incident structure.
--   * institution.institutional_memberships — the affiliation relation.
-- None substitutes for another: an app_api connection with no assignment is
-- unauthorized, an institutional membership grants no clearance, and a command
-- role is not an access role.

CREATE TABLE IF NOT EXISTS security.access_subjects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type        security.actor_type_enum NOT NULL,
  -- Exactly ONE of the four identity references below is populated, enforced
  -- by ck_access_subjects_exactly_one_identity. Three are real FKs; the
  -- fourth is a controlled key rather than an FK because the target schema
  -- has no table for machine identities and inventing one is forbidden when a
  -- controlled column suffices ("system_identity_id o system_key
  -- controlado"). Its shape is constrained so it cannot decay into a
  -- free-text actor field.
  person_id           uuid NULL,
  organization_id     uuid NULL,
  automation_rule_id  uuid NULL,
  system_key          varchar(100) NULL,
  status              security.access_subject_status_enum NOT NULL DEFAULT 'ACTIVE',
  -- Provenance/lifecycle only. Deliberately NO email, legal name, phone or
  -- any other personal datum: this table is a JOIN TARGET for authorization,
  -- and duplicating PII here would create a second copy to protect, redact
  -- and expire (identity.people already owns that, under its own RLS).
  disabled_at         timestamptz NULL,
  disabled_reason_code varchar(50) NULL,
  legacy_source       varchar(100) NULL,
  legacy_record_id    text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_access_subjects_person
    FOREIGN KEY (person_id) REFERENCES identity.people(id) ON DELETE RESTRICT,
  CONSTRAINT fk_access_subjects_organization
    FOREIGN KEY (organization_id) REFERENCES institution.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_access_subjects_automation_rule
    FOREIGN KEY (automation_rule_id) REFERENCES governance.automation_rules(id) ON DELETE RESTRICT,
  -- Exactly one identity reference, never zero and never two.
  CONSTRAINT ck_access_subjects_exactly_one_identity CHECK (
    (CASE WHEN person_id          IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN organization_id    IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN automation_rule_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN system_key         IS NOT NULL THEN 1 ELSE 0 END) = 1
  ),
  -- The populated reference must be the one the declared subject_type implies,
  -- so a PERSON subject can never secretly point at an organization.
  CONSTRAINT ck_access_subjects_type_matches_identity CHECK (
    (subject_type = 'PERSON'          AND person_id          IS NOT NULL) OR
    (subject_type = 'ORGANIZATION'    AND organization_id    IS NOT NULL) OR
    (subject_type = 'AUTOMATION_RULE' AND automation_rule_id IS NOT NULL) OR
    (subject_type = 'SYSTEM'          AND system_key         IS NOT NULL)
  ),
  -- ANONYMOUS is a legitimate security.actor_type_enum label for an audit
  -- record, but it can never be a persisted, authorizable subject: there is
  -- no identity to bind, so there is nothing to authorize.
  CONSTRAINT ck_access_subjects_no_anonymous CHECK (subject_type <> 'ANONYMOUS'),
  CONSTRAINT ck_access_subjects_system_key_shape CHECK (
    system_key IS NULL OR system_key ~ '^[A-Z][A-Z0-9_]{2,99}$'
  ),
  CONSTRAINT ck_access_subjects_disabled_consistency CHECK (
    (status = 'DISABLED' AND disabled_at IS NOT NULL) OR
    (status = 'ACTIVE'   AND disabled_at IS NULL)
  )
);

-- One ACTIVE subject per identity. Partial uniques (not plain UNIQUE) so a
-- disabled subject can be superseded by a new one without deleting history,
-- while two ACTIVE subjects for the same identity — which would make "resolve
-- the subject for this actor" ambiguous and could hide a second set of grants
-- — are impossible.
CREATE UNIQUE INDEX IF NOT EXISTS uq_access_subjects_active_person
  ON security.access_subjects (person_id) WHERE status = 'ACTIVE' AND person_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_access_subjects_active_organization
  ON security.access_subjects (organization_id) WHERE status = 'ACTIVE' AND organization_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_access_subjects_active_automation_rule
  ON security.access_subjects (automation_rule_id) WHERE status = 'ACTIVE' AND automation_rule_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_access_subjects_active_system_key
  ON security.access_subjects (system_key) WHERE status = 'ACTIVE' AND system_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_access_subjects_status ON security.access_subjects (status);

CREATE TABLE IF NOT EXISTS security.access_role_assignments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_subject_id      uuid NOT NULL,
  -- A real FK to the role DEFINITION, never a free-text role name: an
  -- unparented string could not be deactivated, versioned, or capped.
  access_role_id         uuid NOT NULL,
  -- NULL = a global grant. Non-NULL = authorizes only while the session
  -- declares it is acting inside that institution.
  institution_id         uuid NULL,
  -- GENERAL = no purpose restriction. Any other value authorizes only when
  -- the session declares that exact purpose.
  purpose                security.access_purpose_enum NOT NULL DEFAULT 'GENERAL',
  status                 security.access_role_assignment_status_enum NOT NULL DEFAULT 'ACTIVE',
  valid_from             timestamptz NOT NULL DEFAULT now(),
  valid_until            timestamptz NULL,
  granted_by_subject_id  uuid NULL,
  granted_at             timestamptz NOT NULL DEFAULT now(),
  revoked_by_subject_id  uuid NULL,
  revoked_at             timestamptz NULL,
  revocation_reason_code varchar(50) NULL,
  source                 varchar(50) NOT NULL DEFAULT 'MANUAL_GRANT',
  legacy_source          varchar(100) NULL,
  legacy_record_id       text NULL,
  -- Idempotency key for the grant operation: a retried grant with the same
  -- key resolves to the SAME row instead of a second, silently overlapping
  -- authorization.
  idempotency_key        uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_access_role_assignments_subject
    FOREIGN KEY (access_subject_id) REFERENCES security.access_subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_access_role_assignments_role
    FOREIGN KEY (access_role_id) REFERENCES security.access_roles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_access_role_assignments_institution
    FOREIGN KEY (institution_id) REFERENCES institution.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_access_role_assignments_granted_by
    FOREIGN KEY (granted_by_subject_id) REFERENCES security.access_subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_access_role_assignments_revoked_by
    FOREIGN KEY (revoked_by_subject_id) REFERENCES security.access_subjects(id) ON DELETE RESTRICT,
  CONSTRAINT uq_access_role_assignments_idempotency UNIQUE (idempotency_key),
  CONSTRAINT ck_access_role_assignments_validity_window CHECK (
    valid_until IS NULL OR valid_until > valid_from
  ),
  -- A REVOKED row must say why and when; a non-revoked row must carry none of
  -- that. Without this, "revoked_at set but status still ACTIVE" would keep
  -- authorizing.
  CONSTRAINT ck_access_role_assignments_revocation_consistency CHECK (
    (status = 'REVOKED' AND revoked_at IS NOT NULL AND revocation_reason_code IS NOT NULL) OR
    (status <> 'REVOKED' AND revoked_at IS NULL AND revoked_by_subject_id IS NULL AND revocation_reason_code IS NULL)
  ),
  -- No self-granting: an assignment cannot be its own authority.
  CONSTRAINT ck_access_role_assignments_no_self_grant CHECK (
    granted_by_subject_id IS NULL OR granted_by_subject_id <> access_subject_id
  ),
  CONSTRAINT ck_access_role_assignments_source_shape CHECK (
    source ~ '^[A-Z][A-Z0-9_]{2,49}$'
  )
);

-- Two ACTIVE grants of the SAME role to the SAME subject in the SAME scope for
-- the SAME purpose are a silent overlap: revoking one would leave the other
-- authorizing, so the revocation would appear to succeed while access
-- continued. Made physically impossible here rather than checked in
-- application code.
--
-- Two partial unique indexes rather than one, because a NULL institution_id
-- makes a single multi-column UNIQUE non-restrictive in PostgreSQL — exactly
-- for the global-grant case that most needs restricting.
CREATE UNIQUE INDEX IF NOT EXISTS uq_access_role_assignments_active_scoped
  ON security.access_role_assignments (access_subject_id, access_role_id, institution_id, purpose)
  WHERE status = 'ACTIVE' AND institution_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_access_role_assignments_active_global
  ON security.access_role_assignments (access_subject_id, access_role_id, purpose)
  WHERE status = 'ACTIVE' AND institution_id IS NULL;

CREATE INDEX IF NOT EXISTS ix_access_role_assignments_subject_status
  ON security.access_role_assignments (access_subject_id, status);
CREATE INDEX IF NOT EXISTS ix_access_role_assignments_role
  ON security.access_role_assignments (access_role_id);
CREATE INDEX IF NOT EXISTS ix_access_role_assignments_validity
  ON security.access_role_assignments (valid_from, valid_until);
CREATE INDEX IF NOT EXISTS ix_access_role_assignments_institution
  ON security.access_role_assignments (institution_id) WHERE institution_id IS NOT NULL;

-- ------------------------------------------------------------
-- 8.1 RLS
-- ------------------------------------------------------------
-- These two tables ARE the authorization substrate, so they get the strictest
-- posture in the package: ENABLE + FORCE, no USING (true) anywhere, read gated
-- on a persisted ADMIN/AUDIT/SECURITY role (never on a session string), and NO
-- write policy for ANY role — every mutation goes through the SECURITY DEFINER
-- functions in 8.2, which validate and audit. A table that hands out clearance
-- must not be writable by the connection that consumes clearance.
ALTER TABLE security.access_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.access_subjects FORCE ROW LEVEL SECURITY;
-- A subject may see its OWN row (so a session can confirm who it is); ADMIN/
-- AUDIT/SECURITY may read all. Nothing else, and no write.
CREATE POLICY access_subjects_self_or_governance ON security.access_subjects
  FOR SELECT USING (
    id = security.fn_resolve_access_subject(NULLIF(current_setting('argus.actor_id', true), '')::uuid)
    OR security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['ADMIN','AUDIT','SECURITY'])
  );

ALTER TABLE security.access_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.access_role_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY access_role_assignments_self_or_governance ON security.access_role_assignments
  FOR SELECT USING (
    access_subject_id = security.fn_resolve_access_subject(NULLIF(current_setting('argus.actor_id', true), '')::uuid)
    OR security.fn_has_access_role(NULLIF(current_setting('argus.actor_id', true), '')::uuid, ARRAY['ADMIN','AUDIT','SECURITY'])
  );

-- ------------------------------------------------------------
-- 8.2 Administration — narrow SECURITY DEFINER operations
-- ------------------------------------------------------------
-- Revocation is a status transition plus a recorded decision, never a DELETE
-- and never a bare UPDATE: the row IS the history. No role holds
-- INSERT/UPDATE/DELETE on either table, so these functions are the only
-- writable path.
--
-- Every input is validated before anything is written, and every successful
-- mutation writes a security.audit_logs row THROUGH THE CANONICAL PARTITION
-- LIFECYCLE (fn_ensure_audit_log_partition_for_write, then INSERT) in the same
-- transaction — so an assignment change and its audit record commit or fail
-- together. The audit row carries ids and controlled codes only.

CREATE OR REPLACE FUNCTION security.fn_register_access_subject(
  p_subject_type       security.actor_type_enum,
  p_person_id          uuid DEFAULT NULL,
  p_organization_id    uuid DEFAULT NULL,
  p_automation_rule_id uuid DEFAULT NULL,
  p_system_key         varchar(100) DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, security
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  IF p_subject_type IS NULL THEN
    RAISE EXCEPTION 'ACCESS_SUBJECT_NULL_TYPE: subject_type is required'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;
  IF p_subject_type = 'ANONYMOUS' THEN
    RAISE EXCEPTION 'ACCESS_SUBJECT_ANONYMOUS_FORBIDDEN: ANONYMOUS can never be a persisted authorizable subject'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotent by identity: an already-registered ACTIVE subject for the same
  -- identity is returned rather than duplicated (the partial uniques would
  -- reject the duplicate anyway; this makes the retry succeed instead of
  -- erroring).
  SELECT s.id INTO v_id
  FROM security.access_subjects s
  WHERE s.status = 'ACTIVE'
    AND ( (p_person_id          IS NOT NULL AND s.person_id          = p_person_id)
       OR (p_organization_id    IS NOT NULL AND s.organization_id    = p_organization_id)
       OR (p_automation_rule_id IS NOT NULL AND s.automation_rule_id = p_automation_rule_id)
       OR (p_system_key         IS NOT NULL AND s.system_key         = p_system_key) );
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO security.access_subjects
    (subject_type, person_id, organization_id, automation_rule_id, system_key)
  VALUES
    (p_subject_type, p_person_id, p_organization_id, p_automation_rule_id, p_system_key)
  RETURNING id INTO v_id;

  RETURN v_id;
END
$fn$;

-- Shared audit step for both administration functions. Uses the canonical
-- partition lifecycle, so an assignment change can never fail for the reason
-- audit writes used to fail (no partition covering the current month).
CREATE OR REPLACE FUNCTION security.fn_audit_access_role_change(
  p_action           varchar(100),
  p_assignment_id    uuid,
  p_subject_id       uuid,
  p_role_code        text,
  p_reason_code      varchar(50),
  p_actor_subject_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, security, public
AS $fn$
DECLARE
  v_now timestamptz := now();
BEGIN
  PERFORM security.fn_ensure_audit_log_partition_for_write(v_now);
  INSERT INTO security.audit_logs
    (id, actor_type, actor_id, action, target_table, target_id, classification,
     context, purpose, decision, result, integrity_value, occurred_at)
  VALUES
    (gen_random_uuid(), 'SYSTEM',
     coalesce(p_actor_subject_id, '00000000-0000-0000-0000-000000000000'::uuid),
     p_action, 'security.access_role_assignments', p_assignment_id, 'RESTRICTED',
     -- Ids and controlled codes only. No email, name, phone or free text.
     jsonb_build_object('access_subject_id', p_subject_id,
                        'access_role_code', p_role_code,
                        'reason_code', p_reason_code),
     NULL, p_reason_code, 'SUCCESS',
     encode(hmac(p_action || ':' || p_assignment_id::text || ':' || v_now::text,
                 'ARGUS_ACCESS_ROLE_AUDIT_CHAIN', 'sha256'), 'hex'),
     v_now);
END
$fn$;

CREATE OR REPLACE FUNCTION security.fn_grant_access_role(
  p_access_subject_id     uuid,
  p_access_role_code      varchar(100),
  p_institution_id        uuid DEFAULT NULL,
  p_purpose               security.access_purpose_enum DEFAULT 'GENERAL',
  p_valid_from            timestamptz DEFAULT now(),
  p_valid_until           timestamptz DEFAULT NULL,
  p_granted_by_subject_id uuid DEFAULT NULL,
  p_source                varchar(50) DEFAULT 'MANUAL_GRANT',
  p_idempotency_key       uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, security
AS $fn$
DECLARE
  v_role_id  uuid;
  v_key      uuid := coalesce(p_idempotency_key, gen_random_uuid());
  v_existing uuid;
  v_id       uuid;
BEGIN
  -- Idempotency FIRST: a retry must be a no-op returning the same row, before
  -- any validation can reject it for a state the first call itself created.
  SELECT id INTO v_existing FROM security.access_role_assignments WHERE idempotency_key = v_key;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM security.access_subjects
                  WHERE id = p_access_subject_id AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'ACCESS_SUBJECT_NOT_ACTIVE: subject % does not exist or is disabled', p_access_subject_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT id INTO v_role_id FROM security.access_roles
  WHERE code = p_access_role_code AND status = 'ACTIVE'
  ORDER BY version DESC LIMIT 1;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'ACCESS_ROLE_NOT_ACTIVE: no ACTIVE access role with code %', p_access_role_code
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF p_valid_until IS NOT NULL AND p_valid_until <= p_valid_from THEN
    RAISE EXCEPTION 'ACCESS_ASSIGNMENT_INVALID_WINDOW: valid_until must be strictly after valid_from'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO security.access_role_assignments
    (access_subject_id, access_role_id, institution_id, purpose, status,
     valid_from, valid_until, granted_by_subject_id, source, idempotency_key)
  VALUES
    (p_access_subject_id, v_role_id, p_institution_id, p_purpose, 'ACTIVE',
     p_valid_from, p_valid_until, p_granted_by_subject_id, p_source, v_key)
  RETURNING id INTO v_id;

  PERFORM security.fn_audit_access_role_change(
    'ACCESS_ROLE_GRANTED', v_id, p_access_subject_id, p_access_role_code, NULL, p_granted_by_subject_id);

  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION security.fn_revoke_access_role(
  p_assignment_id          uuid,
  p_revocation_reason_code varchar(50),
  p_revoked_by_subject_id  uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, security
AS $fn$
DECLARE
  v_subject_id uuid;
  v_role_code  text;
  v_status     security.access_role_assignment_status_enum;
BEGIN
  IF p_revocation_reason_code IS NULL OR p_revocation_reason_code !~ '^[A-Z][A-Z0-9_]{2,49}$' THEN
    RAISE EXCEPTION 'ACCESS_ASSIGNMENT_INVALID_REASON_CODE: a controlled reason code is required to revoke'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT a.access_subject_id, r.code::text, a.status
  INTO v_subject_id, v_role_code, v_status
  FROM security.access_role_assignments a
  JOIN security.access_roles r ON r.id = a.access_role_id
  WHERE a.id = p_assignment_id
  FOR UPDATE OF a;

  IF v_subject_id IS NULL THEN
    RAISE EXCEPTION 'ACCESS_ASSIGNMENT_NOT_FOUND: assignment % does not exist', p_assignment_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Idempotent revocation: already-revoked is success-with-no-change, not an
  -- error, so a retried revoke never leaves the caller unsure.
  IF v_status = 'REVOKED' THEN
    RETURN false;
  END IF;

  UPDATE security.access_role_assignments
  SET status = 'REVOKED',
      revoked_at = now(),
      revoked_by_subject_id = p_revoked_by_subject_id,
      revocation_reason_code = p_revocation_reason_code,
      updated_at = now()
  WHERE id = p_assignment_id;

  PERFORM security.fn_audit_access_role_change(
    'ACCESS_ROLE_REVOKED', p_assignment_id, v_subject_id, v_role_code,
    p_revocation_reason_code, p_revoked_by_subject_id);

  RETURN true;
END
$fn$;

-- ------------------------------------------------------------
-- 8.3 Grants
-- ------------------------------------------------------------
-- PUBLIC gets nothing on either table and nothing on any administration
-- function. app_api / ingest_worker / jobs_worker get NO grant at all on the
-- two tables: the runtime reads authorization only through
-- security.fn_active_access_roles (SECURITY DEFINER, session-bound), so a
-- compromised runtime credential can neither enumerate nor alter the
-- authorization substrate even with a forged session context.
REVOKE ALL ON security.access_subjects FROM PUBLIC;
REVOKE ALL ON security.access_role_assignments FROM PUBLIC;

-- access_admin: the ONLY role that can change authorization, and only through
-- the validated, audited functions.
GRANT USAGE ON SCHEMA security TO access_admin;
GRANT USAGE ON SCHEMA identity, institution TO access_admin;
GRANT SELECT ON security.access_roles TO access_admin;
GRANT SELECT ON security.access_subjects, security.access_role_assignments TO access_admin;

REVOKE ALL ON FUNCTION security.fn_register_access_subject(security.actor_type_enum, uuid, uuid, uuid, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.fn_audit_access_role_change(varchar, uuid, uuid, text, varchar, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.fn_grant_access_role(uuid, varchar, uuid, security.access_purpose_enum, timestamptz, timestamptz, uuid, varchar, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.fn_revoke_access_role(uuid, varchar, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION security.fn_register_access_subject(security.actor_type_enum, uuid, uuid, uuid, varchar) TO access_admin;
GRANT EXECUTE ON FUNCTION security.fn_grant_access_role(uuid, varchar, uuid, security.access_purpose_enum, timestamptz, timestamptz, uuid, varchar, uuid) TO access_admin;
GRANT EXECUTE ON FUNCTION security.fn_revoke_access_role(uuid, varchar, uuid) TO access_admin;
-- fn_audit_access_role_change is INTERNAL: granted to nobody, reachable only
-- from inside the two SECURITY DEFINER functions above, so no caller can forge
-- an authorization audit entry without an actual authorization change.

-- readonly_inspector: the two tables are deliberately NOT added to its blanket
-- `GRANT SELECT ON ALL TABLES IN SCHEMA` (which ran before they existed) and
-- no grant is added here — an inspection role has no business enumerating who
-- holds which clearance.
