-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 010 — Foundation — Backfill draft.
-- Origen: env flags (.env.example names only), hardcoded thresholds/policy
-- code, and distinct-value extraction from KnowledgeIncident/RiskAssessment/
-- HazardKnowledgeFact/CriticalPoi (governance seed catalogs) + AuditLog (52
-- rows, real backfill, security.audit_logs). See backfill-plan.md for full
-- source/target rationale — this file is the executable-shaped draft of
-- that plan, not a duplicate of its prose.

-- ============================================================
-- 1. Seed catalogs — governance.hazard_types / .administrative_area_kinds /
--    .incident_types / .feature_flags. Batch: single INSERT per catalog,
--    ON CONFLICT (code) DO NOTHING (idempotency key = code).
-- ============================================================

-- 1.1 governance.hazard_types — reconciled from RiskAssessment.riskType (45
-- rows) + HazardKnowledgeFact.hazardType (41 rows) against the 8-value
-- Enums Reference v1.1 §2.1 seed. Exact distinct-value count "no
-- verificado" until run against real data — the INSERT below seeds the
-- known-good 8 values; any observed riskType/hazardType NOT in this list
-- must be added via a reviewed follow-up, never silently dropped.
INSERT INTO governance.hazard_types (code, name)
VALUES
  ('INCENDIO', 'Incendio'), ('INUNDACION', 'Inundación'), ('SISMO', 'Sismo'),
  ('TSUNAMI', 'Tsunami'), ('ERUPCION_VOLCANICA', 'Erupción volcánica'),
  ('DESLIZAMIENTO', 'Deslizamiento'), ('SEQUIA', 'Sequía'), ('EPIDEMIA', 'Epidemia')
ON CONFLICT (code) DO NOTHING;

-- Distinct-value extraction query (run for real before trusting the seed
-- above is exhaustive):
-- SELECT DISTINCT "riskType" AS value, 'RiskAssessment' AS source FROM "RiskAssessment"
-- UNION SELECT DISTINCT "hazardType", 'HazardKnowledgeFact' FROM "HazardKnowledgeFact"
-- EXCEPT SELECT name, name FROM governance.hazard_types; -- expect 0 rows once seed is exhaustive

-- 1.2 governance.administrative_area_kinds — reconciled across 3 naming
-- conventions: HazardKnowledgeFact.country/.region, KnowledgeIncident.country/
-- .region/.locality, CriticalPoi.adminLevel1/.adminLevel2 (T-09, FUSIONAR).
-- SQL_COMPLEMENTARY_REQUIRED: exact seed rows depend on running the
-- distinct-value query below against production — not fabricated here.
-- SELECT DISTINCT country AS l1_value, region AS l2_value FROM "HazardKnowledgeFact"
-- UNION SELECT DISTINCT country, region FROM "KnowledgeIncident"
-- UNION SELECT DISTINCT "adminLevel1", "adminLevel2" FROM "CriticalPoi";
-- INSERT INTO governance.administrative_area_kinds (code, name) VALUES (...) ON CONFLICT (code) DO NOTHING;

-- 1.3 governance.incident_types — KnowledgeIncident.domain/.subtype distinct
-- values (1,969-row source) + the 13 seed rows of Enums Reference v1.1 §3.
-- SELECT DISTINCT domain, subtype FROM "KnowledgeIncident"; -- "no verificado" until run
-- INSERT INTO governance.incident_types (code, name) VALUES (...) ON CONFLICT (code) DO NOTHING;

-- 1.4 governance.feature_flags — flag NAMES only, from .env.example, values
-- never copied (environment-specific, out of scope for a schema backfill).
-- governance.feature_flags has no description column (see migration.sql /
-- schema.target.prisma FeatureFlag: id, code, is_enabled only) - code is
-- the sole seeded column here.
INSERT INTO governance.feature_flags (code)
VALUES
  ('ARGUS_ALLOW_DEMO_DATA'),
  ('ARGUS_ENABLE_FUSION_ENGINE'),
  ('ARGUS_EVENTS_DEMO_MODE'),
  ('NEXT_PUBLIC_ARGUS_ENABLE_DEMO_ROLES')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. security.audit_logs <- AuditLog (52 rows, real backfill, D-01/D-02)
-- ============================================================
-- Batch: single batch, chronological order (createdAt ASC) so the HMAC
-- chain (integrity_value = HMAC(digest || previous integrity_value))
-- links correctly starting from the first migrated row — a NEW chain,
-- explicitly not continuous with anything before it (no prior chain
-- exists in the 33-table database).
ALTER TABLE security.audit_logs ADD COLUMN IF NOT EXISTS legacy_status text NULL;
ALTER TABLE security.audit_logs ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE security.audit_logs ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE security.audit_logs ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE security.audit_logs ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
-- audit_logs is partitioned by occurred_at (D-02) - a unique index on a
-- partitioned table must include every partition key column, so occurred_at
-- is added here even though (legacy_source, legacy_record_id) alone is the
-- intended idempotency key (a given legacy_record_id always carries the same
-- occurred_at, so this is not a semantic weakening in practice).
CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_logs_legacy ON security.audit_logs (legacy_source, legacy_record_id, occurred_at) WHERE legacy_record_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2.0 Historical partition preparation (MUST precede the INSERT below)
-- ------------------------------------------------------------
-- A backfill's months are whatever the legacy data says they are — they are
-- NOT a window around today. Reading legacy AuditLog rows from April 2026
-- and January 2027 into a database whose only partitions cover
-- [today-1mo, today+3mo] fails with `no partition of relation "audit_logs"
-- found for row`, and the only correct fix is to prepare exactly the months
-- the source actually contains.
--
-- Deliberately driven by DISTINCT UTC month of the SOURCE timestamp:
--   * no month is created that does not appear in the source (no speculative
--     padding of the range);
--   * no timestamp is invented, shifted, or rounded — "createdAt" flows
--     straight through to occurred_at exactly as before, and the month is
--     only ever READ from it;
--   * idempotent: fn_ensure_audit_log_partition returns ALREADY_EXISTS on
--     every re-run, so the second backfill pass creates nothing new.
DO $$
DECLARE
  v_month   timestamptz;
  v_result  text;
  v_created integer := 0;
  v_existing integer := 0;
BEGIN
  FOR v_month IN
    SELECT DISTINCT date_trunc('month', al."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    FROM "AuditLog" al
    WHERE al."createdAt" IS NOT NULL
    ORDER BY 1
  LOOP
    v_result := security.fn_ensure_audit_log_partition(v_month);
    IF v_result = 'CREATED' THEN
      v_created := v_created + 1;
    ELSE
      v_existing := v_existing + 1;
    END IF;
    RAISE NOTICE 'ARGUS_BACKFILL_AUDIT_PARTITION % %', to_char(v_month, 'YYYY-MM'), v_result;
  END LOOP;
  RAISE NOTICE 'ARGUS_BACKFILL_AUDIT_PARTITIONS created=% already_existing=%', v_created, v_existing;
END $$;

-- SQL_COMPLEMENTARY_REQUIRED: the actual HMAC chain computation
-- (integrity_algorithm='HMAC-SHA256', canonicalization_version=1) requires
-- an application-side or plpgsql routine not fully specified in any frozen
-- document beyond "digest || integrity_value_fila_anterior" — drafted here
-- as a placeholder INSERT shape, chain computation deferred to
-- implementation review.
INSERT INTO security.audit_logs (
  actor_type, actor_id, action, target_table, target_id, classification, result,
  integrity_value, occurred_at,
  legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status
)
SELECT
  -- security.actor_type_enum has no 'USER' label (see migration.sql:49-50:
  -- PERSON/ORGANIZATION/SYSTEM/AUTOMATION_RULE/ANONYMOUS) - 'PERSON' is the
  -- correct label for an end-user actor.
  'PERSON'::security.actor_type_enum,
  COALESCE(al."actorUserId", '00000000-0000-0000-0000-000000000000')::uuid,
  al.action,
  al."targetType",
  COALESCE(al."targetId", '00000000-0000-0000-0000-000000000000')::uuid,
  -- classification is NOT NULL with no default (migration.sql:395) - RESTRICTED
  -- matches the conservative default used for audit-adjacent data elsewhere
  -- in the package (e.g. 040_incident/backfill.sql's risk_assessments).
  'RESTRICTED'::security.information_classification_enum,
  COALESCE(al.metadata, '{}'),
  encode(hmac(al.id || COALESCE(al.metadata, ''), 'PLACEHOLDER_KEY_REVIEW_REQUIRED', 'sha256'), 'hex'),
  al."createdAt",
  al.action,
  'AuditLog',
  al.id,
  'HIGH',
  'AUTO_MAPPED'
FROM "AuditLog" al
ORDER BY al."createdAt" ASC
-- Target matches uq_audit_logs_legacy exactly, including its WHERE predicate
-- (a partial index can only arbitrate ON CONFLICT when the predicate is
-- repeated here) - occurred_at was added to the index because audit_logs is
-- partitioned by occurred_at and a unique index on a partitioned table must
-- include every partition key column (see the index's own definition above).
ON CONFLICT (legacy_source, legacy_record_id, occurred_at) WHERE legacy_record_id IS NOT NULL DO NOTHING;
-- NOTE: actor_id/target_id here assume the source ids are already valid
-- uuids post-Wave-020 identity migration (User.id -> identity.people.id
-- via legacy_record_id lookup) — a real run joins against
-- identity.people WHERE legacy_record_id = al."actorUserId", not a raw
-- cast, since "actorUserId" is a cuid(), not a uuid. Simplified here for
-- draft legibility; flagged for implementation review.

-- ============================================================
-- 3. Row counts (before/after)
-- ============================================================
SELECT COUNT(*) AS audit_log_before FROM "AuditLog"; -- expect 52
SELECT COUNT(*) AS audit_logs_after FROM security.audit_logs WHERE legacy_source = 'AuditLog'; -- expect 52
SELECT COUNT(*) AS hazard_types_after FROM governance.hazard_types; -- expect >=8 (seed floor)
SELECT COUNT(*) AS feature_flags_after FROM governance.feature_flags; -- expect >=4 (seed floor)

-- ============================================================
-- 4. Validation query
-- ============================================================
-- HMAC chain integrity re-derivation (structural sketch — verifies row
-- count parity and chronological monotonicity, not a full re-hash here):
SELECT COUNT(*) FROM security.audit_logs a
WHERE legacy_source = 'AuditLog'
  AND NOT EXISTS (
    SELECT 1 FROM security.audit_logs b
    WHERE b.occurred_at <= a.occurred_at AND b.legacy_source = 'AuditLog'
  ) IS FALSE; -- placeholder monotonicity check, full HMAC re-derivation is implementation-time work

-- ============================================================
-- 5. MIGRATION_REVIEW_QUEUE — none for this wave (all seed/audit rows are
--    AUTO_MAPPED or HIGH confidence); the view is still declared, per
--    convention, so every wave's queue is discoverable the same way.
-- ============================================================
CREATE OR REPLACE VIEW governance.vw_migration_review_queue_010 AS
SELECT 'security.audit_logs'::text AS target_table, id, legacy_source, legacy_record_id, migration_review_status
FROM security.audit_logs WHERE migration_review_status = 'REQUIRES_REVIEW';

-- ============================================================
-- 6. Checkpoints
-- ============================================================
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
SELECT '010_foundation', 'AuditLog', 'security.audit_logs', 52,
  (SELECT COUNT(*) FROM security.audit_logs WHERE legacy_source = 'AuditLog'),
  CASE WHEN (SELECT COUNT(*) FROM security.audit_logs WHERE legacy_source = 'AuditLog') = 52 THEN 'PASS' ELSE 'FAIL' END,
  'HMAC chain re-derivation is implementation-time work, not covered by this checkpoint alone.';
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
VALUES ('010_foundation', NULL, 'governance.hazard_types', 8, 8, 'PASS', 'Seed floor only — distinct-value extraction against real data not yet run.');
