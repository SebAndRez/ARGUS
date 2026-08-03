-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 010 — Foundation — Rollback
-- Reverses migration.sql in strict dependency-safe order. Must run AFTER
-- every later wave's (020-100) rollback.sql has already been applied, since
-- later waves add FKs pointing INTO governance/security (e.g.
-- incident.incidents -> governance.jurisdictions is never created, but
-- security.audit_logs gains FKs to identity/incident/mission tables via
-- ALTER TABLE in those later waves' migrations — those ALTERs must be
-- reversed before this file drops the tables they reference).

-- ============================================================
-- 0. Precondition
-- ============================================================
-- Running this file before 020-100 rollbacks will raise dependency errors
-- ("cannot drop table governance.jurisdictions because other objects depend
-- on it") — that failure is expected and correct, not a bug.

-- ============================================================
-- 1. Revoke grants (reverse of migration.sql §5)
-- ============================================================
REVOKE SELECT ON ALL TABLES IN SCHEMA security FROM readonly_inspector;
REVOKE SELECT ON ALL TABLES IN SCHEMA governance FROM readonly_inspector;
REVOKE SELECT ON security.audit_logs, security.access_decisions FROM audit_reader;
REVOKE USAGE ON SEQUENCE security.audit_logs_sequence_number_seq FROM app_api, ingest_worker, jobs_worker;
REVOKE SELECT, INSERT ON security.contextual_accesses, security.access_decisions,
  security.audit_logs, security.security_events FROM app_api, ingest_worker, jobs_worker;
REVOKE SELECT ON security.access_policies, security.permissions, security.access_roles,
  security.access_role_permissions FROM app_api, ingest_worker, jobs_worker;
REVOKE SELECT ON ALL TABLES IN SCHEMA governance FROM app_api, ingest_worker, jobs_worker;

-- Drop the MIGRATION_REVIEW_QUEUE view (backfill.sql) before security.audit_logs
-- below, or that DROP TABLE fails with "other objects depend on it".
DROP VIEW IF EXISTS governance.vw_migration_review_queue_010;

-- ============================================================
-- 2. Drop security schema tables (dependency order: children first)
-- ============================================================
DROP TABLE IF EXISTS security.legal_holds;
DROP TABLE IF EXISTS security.retention_policies;
DROP TABLE IF EXISTS security.security_events;
-- audit_logs: drop EVERY partition before the parent. A hardcoded
-- `DROP TABLE security.audit_logs_y2026m07` is no longer sufficient and no
-- longer honest: the partition set is now dynamic (created on demand by
-- security.fn_ensure_audit_log_partition for whatever months the data and
-- the operational window require), so the rollback has to discover it from
-- the catalog. Anything less leaves orphan partitions behind and breaks the
-- ARGUS_TARGET_RESIDUAL_OBJECT_COUNT=0 assertion.
--
-- Discovery is by pg_inherits from the real parent, never by name pattern:
-- a LIKE 'audit_logs_%' sweep would also match an unrelated table that
-- merely shares the prefix. Each child is dropped by its own oid-derived,
-- properly quoted identifier.
DO $$
DECLARE
  v_child text;
BEGIN
  IF to_regclass('security.audit_logs') IS NULL THEN
    RETURN;
  END IF;
  FOR v_child IN
    SELECT quote_ident(n.nspname) || '.' || quote_ident(c.relname)
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE i.inhparent = 'security.audit_logs'::regclass
    ORDER BY c.relname
  LOOP
    EXECUTE 'DROP TABLE IF EXISTS ' || v_child;
    RAISE NOTICE 'ARGUS_ROLLBACK_DROPPED_AUDIT_PARTITION %', v_child;
  END LOOP;
END $$;
DROP TABLE IF EXISTS security.audit_logs;

-- The partition-lifecycle functions are standalone objects: they survive
-- DROP TABLE on the parent and would otherwise show up as FUNCTION| residue
-- in catalog-object-inventory.sql. Dropped in dependency order (window ->
-- single -> assert -> helpers) even though no hard dependency links them,
-- so the intent stays readable.
DROP FUNCTION IF EXISTS security.fn_ensure_audit_log_partition_window(timestamptz, integer, integer);
DROP FUNCTION IF EXISTS security.fn_ensure_audit_log_partition(timestamptz);
DROP FUNCTION IF EXISTS security.fn_assert_audit_log_partition(regclass, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS security.fn_audit_log_partition_name(timestamptz);
DROP FUNCTION IF EXISTS security.fn_audit_log_next_month_start(timestamptz);
DROP FUNCTION IF EXISTS security.fn_audit_log_month_start(timestamptz);
DROP TABLE IF EXISTS security.access_decisions;
DROP TABLE IF EXISTS security.contextual_accesses;
DROP TABLE IF EXISTS security.access_role_permissions;
DROP TABLE IF EXISTS security.access_roles;
DROP TABLE IF EXISTS security.permissions;
DROP TABLE IF EXISTS security.access_policies;

-- ============================================================
-- 3. Drop governance schema tables (dependency order: children first)
-- ============================================================
DROP TABLE IF EXISTS governance.administrative_area_kinds;
DROP TABLE IF EXISTS governance.hazard_types;
DROP TABLE IF EXISTS governance.resource_reservation_rules;
DROP TABLE IF EXISTS governance.policies;
DROP TABLE IF EXISTS governance.jurisdiction_scopes;
DROP TABLE IF EXISTS governance.jurisdictions;
DROP TABLE IF EXISTS governance.emergency_bases;
DROP TABLE IF EXISTS governance.feature_flags;
DROP TABLE IF EXISTS governance.doctrine_versions;
DROP TABLE IF EXISTS governance.automation_rule_incident_types;
DROP TABLE IF EXISTS governance.incident_types;
DROP TABLE IF EXISTS governance.incident_categories;
DROP TABLE IF EXISTS governance.automation_rules;
DROP TABLE IF EXISTS governance.operational_rules;
DROP TABLE IF EXISTS governance.territorial_configurations;

-- ============================================================
-- 4. Drop shared functions (rls_policies.sql) — standalone, not tied to any
--    table's lifecycle, so they survive every DROP TABLE above. Must run
--    before the enum drops below (fn_classification_allowed takes an
--    information_classification_enum parameter, which would otherwise block
--    that type's drop too) and before DROP SCHEMA IF EXISTS security further
--    down, which fails ("schema not empty") while any of these still exist.
-- ============================================================
DROP FUNCTION IF EXISTS security.fn_is_owner(uuid, text, uuid);
DROP FUNCTION IF EXISTS security.fn_has_active_membership(uuid, uuid);
DROP FUNCTION IF EXISTS security.fn_has_active_assignment(uuid, uuid);
DROP FUNCTION IF EXISTS security.fn_has_command_role(uuid, uuid);
DROP FUNCTION IF EXISTS security.fn_has_accepted_collaboration(uuid, uuid);
DROP FUNCTION IF EXISTS security.fn_classification_allowed(uuid, security.information_classification_enum);
DROP FUNCTION IF EXISTS security.fn_has_emergency_access(uuid, uuid);

-- ============================================================
-- 5. Drop enums (guarded — only if no other schema's table still uses them;
--    safe here because this rollback assumes 020-100 already rolled back)
-- ============================================================
DO $$ BEGIN DROP TYPE IF EXISTS security.security_event_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS security.security_severity_kind_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS security.access_decision_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS security.contextual_access_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS security.contextual_access_basis_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS security.access_role_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS security.permission_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS security.policy_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS governance.resource_type_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS governance.emergency_basis_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS governance.emergency_basis_category_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS governance.jurisdiction_scope_role_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS governance.policy_publication_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS governance.rule_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS governance.territorial_configuration_status_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
-- Transversal enums (actor_type_enum, information_classification_enum): only
-- drop here if confirmed zero later-wave type still references them (later
-- waves 020-100 all use both) — guarded no-op if still referenced elsewhere,
-- included for completeness of the rollback narrative:
DO $$ BEGIN DROP TYPE IF EXISTS security.actor_type_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS security.information_classification_enum; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ============================================================
-- 6. Drop schemas (only if empty)
-- ============================================================
DROP SCHEMA IF EXISTS security;
DROP SCHEMA IF EXISTS governance;

-- ============================================================
-- 7. Extensions — NOT dropped here
-- ============================================================
-- pgcrypto/postgis are left installed even on rollback of this wave: other
-- waves' tables (geography columns from 080_geography onward, gen_random_uuid()
-- everywhere) depend on them structurally, and DROP EXTENSION ... CASCADE
-- would be far more destructive than this rollback's scope justifies. If a
-- full teardown is ever intended, drop extensions manually, last, after every
-- other wave's rollback, with explicit human confirmation.
