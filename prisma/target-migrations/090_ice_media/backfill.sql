-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 090 — ICE, Media & Community — Backfill draft.
-- Origen: none for any of the 20 tables in this wave (D-08: ice.* is
-- CREATE_EMPTY, "no existe hoy ningun concepto de consentimiento medico ni
-- de acceso de emergencia"; media.* is a wholly new domain; D-03:
-- community.* is explicitly not fed by VESTA). This file exists so the
-- convention (provenance columns + checkpoint + review-queue view) is
-- uniform across all 11 waves, even where D-08/D-03 forbid any row-level
-- work outright.

ALTER TABLE community.volunteers ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE community.volunteers ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
-- (community.volunteers already carries these 5 columns per migration.sql's
-- own CREATE TABLE — ADD COLUMN IF NOT EXISTS is a no-op guard here, not a
-- new addition, since this is the one table in the wave with a structural
-- precedent, even though not exercised by this file.)

-- ============================================================
-- 1. ice.* (8 tables) — D-08 CREATE_EMPTY. No INSERT statement anywhere in
--    this file targets any ice.* table. FamilyPlan.medicalNeedsNotes (the
--    one real VESTA user's free-text medical data) is explicitly NEVER
--    read from in this file — confirmed by the absence of any reference
--    to "FamilyPlan" below.
-- ============================================================

-- ============================================================
-- 2. media.* (8 tables) — new domain, no current-database source. No
--    INSERT statement.
-- ============================================================

-- ============================================================
-- 3. community.* (4 tables) — D-03, not fed by VESTA. No INSERT statement
--    references PreparednessProfile/FamilyPlan/EmergencyContact(VESTA)/
--    PreparednessChecklistItem/PreparednessReminder. (community.volunteers
--    has a partial structural precedent via User.role in Wave 020's own
--    backfill — not repeated here, per this wave's backfill-plan.md.)
-- ============================================================

-- ============================================================
-- 4. Row counts (before/after)
-- ============================================================
SELECT 0 AS current_database_source_rows; -- no current table feeds any of this wave's 20 targets
SELECT
  (SELECT COUNT(*) FROM ice.emergency_profiles) +
  (SELECT COUNT(*) FROM media.publications) +
  (SELECT COUNT(*) FROM community.family_networks) AS spot_check_after;
-- Expected: 0.

-- ============================================================
-- 5. Validation query — confirms zero rows across all 20 tables (mirrors
--    validation.sql's own check, repeated here since backfill.sql is the
--    artifact Phase 9 requires as a standalone file).
-- ============================================================
SELECT
  (SELECT COUNT(*) FROM ice.emergency_profiles) + (SELECT COUNT(*) FROM ice.medical_conditions) +
  (SELECT COUNT(*) FROM ice.allergies) + (SELECT COUNT(*) FROM ice.current_medications) +
  (SELECT COUNT(*) FROM ice.medical_devices) + (SELECT COUNT(*) FROM ice.special_needs) +
  (SELECT COUNT(*) FROM ice.emergency_accesses) + (SELECT COUNT(*) FROM ice.emergency_contact_designations) +
  (SELECT COUNT(*) FROM media.publications) + (SELECT COUNT(*) FROM media.live_streams) +
  (SELECT COUNT(*) FROM media.content_moderations) + (SELECT COUNT(*) FROM media.anonymizations) +
  (SELECT COUNT(*) FROM media.redactions) + (SELECT COUNT(*) FROM media.visual_maskings) +
  (SELECT COUNT(*) FROM media.usage_licenses) + (SELECT COUNT(*) FROM media.publication_authorizations) +
  (SELECT COUNT(*) FROM community.family_networks) + (SELECT COUNT(*) FROM community.dependents) +
  (SELECT COUNT(*) FROM community.community_groups) + (SELECT COUNT(*) FROM community.volunteers) AS total_rows_all_20_tables;
-- Expected: 0.

-- ============================================================
-- 6. MIGRATION_REVIEW_QUEUE — none (nothing migrated); declared empty for convention.
-- ============================================================
CREATE OR REPLACE VIEW ice.vw_migration_review_queue AS
SELECT 'ice.emergency_profiles'::text AS target_table, NULL::uuid AS id, NULL::text AS legacy_source, NULL::text AS legacy_record_id, NULL::text AS migration_review_status
WHERE false; -- structurally-typed empty result, D-08 permits zero rows by design

-- ============================================================
-- 7. Checkpoint
-- ============================================================
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
VALUES ('090_ice_media', NULL, 'ice.* + media.* + community.* (20 tables)', 0, 0, 'SKIPPED_NO_ROWS',
  'D-08/D-03: zero current-database source by decision, not by gap — see backfill-plan.md.');
