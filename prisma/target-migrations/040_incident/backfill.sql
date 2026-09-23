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
--
-- RECONCILED (earlier session): all legacy-provenance columns ship as part
-- of migration.sql's CREATE TABLE statements; all column names/enum
-- literals below match schema.target.prisma exactly (incident_candidates:
-- created_at not opened_at, status UNDER_ASSESSMENT/PROMOTING/PROMOTED/
-- DISCARDED; incidents: incident_type_id + title now NOT NULL, populated
-- below; incident_transitions: previous_value/new_value not from_value/
-- to_value, dimension enum short-form VERIFICATION/OPERATIONAL/etc.).
--
-- ONE MAPPING, TWO CALLERS (Paso 5): the KnowledgeIncident and
-- IncidentTransition transforms live in migration_meta.fn_sync_* functions
-- taking the legacy ids to process (NULL = every row). This file calls them
-- with NULL; the application's shadow-write calls the same functions with
-- the ids a legacy write just committed. See 030's header for the full
-- contract shared by every fn_sync_* function.
-- risk.* stays backfill-only on purpose: 42 of its 45 rows are deferred
-- pending the T-09 hazard catalog (Corrección #5), so there is no correct
-- shadow-write for it until that decision exists.

-- risk.* is out of scope for this reconciliation (not named by the wave-4
-- mandate's table list, migration.sql left unchanged) — but its
-- legacy-dedup unique indexes were previously created here in backfill.sql
-- (not migration.sql) and are still needed by the ON CONFLICT clauses
-- below; restored as-is.
CREATE UNIQUE INDEX IF NOT EXISTS uq_risk_assessments_legacy ON risk.risk_assessments (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

-- ============================================================
-- 0. governance.incident_categories/incident_types fallback row for
--    KnowledgeIncident.domain values with no resolvable match —
--    incidents.incident_type_id is NOT NULL post-reconciliation; never
--    silently pick an unrelated type.
-- ============================================================
INSERT INTO governance.incident_categories (id, code, name)
SELECT gen_random_uuid(), 'UNCLASSIFIED_LEGACY', 'Unclassified (legacy backfill placeholder)'
WHERE NOT EXISTS (SELECT 1 FROM governance.incident_categories WHERE code = 'UNCLASSIFIED_LEGACY');

INSERT INTO governance.incident_types (id, code, incident_category_id)
SELECT gen_random_uuid(), 'UNCLASSIFIED_LEGACY', (SELECT id FROM governance.incident_categories WHERE code = 'UNCLASSIFIED_LEGACY')
WHERE NOT EXISTS (SELECT 1 FROM governance.incident_types WHERE code = 'UNCLASSIFIED_LEGACY');

-- ============================================================
-- 1. D-02 legacy_status_mapping seed rows for KnowledgeIncident.status/
--    verificationStatus -> the 5 target dimensions. Conservative default:
--    ambiguous values map to the least-privileged target (e.g. an
--    ambiguous "active-ish" status -> operational_status='MONITORING',
--    never 'ACTIVE').
-- ============================================================
INSERT INTO migration_meta.legacy_status_mapping (source_table, source_status_value, target_dimension, target_value, confidence, notes) VALUES
  ('KnowledgeIncident', 'detected', 'operational_status', 'DETECTED', 'HIGH', NULL),
  ('KnowledgeIncident', 'validating', 'operational_status', 'ASSESSING', 'MEDIUM', 'Conservative default — not a confirmed dimension mapping'),
  ('KnowledgeIncident', 'confirmed', 'operational_status', 'ACTIVE', 'HIGH', NULL),
  ('KnowledgeIncident', 'active', 'operational_status', 'ACTIVE', 'HIGH', NULL),
  ('KnowledgeIncident', 'escalating', 'operational_status', 'ACTIVE', 'MEDIUM', 'trend dimension separately set to WORSENING'),
  ('KnowledgeIncident', 'monitoring', 'operational_status', 'ASSESSING', 'HIGH', NULL),
  ('KnowledgeIncident', 'contained', 'operational_status', 'CONTAINED', 'HIGH', NULL),
  ('KnowledgeIncident', 'resolved', 'operational_status', 'RESOLVED', 'HIGH', NULL),
  ('KnowledgeIncident', 'archived', 'operational_status', 'CLOSED', 'MEDIUM', 'No distinct ARCHIVED operational_status value confirmed in target'),
  ('KnowledgeIncident', 'rejected', 'operational_status', 'CLOSED', 'MEDIUM', NULL),
  ('KnowledgeIncident', 'duplicate', 'operational_status', 'CLOSED', 'MEDIUM', NULL),
  ('KnowledgeIncident', 'unverified', 'verification_status', 'UNCONFIRMED', 'HIGH', NULL),
  ('KnowledgeIncident', 'candidate', 'verification_status', 'UNCONFIRMED', 'HIGH', 'Routes to incident_candidates, not incidents'),
  ('KnowledgeIncident', 'corroborated', 'verification_status', 'PARTIALLY_CONFIRMED', 'HIGH', NULL),
  ('KnowledgeIncident', 'official', 'verification_status', 'CONFIRMED', 'HIGH', NULL)
ON CONFLICT (source_table, source_status_value, target_dimension) DO NOTHING;
-- ============================================================
-- Production reality (Paso 3 preflight), which the former synthetic fixture
-- did not have and this wave must handle explicitly:
--   * verificationStatus is UPPERCASE ('CANDIDATE' 4737, 'OFFICIAL' 3457,
--     'UNVERIFIED' 13). The D-02 mapping table keeps its canonical lowercase
--     keys; every comparison normalizes the legacy value with lower().
--     Comparing raw values routed 0 rows to candidates and 4750 candidates
--     straight to incident.incidents (reproduced).
--   * status is NULL in 85% of rows. NULL keeps the conservative DETECTED
--     operational state but is flagged REQUIRES_REVIEW/LOW: it is a default,
--     not an observed state (product decision pending, not taken here).
--   * every DateTime is `timestamp without time zone` in UTC -> explicit
--     AT TIME ZONE 'UTC', never an implicit session-TimeZone cast.
-- ============================================================

-- ============================================================
-- 2-3. incident.incident_candidates / incident.incidents <- KnowledgeIncident
-- ============================================================
-- Split on lower(verificationStatus): 'unverified'/'candidate' -> candidates,
-- everything else -> incidents. T-02.
-- incidents.incident_type_id/title are NOT NULL post-reconciliation —
-- incident_type_id is resolved by domain match against
-- governance.incident_types (seeded Wave 010), falling back to the
-- UNCLASSIFIED_LEGACY placeholder (never NULL, never a fabricated real
-- category); title comes from the legacy row's own `title` column (its
-- canonical incident title, not Report free text).
--
-- Mutable in legacy (knowledgePersistenceService/masterIncidentEngine update
-- these in place): title, summary, domain, status and verificationStatus.
-- The mapped target columns follow them — EXCEPT when the new
-- verificationStatus would move the row to the OTHER table:
--   * candidate row in target, legacy now official -> promotion is an
--     IncidentPromotion decision (wave 040's own invariant: never create an
--     Incident without a promotion record and a decider), so nothing is
--     written and BLOCKED_RECLASSIFICATION is returned;
--   * incident row in target, legacy now candidate -> a demotion has no
--     target operation at all; same treatment.
-- incident_candidates.status is never overwritten: the promotion/discard
-- services own that column (UNDER_ASSESSMENT -> PROMOTING/PROMOTED/DISCARDED).
-- p_ids NULL = every KnowledgeIncident row.
-- ============================================================
-- Paso 6A: sync_worker is the runtime principal for every fn_sync_* in
-- this file. Each function is declared SECURITY DEFINER and granted
-- EXECUTE to sync_worker alone (PUBLIC is revoked first, and app_api /
-- ingest_worker / jobs_worker are never granted). sync_worker holds no
-- table privilege in any target schema, so this EXECUTE is its only way
-- in, and what it can do through it is exactly the mapping written here —
-- for legacy ids that already exist, with no caller-supplied SQL.
-- ============================================================

CREATE OR REPLACE FUNCTION migration_meta.fn_sync_knowledge_incidents(p_ids text[])
RETURNS TABLE (source_table text, legacy_record_id text, target_table text, action text, detail text)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
#variable_conflict use_column
BEGIN
  -- The three statements below each re-derive the disposition from the
  -- catalog instead of caching it: a row this function has just inserted into
  -- candidates can never be picked up by the incidents statement (its
  -- verificationStatus still says candidate) nor be reported as blocked, so
  -- re-deriving is both correct and free of temp-table state.

  -- 2. candidates (legacy says candidate/unverified, target has no incident row)
  RETURN QUERY
  WITH scope AS (
    SELECT ki.id,
      CASE WHEN ki."sourceId" IS NOT NULL AND ki."canonicalKey" IS NOT NULL THEN ki."sourceId" || ':' || ki."canonicalKey" ELSE NULL END AS correlation_key,
      ki."createdAt" AT TIME ZONE 'UTC' AS created_at,
      ki."verificationStatus" AS legacy_status,
      CASE WHEN m.confidence IS NOT NULL THEN m.confidence ELSE 'LOW' END AS conf,
      CASE WHEN m.confidence IS NOT NULL THEN 'AUTO_MAPPED' ELSE 'REQUIRES_REVIEW' END AS review
    FROM "KnowledgeIncident" ki
    LEFT JOIN migration_meta.legacy_status_mapping m
      ON m.source_table = 'KnowledgeIncident' AND m.source_status_value = lower(ki."verificationStatus") AND m.target_dimension = 'verification_status'
    WHERE (p_ids IS NULL OR ki.id = ANY(p_ids))
      AND ki."verificationStatus" IS NOT NULL AND lower(ki."verificationStatus") IN ('unverified','candidate')
      AND NOT EXISTS (SELECT 1 FROM incident.incidents i WHERE i.legacy_source = 'KnowledgeIncident' AND i.legacy_record_id = ki.id)
  ), up AS (
    INSERT INTO incident.incident_candidates AS t (status, correlation_key, classification, created_at,
      legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status)
    SELECT 'UNDER_ASSESSMENT'::incident.incident_candidate_status_enum, s.correlation_key,
      'OPERATIONAL'::security.information_classification_enum, s.created_at,
      s.legacy_status, 'KnowledgeIncident', s.id, s.conf, s.review
    FROM scope s
    ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO UPDATE SET
      correlation_key = EXCLUDED.correlation_key, legacy_status = EXCLUDED.legacy_status,
      migration_confidence = EXCLUDED.migration_confidence, migration_review_status = EXCLUDED.migration_review_status
    WHERE (t.correlation_key, t.legacy_status, t.migration_confidence, t.migration_review_status)
      IS DISTINCT FROM (EXCLUDED.correlation_key, EXCLUDED.legacy_status, EXCLUDED.migration_confidence, EXCLUDED.migration_review_status)
    RETURNING t.legacy_record_id AS lid, (t.xmax = 0) AS ins
  )
  SELECT 'KnowledgeIncident'::text, s.id, 'incident.incident_candidates'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' WHEN up.ins THEN 'INSERTED' ELSE 'UPDATED' END, NULL::text
  FROM scope s LEFT JOIN up ON up.lid = s.id;

  -- 3. incidents (legacy says anything else, target has no candidate row)
  RETURN QUERY
  WITH scope AS (
    SELECT ki.id,
      COALESCE(
        (SELECT it.id FROM governance.incident_types it WHERE lower(it.code) = lower(ki.domain) LIMIT 1),
        (SELECT id FROM governance.incident_types WHERE code = 'UNCLASSIFIED_LEGACY')
      ) AS incident_type_id,
      COALESCE(mv.target_value, 'UNCONFIRMED')::incident.incident_verification_status_enum AS verification_status,
      COALESCE(mo.target_value, 'ASSESSING')::incident.incident_operational_status_enum AS operational_status,
      ki.title, ki.summary AS description,
      ki."createdAt" AT TIME ZONE 'UTC' AS created_at,
      concat_ws('|', ki."verificationStatus", ki.status) AS legacy_status,
      CASE WHEN ki.status IS NOT NULL AND mo.confidence IS NOT NULL AND mv.confidence IS NOT NULL
            AND EXISTS (SELECT 1 FROM governance.incident_types it WHERE lower(it.code) = lower(ki.domain)) THEN 'HIGH' ELSE 'LOW' END AS conf,
      CASE WHEN ki.status IS NOT NULL AND mo.confidence IS NOT NULL AND mv.confidence IS NOT NULL
            AND EXISTS (SELECT 1 FROM governance.incident_types it WHERE lower(it.code) = lower(ki.domain)) THEN 'AUTO_MAPPED' ELSE 'REQUIRES_REVIEW' END AS review
    FROM "KnowledgeIncident" ki
    LEFT JOIN migration_meta.legacy_status_mapping mv
      ON mv.source_table = 'KnowledgeIncident' AND mv.source_status_value = lower(ki."verificationStatus") AND mv.target_dimension = 'verification_status'
    LEFT JOIN migration_meta.legacy_status_mapping mo
      ON mo.source_table = 'KnowledgeIncident' AND mo.source_status_value = lower(COALESCE(ki.status, 'detected')) AND mo.target_dimension = 'operational_status'
    WHERE (p_ids IS NULL OR ki.id = ANY(p_ids))
      AND (ki."verificationStatus" IS NULL OR lower(ki."verificationStatus") NOT IN ('unverified','candidate'))
      AND NOT EXISTS (SELECT 1 FROM incident.incident_candidates c WHERE c.legacy_source = 'KnowledgeIncident' AND c.legacy_record_id = ki.id)
  ), up AS (
    INSERT INTO incident.incidents AS t (incident_type_id, verification_status, operational_status, title, description, created_at,
      legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status)
    SELECT s.incident_type_id, s.verification_status, s.operational_status, s.title, s.description, s.created_at,
      s.legacy_status, 'KnowledgeIncident', s.id, s.conf, s.review
    FROM scope s
    ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO UPDATE SET
      incident_type_id = EXCLUDED.incident_type_id, verification_status = EXCLUDED.verification_status,
      operational_status = EXCLUDED.operational_status, title = EXCLUDED.title, description = EXCLUDED.description,
      legacy_status = EXCLUDED.legacy_status, migration_confidence = EXCLUDED.migration_confidence,
      migration_review_status = EXCLUDED.migration_review_status
    WHERE (t.incident_type_id, t.verification_status, t.operational_status, t.title, t.description, t.legacy_status, t.migration_confidence, t.migration_review_status)
      IS DISTINCT FROM (EXCLUDED.incident_type_id, EXCLUDED.verification_status, EXCLUDED.operational_status, EXCLUDED.title, EXCLUDED.description, EXCLUDED.legacy_status, EXCLUDED.migration_confidence, EXCLUDED.migration_review_status)
    RETURNING t.legacy_record_id AS lid, (t.xmax = 0) AS ins
  )
  SELECT 'KnowledgeIncident'::text, s.id, 'incident.incidents'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' WHEN up.ins THEN 'INSERTED' ELSE 'UPDATED' END, NULL::text
  FROM scope s LEFT JOIN up ON up.lid = s.id;

  -- 3b. disposition changes: never moved automatically, never hidden.
  RETURN QUERY
  WITH scope AS (
    SELECT ki.id,
      (ki."verificationStatus" IS NOT NULL AND lower(ki."verificationStatus") IN ('unverified','candidate')) AS expect_candidate,
      EXISTS (SELECT 1 FROM incident.incidents i WHERE i.legacy_source = 'KnowledgeIncident' AND i.legacy_record_id = ki.id) AS has_incident,
      EXISTS (SELECT 1 FROM incident.incident_candidates c WHERE c.legacy_source = 'KnowledgeIncident' AND c.legacy_record_id = ki.id) AS has_candidate
    FROM "KnowledgeIncident" ki
    WHERE p_ids IS NULL OR ki.id = ANY(p_ids)
  )
  SELECT 'KnowledgeIncident'::text, s.id,
    CASE WHEN s.expect_candidate THEN 'incident.incidents' ELSE 'incident.incident_candidates' END,
    'BLOCKED_RECLASSIFICATION'::text,
    CASE WHEN s.expect_candidate THEN 'LEGACY_NOW_CANDIDATE_TARGET_IS_INCIDENT'
         ELSE 'PROMOTION_REQUIRES_INCIDENT_PROMOTION_DECISION' END
  FROM scope s
  WHERE (s.expect_candidate AND s.has_incident) OR (NOT s.expect_candidate AND s.has_candidate);

  -- 3c. the evidence the same legacy operation writes alongside the incident
  -- (only in shadow-write scope; the backfill already covers every row in 030).
  IF p_ids IS NOT NULL THEN
    RETURN QUERY SELECT * FROM migration_meta.fn_sync_knowledge_evidence(NULL, p_ids);
    RETURN QUERY SELECT * FROM migration_meta.fn_sync_incident_transitions(NULL, p_ids);
  END IF;

  RETURN QUERY
  SELECT 'KnowledgeIncident'::text, u.id, NULL::text, 'LEGACY_NOT_FOUND'::text, NULL::text
  FROM unnest(p_ids) AS u(id)
  WHERE NOT EXISTS (SELECT 1 FROM "KnowledgeIncident" ki WHERE ki.id = u.id);
END
$fn$;
REVOKE ALL ON FUNCTION migration_meta.fn_sync_knowledge_incidents(text[]) FROM PUBLIC;
ALTER FUNCTION migration_meta.fn_sync_knowledge_incidents(text[]) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION migration_meta.fn_sync_knowledge_incidents(text[]) TO sync_worker;

-- ============================================================
-- 4. incident.incident_transitions <- IncidentTransition (T-03).
--    Legacy writes status AND severity in one row (knowledgePersistenceService:
--    previousStatus/newStatus + previousSeverity/newSeverity). The target has
--    no severity dimension, and new_value is NOT NULL, so:
--      * newStatus present and parent migrated to incident.incidents
--        -> OPERATIONAL transition;
--      * newStatus NULL (severity-only / status never recorded)
--        -> deferred, reason NO_OPERATIONAL_STATUS_CHANGE;
--      * parent routed to incident_candidates (candidates have no transition
--        table) -> deferred, reason PARENT_IS_INCIDENT_CANDIDATE.
--    Every legacy transition therefore ends up in exactly one place.
--    decided_by_actor_type/id are NOT NULL post-reconciliation. Legacy
--    IncidentTransition.actorId exists but is NULL for automated transitions
--    and its actor CLASS (person vs. automation vs. institution) was never
--    recorded, so every migrated row carries an AUTOMATION_RULE actor with a
--    fixed, documented nil UUID meaning "migrated, no original actor
--    recorded" (never a fabricated human actor). Attributing actorId to a
--    real person is a pending decision, reported by dual-read as an unmapped
--    legacy column — not silently dropped.
--    Transitions are immutable in legacy (insert-only), so this function has
--    no UPDATE path: a row is INSERTED once, then UNCHANGED forever.
-- ============================================================
CREATE OR REPLACE FUNCTION migration_meta.fn_sync_incident_transitions(p_ids text[], p_incident_ids text[])
RETURNS TABLE (source_table text, legacy_record_id text, target_table text, action text, detail text)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH scope AS (
    SELECT it.id, it."incidentId" AS parent_id, it."previousStatus" AS previous_status, it."newStatus" AS new_status,
      it."createdAt" AT TIME ZONE 'UTC' AS occurred_at
    FROM "IncidentTransition" it
    WHERE (p_ids IS NULL AND p_incident_ids IS NULL)
       OR it.id = ANY(p_ids)
       OR it."incidentId" = ANY(p_incident_ids)
  ), eligible AS (
    SELECT s.*, i.id AS incident_id,
      COALESCE(mp.target_value, s.previous_status) AS previous_value,
      COALESCE(mn.target_value, s.new_status) AS new_value,
      CASE WHEN mn.confidence IS NOT NULL THEN mn.confidence ELSE 'LOW' END AS conf,
      CASE WHEN mn.confidence IS NOT NULL THEN 'AUTO_MAPPED' ELSE 'REQUIRES_REVIEW' END AS review
    FROM scope s
    JOIN incident.incidents i ON i.legacy_source = 'KnowledgeIncident' AND i.legacy_record_id = s.parent_id
    LEFT JOIN migration_meta.legacy_status_mapping mp ON mp.source_table = 'KnowledgeIncident' AND mp.source_status_value = lower(s.previous_status) AND mp.target_dimension = 'operational_status'
    LEFT JOIN migration_meta.legacy_status_mapping mn ON mn.source_table = 'KnowledgeIncident' AND mn.source_status_value = lower(s.new_status) AND mn.target_dimension = 'operational_status'
    WHERE s.new_status IS NOT NULL
  ), up AS (
    INSERT INTO incident.incident_transitions AS t (incident_id, dimension, previous_value, new_value,
      decided_by_actor_type, decided_by_actor_id, occurred_at,
      legacy_source, legacy_record_id, migration_confidence, migration_review_status)
    SELECT e.incident_id, 'OPERATIONAL'::incident.incident_state_dimension_enum, e.previous_value, e.new_value,
      'AUTOMATION_RULE'::security.actor_type_enum, '00000000-0000-0000-0000-000000000000'::uuid, e.occurred_at,
      'IncidentTransition', e.id, e.conf, e.review
    FROM eligible e
    ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING
    RETURNING t.legacy_record_id AS lid
  )
  SELECT 'IncidentTransition'::text, e.id, 'incident.incident_transitions'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' ELSE 'INSERTED' END, NULL::text
  FROM eligible e LEFT JOIN up ON up.lid = e.id;

  RETURN QUERY
  WITH scope AS (
    SELECT it.id, it."incidentId" AS parent_id, it."newStatus" AS new_status
    FROM "IncidentTransition" it
    WHERE (p_ids IS NULL AND p_incident_ids IS NULL)
       OR it.id = ANY(p_ids)
       OR it."incidentId" = ANY(p_incident_ids)
  ), classified AS (
    SELECT s.id,
      CASE WHEN ic.id IS NOT NULL THEN 'PARENT_IS_INCIDENT_CANDIDATE'
           WHEN i.id IS NULL THEN 'PARENT_NOT_MIGRATED'
           ELSE 'NO_OPERATIONAL_STATUS_CHANGE' END AS reason,
      CASE WHEN ic.id IS NOT NULL THEN 'candidate history model (no incident_candidate transition table)'
           WHEN i.id IS NULL THEN 'parent KnowledgeIncident disposition'
           ELSE 'severity history has no target dimension' END AS pending
    FROM scope s
    LEFT JOIN incident.incidents i ON i.legacy_source = 'KnowledgeIncident' AND i.legacy_record_id = s.parent_id
    LEFT JOIN incident.incident_candidates ic ON ic.legacy_source = 'KnowledgeIncident' AND ic.legacy_record_id = s.parent_id
    WHERE s.new_status IS NULL OR i.id IS NULL
  ), def AS (
    INSERT INTO migration_meta.legacy_deferred_rows AS t (source_table, legacy_record_id, wave, reason, pending_decision)
    SELECT 'IncidentTransition', c.id, '040_incident', c.reason, c.pending FROM classified c
    ON CONFLICT (source_table, legacy_record_id) DO NOTHING
    RETURNING t.legacy_record_id AS lid
  )
  SELECT 'IncidentTransition'::text, c.id, 'migration_meta.legacy_deferred_rows'::text,
    CASE WHEN def.lid IS NULL THEN 'ALREADY_DEFERRED' ELSE 'DEFERRED' END, c.reason
  FROM classified c LEFT JOIN def ON def.lid = c.id;

  RETURN QUERY
  SELECT 'IncidentTransition'::text, u.id, NULL::text, 'LEGACY_NOT_FOUND'::text, NULL::text
  FROM unnest(p_ids) AS u(id)
  WHERE NOT EXISTS (SELECT 1 FROM "IncidentTransition" it WHERE it.id = u.id);
END
$fn$;
REVOKE ALL ON FUNCTION migration_meta.fn_sync_incident_transitions(text[], text[]) FROM PUBLIC;
ALTER FUNCTION migration_meta.fn_sync_incident_transitions(text[], text[]) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION migration_meta.fn_sync_incident_transitions(text[], text[]) TO sync_worker;

-- ============================================================
-- Backfill = both sync functions over every legacy row (NULL scope).
-- Incidents first: transitions attach to the incident rows it creates.
-- ============================================================
SELECT source_table, target_table, action, count(*) AS rows FROM migration_meta.fn_sync_knowledge_incidents(NULL) GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
SELECT source_table, target_table, action, count(*) AS rows FROM migration_meta.fn_sync_incident_transitions(NULL, NULL) GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- ============================================================
-- 5. incident.incident_relations <- IncidentRelation (0 rows, structure only)
-- ============================================================
-- INSERT INTO incident.incident_relations (...) SELECT ... FROM "IncidentRelation"; -- 0 rows, never executes for real

-- ============================================================
-- 6. risk.risk_assessments <- RiskAssessment.
--    hazard_type_id is NOT NULL. Production riskType values are
--    fire_smoke / earthquake_impact / tsunami / humanitarian_impact, none of
--    which is a governance.hazard_types code (INCENDIO, SISMO, TSUNAMI, ...),
--    and matching them is the pending T-09 hazard catalog decision
--    (Corrección #5), not something to guess here. Rows that do match are
--    migrated; the rest are deferred with that decision named — never
--    dropped, never assigned an invented hazard.
-- ============================================================
INSERT INTO risk.risk_assessments (hazard_type_id, classification, status, created_at,
  legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT ht.id,
  'RESTRICTED'::security.information_classification_enum,
  -- 'CLOSED' -> 'REVISED': risk_assessment_status_enum was reconciled to
  -- schema.target.prisma's RiskAssessmentStatus (ACTIVE/REVISED) by the
  -- corrective session; 'REVISED' is the only non-ACTIVE value the target
  -- enum has, and is the conservative mapping for any legacy non-active
  -- assessment (D-02: never the more privileged value).
  CASE WHEN lower(ra.status) = 'active' THEN 'ACTIVE'::risk.risk_assessment_status_enum ELSE 'REVISED'::risk.risk_assessment_status_enum END,
  ra."createdAt" AT TIME ZONE 'UTC',
  ra.status,
  'RiskAssessment', ra.id, 'HIGH', 'AUTO_MAPPED'
FROM "RiskAssessment" ra
JOIN governance.hazard_types ht ON upper(ht.code) = upper(ra."riskType")
ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;

INSERT INTO migration_meta.legacy_deferred_rows (source_table, legacy_record_id, wave, reason, pending_decision)
SELECT 'RiskAssessment', ra.id, '040_incident', 'NO_HAZARD_TYPE_MATCH', 'T-09 hazard catalog (Corrección #5)'
FROM "RiskAssessment" ra
WHERE NOT EXISTS (SELECT 1 FROM risk.risk_assessments t WHERE t.legacy_source = 'RiskAssessment' AND t.legacy_record_id = ra.id)
ON CONFLICT (source_table, legacy_record_id) DO NOTHING;

-- ============================================================
-- 7. risk.risk_assessment_revisions <- RiskAssessmentRevision (MIGRAR 1:1)
--    for migrated parents; the rest follow their parent into the deferred set.
-- ============================================================
-- `changes` renamed to `content_snapshot` (jsonb NOT NULL) by the
-- corrective session's risk.* reconciliation against schema.target.prisma's
-- RiskAssessmentRevision.contentSnapshot — the jsonb_build_object below
-- already always produces a non-NULL value, so NOT NULL is satisfied.
INSERT INTO risk.risk_assessment_revisions (risk_assessment_id, revision_number, content_snapshot, created_at,
  legacy_source, legacy_record_id, migration_confidence, migration_review_status)
SELECT ra.id, row_number() OVER (PARTITION BY rar."assessmentId" ORDER BY rar."createdAt"),
  jsonb_build_object('previousStatus', rar."previousStatus", 'newStatus', rar."newStatus", 'reason', rar.reason, 'evidence', rar.evidence),
  rar."createdAt" AT TIME ZONE 'UTC',
  'RiskAssessmentRevision', rar.id, 'HIGH', 'AUTO_MAPPED'
FROM "RiskAssessmentRevision" rar
JOIN risk.risk_assessments ra ON ra.legacy_source = 'RiskAssessment' AND ra.legacy_record_id = rar."assessmentId"
ON CONFLICT DO NOTHING;

INSERT INTO migration_meta.legacy_deferred_rows (source_table, legacy_record_id, wave, reason, pending_decision)
SELECT 'RiskAssessmentRevision', rar.id, '040_incident', 'PARENT_DEFERRED', 'T-09 hazard catalog (Corrección #5)'
FROM "RiskAssessmentRevision" rar
WHERE NOT EXISTS (SELECT 1 FROM risk.risk_assessments ra WHERE ra.legacy_source = 'RiskAssessment' AND ra.legacy_record_id = rar."assessmentId")
ON CONFLICT (source_table, legacy_record_id) DO NOTHING;

-- ============================================================
-- 8. Row counts (before/after)
-- ============================================================
SELECT
  (SELECT COUNT(*) FROM "KnowledgeIncident") AS knowledge_incident_before,
  (SELECT COUNT(*) FROM "IncidentTransition") AS incident_transition_before,
  (SELECT COUNT(*) FROM "RiskAssessment") AS risk_assessment_before,
  (SELECT COUNT(*) FROM "RiskAssessmentRevision") AS risk_assessment_revision_before;

SELECT
  (SELECT COUNT(*) FROM incident.incidents) AS incidents_after,
  (SELECT COUNT(*) FROM incident.incident_candidates) AS incident_candidates_after,
  (SELECT COUNT(*) FROM incident.incident_transitions) AS incident_transitions_after,
  (SELECT COUNT(*) FROM risk.risk_assessments) AS risk_assessments_after,
  (SELECT COUNT(*) FROM risk.risk_assessment_revisions) AS risk_assessment_revisions_after;

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
-- 11. Checkpoints — expected counts come from the source, never constants;
--     deferred rows are counted explicitly, so "migrated + deferred = source".
-- ============================================================
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
SELECT '040_incident', 'KnowledgeIncident', 'incident.incidents + incident.incident_candidates', e.n, a.n,
  CASE WHEN a.n = e.n THEN 'PASS' ELSE 'FAIL' END,
  'Split by lower(verificationStatus): candidates = unverified/candidate, incidents = the rest.'
FROM (SELECT COUNT(*) AS n FROM "KnowledgeIncident") e,
     (SELECT (SELECT COUNT(*) FROM incident.incidents WHERE legacy_source = 'KnowledgeIncident')
           + (SELECT COUNT(*) FROM incident.incident_candidates WHERE legacy_source = 'KnowledgeIncident') AS n) a;
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
SELECT '040_incident', 'IncidentTransition', 'incident.incident_transitions + legacy_deferred_rows', e.n, a.n,
  CASE WHEN a.n = e.n THEN 'PASS' ELSE 'FAIL' END, 'Deferred: parent is a candidate, or no operational status change.'
FROM (SELECT COUNT(*) AS n FROM "IncidentTransition") e,
     (SELECT (SELECT COUNT(*) FROM incident.incident_transitions WHERE legacy_source = 'IncidentTransition')
           + (SELECT COUNT(*) FROM migration_meta.legacy_deferred_rows WHERE source_table = 'IncidentTransition') AS n) a;
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
SELECT '040_incident', 'RiskAssessment', 'risk.risk_assessments + legacy_deferred_rows', e.n, a.n,
  CASE WHEN a.n = e.n THEN 'PASS' ELSE 'FAIL' END, 'Deferred rows wait on the T-09 hazard catalog decision.'
FROM (SELECT COUNT(*) AS n FROM "RiskAssessment") e,
     (SELECT (SELECT COUNT(*) FROM risk.risk_assessments WHERE legacy_source = 'RiskAssessment')
           + (SELECT COUNT(*) FROM migration_meta.legacy_deferred_rows WHERE source_table = 'RiskAssessment') AS n) a;
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status, notes)
SELECT '040_incident', 'RiskAssessmentRevision', 'risk.risk_assessment_revisions + legacy_deferred_rows', e.n, a.n,
  CASE WHEN a.n = e.n THEN 'PASS' ELSE 'FAIL' END, 'Revisions follow their parent assessment.'
FROM (SELECT COUNT(*) AS n FROM "RiskAssessmentRevision") e,
     (SELECT (SELECT COUNT(*) FROM risk.risk_assessment_revisions WHERE legacy_source = 'RiskAssessmentRevision')
           + (SELECT COUNT(*) FROM migration_meta.legacy_deferred_rows WHERE source_table = 'RiskAssessmentRevision') AS n) a;
