-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 070 — Alerts & Communications — Backfill draft.
-- Origen: none for any of the 15 tables in this wave — see
-- backfill-plan.md for the per-table reason (DERIVAR/CREATE_EMPTY/
-- NO_RECONSTRUCTABLE). This file exists structurally so the convention
-- (provenance columns + checkpoint + review-queue view) is uniform across
-- all 11 waves, even where there is nothing to move.

ALTER TABLE alert.alerts ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE alert.alerts ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE alert.alerts ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE alert.alerts ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
ALTER TABLE comms.messages ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE comms.messages ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;

-- ============================================================
-- 1. alert.alerts — DERIVAR. "Alerta" today is a read-time projection of
--    KnowledgeIncident/ExternalEvent, never a persisted entity — there is
--    no source row to SELECT FROM. No INSERT statement (nothing to move).
-- ============================================================

-- ============================================================
-- 2. comms.messages — NO_RECONSTRUCTABLE. Today's notification content is
--    computed in memory at send time (api/notifications/route.ts) and
--    never persisted — there is no historical content to backfill, by
--    construction, not by omission.
-- ============================================================

-- ============================================================
-- 3. comms.acknowledgements — NO_RECONSTRUCTABLE. "Read" state lives in
--    client localStorage today, never reaches the server — same posture
--    as §2.
-- ============================================================

-- ============================================================
-- 4. All remaining 12 tables (alert.alert_authorizations/.alert_cancellations/
--    .alert_supersessions/.critical_instructions/.critical_instruction_versions/
--    .instruction_authorizations/.instruction_compliance_records,
--    comms.communication_plans/.delivery_attempts/.comprehension_confirmations/
--    .offline_communication_plans/.communication_losses) — CREATE_EMPTY,
--    entirely new domain, no current-database source.
-- ============================================================

-- D-04 non-relationship correction (documented, not executed): comms.
-- communication_losses is explicitly NOT fed by TelecomConnectivityStatus/
-- TelecomConnectivityEvidence (those map to evidence.*, Wave 030) —
-- confirmed here by the absence of any INSERT referencing either table.

-- ============================================================
-- 5. Row counts (before/after)
-- ============================================================
SELECT 0 AS current_database_source_rows; -- no current table feeds any of this wave's 15 targets
SELECT
  (SELECT COUNT(*) FROM alert.alerts) AS alerts_after,
  (SELECT COUNT(*) FROM comms.messages) AS messages_after;
-- Expected: 0, 0.

-- ============================================================
-- 6. Validation query — confirms zero rows anywhere in this wave's 15 tables
-- ============================================================
SELECT
  (SELECT COUNT(*) FROM alert.alerts) +
  (SELECT COUNT(*) FROM alert.alert_authorizations) +
  (SELECT COUNT(*) FROM alert.alert_cancellations) +
  (SELECT COUNT(*) FROM alert.alert_supersessions) +
  (SELECT COUNT(*) FROM alert.critical_instructions) +
  (SELECT COUNT(*) FROM alert.critical_instruction_versions) +
  (SELECT COUNT(*) FROM alert.instruction_authorizations) +
  (SELECT COUNT(*) FROM alert.instruction_compliance_records) +
  (SELECT COUNT(*) FROM comms.communication_plans) +
  (SELECT COUNT(*) FROM comms.messages) +
  (SELECT COUNT(*) FROM comms.delivery_attempts) +
  (SELECT COUNT(*) FROM comms.comprehension_confirmations) +
  (SELECT COUNT(*) FROM comms.offline_communication_plans) +
  (SELECT COUNT(*) FROM comms.communication_losses) +
  (SELECT COUNT(*) FROM comms.acknowledgements) AS total_rows_all_15_tables;
-- Expected: 0.

-- ============================================================
-- 7. MIGRATION_REVIEW_QUEUE — none for this wave (nothing migrated, so
--    nothing can be flagged REQUIRES_REVIEW); declared empty for convention.
-- ============================================================
CREATE OR REPLACE VIEW alert.vw_migration_review_queue AS
SELECT 'alert.alerts'::text AS target_table, id, legacy_source, legacy_record_id, migration_review_status
FROM alert.alerts WHERE migration_review_status = 'REQUIRES_REVIEW';

-- ============================================================
-- 8. Checkpoint
-- ============================================================
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
VALUES ('070_alerts_communications', NULL, 'alert.* + comms.* (15 tables)', 0, 0, 'SKIPPED_NO_ROWS',
  'Zero current-database source for this entire wave — structural readiness only.');
