-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 010 — Foundation
-- Schemas: governance (15 tables), security (10 tables). Extensions:
-- pgcrypto, postgis. See README.md for full scope and cross-wave FK notes.
--
-- Authority: ARGUS_PHYSICAL_TABLE_CATALOG_v1.1_FROZEN.md,
-- ARGUS_PHYSICAL_KEYS_CONSTRAINTS_INDEXES_v1.1_FROZEN.md,
-- ARGUS_PHYSICAL_ENUMS_REFERENCE_DATA_v1.1_FROZEN.md,
-- ARGUS_PHYSICAL_ACCESS_CONTROL_v1.1_FROZEN.md.

-- ============================================================
-- 0. Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid() for UUIDv4 PKs (ice.emergency_profiles, security.audit_logs)
CREATE EXTENSION IF NOT EXISTS postgis;    -- geography(...) columns used from Wave 080 onward; installed here so later waves need not re-check

-- SQL_COMPLEMENTARY_REQUIRED: UUIDv7 generation. Native pg_uuidv7 or an
-- equivalent extension/function must be installed for the "id uuid PK,
-- UUIDv7 salvo excepción" convention used across the 168-table catalog.
-- PostgreSQL 17 (confirmed live version per
-- ARGUS_CURRENT_DATABASE_BASELINE_v1.0.md §0) does not have a native
-- gen_random_uuid_v7() built-in as of this draft — a vetted UUIDv7
-- function/extension choice is a human decision outside this file's scope.
-- Every CREATE TABLE below uses `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
-- as a structurally-correct placeholder (produces UUIDv4, not UUIDv7) and
-- flags this exception explicitly rather than silently under-delivering
-- the UUIDv7 requirement.

-- ============================================================
-- 1. Schemas
-- ============================================================
CREATE SCHEMA IF NOT EXISTS governance;
CREATE SCHEMA IF NOT EXISTS security;

-- ============================================================
-- 2. Enums used first-time in this wave
-- ============================================================
-- Transversal enums (used across many later-wave schemas; created here
-- because governance/security is the first wave that needs them):
DO $$ BEGIN
  CREATE TYPE security.information_classification_enum AS ENUM
    ('PUBLIC','OPERATIONAL','SENSITIVE','RESTRICTED','CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE security.actor_type_enum AS ENUM
    ('PERSON','ORGANIZATION','SYSTEM','AUTOMATION_RULE','ANONYMOUS');
  -- 5 values per Enums Reference v1.1 #3. Exact label set is a human
  -- decision at DDL-review time; ARGUS_PHYSICAL_ENUMS_REFERENCE_DATA
  -- does not enumerate the 5 literal labels, only the count and role
  -- (transversal polymorphic Actor discriminator) — labels above are a
  -- structurally-reasonable placeholder, flagged for review.
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- governance-local enums
DO $$ BEGIN
  CREATE TYPE governance.territorial_configuration_status_enum AS ENUM ('ACTIVE','INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE governance.rule_status_enum AS ENUM ('PROPOSED','APPROVED','ACTIVE','DEPRECATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE governance.policy_publication_status_enum AS ENUM ('DRAFT','PUBLISHED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE governance.jurisdiction_scope_role_enum AS ENUM ('PRIMARY','COORDINATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE governance.emergency_basis_category_enum AS ENUM
    ('LIFE_THREATENING','INCAPACITY','LEGAL_MANDATE','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE governance.emergency_basis_status_enum AS ENUM ('ACTIVE','DEPRECATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- resource_type_enum: first used by governance.resource_reservation_rules
-- (nullable — NULL = applies to all resource types); reused unchanged by
-- resource.resources.resource_type in Wave 060. Created here, not there.
DO $$ BEGIN
  CREATE TYPE governance.resource_type_enum AS ENUM
    ('PERSON','EQUIPMENT','FACILITY','VEHICLE','SUPPLY','SERVICE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- security-local enums
DO $$ BEGIN CREATE TYPE security.policy_status_enum AS ENUM ('ACTIVE','DEPRECATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE security.permission_status_enum AS ENUM ('ACTIVE','DEPRECATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE security.access_role_status_enum AS ENUM ('ACTIVE','DEPRECATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE security.contextual_access_basis_enum AS ENUM
    ('OWNERSHIP','MEMBERSHIP','ASSIGNMENT','PROXIMITY','CLASSIFICATION','EMERGENCY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE security.contextual_access_status_enum AS ENUM ('ACTIVE','EXPIRED','REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE security.access_decision_enum AS ENUM ('GRANTED','DENIED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE security.security_severity_kind_enum AS ENUM ('EVENT','CONFIRMED_INCIDENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE security.security_event_status_enum AS ENUM
    ('DETECTED','INVESTIGATING','CONFIRMED','DISCARDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 3. governance schema — 15 tables
-- ============================================================

CREATE TABLE IF NOT EXISTS governance.territorial_configurations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(255) NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  status      governance.territorial_configuration_status_enum NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS governance.operational_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                varchar(255) NOT NULL,
  version             integer NOT NULL DEFAULT 1,
  status              governance.rule_status_enum NOT NULL DEFAULT 'PROPOSED',
  approved_by_actor_id uuid NULL,   -- polymorphic Actor, no FK by design
  effective_from      timestamptz NOT NULL DEFAULT now(),
  effective_to        timestamptz NULL
);

CREATE TABLE IF NOT EXISTS governance.automation_rules (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                            varchar(255) NOT NULL,
  version                         integer NOT NULL DEFAULT 1,
  status                          governance.rule_status_enum NOT NULL DEFAULT 'PROPOSED',
  confidence_threshold            numeric(5,2) NULL,
  required_corroboration_count    smallint NULL,
  approved_by_actor_id            uuid NULL,  -- polymorphic Actor, no FK
  effective_from                 timestamptz NOT NULL DEFAULT now(),
  effective_to                    timestamptz NULL
);

CREATE TABLE IF NOT EXISTS governance.incident_categories (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code  varchar(100) NOT NULL,
  name  varchar(255) NOT NULL,
  CONSTRAINT uq_incident_categories_code UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS governance.incident_types (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                        varchar(100) NOT NULL,
  incident_category_id        uuid NOT NULL,
  elevates_classification_to  security.information_classification_enum NULL,
  version                     integer NOT NULL DEFAULT 1,
  effective_from              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_incident_types_code UNIQUE (code),
  CONSTRAINT fk_incident_types_category
    FOREIGN KEY (incident_category_id) REFERENCES governance.incident_categories(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS governance.automation_rule_incident_types (
  automation_rule_id  uuid NOT NULL,
  incident_type_id    uuid NOT NULL,
  PRIMARY KEY (automation_rule_id, incident_type_id),
  CONSTRAINT fk_arit_automation_rule
    FOREIGN KEY (automation_rule_id) REFERENCES governance.automation_rules(id) ON DELETE CASCADE,
  CONSTRAINT fk_arit_incident_type
    FOREIGN KEY (incident_type_id) REFERENCES governance.incident_types(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS governance.doctrine_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_label varchar(50) NOT NULL,
  adopted_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS governance.feature_flags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        varchar(100) NOT NULL,
  is_enabled  boolean NOT NULL DEFAULT false,
  CONSTRAINT uq_feature_flags_code UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS governance.emergency_bases (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category              governance.emergency_basis_category_enum NOT NULL,
  description           text NOT NULL,
  max_access_duration   interval NOT NULL,
  version               integer NOT NULL DEFAULT 1,
  status                governance.emergency_basis_status_enum NOT NULL DEFAULT 'ACTIVE'
);

-- jurisdictions: primary_administrative_area_id -> geo.administrative_areas
-- (Wave 080) and declaring_organization_id -> institution.organizations
-- (Wave 020) are FORWARD references — geo and institution schemas do not
-- exist yet in this wave. Columns are created NOT NULL / NULL as specified
-- by the catalog, WITHOUT the FK constraint here; the FK is added by
-- ALTER TABLE in the wave that creates the referenced table (see Wave 020's
-- and Wave 080's migration.sql "deferred FK" sections). This is the
-- documented, intentional resolution for governance's forward dependencies
-- — not an omission.
CREATE TABLE IF NOT EXISTS governance.jurisdictions (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                            varchar(255) NOT NULL,
  primary_administrative_area_id  uuid NOT NULL,   -- FK to geo.administrative_areas deferred to Wave 080
  declaring_organization_id       uuid NULL,        -- FK to institution.organizations deferred to Wave 020
  legal_basis                     text NULL,
  approved_by_actor_type          security.actor_type_enum NULL,
  approved_by_actor_id            uuid NULL,        -- polymorphic Actor, no FK
  version                         integer NOT NULL DEFAULT 1,
  effective_from                  timestamptz NOT NULL DEFAULT now(),
  effective_to                    timestamptz NULL,
  CONSTRAINT uq_jurisdictions_area_org_basis
    UNIQUE (primary_administrative_area_id, declaring_organization_id, legal_basis, version)
);

CREATE TABLE IF NOT EXISTS governance.jurisdiction_scopes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id  uuid NOT NULL,
  scoped_table     varchar(50) NOT NULL,
  scoped_id           uuid NOT NULL,   -- polymorphic, no FK by design
  scope_role             governance.jurisdiction_scope_role_enum NOT NULL,
  CONSTRAINT fk_jurisdiction_scopes_jurisdiction
    FOREIGN KEY (jurisdiction_id) REFERENCES governance.jurisdictions(id) ON DELETE RESTRICT,
  CONSTRAINT ck_jurisdiction_scopes_table_whitelist CHECK (
    scoped_table IN (
      'organizations','resources','operational_rules','automation_rules',
      'hazard_types','administrative_area_kinds','resource_reservation_rules'
    )
  )
);

CREATE TABLE IF NOT EXISTS governance.policies (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    varchar(255) NOT NULL,
  version                 integer NOT NULL DEFAULT 1,
  status                  governance.policy_publication_status_enum NOT NULL DEFAULT 'PUBLISHED',
  approved_by_actor_type  security.actor_type_enum NULL,
  approved_by_actor_id    uuid NULL   -- polymorphic Actor, no FK
);

-- resource_reservation_rules: institution_id -> institution.organizations
-- is a FORWARD reference (Wave 020). Same deferred-FK treatment as
-- jurisdictions above.
CREATE TABLE IF NOT EXISTS governance.resource_reservation_rules (
  id                                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type                        governance.resource_type_enum NULL,  -- NULL = applies to all resource types
  institution_id                       uuid NULL,   -- FK to institution.organizations deferred to Wave 020
  pending_confirmation_ttl_connected   interval NOT NULL DEFAULT '5 minutes',
  pending_confirmation_ttl_degraded    interval NOT NULL DEFAULT '15 minutes',
  max_extension_count                  smallint NOT NULL DEFAULT 1,
  max_extension_duration               interval NOT NULL,
  release_on_rejection                 boolean NOT NULL DEFAULT true,
  release_on_unavailability            boolean NOT NULL DEFAULT true,
  compensation_rule                    text NULL,
  priority                             integer NOT NULL DEFAULT 100,
  version                              integer NOT NULL DEFAULT 1,
  status                               governance.rule_status_enum NOT NULL DEFAULT 'PROPOSED',
  approved_by_actor_type               security.actor_type_enum NULL,
  approved_by_actor_id                 uuid NULL,   -- polymorphic Actor, no FK
  effective_from                       timestamptz NOT NULL DEFAULT now(),
  effective_to                         timestamptz NULL,
  supersedes_rule_id                   uuid NULL,
  created_at                           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_rrr_supersedes
    FOREIGN KEY (supersedes_rule_id) REFERENCES governance.resource_reservation_rules(id) ON DELETE SET NULL,
  CONSTRAINT ck_rrr_extension_count_positive CHECK (max_extension_count >= 0),
  CONSTRAINT ck_rrr_ttl_positive CHECK (pending_confirmation_ttl_connected > interval '0'),
  CONSTRAINT ck_rrr_degraded_ge_connected CHECK (pending_confirmation_ttl_degraded >= pending_confirmation_ttl_connected)
);
-- Obligatory index (Keys/Constraints v1.1 §9, #31):
CREATE INDEX IF NOT EXISTS ix_rrr_resource_type_institution_priority
  ON governance.resource_reservation_rules (resource_type, institution_id, priority DESC);

CREATE TABLE IF NOT EXISTS governance.hazard_types (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                    varchar(100) NOT NULL,
  name                    varchar(255) NOT NULL,
  description             text NULL,
  version                 integer NOT NULL DEFAULT 1,
  status                  governance.rule_status_enum NOT NULL DEFAULT 'PROPOSED',
  approved_by_actor_type  security.actor_type_enum NULL,
  approved_by_actor_id    uuid NULL,
  effective_from          timestamptz NOT NULL DEFAULT now(),
  effective_to            timestamptz NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hazard_types_code UNIQUE (code)
);
-- Seed (Enums Reference v1.1 §2.1): incendio, inundacion, sismo, tsunami,
-- erupcion volcanica, deslizamiento, sequia, epidemia — seed INSERTs belong
-- to the backfill step, not this DDL file (no data manipulation here).

CREATE TABLE IF NOT EXISTS governance.administrative_area_kinds (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                    varchar(50) NOT NULL,
  name                    varchar(255) NOT NULL,
  hierarchy_level         smallint NOT NULL,
  version                 integer NOT NULL DEFAULT 1,
  status                  governance.rule_status_enum NOT NULL DEFAULT 'PROPOSED',
  approved_by_actor_type  security.actor_type_enum NULL,
  approved_by_actor_id    uuid NULL,
  effective_from          timestamptz NOT NULL DEFAULT now(),
  effective_to            timestamptz NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_administrative_area_kinds_code UNIQUE (code)
);
CREATE INDEX IF NOT EXISTS ix_administrative_area_kinds_hierarchy_level
  ON governance.administrative_area_kinds (hierarchy_level);

-- ============================================================
-- 4. security schema — 10 tables
-- ============================================================

CREATE TABLE IF NOT EXISTS security.access_policies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(255) NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  status      security.policy_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security.permissions (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code     varchar(100) NOT NULL,
  status   security.permission_status_enum NOT NULL DEFAULT 'ACTIVE',
  version  integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_permissions_code UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS security.access_roles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            varchar(100) NOT NULL,
  version         integer NOT NULL DEFAULT 1,
  status          security.access_role_status_enum NOT NULL DEFAULT 'ACTIVE',
  effective_from  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_access_roles_code_version UNIQUE (code, version)
);

CREATE TABLE IF NOT EXISTS security.access_role_permissions (
  access_role_id  uuid NOT NULL,
  permission_id   uuid NOT NULL,
  PRIMARY KEY (access_role_id, permission_id),
  CONSTRAINT fk_arp_access_role FOREIGN KEY (access_role_id) REFERENCES security.access_roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_arp_permission FOREIGN KEY (permission_id) REFERENCES security.permissions(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_access_role_permissions_permission_id
  ON security.access_role_permissions (permission_id);

CREATE TABLE IF NOT EXISTS security.contextual_accesses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_policy_id    uuid NOT NULL,
  actor_type          security.actor_type_enum NOT NULL,
  actor_id            uuid NOT NULL,
  target_table        varchar(50) NOT NULL,
  target_id           uuid NOT NULL,   -- polymorphic, no FK by design
  basis               security.contextual_access_basis_enum NOT NULL,
  emergency_basis_id  uuid NULL,
  status              security.contextual_access_status_enum NOT NULL DEFAULT 'ACTIVE',
  granted_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  revoked_at          timestamptz NULL,
  CONSTRAINT fk_contextual_accesses_policy
    FOREIGN KEY (access_policy_id) REFERENCES security.access_policies(id) ON DELETE RESTRICT,
  CONSTRAINT fk_contextual_accesses_emergency_basis
    FOREIGN KEY (emergency_basis_id) REFERENCES governance.emergency_bases(id) ON DELETE SET NULL,
  CONSTRAINT ck_contextual_accesses_expires_at_required CHECK (expires_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_contextual_accesses_actor ON security.contextual_accesses (actor_type, actor_id);
CREATE INDEX IF NOT EXISTS ix_contextual_accesses_target ON security.contextual_accesses (target_table, target_id);
CREATE INDEX IF NOT EXISTS ix_contextual_accesses_expires_at ON security.contextual_accesses (expires_at);

CREATE TABLE IF NOT EXISTS security.access_decisions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_table  varchar(50) NOT NULL,
  requested_id     uuid NOT NULL,
  actor_type       security.actor_type_enum NOT NULL,
  actor_id         uuid NOT NULL,
  decision         security.access_decision_enum NOT NULL,
  reason           text NULL,
  decided_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_access_decisions_requested ON security.access_decisions (requested_table, requested_id);

-- audit_logs: UUIDv4 PK (P2-09 — avoids temporal metadata leak), monthly
-- RANGE partition by occurred_at ACTIVATED FROM THE START (D-02, approved
-- decision, not conditional). device_id/operational_session_id (Wave 020),
-- incident_id (Wave 040), mission_id (Wave 050), jurisdiction_id (this
-- wave, governance.jurisdictions) — the first three are FORWARD references,
-- deferred the same way as governance.jurisdictions above.
CREATE TABLE IF NOT EXISTS security.audit_logs (
  id                        uuid NOT NULL DEFAULT gen_random_uuid(),  -- UUIDv4 by design, not UUIDv7 (P2-09)
  sequence_number           bigserial NOT NULL,
  actor_type                security.actor_type_enum NOT NULL,
  actor_id                  uuid NOT NULL,
  action                    varchar(100) NOT NULL,
  target_table              varchar(50) NOT NULL,
  target_id                 uuid NOT NULL,   -- polymorphic, no FK by design
  classification            security.information_classification_enum NOT NULL,
  context                   jsonb NULL,
  purpose                   text NULL,
  decision                  text NULL,
  result                    text NOT NULL,
  before_state              jsonb NULL,
  after_state               jsonb NULL,
  integrity_value           text NOT NULL,
  integrity_algorithm       varchar(20) NOT NULL DEFAULT 'HMAC-SHA256',
  canonicalization_version  integer NOT NULL DEFAULT 1,
  integrity_key_id          varchar(50) NULL,
  correlation_id            uuid NULL,
  device_id                 uuid NULL,              -- FK to identity.devices deferred to Wave 020
  operational_session_id    uuid NULL,              -- FK to identity.operational_sessions deferred to Wave 020
  incident_id               uuid NULL,              -- FK to incident.incidents deferred to Wave 040
  mission_id                uuid NULL,              -- FK to mission.missions deferred to Wave 050
  jurisdiction_id           uuid NULL,
  occurred_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, occurred_at),   -- occurred_at must be part of the PK for a partitioned table in PostgreSQL
  CONSTRAINT fk_audit_logs_jurisdiction
    FOREIGN KEY (jurisdiction_id) REFERENCES governance.jurisdictions(id) ON DELETE SET NULL
) PARTITION BY RANGE (occurred_at);

-- SQL_COMPLEMENTARY_REQUIRED: automated monthly partition creation
-- (pg_partman or an equivalent scheduled job) for security.audit_logs.
-- One illustrative initial partition, NOT a substitute for the automated
-- mechanism:
CREATE TABLE IF NOT EXISTS security.audit_logs_y2026m07
  PARTITION OF security.audit_logs
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE INDEX IF NOT EXISTS ix_audit_logs_target ON security.audit_logs (target_table, target_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_actor ON security.audit_logs (actor_type, actor_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_occurred_at ON security.audit_logs (occurred_at);

-- D-03: explicit, named REVOKE — audit_logs is append-only for every
-- non-audit role. Deferred until app_api/ingest_worker/jobs_worker exist
-- (created in Wave 000) — safe to run here since Wave 000 precedes this
-- wave.
REVOKE UPDATE, DELETE ON security.audit_logs FROM app_api, ingest_worker, jobs_worker;

CREATE TABLE IF NOT EXISTS security.security_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity_kind  security.security_severity_kind_enum NOT NULL,
  description    text NOT NULL,
  status         security.security_event_status_enum NOT NULL DEFAULT 'DETECTED',
  detected_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_security_events_severity_kind ON security.security_events (severity_kind);

CREATE TABLE IF NOT EXISTS security.retention_policies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category          varchar(100) NOT NULL,
  retention_period  interval NOT NULL,
  version           integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_retention_policies_category_version UNIQUE (category, version)
);
CREATE INDEX IF NOT EXISTS ix_retention_policies_category ON security.retention_policies (category);

CREATE TABLE IF NOT EXISTS security.legal_holds (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table varchar(50) NOT NULL,
  target_id    uuid NOT NULL,   -- polymorphic, no FK by design
  reason       text NOT NULL,
  applied_at   timestamptz NOT NULL DEFAULT now(),
  released_at  timestamptz NULL,
  -- Whitelist reconciled per Keys/Constraints v1.1 §5 — 14 tables, includes
  -- the 10 new v1.1 tables added "for completeness" even though none is a
  -- realistically expected LegalHold target in normal use (per the catalog's
  -- own caveat).
  CONSTRAINT ck_legal_holds_table_whitelist CHECK (
    target_table IN (
      'observations','evidence_records','help_requests','incidents',
      'critical_instruction_versions','audit_logs','publications',
      'emergency_profiles','emergency_accesses',
      'incident_candidate_observations','incident_merge_sources',
      'incident_split_targets','command_roles','operational_unit_members',
      'communication_losses','lesson_learned_findings',
      'resource_reservation_rules','hazard_types','administrative_area_kinds'
    )
  )
);
CREATE INDEX IF NOT EXISTS ix_legal_holds_target ON security.legal_holds (target_table, target_id);

-- ============================================================
-- 5. Grants — least-privilege, per role, per table (no blanket grants)
-- ============================================================
-- app_api: read on public/operational catalogs, no write on security.*
-- (security.* is governance/audit territory, not application-runtime write
-- territory except where a later wave's SECURITY DEFINER function needs it).
GRANT SELECT ON ALL TABLES IN SCHEMA governance TO app_api, ingest_worker, jobs_worker;
GRANT SELECT ON security.access_policies, security.permissions, security.access_roles,
  security.access_role_permissions TO app_api, ingest_worker, jobs_worker;
GRANT SELECT, INSERT ON security.contextual_accesses, security.access_decisions,
  security.audit_logs, security.security_events TO app_api, ingest_worker, jobs_worker;
-- audit_reader: read-only on the two audit-grade tables, nothing else in
-- this wave.
GRANT SELECT ON security.audit_logs, security.access_decisions TO audit_reader;
-- readonly_inspector: read-only on everything created in this wave.
GRANT SELECT ON ALL TABLES IN SCHEMA governance TO readonly_inspector;
GRANT SELECT ON ALL TABLES IN SCHEMA security TO readonly_inspector;
-- Writes to governance.* catalogs (rule/policy publication) are reserved
-- for migration_owner / a future governance-admin role, never app_api —
-- no INSERT/UPDATE/DELETE grant on governance.* to any runtime role here.
