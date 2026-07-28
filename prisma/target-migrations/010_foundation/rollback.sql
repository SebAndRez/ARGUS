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
REVOKE SELECT, INSERT ON security.contextual_accesses, security.access_decisions,
  security.audit_logs, security.security_events FROM app_api, ingest_worker, jobs_worker;
REVOKE SELECT ON security.access_policies, security.permissions, security.access_roles,
  security.access_role_permissions FROM app_api, ingest_worker, jobs_worker;
REVOKE SELECT ON ALL TABLES IN SCHEMA governance FROM app_api, ingest_worker, jobs_worker;

-- ============================================================
-- 2. Drop security schema tables (dependency order: children first)
-- ============================================================
DROP TABLE IF EXISTS security.legal_holds;
DROP TABLE IF EXISTS security.retention_policies;
DROP TABLE IF EXISTS security.security_events;
-- audit_logs: drop partition(s) before the parent (Postgres normally cascades
-- this automatically via DROP TABLE on the parent, but the partition is
-- listed explicitly for auditability of what disappears):
DROP TABLE IF EXISTS security.audit_logs_y2026m07;
DROP TABLE IF EXISTS security.audit_logs;
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
-- 4. Drop enums (guarded — only if no other schema's table still uses them;
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
-- 5. Drop schemas (only if empty)
-- ============================================================
DROP SCHEMA IF EXISTS security;
DROP SCHEMA IF EXISTS governance;

-- ============================================================
-- 6. Extensions — NOT dropped here
-- ============================================================
-- pgcrypto/postgis are left installed even on rollback of this wave: other
-- waves' tables (geography columns from 080_geography onward, gen_random_uuid()
-- everywhere) depend on them structurally, and DROP EXTENSION ... CASCADE
-- would be far more destructive than this rollback's scope justifies. If a
-- full teardown is ever intended, drop extensions manually, last, after every
-- other wave's rollback, with explicit human confirmation.
