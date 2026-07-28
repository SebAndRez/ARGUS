-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- RLS role posture — restates and locks the 6 physical roles created in
-- 000_preflight/migration.sql in the context of Row Level Security, per
-- ARGUS_PHYSICAL_ACCESS_CONTROL_v1.1_FROZEN.md §1/§10. This file does not
-- CREATE ROLE again (guarded no-op if run out of order) — its purpose is to
-- assert, in one place, the RLS-relevant posture of each role before
-- rls_policies.sql references them, and to make that posture independently
-- re-checkable (see rls_validation.sql).
--
-- Authority: ARGUS_PHYSICAL_ACCESS_CONTROL_v1.1_FROZEN.md §1, §10.
-- D-03 (structural condition, referenced from the Migration Decision
-- Register indirectly via security.audit_logs): app_api never has BYPASSRLS.

-- ============================================================
-- 1. Idempotent restatement (safe no-op if 000_preflight already ran)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migration_owner') THEN
    RAISE EXCEPTION 'migration_owner does not exist — apply 000_preflight/migration.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
    RAISE EXCEPTION 'app_api does not exist — apply 000_preflight/migration.sql first';
  END IF;
END $$;

-- ============================================================
-- 2. RLS posture per role (documentation of intent, re-asserted defensively)
-- ============================================================
-- migration_owner: owns every table created by this and every later wave's
-- migration.sql (DDL-time ownership, not a runtime application role). Table
-- owners bypass RLS by default in PostgreSQL UNLESS the table has
-- FORCE ROW LEVEL SECURITY — every RLS-bearing table in this package uses
-- FORCE ROW LEVEL SECURITY specifically so that even migration_owner (and
-- any future accidental ownership grant) is subject to the same policies as
-- everyone else when connecting for anything other than DDL.
ALTER ROLE migration_owner NOBYPASSRLS;

-- app_api: the runtime application role. Load-bearing (D-03) — every policy
-- in rls_policies.sql is written assuming app_api has NO special bypass.
ALTER ROLE app_api NOBYPASSRLS;

-- ingest_worker / jobs_worker: background roles, same posture as app_api —
-- subject to RLS on every table they touch (ingest.*, evidence.*, and the
-- specific governance/security tables granted in each wave's migration.sql).
ALTER ROLE ingest_worker NOBYPASSRLS;
ALTER ROLE jobs_worker NOBYPASSRLS;

-- audit_reader: read-only on security.audit_logs/access_decisions. Subject to
-- RLS in principle, but its only granted tables have a policy of
-- "actor_role='AUDIT'" that audit_reader always satisfies by role mapping
-- (see rls_policies.sql §security) — never BYPASSRLS, the effect is achieved
-- entirely through policy content, not through a bypass.
ALTER ROLE audit_reader NOBYPASSRLS;

-- readonly_inspector: general schema-review role. Explicitly NOT exempted
-- from RLS — a reviewer should see exactly what an ordinary authenticated
-- actor with no special claims would see, unless a specific inspection
-- policy is designed (none is, in this draft) to grant it broader read
-- access. This is a deliberate, conservative default.
ALTER ROLE readonly_inspector NOBYPASSRLS;

-- ============================================================
-- 3. What this file deliberately does NOT do
-- ============================================================
-- - Does not grant any role BYPASSRLS, ever, under any circumstance.
-- - Does not grant table ownership to any role other than migration_owner
--   (each wave's CREATE TABLE runs as migration_owner implicitly — no
--   explicit ALTER TABLE ... OWNER TO is needed or included).
-- - Does not grant EXECUTE on any SECURITY DEFINER function to a broad role;
--   each SECURITY DEFINER function (the 6 dimension functions in Access
--   Control v1.1 §3, help.close_help_request_authorized in §8) gets its own
--   narrow GRANT EXECUTE in the wave/file that defines it, never a blanket
--   grant here.
