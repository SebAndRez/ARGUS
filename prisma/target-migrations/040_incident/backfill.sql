-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 040 — Incident (+ Risk & Command) — Backfill draft.
-- Origen: KnowledgeIncident(1,969, T-02, the highest-impact single transform
-- of the whole plan) -> incident.incidents / .incident_candidates (DIVIDIR,
-- split on verificationStatus); IncidentTransition(16) -> .incident_transitions
-- (T-03, D-02 legacy_status_mapping join); IncidentRelation(0) ->
-- .incident_relations; RiskAssessment(45) -> risk.risk_assessments;
-- RiskAssessmentRevision(50) -> risk.risk_assessment_revisions.

ALTER TABLE incident.incidents ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE incident.incidents ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE incident.incidents ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE incident.incidents ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_legacy ON incident.incidents (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

ALTER TABLE incident.incident_candidates ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE incident.incident_candidates ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE incident.incident_candidates ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE incident.incident_candidates ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_incident_candidates_legacy ON incident.incident_candidates (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

ALTER TABLE incident.incident_transitions ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE incident.incident_transitions ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE incident.incident_transitions ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE incident.incident_transitions ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;

ALTER TABLE risk.risk_assessments ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE risk.risk_assessments ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE risk.risk_assessments ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE risk.risk_assessments ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_risk_assessments_legacy ON risk.risk_assessments (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

ALTER TABLE risk.risk_assessment_revisions ADD COLUMN IF NOT EXISTS legacy_source varchar(100) NULL;
ALTER TABLE risk.risk_assessment_revisions ADD COLUMN IF NOT EXISTS legacy_record_id text NULL;
ALTER TABLE risk.risk_assessment_revisions ADD COLUMN IF NOT EXISTS migration_confidence varchar(10) NULL;
ALTER TABLE risk.risk_assessment_revisions ADD COLUMN IF NOT EXISTS migration_review_status varchar(30) NULL;

-- ============================================================
-- 1. D-02 legacy_status_mapping seed rows for KnowledgeIncident.status/
--    verificationStatus -> the 5 target dimensions. Conservative default:
--    ambiguous values map to the least-privileged target (e.g. an
--    ambiguous "active-ish" status -> operational_status='MONITORING',
--    never 'ACTIVE').
-- ============================================================
-- target_value entries below are corrected to match the real enum labels
-- (migration.sql:41-45: incident_verification_status_enum = UNVERIFIED/
-- PENDING/VERIFIED/DISPUTED; incident_operational_status_enum = ACTIVE/
-- CONTAINED/MITIGATING/RESOLVED/MONITORING/ARCHIVED/CANCELLED) - the original
-- draft used DETECTED/UNCONFIRMED/CORROBORATED/OFFICIAL, none of which exist
-- on either enum; this column is plain varchar here but gets CAST to the
-- real enum type at read time in steps 2-4 below.
INSERT INTO migration_meta.legacy_status_mapping (source_table, source_status_value, target_dimension, target_value, confidence, notes) VALUES
  ('KnowledgeIncident', 'detected', 'operational_status', 'ACTIVE', 'HIGH', NULL),
  ('KnowledgeIncident', 'validating', 'operational_status', 'MONITORING', 'MEDIUM', 'Conservative default — not a confirmed dimension mapping'),
  ('KnowledgeIncident', 'confirmed', 'operational_status', 'ACTIVE', 'HIGH', NULL),
  ('KnowledgeIncident', 'active', 'operational_status', 'ACTIVE', 'HIGH', NULL),
  ('KnowledgeIncident', 'escalating', 'operational_status', 'ACTIVE', 'MEDIUM', 'trend dimension separately set to ESCALATING'),
  ('KnowledgeIncident', 'monitoring', 'operational_status', 'MONITORING', 'HIGH', NULL),
  ('KnowledgeIncident', 'contained', 'operational_status', 'CONTAINED', 'HIGH', NULL),
  ('KnowledgeIncident', 'resolved', 'operational_status', 'RESOLVED', 'HIGH', NULL),
  ('KnowledgeIncident', 'archived', 'operational_status', 'RESOLVED', 'MEDIUM', 'No distinct ARCHIVED operational_status value confirmed in target'),
  ('KnowledgeIncident', 'unverified', 'verification_status', 'UNVERIFIED', 'HIGH', NULL),
  ('KnowledgeIncident', 'candidate', 'verification_status', 'PENDING', 'HIGH', 'Routes to incident_candidates, not incidents'),
  ('KnowledgeIncident', 'corroborated', 'verification_status', 'VERIFIED', 'HIGH', NULL),
  ('KnowledgeIncident', 'official', 'verification_status', 'VERIFIED', 'HIGH', NULL)
ON CONFLICT (source_table, source_status_value, target_dimension) DO NOTHING;

-- ============================================================
-- 2. incident.incident_candidates <- KnowledgeIncident WHERE verificationStatus
--    IN ('unverified','candidate'). Batched 500 rows, transaction per batch.
-- ============================================================
-- incident.incident_candidates has no correlation_key column
-- (migration.sql:76-86) - removed; created_at renamed to opened_at, the real
-- column name; incident_candidate_status_enum has no 'UNDER_ASSESSMENT'
-- label (migration.sql:38-39: OPEN/CORRELATING/PROMOTED/DISCARDED) -
-- 'CORRELATING' is the correct label.
INSERT INTO incident.incident_candidates (status, opened_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT 'CORRELATING'::incident.incident_candidate_status_enum, ki."createdAt",
  'KnowledgeIncident', ki.id,
  CASE WHEN m.confidence IS NOT NULL THEN m.confidence ELSE 'LOW' END,
  CASE WHEN m.confidence IS NOT NULL THEN 'AUTO_MAPPED' ELSE 'REQUIRES_REVIEW' END
FROM "KnowledgeIncident" ki
LEFT JOIN migration_meta.legacy_status_mapping m
  ON m.source_table = 'KnowledgeIncident' AND m.source_status_value = ki."verificationStatus" AND m.target_dimension = 'verification_status'
WHERE ki."verificationStatus" IN ('unverified','candidate')
ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;

-- ============================================================
-- 3. incident.incidents <- KnowledgeIncident (remainder). T-02.
-- ============================================================
-- incident.incidents has no title/description column (migration.sql:116-135)
-- - removed; that content has no home in this table's schema.
INSERT INTO incident.incidents (verification_status, operational_status, created_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT
  COALESCE(mv.target_value, 'UNVERIFIED')::incident.incident_verification_status_enum,
  COALESCE(mo.target_value, 'MONITORING')::incident.incident_operational_status_enum,
  ki."createdAt",
  'KnowledgeIncident', ki.id,
  CASE WHEN mo.confidence IS NOT NULL THEN mo.confidence ELSE 'LOW' END,
  CASE WHEN mo.confidence IS NOT NULL THEN 'AUTO_MAPPED' ELSE 'REQUIRES_REVIEW' END
FROM "KnowledgeIncident" ki
LEFT JOIN migration_meta.legacy_status_mapping mv
  ON mv.source_table = 'KnowledgeIncident' AND mv.source_status_value = ki."verificationStatus" AND mv.target_dimension = 'verification_status'
LEFT JOIN migration_meta.legacy_status_mapping mo
  ON mo.source_table = 'KnowledgeIncident' AND mo.source_status_value = COALESCE(ki.status, 'detected') AND mo.target_dimension = 'operational_status'
WHERE ki."verificationStatus" NOT IN ('unverified','candidate') OR ki."verificationStatus" IS NULL
ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;

-- ============================================================
-- 4. incident.incident_transitions <- IncidentTransition (16 rows, T-03,
--    split per-dimension via legacy_status_mapping join). Single batch.
-- ============================================================
-- columns are from_value/to_value, not previous_value/new_value
-- (migration.sql:226-240); dimension is incident_state_dimension_enum, whose
-- labels are uppercase (migration.sql:56-58) - 'OPERATIONAL_STATUS', not
-- 'operational_status' (that lowercase form is only valid for the plain
-- varchar target_dimension column in migration_meta.legacy_status_mapping).
INSERT INTO incident.incident_transitions (incident_id, dimension, from_value, to_value, transitioned_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT i.id, 'OPERATIONAL_STATUS',
  COALESCE(mp.target_value, it."previousStatus"), COALESCE(mn.target_value, it."newStatus"), it."createdAt",
  'IncidentTransition', it.id,
  CASE WHEN mn.confidence IS NOT NULL THEN mn.confidence ELSE 'LOW' END,
  CASE WHEN mn.confidence IS NOT NULL THEN 'AUTO_MAPPED' ELSE 'REQUIRES_REVIEW' END
FROM "IncidentTransition" it
JOIN incident.incidents i ON i.legacy_source = 'KnowledgeIncident' AND i.legacy_record_id = it."incidentId"
LEFT JOIN migration_meta.legacy_status_mapping mp ON mp.source_table = 'KnowledgeIncident' AND mp.source_status_value = it."previousStatus" AND mp.target_dimension = 'operational_status'
LEFT JOIN migration_meta.legacy_status_mapping mn ON mn.source_table = 'KnowledgeIncident' AND mn.source_status_value = it."newStatus" AND mn.target_dimension = 'operational_status'
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. incident.incident_relations <- IncidentRelation (0 rows, structure only)
-- ============================================================
-- INSERT INTO incident.incident_relations (...) SELECT ... FROM "IncidentRelation"; -- 0 rows, never executes for real

-- ============================================================
-- 6. risk.risk_assessments <- RiskAssessment (45 rows). Single batch.
--    riskType string -> hazard_type_id FK (governance.hazard_types, seeded
--    Wave 010).
-- ============================================================
INSERT INTO risk.risk_assessments (hazard_type_id, classification, status, created_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT ht.id,
  'RESTRICTED'::security.information_classification_enum,
  -- risk.risk_assessment_status_enum has no 'ARCHIVED' label
  -- (migration.sql:64: ACTIVE/CLOSED only) - 'CLOSED' is the correct label.
  CASE WHEN ra.status = 'active' THEN 'ACTIVE'::risk.risk_assessment_status_enum ELSE 'CLOSED'::risk.risk_assessment_status_enum END,
  ra."createdAt",
  'RiskAssessment', ra.id,
  CASE WHEN ht.id IS NOT NULL THEN 'HIGH' ELSE 'LOW' END,
  CASE WHEN ht.id IS NOT NULL THEN 'AUTO_MAPPED' ELSE 'REQUIRES_REVIEW' END
FROM "RiskAssessment" ra
LEFT JOIN governance.hazard_types ht ON upper(ht.code) = upper(ra."riskType")
ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;

-- ============================================================
-- 7. risk.risk_assessment_revisions <- RiskAssessmentRevision (50 rows,
--    MIGRAR 1:1). Single batch.
-- ============================================================
-- column is "changes" not "content_snapshot" (migration.sql:353-366)
INSERT INTO risk.risk_assessment_revisions (risk_assessment_id, revision_number, changes, created_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT ra.id, row_number() OVER (PARTITION BY rar."assessmentId" ORDER BY rar."createdAt"),
  jsonb_build_object('previousStatus', rar."previousStatus", 'newStatus', rar."newStatus", 'reason', rar.reason, 'evidence', rar.evidence),
  rar."createdAt",
  'RiskAssessmentRevision', rar.id, 'HIGH', 'AUTO_MAPPED'
FROM "RiskAssessmentRevision" rar
JOIN risk.risk_assessments ra ON ra.legacy_source = 'RiskAssessment' AND ra.legacy_record_id = rar."assessmentId"
ON CONFLICT DO NOTHING;

-- ============================================================
-- 8. Row counts (before/after)
-- ============================================================
SELECT
  (SELECT COUNT(*) FROM "KnowledgeIncident") AS knowledge_incident_before, -- expect 1969
  (SELECT COUNT(*) FROM "IncidentTransition") AS incident_transition_before, -- expect 16
  (SELECT COUNT(*) FROM "RiskAssessment") AS risk_assessment_before, -- expect 45
  (SELECT COUNT(*) FROM "RiskAssessmentRevision") AS risk_assessment_revision_before; -- expect 50

SELECT
  (SELECT COUNT(*) FROM incident.incidents) AS incidents_after,
  (SELECT COUNT(*) FROM incident.incident_candidates) AS incident_candidates_after,
  (SELECT COUNT(*) FROM incident.incident_transitions) AS incident_transitions_after, -- expect 16
  (SELECT COUNT(*) FROM risk.risk_assessments) AS risk_assessments_after, -- expect 45
  (SELECT COUNT(*) FROM risk.risk_assessment_revisions) AS risk_assessment_revisions_after; -- expect 50

-- ============================================================
-- 9. Validation query — every KnowledgeIncident row is accounted for in
--    exactly one of incidents/incident_candidates, never both, never neither
-- ============================================================
SELECT ki.id FROM "KnowledgeIncident" ki
LEFT JOIN incident.incidents i ON i.legacy_source = 'KnowledgeIncident' AND i.legacy_record_id = ki.id
LEFT JOIN incident.incident_candidates ic ON ic.legacy_source = 'KnowledgeIncident' AND ic.legacy_record_id = ki.id
WHERE (i.id IS NULL AND ic.id IS NULL) OR (i.id IS NOT NULL AND ic.id IS NOT NULL);
-- Expected: 0 rows.

-- ============================================================
-- 10. MIGRATION_REVIEW_QUEUE
-- ============================================================
CREATE OR REPLACE VIEW incident.vw_migration_review_queue AS
SELECT 'incident.incidents'::text AS target_table, id, legacy_source, legacy_record_id, migration_review_status FROM incident.incidents WHERE migration_review_status = 'REQUIRES_REVIEW'
UNION ALL
SELECT 'incident.incident_candidates', id, legacy_source, legacy_record_id, migration_review_status FROM incident.incident_candidates WHERE migration_review_status = 'REQUIRES_REVIEW';
CREATE OR REPLACE VIEW risk.vw_migration_review_queue AS
SELECT 'risk.risk_assessments'::text AS target_table, id, legacy_source, legacy_record_id, migration_review_status FROM risk.risk_assessments WHERE migration_review_status = 'REQUIRES_REVIEW';

-- ============================================================
-- 11. Checkpoints
-- ============================================================
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
SELECT '040_incident', 'KnowledgeIncident', 'incident.incidents + incident.incident_candidates', 1969,
  (SELECT COUNT(*) FROM incident.incidents WHERE legacy_source = 'KnowledgeIncident') + (SELECT COUNT(*) FROM incident.incident_candidates WHERE legacy_source = 'KnowledgeIncident'),
  CASE WHEN (SELECT COUNT(*) FROM incident.incidents WHERE legacy_source = 'KnowledgeIncident') + (SELECT COUNT(*) FROM incident.incident_candidates WHERE legacy_source = 'KnowledgeIncident') = 1969 THEN 'PASS' ELSE 'FAIL' END,
  'Exact A/B split (incidents vs candidates) is "no verificado" until run against real verificationStatus distribution.';
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status)
SELECT '040_incident', 'RiskAssessment', 'risk.risk_assessments', 45, (SELECT COUNT(*) FROM risk.risk_assessments),
  CASE WHEN (SELECT COUNT(*) FROM risk.risk_assessments) = 45 THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status)
SELECT '040_incident', 'RiskAssessmentRevision', 'risk.risk_assessment_revisions', 50, (SELECT COUNT(*) FROM risk.risk_assessment_revisions),
  CASE WHEN (SELECT COUNT(*) FROM risk.risk_assessment_revisions) = 50 THEN 'PASS' ELSE 'FAIL' END;
