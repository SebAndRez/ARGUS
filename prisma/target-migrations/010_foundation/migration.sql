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

CREATE INDEX IF NOT EXISTS ix_audit_logs_target ON security.audit_logs (target_table, target_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_actor ON security.audit_logs (actor_type, actor_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_occurred_at ON security.audit_logs (occurred_at);

-- ============================================================
-- 4.bis  security.audit_logs monthly partition LIFECYCLE
-- ============================================================
-- Replaces the previous "SQL_COMPLEMENTARY_REQUIRED: use pg_partman or an
-- equivalent scheduled job" note plus its single illustrative
-- audit_logs_y2026m07 partition. That combination was a real production
-- blocker, not a documentation gap: with exactly one partition and no
-- DEFAULT partition, EVERY insert whose occurred_at fell outside July 2026
-- failed with "no partition of relation \"audit_logs\" found for row" —
-- which is exactly what a legitimate audit write outside that month is.
--
-- The contract implemented below:
--   * one partition per CALENDAR MONTH, half-open [month_start, next_month)
--     computed in UTC — never a 30-day interval, never the server's local
--     timezone;
--   * occurred_at is the ONLY routing authority; the incoming value's own
--     offset is normalized to UTC for the month computation and the stored
--     value is never altered;
--   * naming derived exclusively from the validated timestamp:
--     audit_logs_yYYYYmMM;
--   * NO DEFAULT partition, deliberately — a DEFAULT partition silently
--     absorbs mis-routed rows and makes every later ATTACH require a full
--     scan. Missing coverage must fail loudly or be created explicitly,
--     never be swallowed;
--   * creation is idempotent and concurrency-safe (per-month advisory
--     transaction lock + re-check after the lock);
--   * an existing object under the expected name with the WRONG contract
--     (not a partition of this parent, or wrong bounds) is a hard error —
--     never silently adopted, never silently altered.
--
-- Why the write path does not depend on a cron job alone: the canonical
-- target audit writer calls fn_ensure_audit_log_partition BEFORE its
-- INSERT (src/lib/database-target/repositories/auditLogPartitionRepository
-- .ts), so a legitimate audit event can never be lost to a missed
-- maintenance run. The scheduled window maintenance
-- (fn_ensure_audit_log_partition_window) exists so that, in the normal
-- case, the writer's ensure call is a pure catalog read that takes no lock
-- on the parent at all.

-- Helper 1/3 — UTC month start of an arbitrary instant. IMMUTABLE: the
-- double `AT TIME ZONE 'UTC'` makes this independent of the session
-- TimeZone (timestamptz -> timestamp -> timestamptz, both conversions
-- pinned to UTC), which is precisely why an offset-bearing input such as
-- '2026-08-01T00:30:00+02:00' routes by its UTC instant (July 2026) and not
-- by its wall-clock month.
CREATE OR REPLACE FUNCTION security.fn_audit_log_month_start(p_occurred_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT date_trunc('month', p_occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
$fn$;

-- Helper 2/3 — start of the FOLLOWING UTC month. Uses interval '1 month'
-- arithmetic on the truncated month, so year rollover (Dec -> Jan),
-- February, and leap years are handled by the calendar, never by a
-- 30-day approximation.
CREATE OR REPLACE FUNCTION security.fn_audit_log_next_month_start(p_occurred_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT (date_trunc('month', p_occurred_at AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC';
$fn$;

-- Helper 3/3 — the partition's relation name. Derived ONLY from the
-- validated timestamp: no caller ever supplies a schema, a table name, or
-- any other SQL identifier to this lifecycle (mandate: "No usar nombres de
-- tabla recibidos desde cliente").
CREATE OR REPLACE FUNCTION security.fn_audit_log_partition_name(p_occurred_at timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT 'audit_logs_y' || to_char(date_trunc('month', p_occurred_at AT TIME ZONE 'UTC'), 'YYYY"m"MM');
$fn$;

-- Contract assertion for an ALREADY-EXISTING relation carrying the expected
-- name. Deliberately raises instead of repairing: silently ALTERing or
-- re-bounding a partition that already holds rows is a data-movement
-- operation, and this lifecycle is explicitly forbidden from relocating
-- rows. TimeZone/DateStyle are pinned so pg_get_expr's rendering of the
-- bound literals is deterministic and comparable.
CREATE OR REPLACE FUNCTION security.fn_assert_audit_log_partition(
  p_partition   regclass,
  p_month_start timestamptz,
  p_next_start  timestamptz
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, security
SET TimeZone = 'UTC'
SET DateStyle = 'ISO, MDY'
AS $fn$
DECLARE
  v_bound    text;
  v_expected text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_inherits i
    WHERE i.inhrelid = p_partition
      AND i.inhparent = 'security.audit_logs'::regclass
  ) THEN
    RAISE EXCEPTION
      'AUDIT_PARTITION_NOT_A_PARTITION: relation % already exists but is not a partition of security.audit_logs',
      p_partition::text
      USING ERRCODE = 'invalid_table_definition';
  END IF;

  SELECT pg_get_expr(c.relpartbound, c.oid) INTO v_bound
  FROM pg_class c WHERE c.oid = p_partition;

  IF v_bound IS NULL OR v_bound = 'DEFAULT' THEN
    RAISE EXCEPTION
      'AUDIT_PARTITION_UNEXPECTED_DEFAULT: relation % is a DEFAULT partition; security.audit_logs must never have one',
      p_partition::text
      USING ERRCODE = 'invalid_table_definition';
  END IF;

  v_expected := format(
    'FOR VALUES FROM (%L) TO (%L)',
    to_char(p_month_start, 'YYYY-MM-DD HH24:MI:SS') || '+00',
    to_char(p_next_start,  'YYYY-MM-DD HH24:MI:SS') || '+00'
  );

  IF v_bound <> v_expected THEN
    RAISE EXCEPTION
      'AUDIT_PARTITION_BOUND_MISMATCH: relation % has bound %, the UTC calendar-month contract requires %',
      p_partition::text, v_bound, v_expected
      USING ERRCODE = 'invalid_table_definition';
  END IF;
END
$fn$;

-- The single-month entry point. Returns 'CREATED' or 'ALREADY_EXISTS'.
--
-- SECURITY DEFINER is genuinely required, not decorative: CREATE TABLE ...
-- PARTITION OF is DDL in schema `security`, and NO application role has (or
-- may ever be granted) CREATE ON SCHEMA security. Running as the schema
-- owner is what lets the authorized maintenance role create a partition
-- WITHOUT ever holding schema-level CREATE itself. The privilege boundary
-- is therefore the function's grant list, and it is kept narrow:
--   * REVOKE EXECUTE FROM PUBLIC (below);
--   * no GRANT to app_api / ingest_worker — they cannot call this at all;
--   * search_path is pinned to `pg_catalog, security` so no caller-supplied
--     schema can shadow any function or operator used in the body;
--   * every identifier is produced internally from the validated timestamp
--     and interpolated with format('%I', ...); the bounds are literals
--     rendered by format('%L', ...). No caller string ever reaches the
--     dynamic statement.
CREATE OR REPLACE FUNCTION security.fn_ensure_audit_log_partition(p_occurred_at timestamptz)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, security
SET TimeZone = 'UTC'
SET DateStyle = 'ISO, MDY'
AS $fn$
DECLARE
  v_month_start timestamptz;
  v_next_start  timestamptz;
  v_name        text;
  v_oid         oid;
  v_lock_key    bigint;
BEGIN
  IF p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_NULL_TIMESTAMP: p_occurred_at must not be NULL'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;

  v_month_start := security.fn_audit_log_month_start(p_occurred_at);
  v_next_start  := security.fn_audit_log_next_month_start(p_occurred_at);
  v_name        := security.fn_audit_log_partition_name(p_occurred_at);

  -- Existence is checked by QUERYING pg_class, deliberately NOT with
  -- to_regclass(). This is load-bearing and was found by a real concurrency
  -- test, not reasoned about: to_regclass() resolves through the relation
  -- syscache, which is read under the backend's cached CATALOG snapshot and
  -- is not refreshed by waiting on an advisory lock (a NoLock name lookup
  -- never processes invalidation messages). A session that took the slow
  -- path, waited for the lock, and then re-checked with to_regclass() could
  -- therefore still observe the pre-creation catalog and go on to issue a
  -- CREATE TABLE that failed with duplicate_table (42P07) despite holding
  -- the lock. A plain SQL scan of pg_class runs under a fresh READ COMMITTED
  -- statement snapshot, so it sees the other session's committed DDL.
  --
  -- Fast path: no advisory lock, no lock on the parent at all, one catalog
  -- read. This is the path the audit writer takes on every normal insert
  -- once the maintenance window has already created the month.
  SELECT c.oid INTO v_oid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'security' AND c.relname = v_name;

  IF v_oid IS NOT NULL THEN
    PERFORM security.fn_assert_audit_log_partition(v_oid::regclass, v_month_start, v_next_start);
    RETURN 'ALREADY_EXISTS';
  END IF;

  -- Slow path. The advisory key is deterministic per (parent, YYYY-MM), so
  -- N concurrent sessions asking for the SAME month serialize here while
  -- sessions asking for DIFFERENT months never block each other on this
  -- lock. It is a transaction-scoped lock: released by COMMIT/ROLLBACK, so
  -- a crashed session can never leave the month wedged.
  --
  -- This is NOT "catch duplicate_table and pretend it succeeded": the lock
  -- plus the re-check below mean the duplicate is never attempted, and any
  -- OTHER error still propagates untouched.
  v_lock_key := ('x' || substr(md5('security.audit_logs:' || to_char(v_month_start, 'YYYY-MM')), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT c.oid INTO v_oid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'security' AND c.relname = v_name;

  IF v_oid IS NOT NULL THEN
    PERFORM security.fn_assert_audit_log_partition(v_oid::regclass, v_month_start, v_next_start);
    RETURN 'ALREADY_EXISTS';
  END IF;

  -- Indexes are NOT recreated here on purpose: PostgreSQL attaches a child
  -- index for every partitioned index on the parent (ix_audit_logs_target,
  -- ix_audit_logs_actor, ix_audit_logs_occurred_at, audit_logs_pkey, and
  -- uq_audit_logs_legacy once backfill.sql has created it) automatically as
  -- part of this statement. Duplicating them by hand would produce a second,
  -- redundant, non-attached index per partition. validation.sql verifies the
  -- attachment physically rather than assuming it.
  EXECUTE format(
    'CREATE TABLE security.%I PARTITION OF security.audit_logs FOR VALUES FROM (%L) TO (%L)',
    v_name,
    to_char(v_month_start, 'YYYY-MM-DD HH24:MI:SS') || '+00',
    to_char(v_next_start,  'YYYY-MM-DD HH24:MI:SS') || '+00'
  );

  -- Defense in depth. Reads/writes routed THROUGH the parent are already
  -- governed by the parent's own policies (audit_logs_audit_only /
  -- audit_logs_insert_service_roles, rls_policies.sql), and enabling RLS on
  -- the child does not interfere with that — verified against the real
  -- rehearsal database, both directions: audit_reader still reads through
  -- the parent and app_api still inserts through the parent with
  -- argus.actor_role='SYSTEM', while a wrong actor_role is still denied.
  -- What this adds is that a partition can never become a side door: with
  -- RLS enabled and zero policies of its own, DIRECT access to the child
  -- yields nothing even if some future GRANT mistakenly exposed it.
  EXECUTE format('ALTER TABLE security.%I ENABLE ROW LEVEL SECURITY', v_name);
  EXECUTE format('ALTER TABLE security.%I FORCE ROW LEVEL SECURITY', v_name);

  RETURN 'CREATED';
END
$fn$;

-- The maintenance entry point: a CONTIGUOUS monthly window around an
-- anchor. Never drops, never detaches, never touches a single row — the
-- only DDL it can reach is fn_ensure_audit_log_partition's CREATE TABLE.
-- Bounded to 0..24 months per side so a bad argument cannot spray thousands
-- of partitions into the catalog.
CREATE OR REPLACE FUNCTION security.fn_ensure_audit_log_partition_window(
  p_anchor        timestamptz DEFAULT now(),
  p_months_before integer     DEFAULT 1,
  p_months_after  integer     DEFAULT 3
)
RETURNS TABLE (partition_name text, range_start timestamptz, range_end timestamptz, result text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, security
SET TimeZone = 'UTC'
SET DateStyle = 'ISO, MDY'
AS $fn$
DECLARE
  v_anchor_month timestamptz;
  v_month        timestamptz;
  v_offset       integer;
BEGIN
  IF p_anchor IS NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_WINDOW_NULL_ANCHOR: p_anchor must not be NULL'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;
  IF p_months_before IS NULL OR p_months_after IS NULL THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_WINDOW_NULL_BOUND: p_months_before/p_months_after must not be NULL'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;
  IF p_months_before < 0 OR p_months_after < 0 THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_WINDOW_NEGATIVE: p_months_before=% p_months_after=% - a window side cannot be negative',
      p_months_before, p_months_after
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_months_before > 24 OR p_months_after > 24 THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_WINDOW_TOO_WIDE: p_months_before=% p_months_after=% - each side is capped at 24 months',
      p_months_before, p_months_after
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_anchor_month := security.fn_audit_log_month_start(p_anchor);

  FOR v_offset IN (0 - p_months_before) .. p_months_after LOOP
    v_month := ((v_anchor_month AT TIME ZONE 'UTC') + make_interval(months => v_offset)) AT TIME ZONE 'UTC';
    partition_name := security.fn_audit_log_partition_name(v_month);
    range_start    := security.fn_audit_log_month_start(v_month);
    range_end      := security.fn_audit_log_next_month_start(v_month);
    result         := security.fn_ensure_audit_log_partition(v_month);
    RETURN NEXT;
  END LOOP;
END
$fn$;

-- Privilege boundary (mandate Fase 4/9). PUBLIC loses EXECUTE on all five;
-- the ONLY runtime role that gains anything is jobs_worker, and only on the
-- window maintenance function — not on the single-month DDL entry point, not
-- on the helpers. app_api and ingest_worker gain nothing: they cannot create
-- a partition, cannot call the ensure function, and (per Wave 000) hold no
-- CREATE ON SCHEMA security.
REVOKE ALL ON FUNCTION security.fn_audit_log_month_start(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.fn_audit_log_next_month_start(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.fn_audit_log_partition_name(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.fn_assert_audit_log_partition(regclass, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.fn_ensure_audit_log_partition(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.fn_ensure_audit_log_partition_window(timestamptz, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security.fn_ensure_audit_log_partition_window(timestamptz, integer, integer) TO jobs_worker;

-- The historical partition this wave has always declared, now created
-- through the same single code path as every other partition (so its bounds
-- are provably identical in shape to the generated ones) instead of a
-- hand-written CREATE TABLE.
SELECT security.fn_ensure_audit_log_partition(TIMESTAMPTZ '2026-07-01 00:00:00+00');

-- Initial operational window: previous month, current month, next 3 months.
-- Running this at install time is what makes the very first audit write
-- after a fresh install succeed without waiting for any scheduled job.
SELECT * FROM security.fn_ensure_audit_log_partition_window(now(), 1, 3);

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
-- SCHEMA-LEVEL USAGE (corrective session): a table-level GRANT is
-- unreachable without USAGE on its schema — the role gets "permission
-- denied for schema <x>" before RLS is even consulted. The comment 12
-- lines below already knew this for `security`/audit_reader; the same rule
-- was simply never applied to the other role/schema pairs. Confirmed by
-- running the real non-superuser RLS matrix
-- (scripts/migration-rehearsal/sql/rls-matrix-checks.sql), which failed
-- with exactly that error until these were added.
GRANT USAGE ON SCHEMA governance TO app_api, ingest_worker, jobs_worker, readonly_inspector;
GRANT USAGE ON SCHEMA security TO app_api, ingest_worker, jobs_worker, readonly_inspector;

GRANT SELECT ON ALL TABLES IN SCHEMA governance TO app_api, ingest_worker, jobs_worker;
GRANT SELECT ON security.access_policies, security.permissions, security.access_roles,
  security.access_role_permissions TO app_api, ingest_worker, jobs_worker;
GRANT SELECT, INSERT ON security.contextual_accesses, security.access_decisions,
  security.audit_logs, security.security_events TO app_api, ingest_worker, jobs_worker;
-- audit_logs.sequence_number is a bigserial, so an INSERT grant alone is not
-- an insertable audit log: nextval() on the owning sequence needs its own
-- USAGE grant. Found by actually exercising the authorized server-side audit
-- write as app_api (Fase 9 case 1) — it failed with "permission denied for
-- sequence audit_logs_sequence_number_seq" long before RLS was consulted,
-- which means the append-only audit path this wave declares was not in fact
-- reachable by any runtime role. USAGE grants nextval/currval only: no
-- setval, so no role can rewind or fast-forward the audit sequence.
GRANT USAGE ON SEQUENCE security.audit_logs_sequence_number_seq TO app_api, ingest_worker, jobs_worker;
-- audit_reader: read-only on the two audit-grade tables, nothing else in
-- this wave. GRANT SELECT ON ... alone is not reachable without schema
-- USAGE too (rls-runtime-checks.sql Fase 12: "permission denied for schema
-- security" without this).
GRANT USAGE ON SCHEMA security TO audit_reader;
GRANT SELECT ON security.audit_logs, security.access_decisions TO audit_reader;
-- readonly_inspector: read-only on everything created in this wave.
GRANT SELECT ON ALL TABLES IN SCHEMA governance TO readonly_inspector;
GRANT SELECT ON ALL TABLES IN SCHEMA security TO readonly_inspector;

-- Partitions of security.audit_logs are NOT part of any role's grant surface.
-- `GRANT ... ON ALL TABLES IN SCHEMA security` above is a one-time snapshot:
-- it silently included whichever audit_logs partitions happened to exist at
-- this moment, while every partition created later (by the maintenance window
-- or by the audit writer's ensure-before-insert) would get nothing. That
-- inconsistency is removed here rather than left to chance, so the posture is
-- uniform for all partitions, present and future: audit access is exclusively
-- through the parent, where the RLS policies live. Reading the parent still
-- reads every partition's rows — PostgreSQL does not consult partition
-- privileges for a query routed through the partitioned table.
DO $$
DECLARE v_child text;
BEGIN
  FOR v_child IN
    SELECT quote_ident(n.nspname) || '.' || quote_ident(c.relname)
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE i.inhparent = 'security.audit_logs'::regclass
  LOOP
    EXECUTE 'REVOKE ALL ON ' || v_child || ' FROM PUBLIC, app_api, ingest_worker, jobs_worker, audit_reader, readonly_inspector';
  END LOOP;
END $$;
-- Writes to governance.* catalogs (rule/policy publication) are reserved
-- for migration_owner / a future governance-admin role, never app_api —
-- no INSERT/UPDATE/DELETE grant on governance.* to any runtime role here.
