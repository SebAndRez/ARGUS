-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 000 — Preflight
-- No domain tables. Cluster-level role provisioning + process scaffolding
-- only. See README.md for scope. Every statement below is a DRAFT for
-- future human review — nothing in this file has been executed against
-- any database, local or shared.
--
-- Prerequisite reading before this file is ever run for real:
--   docs/architecture/private/ARGUS_PHYSICAL_ACCESS_CONTROL_v1.1_FROZEN.md
--   docs/architecture/private/ARGUS_MIGRATION_DECISION_REGISTER_v1.0_FROZEN.md
--   docs/architecture/private/ARGUS_RLS_AUTO_ENABLE_REMEDIATION_v1.0.md
--   docs/architecture/private/ARGUS_CURRENT_RLS_CONTAINMENT_PLAN_v1.0.md

-- ============================================================
-- 0. Backup verification (process, not DDL)
-- ============================================================
-- This wave's first real gate is human, not SQL: confirm that a verified,
-- restorable backup/snapshot of the CURRENT production database (the 33
-- Prisma tables + _prisma_migrations) exists and has been test-restored
-- to a scratch environment before ANY DDL in Wave 010+ runs against the
-- shared database. Supabase point-in-time recovery window and the most
-- recent daily backup timestamp must both be confirmed manually in the
-- Supabase dashboard (Database -> Backups) — this is not automatable from
-- this repository and is NOT expressed as SQL here.
--
-- SQL_COMPLEMENTARY_REQUIRED: a scripted backup-verification step (e.g. a
-- one-off `pg_dump` to a controlled location, or confirmation via the
-- Supabase Management API) belongs in an operational runbook outside this
-- migration package, executed by a human with production credentials,
-- never by an automated agent.

-- ============================================================
-- 1. Role provisioning — the 6 physical roles (Access Control v1.1 FROZEN)
-- ============================================================
-- Principle (Access Control v1.1 §1): deny by default, ENABLE ROW LEVEL
-- SECURITY + FORCE ROW LEVEL SECURITY without a USING (true) fallback.
-- Condition D-03 (structural, referenced from security.audit_logs REVOKE
-- clause): app_api never has BYPASSRLS. No role below is granted
-- BYPASSRLS, blanket table ownership, or indiscriminate SECURITY DEFINER
-- EXECUTE rights.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migration_owner') THEN
    -- Owns all target-schema objects during migration. NOT a runtime
    -- application role. NOSUPERUSER, NOBYPASSRLS — owns tables, which is
    -- sufficient to apply DDL without needing to bypass RLS on them.
    CREATE ROLE migration_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
    -- The application's runtime connection role (replaces today's single
    -- DATABASE_URL role with full privilege and no RLS awareness).
    -- NOBYPASSRLS is the load-bearing property here (D-03/Access Control
    -- v1.1 §1) — app_api is fully subject to every RLS policy designed
    -- in Wave 010's rls_policies.sql.
    CREATE ROLE app_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ingest_worker') THEN
    -- Background ingestion pipeline (ingest.*, evidence.source-adjacent
    -- writes). Distinct from app_api so a compromised ingestion credential
    -- cannot reach identity/help/mission/ice tables it has no business
    -- touching.
    CREATE ROLE ingest_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jobs_worker') THEN
    -- Scheduled/cron jobs (resource reservation expiry, proj.* refresh
    -- jobs, retention/legal-hold sweeps). Distinct from app_api and
    -- ingest_worker for the same least-privilege reasoning.
    CREATE ROLE jobs_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_reader') THEN
    -- Exclusive, non-delegable read access to security.audit_logs and
    -- security.access_decisions (Physical Table Catalog v1.1,
    -- security.audit_logs REVOKE clause: REVOKE UPDATE, DELETE ON
    -- security.audit_logs FROM app_api, ingest_worker, jobs_worker — D-03).
    -- Read-only by design: no INSERT/UPDATE/DELETE grants anywhere in this
    -- package for this role.
    CREATE ROLE audit_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'access_admin') THEN
    -- Explicit administrative role for AccessRole ASSIGNMENT lifecycle
    -- (security.access_subjects / security.access_role_assignments, Wave
    -- 020). Deliberately a 7th role rather than reusing app_api or
    -- migration_owner:
    --   * app_api is the runtime request role and must never be able to
    --     grant itself (or anyone) an access role — that is privilege
    --     escalation by design;
    --   * migration_owner is a DDL-time identity with no LOGIN, and using a
    --     migration credential to perform runtime authorization changes is
    --     exactly the silent-owner reuse this package forbids.
    -- Holds NO direct DML on the two tables: its only path is the narrow
    -- SECURITY DEFINER grant/revoke functions defined in Wave 020, so every
    -- assignment change is validated and audited by construction.
    CREATE ROLE access_admin LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readonly_inspector') THEN
    -- General read-only inspection role for humans/tooling doing schema
    -- review (analogous in spirit to
    -- ARGUS_READONLY_DATABASE_INSPECTION_ROLE_v1.0.md for the CURRENT
    -- database) — never used by the running application, never granted
    -- write of any kind.
    CREATE ROLE readonly_inspector NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

-- No GRANTs on domain tables happen here — there are no domain tables yet.
-- Each subsequent wave's migration.sql grants exactly the privileges each
-- role needs on that wave's new tables (see e.g. 010_foundation/migration.sql).

-- ============================================================
-- 2. Drift-check queries (read-only, informational — run before Wave 010)
-- ============================================================
-- These are SELECT-only and safe to run against the CURRENT production
-- database at any time; they do not touch prisma/schema.prisma or
-- prisma/migrations/. They exist so that whoever runs this wave for real
-- re-verifies the drift documented in
-- ARGUS_CURRENT_RLS_CONTAINMENT_PLAN_v1.0.md rather than assuming it is
-- still accurate (that document is dated and explicitly says future
-- sessions must re-verify, not assume).

-- 2.1 Confirm RLS-enabled-no-policy count on the 33 current tables
--     (baseline: 26 tables with zero policies + 8 with an unexplained
--     policy — see ARGUS_CURRENT_RLS_CONTAINMENT_PLAN_v1.0.md §4).
-- SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
--        COUNT(p.polname) AS policy_count
-- FROM pg_class c
-- LEFT JOIN pg_policy p ON p.polrelid = c.oid
-- WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
-- GROUP BY c.relname, c.relrowsecurity
-- ORDER BY policy_count, c.relname;

-- 2.2 Confirm rls_auto_enable() still exists and is still reachable by
--     anon/authenticated (see rls_auto_enable_remediation.sql for the
--     full inspection/remediation plan).
-- SELECT routine_name, security_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public' AND routine_name = 'rls_auto_enable';

-- SQL_COMPLEMENTARY_REQUIRED: the actual REVOKE/inspection of
-- rls_auto_enable() is drafted separately in
-- 000_preflight/rls_auto_enable_remediation.sql, not inline here, because
-- it requires execute_sql read access not currently authorized in this
-- session (see that file for the full chain of custody).

-- ============================================================
-- 3. Feature-flag scaffolding notes (table created in Wave 010)
-- ============================================================
-- governance.feature_flags (Wave 010) will carry, at minimum, one flag per
-- wave gating cutover of that wave's read/write path from the legacy
-- table(s) to the target table(s), e.g.:
--   'target_identity_dual_write'      (Wave 020)
--   'target_incident_dual_write'      (Wave 040)
--   'target_help_mission_cutover'     (Wave 050)
-- These are NOT created here — this comment exists only so the flag
-- naming convention is fixed before Wave 010 creates the table, avoiding
-- ad hoc naming drift across waves.
