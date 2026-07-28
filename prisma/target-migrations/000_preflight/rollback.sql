-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 000 — Preflight — Rollback
-- Reverses migration.sql. Since this wave creates no domain tables, rollback
-- is limited to dropping the 6 cluster-level roles, guarded so it never
-- fails if a later wave already granted them table privileges (those grants
-- must be revoked by the rollback of the wave that created them, in
-- reverse wave order, BEFORE this rollback runs — see note below).

-- ============================================================
-- 0. Precondition — read before running
-- ============================================================
-- DROP ROLE fails in PostgreSQL if the role still owns objects or holds
-- privileges anywhere in the database. This rollback is therefore only
-- safe to execute AFTER every later wave (010 through 100) has had its own
-- rollback.sql applied first, in strict reverse order (100 -> 090 -> ... ->
-- 010), so that no GRANT/ownership referencing these roles remains.
-- Running this file out of order will raise
-- "role ... cannot be dropped because some objects depend on it" —
-- that failure is the correct, expected behavior, not a bug in this script.

-- ============================================================
-- 1. Drop the 6 roles (guarded)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readonly_inspector') THEN
    DROP ROLE readonly_inspector;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_reader') THEN
    DROP ROLE audit_reader;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jobs_worker') THEN
    DROP ROLE jobs_worker;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ingest_worker') THEN
    DROP ROLE ingest_worker;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
    DROP ROLE app_api;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migration_owner') THEN
    DROP ROLE migration_owner;
  END IF;
END $$;

-- ============================================================
-- 2. What CANNOT be safely rolled back
-- ============================================================
-- - If rls_auto_enable_remediation.sql's REVOKE/DROP FUNCTION statements
--   were ever actually applied (they are NOT in this draft), reverting them
--   requires the captured pg_get_functiondef() output referenced in that
--   file's §9 rollback plan — this rollback.sql does not attempt to
--   recreate public.rls_auto_enable(), since recreating a previously-drifted,
--   undocumented SECURITY DEFINER function automatically would reintroduce
--   the exact risk this wave exists to remove.
-- - Any audit_logs rows written by migration tooling while connected as
--   migration_owner/app_api before rollback are NOT deleted by this script
--   (security.audit_logs is append-only by design from Wave 010 onward;
--   this wave predates that table, so no such rows can exist yet in
--   practice — noted here only for completeness).
