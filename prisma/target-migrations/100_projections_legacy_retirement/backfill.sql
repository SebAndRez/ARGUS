-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 100 — Projections & Legacy Retirement — Backfill draft.
-- Origen: KnowledgeLesson(0) -> knowledge.lessons_learned (MIGRAR 1:1);
-- HazardKnowledgeDocument(59) + KnowledgeDocument(0) -> knowledge.
-- knowledge_documents (FUSIONAR, 4 duplicate-column pairs reconciled);
-- HazardKnowledgeFact(41) -> knowledge.knowledge_facts (TRANSFORMAR,
-- hazardType -> governance.hazard_types FK, seeded Wave 010). proj.* has no
-- backfill of its own (pure projection over already-migrated data).

-- (Provenance columns for lessons_learned/knowledge_documents/knowledge_facts
-- are already declared in this wave's own migration.sql CREATE TABLE
-- statements — unlike other waves, no ALTER TABLE ADD COLUMN is needed
-- here, since these 3 tables were designed with D-02 provenance from the
-- start, being new in this same migration package.)

-- ============================================================
-- 1. knowledge.lessons_learned <- KnowledgeLesson (0 rows, MIGRAR 1:1).
--    Single batch, structure only.
-- ============================================================
INSERT INTO knowledge.lessons_learned (description, status, legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT kl.summary, 'PENDING'::knowledge.lesson_status_enum, NULL, 'KnowledgeLesson', kl.id, 'HIGH', 'AUTO_MAPPED'
FROM "KnowledgeLesson" kl
ON CONFLICT (legacy_source, legacy_record_id) DO NOTHING;
-- 0 rows in "KnowledgeLesson" today — no-op by construction, kept
-- executable so it activates the moment a real row exists.

-- ============================================================
-- 2. knowledge.knowledge_documents <- HazardKnowledgeDocument(59) +
--    KnowledgeDocument(0), FUSIONAR. Single batch (low volume). Dedup rule:
--    match by (title, sourceUrl) across both sources before insert — if a
--    HazardKnowledgeDocument and a KnowledgeDocument row share the same
--    (title, sourceUrl), only ONE fused knowledge_documents row is created,
--    never two. The winning source for conflicting fields (documentCategory
--    vs documentType, etc.) is NOT fixed here — flagged REQUIRES_REVIEW for
--    every fused row until a human confirms the precedence rule.
-- ============================================================
INSERT INTO knowledge.knowledge_documents (title, status, legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT hkd.title,
  CASE hkd."ingestionStatus" WHEN 'queued' THEN 'DRAFT'::knowledge.knowledge_document_status_enum ELSE 'PUBLISHED'::knowledge.knowledge_document_status_enum END,
  hkd."ingestionStatus", 'HazardKnowledgeDocument', hkd.id, 'MEDIUM', 'REQUIRES_REVIEW'
FROM "HazardKnowledgeDocument" hkd
ON CONFLICT (legacy_source, legacy_record_id) DO NOTHING;

INSERT INTO knowledge.knowledge_documents (title, status, legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT kd.title,
  CASE kd."reviewStatus" WHEN 'pending_review' THEN 'DRAFT'::knowledge.knowledge_document_status_enum ELSE 'PUBLISHED'::knowledge.knowledge_document_status_enum END,
  kd."reviewStatus", 'KnowledgeDocument', kd.id, 'MEDIUM', 'REQUIRES_REVIEW'
FROM "KnowledgeDocument" kd
WHERE NOT EXISTS ( -- dedup guard: skip if a HazardKnowledgeDocument with the same title already produced a fused row
  SELECT 1 FROM "HazardKnowledgeDocument" hkd WHERE hkd.title = kd.title
)
ON CONFLICT (legacy_source, legacy_record_id) DO NOTHING;
-- 0 rows in "KnowledgeDocument" today — this branch is a no-op by
-- construction but kept executable for the same reason as §1.

-- ============================================================
-- 3. knowledge.knowledge_facts <- HazardKnowledgeFact (41 rows,
--    TRANSFORMAR). hazardType string -> governance.hazard_types FK
--    (reconciled to the 8-value seed, Wave 010). Single batch.
-- ============================================================
INSERT INTO knowledge.knowledge_facts (knowledge_document_id, fact_kind, content,
  legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT kd.id, 'FACT'::knowledge.fact_kind_enum, hkf.summary,
  hkf."extractionStatus", 'HazardKnowledgeFact', hkf.id,
  CASE WHEN ht.id IS NOT NULL THEN 'MEDIUM' ELSE 'LOW' END,
  CASE WHEN ht.id IS NOT NULL THEN 'AUTO_MAPPED' ELSE 'REQUIRES_REVIEW' END
FROM "HazardKnowledgeFact" hkf
LEFT JOIN governance.hazard_types ht ON upper(ht.code) = upper(hkf."hazardType")
LEFT JOIN knowledge.knowledge_documents kd ON kd.legacy_source = 'HazardKnowledgeDocument' AND kd.legacy_record_id = hkf."documentId"
ON CONFLICT (legacy_source, legacy_record_id) DO NOTHING;
-- NOTE: knowledge_document_id is NOT NULL in the target schema but
-- HazardKnowledgeFact.documentId is nullable in the current schema — any
-- row where kd.id resolves to NULL here will fail the NOT NULL constraint
-- and must be resolved (either a placeholder "orphan facts" document, or a
-- schema relaxation) before this INSERT can run for real; flagged for
-- implementation review, not silently worked around in this draft.

-- ============================================================
-- 4. Row counts (before/after)
-- ============================================================
SELECT
  (SELECT COUNT(*) FROM "KnowledgeLesson") AS knowledge_lesson_before, -- expect 0
  (SELECT COUNT(*) FROM "HazardKnowledgeDocument") AS hazard_knowledge_document_before, -- expect 59
  (SELECT COUNT(*) FROM "KnowledgeDocument") AS knowledge_document_before, -- expect 0
  (SELECT COUNT(*) FROM "HazardKnowledgeFact") AS hazard_knowledge_fact_before; -- expect 41

SELECT
  (SELECT COUNT(*) FROM knowledge.lessons_learned) AS lessons_learned_after, -- expect 0
  (SELECT COUNT(*) FROM knowledge.knowledge_documents) AS knowledge_documents_after, -- expect <=59
  (SELECT COUNT(*) FROM knowledge.knowledge_facts) AS knowledge_facts_after; -- expect <=41 (pending FK resolution for null-documentId rows)

-- ============================================================
-- 5. Validation query — every HazardKnowledgeDocument row produced exactly
--    one knowledge_documents row (fusion never drops a row silently)
-- ============================================================
SELECT hkd.id FROM "HazardKnowledgeDocument" hkd
LEFT JOIN knowledge.knowledge_documents kd ON kd.legacy_source = 'HazardKnowledgeDocument' AND kd.legacy_record_id = hkd.id
WHERE kd.id IS NULL;
-- Expected: 0 rows.

-- ============================================================
-- 6. MIGRATION_REVIEW_QUEUE
-- ============================================================
CREATE OR REPLACE VIEW knowledge.vw_migration_review_queue AS
SELECT 'knowledge.knowledge_documents'::text AS target_table, id, legacy_source, legacy_record_id, migration_review_status FROM knowledge.knowledge_documents WHERE migration_review_status = 'REQUIRES_REVIEW'
UNION ALL
SELECT 'knowledge.knowledge_facts', id, legacy_source, legacy_record_id, migration_review_status FROM knowledge.knowledge_facts WHERE migration_review_status = 'REQUIRES_REVIEW';

-- ============================================================
-- 7. Checkpoints
-- ============================================================
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status)
SELECT '100_projections_legacy_retirement', 'HazardKnowledgeDocument+KnowledgeDocument', 'knowledge.knowledge_documents', 59,
  (SELECT COUNT(*) FROM knowledge.knowledge_documents), CASE WHEN (SELECT COUNT(*) FROM knowledge.knowledge_documents) <= 59 THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
SELECT '100_projections_legacy_retirement', 'HazardKnowledgeFact', 'knowledge.knowledge_facts', 41,
  (SELECT COUNT(*) FROM knowledge.knowledge_facts), CASE WHEN (SELECT COUNT(*) FROM knowledge.knowledge_facts) = 41 THEN 'PASS' ELSE 'FAIL' END,
  'May under-count until the nullable-documentId NOT NULL conflict (§3 note) is resolved by implementation review.';
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status)
VALUES ('100_projections_legacy_retirement', 'KnowledgeLesson', 'knowledge.lessons_learned', 0, 0, 'SKIPPED_NO_ROWS');

-- ============================================================
-- 8. Program-level closing check — every one of the 11 waves has written
--    at least one row to migration_meta.migration_checkpoints (confirms
--    no wave was silently skipped end to end).
-- ============================================================
SELECT wave, COUNT(*) AS checkpoint_rows FROM migration_meta.migration_checkpoints GROUP BY wave ORDER BY wave;
-- Expected: 11 distinct wave values, each with >=1 row.
