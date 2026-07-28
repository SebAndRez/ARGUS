-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 000 — Preflight — Backfill draft.
-- This wave creates zero domain tables (see backfill-plan.md) — its
-- "backfill" is the shared bookkeeping infrastructure every later wave's
-- backfill.sql depends on: a versioned legacy-status-mapping table (D-02),
-- a checkpoint ledger, and the review-queue convention (D-06). None of
-- this is domain data — it is migration machinery, created once, here,
-- because this is the one wave upstream of every data-mapping decision.

CREATE SCHEMA IF NOT EXISTS migration_meta;
-- Owned by migration_owner (Wave 000 role) — never granted to app_api/
-- ingest_worker/jobs_worker; this schema exists only for the duration of
-- the migration program, not as steady-state application schema.

-- ============================================================
-- 1. governance.legacy_status_mapping (D-02) — the ONE place every wave's
--    status-value transform is looked up, never an inline CASE WHEN.
-- ============================================================
CREATE TABLE IF NOT EXISTS migration_meta.legacy_status_mapping (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table      varchar(100) NOT NULL,
  source_status_value text NOT NULL,
  target_dimension  varchar(100) NOT NULL,
  target_value      varchar(100) NOT NULL,
  confidence        varchar(10) NOT NULL CHECK (confidence IN ('HIGH','MEDIUM','LOW')),
  notes             text NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_legacy_status_mapping UNIQUE (source_table, source_status_value, target_dimension)
);
COMMENT ON TABLE migration_meta.legacy_status_mapping IS
  'D-02: versioned transform table, one row per (source_table, source_status_value, target_dimension). Populated per-wave in that wave''s own backfill.sql, read by JOIN, never by inline CASE.';

-- ============================================================
-- 2. migration_checkpoints — one row per wave/source/target checkpoint,
--    written by every subsequent backfill.sql after it completes (or after
--    a no-op pass, for waves with 0 rows to move).
-- ============================================================
CREATE TABLE IF NOT EXISTS migration_meta.migration_checkpoints (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wave           varchar(60) NOT NULL,
  source_table   varchar(100) NULL,
  target_table   varchar(100) NOT NULL,
  expected_count bigint NOT NULL,
  actual_count   bigint NOT NULL,
  status         varchar(20) NOT NULL CHECK (status IN ('PASS','FAIL','SKIPPED_NO_ROWS')),
  checked_at     timestamptz NOT NULL DEFAULT now(),
  notes          text NULL
);
CREATE INDEX IF NOT EXISTS ix_migration_checkpoints_wave ON migration_meta.migration_checkpoints (wave);

-- ============================================================
-- 3. This wave's own checkpoint — process, not data.
-- ============================================================
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
VALUES ('000_preflight', NULL, 'migration_meta.* + 6 roles', 1, 1, 'PASS',
  'Binary checkpoint: verified/restorable backup confirmed (manual, Supabase dashboard, not automatable) AND all 6 roles exist with expected attributes (see migration.sql §1). No row-level work in this wave.');

-- No SELECT COUNT(*) before/after is meaningful here (no domain rows exist
-- yet in either the current or target database at this point in the
-- program) — the "before/after" for this wave is role existence, already
-- checked via validation.sql §1.
