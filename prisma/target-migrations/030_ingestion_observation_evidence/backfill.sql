-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 030 — Ingestion, Observation & Evidence — Backfill draft.
-- Origen: IngestionRun+KnowledgeIngestionRun->ingest.ingestion_runs
-- (FUSIONAR); KnowledgeSource(1)->ingest.sources (FUSIONAR with the ~43-source
-- code catalog, DUP-003); ExternalEvent(1,904)->ingest.source_records
-- (T-01) + evidence.observations; Report(1)->evidence.observations;
-- KnowledgeEvidence(2,463)->evidence.evidence_records (partial — the
-- incident_id-linked half completes in Wave 040). D-04: TelecomConnectivityStatus/
-- TelecomConnectivityEvidence (0 rows each) -> evidence.observations /
-- .evidence_records, structural mapping only.
--
-- RECONCILED (earlier session): all legacy-provenance columns ship as part
-- of migration.sql's CREATE TABLE statements (no post-hoc ALTER TABLE
-- ADD COLUMN patches here); all column names/enum literals below match
-- schema.target.prisma exactly.
--
-- ONE MAPPING, TWO CALLERS (Paso 5). Every legacy -> target transform of
-- this wave lives in exactly one place: a migration_meta.fn_sync_* function
-- taking the legacy ids to process (NULL = every row). This file calls each
-- one with NULL (the backfill); the application's shadow-write
-- (src/lib/database-target/shadow-write/legacyShadowSync.ts) calls the same
-- function with the ids a legacy write just committed. The backfill and the
-- shadow-write therefore cannot drift apart: there is no second copy of the
-- mapping to drift.
--
-- Contract shared by every fn_sync_* function (all waves):
--   * reads the COMMITTED legacy row (legacy stays the source of truth; the
--     request payload is never trusted as input);
--   * idempotent on the legacy identity (legacy_source, legacy_record_id):
--     a new row is INSERTED, a changed mapped value is UPDATED in place, an
--     identical re-run is UNCHANGED — never a second row;
--   * never moves a legacy row between dispositions (migrated to table A,
--     migrated to table B, deferred, review queue). When the current legacy
--     values imply a different disposition than the one already recorded,
--     nothing is written and BLOCKED_RECLASSIFICATION is returned; a value
--     the target can only accept with a human decision returns
--     BLOCKED_REQUIRES_DECISION. Both surface in dual-read as mismatches,
--     never silently;
--   * returns one row per (legacy row, target table touched):
--     (source_table, legacy_record_id, target_table, action, detail), with
--     action in INSERTED | UPDATED | UNCHANGED | DEFERRED | ALREADY_DEFERRED |
--     BLOCKED_RECLASSIFICATION | BLOCKED_REQUIRES_DECISION | LEGACY_NOT_FOUND.
--     `detail` carries codes only, never legacy content.
-- EXECUTE is revoked from PUBLIC: only the migration owner runs them.

-- ============================================================
-- 0-1. ingest.providers / ingest.sources <- every legacy source id
-- ============================================================
-- ingest.sources.provider_id is NOT NULL, and KnowledgeSource/the code
-- source catalog have no resolvable institution.organizations row (D-01 —
-- never fabricated), so every source hangs off one placeholder provider.
--
-- Production has ONE KnowledgeSource row, while IngestionRun,
-- KnowledgeIngestionRun, ExternalEvent and KnowledgeEvidence reference the
-- Global Watch and Knowledge Intake registry ids (gdacs, nasa_firms,
-- usgs_earthquake, noaa_tsunami, ...), which live in code, not in a table.
-- Building ingest.sources from KnowledgeSource alone and INNER JOINing on it
-- silently dropped every run/event of every other source (reproduced on the
-- realistic baseline: 3044 IngestionRun, 8209 KnowledgeIngestionRun and 1539
-- ExternalEvent rows). One source per distinct legacy id is created instead,
-- so every legacy row has a source to attach to:
--   * endpoint_signature = the legacy source id (the join key, unchanged);
--   * name/status from KnowledgeSource when the id exists there;
--   * otherwise name = the id and status ACTIVE: these ids appear only
--     because the source produced rows. Reconciling them with the code
--     registries (buildCanonicalSourceDirectory) is DUP-003 review work;
--     nothing about them is invented here.
-- ingest.sources has NO legacy-provenance columns (schema.target.prisma's
-- Source model has none), so sources are insert-only.
-- p_source_ids NULL = every source id referenced by any legacy table.
-- ============================================================
-- Paso 6A: sync_worker is the runtime principal for every fn_sync_* in
-- this file. Each function is declared SECURITY DEFINER and granted
-- EXECUTE to sync_worker alone (PUBLIC is revoked first, and app_api /
-- ingest_worker / jobs_worker are never granted). sync_worker holds no
-- table privilege in any target schema, so this EXECUTE is its only way
-- in, and what it can do through it is exactly the mapping written here —
-- for legacy ids that already exist, with no caller-supplied SQL.
-- ============================================================

CREATE OR REPLACE FUNCTION migration_meta.fn_sync_sources(p_source_ids text[])
RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_inserted integer;
BEGIN
  -- Concurrent shadow-writes must not race the NOT EXISTS below into two
  -- placeholder providers (the scalar subquery that follows needs exactly one).
  PERFORM pg_advisory_xact_lock(hashtext('migration_meta.fn_sync_sources'));

  INSERT INTO ingest.providers (id, name, organization_id, status)
  SELECT gen_random_uuid(), 'Legacy Source Catalog (DUP-003, unresolved organization)', NULL, 'ACTIVE'::ingest.provider_status_enum
  WHERE NOT EXISTS (SELECT 1 FROM ingest.providers WHERE name = 'Legacy Source Catalog (DUP-003, unresolved organization)');

  INSERT INTO ingest.sources (provider_id, endpoint_signature, name, status, created_at)
  SELECT (SELECT id FROM ingest.providers WHERE name = 'Legacy Source Catalog (DUP-003, unresolved organization)'),
    ids.source_id,
    COALESCE(ks.name, ids.source_id),
    CASE WHEN ks.id IS NULL OR ks.enabled THEN 'ACTIVE'::ingest.source_status_enum ELSE 'INACTIVE'::ingest.source_status_enum END,
    COALESCE(ks."createdAt" AT TIME ZONE 'UTC', now())
  FROM (
    SELECT u.source_id FROM unnest(p_source_ids) AS u(source_id)
    UNION
    SELECT a.source_id FROM (
      SELECT id AS source_id FROM "KnowledgeSource"
      UNION SELECT "sourceId" FROM "IngestionRun"
      UNION SELECT "sourceId" FROM "KnowledgeIngestionRun"
      UNION SELECT "sourceId" FROM "ExternalEvent"
      UNION SELECT "sourceId" FROM "KnowledgeEvidence"
    ) a
    WHERE p_source_ids IS NULL
  ) ids
  LEFT JOIN "KnowledgeSource" ks ON ks.id = ids.source_id
  WHERE ids.source_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END
$fn$;
REVOKE ALL ON FUNCTION migration_meta.fn_sync_sources(text[]) FROM PUBLIC;
ALTER FUNCTION migration_meta.fn_sync_sources(text[]) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION migration_meta.fn_sync_sources(text[]) TO sync_worker;

-- ============================================================
-- 2. ingest.ingestion_runs <- IngestionRun + KnowledgeIngestionRun
-- ============================================================
-- Legacy statuses as the code writes them (not measured in production):
--   IngestionRun:          success | error | failed        (recordIngestionRun)
--   KnowledgeIngestionRun: success | partial | failed | error (knowledge-intake)
-- The previous draft mapped KnowledgeIngestionRun on 'completed', a value
-- the writer never produces, so every successful run became FAILED
-- (reproduced: 8195 of 9577). Mapping below: success/completed -> COMPLETED;
-- partial -> COMPLETED flagged REQUIRES_REVIEW; error/failed -> FAILED; any
-- other value -> FAILED flagged REQUIRES_REVIEW. The raw value is always
-- kept in legacy_status. Timestamps: explicit UTC.
-- Mutable in legacy (a run is created, then finished): status, completed_at,
-- legacy_status and the confidence/review pair follow it.
-- p_ids may mix IngestionRun and KnowledgeIngestionRun ids (both cuids).
CREATE OR REPLACE FUNCTION migration_meta.fn_sync_ingestion_runs(p_ids text[])
RETURNS TABLE (source_table text, legacy_record_id text, target_table text, action text, detail text)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
#variable_conflict use_column
BEGIN
  PERFORM migration_meta.fn_sync_sources(CASE WHEN p_ids IS NULL THEN NULL ELSE ARRAY(
    SELECT "sourceId" FROM "IngestionRun" WHERE id = ANY(p_ids)
    UNION SELECT "sourceId" FROM "KnowledgeIngestionRun" WHERE id = ANY(p_ids)) END);

  RETURN QUERY
  WITH scope AS (
    SELECT 'IngestionRun'::text AS src, ir.id, s.id AS source_id,
      migration_meta.fn_legacy_uuid('legacy:IngestionRun:' || ir.id) AS idem,
      'EXTERNAL_EVENT_PIPELINE'::ingest.ingestion_run_origin_kind_enum AS origin_kind,
      CASE WHEN lower(ir.status) IN ('success','completed') THEN 'COMPLETED'::ingest.ingestion_run_status_enum ELSE 'FAILED'::ingest.ingestion_run_status_enum END AS status,
      ir."fetchedAt" AT TIME ZONE 'UTC' AS started_at, ir."completedAt" AT TIME ZONE 'UTC' AS completed_at,
      ir.status AS legacy_status,
      CASE WHEN lower(ir.status) IN ('success','completed','error','failed') THEN 'HIGH' ELSE 'LOW' END AS conf,
      CASE WHEN lower(ir.status) IN ('success','completed','error','failed') THEN 'AUTO_MAPPED' ELSE 'REQUIRES_REVIEW' END AS review
    FROM "IngestionRun" ir
    JOIN ingest.sources s ON s.endpoint_signature = ir."sourceId"
    WHERE p_ids IS NULL OR ir.id = ANY(p_ids)
    UNION ALL
    SELECT 'KnowledgeIngestionRun'::text, kir.id, s.id,
      migration_meta.fn_legacy_uuid('legacy:KnowledgeIngestionRun:' || kir.id),
      'GLOBAL_WATCH_PIPELINE'::ingest.ingestion_run_origin_kind_enum,
      CASE WHEN lower(kir.status) IN ('success','completed','partial') THEN 'COMPLETED'::ingest.ingestion_run_status_enum ELSE 'FAILED'::ingest.ingestion_run_status_enum END,
      kir."startedAt" AT TIME ZONE 'UTC', kir."finishedAt" AT TIME ZONE 'UTC',
      kir.status,
      CASE WHEN lower(kir.status) IN ('success','completed','error','failed') THEN 'HIGH' WHEN lower(kir.status) = 'partial' THEN 'MEDIUM' ELSE 'LOW' END,
      CASE WHEN lower(kir.status) IN ('success','completed','error','failed') THEN 'AUTO_MAPPED' ELSE 'REQUIRES_REVIEW' END
    FROM "KnowledgeIngestionRun" kir
    JOIN ingest.sources s ON s.endpoint_signature = kir."sourceId"
    WHERE p_ids IS NULL OR kir.id = ANY(p_ids)
  ), up AS (
    INSERT INTO ingest.ingestion_runs AS t (source_id, idempotency_key, origin_kind, status, started_at, completed_at,
      legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status)
    SELECT sc.source_id, sc.idem, sc.origin_kind, sc.status, sc.started_at, sc.completed_at,
      sc.legacy_status, sc.src, sc.id, sc.conf, sc.review
    FROM scope sc
    ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO UPDATE SET
      status = EXCLUDED.status, completed_at = EXCLUDED.completed_at, legacy_status = EXCLUDED.legacy_status,
      migration_confidence = EXCLUDED.migration_confidence, migration_review_status = EXCLUDED.migration_review_status
    WHERE (t.status, t.completed_at, t.legacy_status, t.migration_confidence, t.migration_review_status)
      IS DISTINCT FROM (EXCLUDED.status, EXCLUDED.completed_at, EXCLUDED.legacy_status, EXCLUDED.migration_confidence, EXCLUDED.migration_review_status)
    RETURNING t.legacy_source AS lsrc, t.legacy_record_id AS lid, (t.xmax = 0) AS ins
  )
  SELECT sc.src, sc.id, 'ingest.ingestion_runs'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' WHEN up.ins THEN 'INSERTED' ELSE 'UPDATED' END, NULL::text
  FROM scope sc LEFT JOIN up ON up.lsrc = sc.src AND up.lid = sc.id;

  RETURN QUERY
  SELECT 'IngestionRun|KnowledgeIngestionRun'::text, u.id, NULL::text, 'LEGACY_NOT_FOUND'::text, NULL::text
  FROM unnest(p_ids) AS u(id)
  WHERE NOT EXISTS (SELECT 1 FROM "IngestionRun" ir WHERE ir.id = u.id)
    AND NOT EXISTS (SELECT 1 FROM "KnowledgeIngestionRun" kir WHERE kir.id = u.id);
END
$fn$;
REVOKE ALL ON FUNCTION migration_meta.fn_sync_ingestion_runs(text[]) FROM PUBLIC;
ALTER FUNCTION migration_meta.fn_sync_ingestion_runs(text[]) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION migration_meta.fn_sync_ingestion_runs(text[]) TO sync_worker;

-- ============================================================
-- 3-4. ingest.source_records + evidence.observations <- ExternalEvent (T-01)
-- ============================================================
-- source_records.ingestion_run_id is NOT NULL, but legacy ExternalEvent
-- never recorded which run produced it. The previous draft attached every
-- event to the single oldest IngestionRun of any source — fabricated
-- provenance. Instead, one explicit "legacy backfill" run per source is
-- created by this migration (legacy_source = 'migration:030', status
-- COMPLETED, flagged REQUIRES_REVIEW) and events attach to their own
-- source's backfill run: the provenance says exactly what is known.
--
-- content_hash: sha256 over the UTF-8 bytes of the jsonb text. The previous
-- draft hashed `raw::text::bytea`, a cast that parses backslashes as bytea
-- escape syntax: any payload containing a JSON escape such as \n or \"
-- (routine in GDACS/ReliefWeb descriptions) aborted the whole backfill with
-- "invalid input syntax for type bytea". convert_to() yields the same bytes
-- for every payload the old cast accepted, and never fails.
--
-- Mutable in legacy (ExternalEvent is upserted on every fetch): the raw
-- payload/hash, received_at and external id on source_records; the title,
-- occurred/reported instants and the source-record link on observations.
-- lastSeenAt/expiresAt/normalized/severity/coordinates have no target column
-- here (documented gap, reported by dual-read as unmapped, never as a match).
CREATE OR REPLACE FUNCTION migration_meta.fn_sync_external_events(p_ids text[])
RETURNS TABLE (source_table text, legacy_record_id text, target_table text, action text, detail text)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
#variable_conflict use_column
BEGIN
  PERFORM migration_meta.fn_sync_sources(CASE WHEN p_ids IS NULL THEN NULL ELSE ARRAY(
    SELECT DISTINCT "sourceId" FROM "ExternalEvent" WHERE id = ANY(p_ids)) END);

  INSERT INTO ingest.ingestion_runs (source_id, idempotency_key, origin_kind, status, started_at, completed_at,
    legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status)
  SELECT s.id, migration_meta.fn_legacy_uuid('migration:030:external-event-backfill:' || s.endpoint_signature),
    'EXTERNAL_EVENT_PIPELINE'::ingest.ingestion_run_origin_kind_enum, 'COMPLETED'::ingest.ingestion_run_status_enum,
    now(), now(), NULL, 'migration:030', 'external-event-backfill:' || s.endpoint_signature, 'LOW', 'REQUIRES_REVIEW'
  FROM ingest.sources s
  WHERE EXISTS (SELECT 1 FROM "ExternalEvent" ee WHERE ee."sourceId" = s.endpoint_signature AND (p_ids IS NULL OR ee.id = ANY(p_ids)))
  ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO NOTHING;

  RETURN QUERY
  WITH scope AS (
    SELECT ee.id, run.id AS run_id, s.id AS source_id, ee."externalId" AS external_id,
      jsonb_build_object('legacy_record_id', ee.id, 'legacy_table', 'ExternalEvent', 'ingestion_run', 'not recorded in legacy') AS provenance,
      COALESCE(ee.raw, '{}') AS raw_content,
      encode(sha256(convert_to(COALESCE(ee.raw, '{}')::text, 'UTF8')), 'hex') AS content_hash,
      COALESCE(ee."fetchedAt", ee."createdAt") AT TIME ZONE 'UTC' AS received_at
    FROM "ExternalEvent" ee
    JOIN ingest.sources s ON s.endpoint_signature = ee."sourceId"
    JOIN ingest.ingestion_runs run ON run.legacy_source = 'migration:030' AND run.legacy_record_id = 'external-event-backfill:' || s.endpoint_signature
    WHERE p_ids IS NULL OR ee.id = ANY(p_ids)
  ), up AS (
    INSERT INTO ingest.source_records AS t (ingestion_run_id, source_id, origin_kind, external_id, provenance, raw_content, content_hash, received_at,
      legacy_source, legacy_record_id, migration_confidence, migration_review_status)
    SELECT sc.run_id, sc.source_id, 'EXTERNAL_EVENT'::ingest.source_record_origin_enum, sc.external_id, sc.provenance, sc.raw_content, sc.content_hash, sc.received_at,
      'ExternalEvent', sc.id, 'HIGH', 'AUTO_MAPPED'
    FROM scope sc
    ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO UPDATE SET
      external_id = EXCLUDED.external_id, raw_content = EXCLUDED.raw_content,
      content_hash = EXCLUDED.content_hash, received_at = EXCLUDED.received_at
    WHERE (t.external_id, t.content_hash, t.received_at)
      IS DISTINCT FROM (EXCLUDED.external_id, EXCLUDED.content_hash, EXCLUDED.received_at)
    RETURNING t.legacy_record_id AS lid, (t.xmax = 0) AS ins
  )
  SELECT 'ExternalEvent'::text, sc.id, 'ingest.source_records'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' WHEN up.ins THEN 'INSERTED' ELSE 'UPDATED' END, NULL::text
  FROM scope sc LEFT JOIN up ON up.lid = sc.id;

  RETURN QUERY
  WITH scope AS (
    SELECT ee.id, ee.title AS claim_text,
      (SELECT sr.id FROM ingest.source_records sr WHERE sr.legacy_source = 'ExternalEvent' AND sr.legacy_record_id = ee.id) AS source_record_id,
      jsonb_build_object('chain', jsonb_build_array(jsonb_build_object('step_kind', 'EXTERNAL_EVENT_INGESTION', 'timestamp', to_char(ee."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))), 'depth', 1) AS provenance,
      COALESCE(ee."occurredAt", ee."fetchedAt", ee."createdAt") AT TIME ZONE 'UTC' AS occurred_at,
      COALESCE(ee."fetchedAt", ee."createdAt") AT TIME ZONE 'UTC' AS reported_at,
      ee."createdAt" AT TIME ZONE 'UTC' AS created_at
    FROM "ExternalEvent" ee
    WHERE p_ids IS NULL OR ee.id = ANY(p_ids)
  ), up AS (
    INSERT INTO evidence.observations AS t (origin_type, claim_text, source_record_id, provenance, occurred_at, reported_at,
      legacy_source, legacy_record_id, migration_confidence, migration_review_status, created_at)
    SELECT 'PRIMARY'::evidence.observation_origin_enum, sc.claim_text, sc.source_record_id, sc.provenance, sc.occurred_at, sc.reported_at,
      'ExternalEvent', sc.id, 'MEDIUM', 'REQUIRES_REVIEW', sc.created_at
    FROM scope sc
    ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO UPDATE SET
      claim_text = EXCLUDED.claim_text, source_record_id = EXCLUDED.source_record_id,
      occurred_at = EXCLUDED.occurred_at, reported_at = EXCLUDED.reported_at
    WHERE (t.claim_text, t.source_record_id, t.occurred_at, t.reported_at)
      IS DISTINCT FROM (EXCLUDED.claim_text, EXCLUDED.source_record_id, EXCLUDED.occurred_at, EXCLUDED.reported_at)
    RETURNING t.legacy_record_id AS lid, (t.xmax = 0) AS ins
  )
  SELECT 'ExternalEvent'::text, sc.id, 'evidence.observations'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' WHEN up.ins THEN 'INSERTED' ELSE 'UPDATED' END, NULL::text
  FROM scope sc LEFT JOIN up ON up.lid = sc.id;

  RETURN QUERY
  SELECT 'ExternalEvent'::text, u.id, NULL::text, 'LEGACY_NOT_FOUND'::text, NULL::text
  FROM unnest(p_ids) AS u(id)
  WHERE NOT EXISTS (SELECT 1 FROM "ExternalEvent" ee WHERE ee.id = u.id);
END
$fn$;
REVOKE ALL ON FUNCTION migration_meta.fn_sync_external_events(text[]) FROM PUBLIC;
ALTER FUNCTION migration_meta.fn_sync_external_events(text[]) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION migration_meta.fn_sync_external_events(text[]) TO sync_worker;

-- ============================================================
-- 4b. evidence.observations <- Report
-- ============================================================
-- author_person_id is a real uuid FK to identity.people(id) — Report.userId
-- is the legacy cuid, resolved via identity.people.legacy_record_id (Ola 2
-- backfill, User -> identity.people), never inserted as a raw cuid string.
-- A Report whose author is not (yet) in identity.people keeps a NULL author
-- flagged LOW/REQUIRES_REVIEW; once the person exists, a later sync fills it.
-- Report.status/severity/category/coordinates have no target column on
-- observations (documented gap, reported by dual-read as unmapped).
CREATE OR REPLACE FUNCTION migration_meta.fn_sync_reports(p_ids text[])
RETURNS TABLE (source_table text, legacy_record_id text, target_table text, action text, detail text)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH scope AS (
    SELECT r.id, p.id AS person_id, r.description AS claim_text,
      jsonb_build_object('chain', jsonb_build_array(jsonb_build_object('step_kind', 'CITIZEN_REPORT', 'timestamp', to_char(r."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))), 'depth', 1) AS provenance,
      r."createdAt" AT TIME ZONE 'UTC' AS created_at,
      CASE WHEN p.id IS NOT NULL THEN 'HIGH' ELSE 'LOW' END AS conf,
      CASE WHEN p.id IS NOT NULL THEN 'AUTO_MAPPED' ELSE 'REQUIRES_REVIEW' END AS review
    FROM "Report" r
    LEFT JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = r."userId"
    WHERE p_ids IS NULL OR r.id = ANY(p_ids)
  ), up AS (
    INSERT INTO evidence.observations AS t (origin_type, author_type, author_person_id, claim_text, provenance, occurred_at, reported_at,
      legacy_source, legacy_record_id, migration_confidence, migration_review_status, created_at)
    SELECT 'PRIMARY'::evidence.observation_origin_enum, 'CITIZEN'::evidence.report_author_type_enum, sc.person_id,
      sc.claim_text, sc.provenance, sc.created_at, sc.created_at,
      'Report', sc.id, sc.conf, sc.review, sc.created_at
    FROM scope sc
    ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO UPDATE SET
      author_person_id = EXCLUDED.author_person_id, claim_text = EXCLUDED.claim_text,
      migration_confidence = EXCLUDED.migration_confidence, migration_review_status = EXCLUDED.migration_review_status
    WHERE (t.author_person_id, t.claim_text, t.migration_confidence, t.migration_review_status)
      IS DISTINCT FROM (EXCLUDED.author_person_id, EXCLUDED.claim_text, EXCLUDED.migration_confidence, EXCLUDED.migration_review_status)
    RETURNING t.legacy_record_id AS lid, (t.xmax = 0) AS ins
  )
  SELECT 'Report'::text, sc.id, 'evidence.observations'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' WHEN up.ins THEN 'INSERTED' ELSE 'UPDATED' END,
    CASE WHEN sc.person_id IS NULL THEN 'AUTHOR_NOT_MIGRATED' END
  FROM scope sc LEFT JOIN up ON up.lid = sc.id;

  RETURN QUERY
  SELECT 'Report'::text, u.id, NULL::text, 'LEGACY_NOT_FOUND'::text, NULL::text
  FROM unnest(p_ids) AS u(id)
  WHERE NOT EXISTS (SELECT 1 FROM "Report" r WHERE r.id = u.id);
END
$fn$;
REVOKE ALL ON FUNCTION migration_meta.fn_sync_reports(text[]) FROM PUBLIC;
ALTER FUNCTION migration_meta.fn_sync_reports(text[]) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION migration_meta.fn_sync_reports(text[]) TO sync_worker;
-- D-04: TelecomConnectivityStatus (0 rows) — origin_type='PRIMARY',
-- structural mapping only, no rows to move (0 rows in current schema, never
-- executes a real row).

-- ============================================================
-- 5. evidence.evidence_records <- KnowledgeEvidence
-- ============================================================
-- The link to the legacy incident (KnowledgeEvidence.incidentId) is kept in
-- chain_of_custody.legacyIncidentId. The previous draft dropped it while
-- claiming Wave 040 would rebuild incident_evidence_links, which 040 never
-- did; building those links is still pending, but the information is no
-- longer lost.
-- Scope: p_ids (evidence ids) and/or p_incident_ids (every evidence row of
-- those legacy incidents — the KnowledgeIncident writer creates evidence in
-- the same operation, so Wave 040's incident sync passes its incident ids
-- here). Both NULL = every row.
CREATE OR REPLACE FUNCTION migration_meta.fn_sync_knowledge_evidence(p_ids text[], p_incident_ids text[])
RETURNS TABLE (source_table text, legacy_record_id text, target_table text, action text, detail text)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH scope AS (
    SELECT ke.id,
      jsonb_build_object('sourceId', ke."sourceId", 'sourceName', ke."sourceName", 'legacy_record_id', ke.id, 'legacyIncidentId', ke."incidentId") AS chain_of_custody,
      ke."createdAt" AT TIME ZONE 'UTC' AS created_at
    FROM "KnowledgeEvidence" ke
    WHERE (p_ids IS NULL AND p_incident_ids IS NULL)
       OR ke.id = ANY(p_ids)
       OR ke."incidentId" = ANY(p_incident_ids)
  ), up AS (
    INSERT INTO evidence.evidence_records AS t (origin_type, classification, chain_of_custody,
      legacy_source, legacy_record_id, migration_confidence, migration_review_status, created_at)
    SELECT 'DERIVED'::evidence.evidence_origin_enum, 'OPERATIONAL'::security.information_classification_enum, sc.chain_of_custody,
      'KnowledgeEvidence', sc.id, 'MEDIUM', 'REQUIRES_REVIEW', sc.created_at
    FROM scope sc
    ON CONFLICT (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL DO UPDATE SET
      chain_of_custody = EXCLUDED.chain_of_custody
    WHERE t.chain_of_custody IS DISTINCT FROM EXCLUDED.chain_of_custody
    RETURNING t.legacy_record_id AS lid, (t.xmax = 0) AS ins
  )
  SELECT 'KnowledgeEvidence'::text, sc.id, 'evidence.evidence_records'::text,
    CASE WHEN up.lid IS NULL THEN 'UNCHANGED' WHEN up.ins THEN 'INSERTED' ELSE 'UPDATED' END, NULL::text
  FROM scope sc LEFT JOIN up ON up.lid = sc.id;

  RETURN QUERY
  SELECT 'KnowledgeEvidence'::text, u.id, NULL::text, 'LEGACY_NOT_FOUND'::text, NULL::text
  FROM unnest(p_ids) AS u(id)
  WHERE NOT EXISTS (SELECT 1 FROM "KnowledgeEvidence" ke WHERE ke.id = u.id);
END
$fn$;
REVOKE ALL ON FUNCTION migration_meta.fn_sync_knowledge_evidence(text[], text[]) FROM PUBLIC;
ALTER FUNCTION migration_meta.fn_sync_knowledge_evidence(text[], text[]) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION migration_meta.fn_sync_knowledge_evidence(text[], text[]) TO sync_worker;
-- D-04: TelecomConnectivityEvidence (0 rows) -> evidence_records/evidence_assets,
-- structural mapping only, same pattern as above — 0 rows, no INSERT executes for real.

-- ============================================================
-- Backfill = every sync function over every legacy row (NULL scope).
-- Order: sources/runs first (source_records hang off them), then events,
-- then reports and evidence. One summary line per (source, target, action).
-- ============================================================
SELECT source_table, target_table, action, count(*) AS rows FROM migration_meta.fn_sync_ingestion_runs(NULL) GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
SELECT source_table, target_table, action, count(*) AS rows FROM migration_meta.fn_sync_external_events(NULL) GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
SELECT source_table, target_table, action, count(*) AS rows FROM migration_meta.fn_sync_reports(NULL) GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
SELECT source_table, target_table, action, count(*) AS rows FROM migration_meta.fn_sync_knowledge_evidence(NULL, NULL) GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- ============================================================
-- 6. Row counts (before/after)
-- ============================================================
SELECT
  (SELECT COUNT(*) FROM "IngestionRun") AS ingestion_run_before,
  (SELECT COUNT(*) FROM "KnowledgeIngestionRun") AS knowledge_ingestion_run_before,
  (SELECT COUNT(*) FROM "ExternalEvent") AS external_event_before,
  (SELECT COUNT(*) FROM "Report") AS report_before,
  (SELECT COUNT(*) FROM "KnowledgeEvidence") AS knowledge_evidence_before;

SELECT
  (SELECT COUNT(*) FROM ingest.ingestion_runs WHERE legacy_source IN ('IngestionRun','KnowledgeIngestionRun')) AS ingestion_runs_after,
  (SELECT COUNT(*) FROM ingest.source_records WHERE legacy_source = 'ExternalEvent') AS source_records_after,
  (SELECT COUNT(*) FROM evidence.observations WHERE legacy_source IN ('ExternalEvent','Report')) AS observations_after,
  (SELECT COUNT(*) FROM evidence.evidence_records WHERE legacy_source = 'KnowledgeEvidence') AS evidence_records_after;

-- ============================================================
-- 7. Validation query — every ExternalEvent row has exactly one
--    source_records row and one observations row
-- ============================================================
SELECT ee.id FROM "ExternalEvent" ee
LEFT JOIN ingest.source_records sr ON sr.legacy_source = 'ExternalEvent' AND sr.legacy_record_id = ee.id
LEFT JOIN evidence.observations o ON o.legacy_source = 'ExternalEvent' AND o.legacy_record_id = ee.id
WHERE sr.id IS NULL OR o.id IS NULL;
-- Expected: 0 rows.

-- ============================================================
-- 8. MIGRATION_REVIEW_QUEUE
-- ============================================================
-- ingest.sources has no legacy-provenance columns (see §1 note above) —
-- excluded from this view, never fabricated.
CREATE OR REPLACE VIEW ingest.vw_migration_review_queue AS
SELECT 'ingest.source_records'::text AS target_table, id, legacy_source, legacy_record_id, migration_review_status FROM ingest.source_records WHERE migration_review_status = 'REQUIRES_REVIEW';

CREATE OR REPLACE VIEW evidence.vw_migration_review_queue AS
SELECT 'evidence.observations'::text AS target_table, id, legacy_source, legacy_record_id, migration_review_status FROM evidence.observations WHERE migration_review_status = 'REQUIRES_REVIEW'
UNION ALL
SELECT 'evidence.evidence_records', id, legacy_source, legacy_record_id, migration_review_status FROM evidence.evidence_records WHERE migration_review_status = 'REQUIRES_REVIEW';

-- ============================================================
-- 9. Checkpoints — expected = the source's own count, filtered by
--    legacy_source so target rows written by anything else never mask a gap
-- ============================================================
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status)
SELECT '030_ingestion_observation_evidence', 'IngestionRun+KnowledgeIngestionRun', 'ingest.ingestion_runs', e.n, a.n, CASE WHEN a.n = e.n THEN 'PASS' ELSE 'FAIL' END
FROM (SELECT (SELECT COUNT(*) FROM "IngestionRun") + (SELECT COUNT(*) FROM "KnowledgeIngestionRun") AS n) e,
     (SELECT COUNT(*) AS n FROM ingest.ingestion_runs WHERE legacy_source IN ('IngestionRun','KnowledgeIngestionRun')) a;
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status)
SELECT '030_ingestion_observation_evidence', 'ExternalEvent', 'ingest.source_records', e.n, a.n, CASE WHEN a.n = e.n THEN 'PASS' ELSE 'FAIL' END
FROM (SELECT COUNT(*) AS n FROM "ExternalEvent") e,
     (SELECT COUNT(*) AS n FROM ingest.source_records WHERE legacy_source = 'ExternalEvent') a;
INSERT INTO migration_meta.migration_checkpoints (wave, source_table, target_table, expected_count, actual_count, status)
SELECT '030_ingestion_observation_evidence', 'KnowledgeEvidence', 'evidence.evidence_records', e.n, a.n, CASE WHEN a.n = e.n THEN 'PASS' ELSE 'FAIL' END
FROM (SELECT COUNT(*) AS n FROM "KnowledgeEvidence") e,
     (SELECT COUNT(*) AS n FROM evidence.evidence_records WHERE legacy_source = 'KnowledgeEvidence') a;
