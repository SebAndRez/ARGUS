/**
 * src/lib/database-target/dual-read/legacyDualRead.ts
 *
 * Dual-read (Paso 5): read the legacy row, read its target counterpart, and
 * compare them deterministically. Distinct from `compare.ts`, which is the
 * generic field comparator for two already-projected records; this module is
 * the real, per-domain reconciliation against the database.
 *
 * Properties this file is built to guarantee:
 *   * READ ONLY. Every statement runs inside a transaction that starts with
 *     `SET TRANSACTION READ ONLY`, so a comparison cannot mutate either side
 *     even if a query were wrong. Enforced by the database, not by review.
 *   * Independent of the shadow-write. The expectation is re-derived here
 *     from the legacy columns and the D-02 mapping table, not read back from
 *     `migration_meta.fn_sync_*`. A bug in the sync function therefore shows
 *     up as a divergence instead of being mirrored into agreement.
 *   * It never reaches the user. Callers may log/metric the report (see
 *     `observability/shadowSyncMetrics.ts`); the response the user gets is
 *     always the legacy one the caller already produced.
 *   * PII-free output. The report carries legacy ids, target table names,
 *     field NAMES and counts — never values, so a divergence on
 *     `observations.claim_text` names the field without echoing the text.
 *
 * Vocabulary (the five outcomes Paso 5 requires):
 *   MATCH             — the target row exists and every mapped field agrees.
 *   MISSING_TARGET    — the legacy row should be in the target and is not.
 *   MISSING_LEGACY    — a target/deferred row whose legacy row no longer exists.
 *   VALUE_MISMATCH    — both sides exist but a mapped field (or the
 *                       disposition, or a relation) disagrees.
 *   DEFERRED_EXPECTED — the legacy row is deliberately not in the target and
 *                       is recorded as deferred/queued with a reason. Never
 *                       counted as loss, never counted as a match.
 */

import { isDualReadEnabled, type FlagEnvSource } from "../flags/targetMigrationFlags";
import {
  recordDualReadComparison,
  recordDualReadFailure,
  recordDualReadFieldDivergence,
  recordDualReadRun,
} from "../observability/shadowSyncMetrics";

export type DualReadOutcome =
  | "MATCH"
  | "MISSING_TARGET"
  | "MISSING_LEGACY"
  | "VALUE_MISMATCH"
  | "DEFERRED_EXPECTED";

export interface DualReadRowResult {
  domain: string;
  legacyId: string;
  outcome: DualReadOutcome;
  /** Where the row is (or should be). `null` for MISSING_TARGET. */
  disposition: string | null;
  /** Field NAMES only (e.g. `observations.claim_text`), never values. */
  mismatchedFields: string[];
  /** A code: the deferral reason, or `disposition`, never legacy content. */
  detail: string | null;
}

export interface DualReadDomainReport {
  domain: string;
  status: "COMPLETED" | "SKIPPED_FLAG_OFF" | "FAILED";
  legacyRows: number;
  counts: Record<DualReadOutcome, number>;
  /** Legacy columns this wave maps nowhere yet. A gap that is reported, not hidden behind a MATCH. */
  unmappedLegacyColumns: string[];
  /** Every row whose outcome is not MATCH (bounded by `maxRowsReported`). */
  divergences: DualReadRowResult[];
  errorCode: string | null;
  durationMs: number;
}

export interface DualReadReport {
  domains: DualReadDomainReport[];
  totals: Record<DualReadOutcome, number>;
  /** True only when nothing anywhere is MISSING_TARGET / MISSING_LEGACY / VALUE_MISMATCH. */
  reconciled: boolean;
}

const ZERO_COUNTS = (): Record<DualReadOutcome, number> => ({
  MATCH: 0,
  MISSING_TARGET: 0,
  MISSING_LEGACY: 0,
  VALUE_MISMATCH: 0,
  DEFERRED_EXPECTED: 0,
});

// ---------------------------------------------------------------------------
// Per-domain specs
// ---------------------------------------------------------------------------
// Every `comparisonSql` returns exactly these columns, one row per legacy row:
//   legacy_id text, expected text, actual text, mismatched_fields text[], detail text
// `expected`/`actual` are dispositions: 'MIGRATED' | 'DEFERRED' | 'QUEUE' |
// 'PARTIAL' (some of the expected target rows exist) | 'NONE'.
// $1 is a text[] of legacy ids, or NULL for "every row".

interface DualReadDomainSpec {
  domain: string;
  legacyTable: string;
  unmappedLegacyColumns: string[];
  comparisonSql: string;
  /** Target/deferred/queue rows whose legacy row no longer exists → MISSING_LEGACY. */
  orphanSql: string[];
}

function orphanSql(targetTable: string, legacySource: string, legacyTable: string): string {
  return `SELECT t.legacy_record_id AS legacy_id, '${targetTable}' AS disposition
          FROM ${targetTable} t
          WHERE t.legacy_source = '${legacySource}'
            AND NOT EXISTS (SELECT 1 FROM "${legacyTable}" l WHERE l.id = t.legacy_record_id)`;
}

function deferredOrphanSql(sourceTable: string, legacyTable: string): string {
  return `SELECT d.legacy_record_id AS legacy_id, 'DEFERRED' AS disposition
          FROM migration_meta.legacy_deferred_rows d
          WHERE d.source_table = '${sourceTable}'
            AND NOT EXISTS (SELECT 1 FROM "${legacyTable}" l WHERE l.id = d.legacy_record_id)`;
}

const SPECS: DualReadDomainSpec[] = [
  {
    domain: "User",
    legacyTable: "User",
    unmappedLegacyColumns: [
      "passwordHash (never migrated: authentication stays legacy until cutover)",
      "googleSub (identity.user_accounts has no credential columns since the Paso 6A reconciliation)",
      "avatarUrl",
      "emailVerifiedAt",
      "profileCompletedAt",
      "preferredLanguage",
      "unitSystem",
      "strikes (folded into the reputation snapshot's reason, not a column)",
    ],
    comparisonSql: `
      WITH cmp AS (
        SELECT u.id AS legacy_id,
          p.id IS NOT NULL AS has_person,
          ua.id IS NOT NULL AS has_account,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN p.id IS NOT NULL AND p.legal_name IS DISTINCT FROM u.name THEN 'people.legal_name' END,
            CASE WHEN p.id IS NOT NULL AND p.display_alias IS DISTINCT FROM u."publicAlias" THEN 'people.display_alias' END,
            CASE WHEN p.id IS NOT NULL AND p.national_id_hash IS DISTINCT FROM u."governmentIdHash" THEN 'people.national_id_hash' END,
            CASE WHEN p.id IS NOT NULL AND p.contact_info IS DISTINCT FROM jsonb_build_object('email', u.email, 'phone', u.phone, 'city', u.city, 'region', u.region, 'countryCode', u."countryCode") THEN 'people.contact_info' END,
            CASE WHEN p.id IS NOT NULL AND p.legacy_status IS DISTINCT FROM u.role THEN 'people.legacy_status' END,
            CASE WHEN p.id IS NOT NULL AND p.created_at IS DISTINCT FROM (u."createdAt" AT TIME ZONE 'UTC') THEN 'people.created_at' END,
            CASE WHEN ua.id IS NOT NULL AND ua.status::text IS DISTINCT FROM (CASE WHEN u."accountStatus" = 'ACTIVE' THEN 'ACTIVE' ELSE 'SUSPENDED' END) THEN 'user_accounts.status' END,
            CASE WHEN ua.id IS NOT NULL AND ua.auth_provider IS DISTINCT FROM u."authProvider" THEN 'user_accounts.auth_provider' END,
            CASE WHEN ua.id IS NOT NULL AND ua.last_login_at IS DISTINCT FROM (u."lastLoginAt" AT TIME ZONE 'UTC') THEN 'user_accounts.last_login_at' END,
            CASE WHEN ua.id IS NOT NULL AND ua.legacy_status IS DISTINCT FROM u."accountStatus" THEN 'user_accounts.legacy_status' END,
            CASE WHEN (u."governmentIdHash" IS NOT NULL) <> EXISTS (SELECT 1 FROM identity.verified_identities vi WHERE vi.legacy_source = 'User' AND vi.legacy_record_id = u.id) THEN 'relation:identity.verified_identities' END,
            CASE WHEN (SELECT count(*) FROM identity.consents c WHERE c.legacy_source = 'User' AND c.legacy_record_id = u.id)
                   <> ((CASE WHEN u."termsAcceptedAt" IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN u."privacyAcceptedAt" IS NOT NULL THEN 1 ELSE 0 END)) THEN 'relation:identity.consents' END,
            CASE WHEN NOT EXISTS (SELECT 1 FROM identity.reputation_events re WHERE re.legacy_source = 'User' AND re.legacy_record_id = u.id AND re.delta = u."trustScore" - 70) THEN 'reputation_events.delta' END
          ], NULL) AS mismatched_fields
        FROM "User" u
        LEFT JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = u.id
        LEFT JOIN identity.user_accounts ua ON ua.legacy_source = 'User' AND ua.legacy_record_id = u.id
        WHERE $1::text[] IS NULL OR u.id = ANY($1::text[])
      )
      SELECT legacy_id, 'MIGRATED' AS expected,
        CASE WHEN has_person AND has_account THEN 'MIGRATED' WHEN has_person OR has_account THEN 'PARTIAL' ELSE 'NONE' END AS actual,
        mismatched_fields, NULL::text AS detail
      FROM cmp`,
    orphanSql: [
      orphanSql("identity.people", "User", "User"),
      orphanSql("identity.user_accounts", "User", "User"),
    ],
  },
  {
    domain: "AuditLog",
    legacyTable: "AuditLog",
    unmappedLegacyColumns: [],
    comparisonSql: `
      WITH cmp AS (
        SELECT al.id AS legacy_id,
          a.id IS NOT NULL AS has_row,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN a.id IS NOT NULL AND a.occurred_at IS DISTINCT FROM (al."createdAt" AT TIME ZONE 'UTC') THEN 'audit_logs.occurred_at' END,
            CASE WHEN a.id IS NOT NULL AND a.action IS DISTINCT FROM al.action THEN 'audit_logs.action' END,
            CASE WHEN a.id IS NOT NULL AND a.target_table IS DISTINCT FROM al."targetType" THEN 'audit_logs.target_table' END,
            CASE WHEN a.id IS NOT NULL AND a.actor_type::text IS DISTINCT FROM (CASE WHEN al."actorUserId" IS NULL THEN 'SYSTEM' ELSE 'PERSON' END) THEN 'audit_logs.actor_type' END,
            CASE WHEN a.id IS NOT NULL AND a.actor_id IS DISTINCT FROM (CASE WHEN al."actorUserId" IS NULL
                   THEN migration_meta.fn_legacy_uuid('legacy:AuditLog:unrecorded-actor')
                   ELSE migration_meta.fn_legacy_uuid('legacy:User:' || al."actorUserId") END) THEN 'audit_logs.actor_id' END,
            CASE WHEN a.id IS NOT NULL AND a.target_id IS DISTINCT FROM (CASE WHEN al."targetId" IS NULL
                   THEN migration_meta.fn_legacy_uuid('legacy:AuditLog:no-target:' || al.id)
                   ELSE migration_meta.fn_legacy_uuid('legacy:' || al."targetType" || ':' || al."targetId") END) THEN 'audit_logs.target_id' END,
            CASE WHEN a.id IS NOT NULL AND a.context IS DISTINCT FROM jsonb_build_object('legacyActorUserId', al."actorUserId", 'legacyTargetId', al."targetId") THEN 'audit_logs.context' END,
            CASE WHEN a.id IS NOT NULL AND a.result IS DISTINCT FROM COALESCE(al.metadata, '{}') THEN 'audit_logs.result' END,
            CASE WHEN a.id IS NOT NULL AND (a.integrity_value IS NULL OR a.integrity_key_id IS NULL) THEN 'audit_logs.integrity_value' END
          ], NULL) AS mismatched_fields
        FROM "AuditLog" al
        LEFT JOIN security.audit_logs a ON a.legacy_source = 'AuditLog' AND a.legacy_record_id = al.id
        WHERE $1::text[] IS NULL OR al.id = ANY($1::text[])
      )
      SELECT legacy_id, 'MIGRATED' AS expected, CASE WHEN has_row THEN 'MIGRATED' ELSE 'NONE' END AS actual,
        mismatched_fields, NULL::text AS detail
      FROM cmp`,
    orphanSql: [orphanSql("security.audit_logs", "AuditLog", "AuditLog")],
  },
  {
    domain: "IngestionRun",
    legacyTable: "IngestionRun",
    unmappedLegacyColumns: ["count", "cached", "error", "durationMs", "metadata"],
    comparisonSql: `
      WITH cmp AS (
        SELECT ir.id AS legacy_id,
          r.id IS NOT NULL AS has_row,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN r.id IS NOT NULL AND r.status::text IS DISTINCT FROM (CASE WHEN lower(ir.status) IN ('success','completed') THEN 'COMPLETED' ELSE 'FAILED' END) THEN 'ingestion_runs.status' END,
            CASE WHEN r.id IS NOT NULL AND r.started_at IS DISTINCT FROM (ir."fetchedAt" AT TIME ZONE 'UTC') THEN 'ingestion_runs.started_at' END,
            CASE WHEN r.id IS NOT NULL AND r.completed_at IS DISTINCT FROM (ir."completedAt" AT TIME ZONE 'UTC') THEN 'ingestion_runs.completed_at' END,
            CASE WHEN r.id IS NOT NULL AND r.legacy_status IS DISTINCT FROM ir.status THEN 'ingestion_runs.legacy_status' END,
            CASE WHEN r.id IS NOT NULL AND s.endpoint_signature IS DISTINCT FROM ir."sourceId" THEN 'ingestion_runs.source_id' END
          ], NULL) AS mismatched_fields
        FROM "IngestionRun" ir
        LEFT JOIN ingest.ingestion_runs r ON r.legacy_source = 'IngestionRun' AND r.legacy_record_id = ir.id
        LEFT JOIN ingest.sources s ON s.id = r.source_id
        WHERE $1::text[] IS NULL OR ir.id = ANY($1::text[])
      )
      SELECT legacy_id, 'MIGRATED' AS expected, CASE WHEN has_row THEN 'MIGRATED' ELSE 'NONE' END AS actual,
        mismatched_fields, NULL::text AS detail
      FROM cmp`,
    orphanSql: [orphanSql("ingest.ingestion_runs", "IngestionRun", "IngestionRun")],
  },
  {
    domain: "KnowledgeIngestionRun",
    legacyTable: "KnowledgeIngestionRun",
    unmappedLegacyColumns: [
      "sourceName",
      "recordsFetched/Normalized/Inserted/Updated/Skipped",
      "errorMessage",
      "warningsJson",
      "metadataJson",
    ],
    comparisonSql: `
      WITH cmp AS (
        SELECT kir.id AS legacy_id,
          r.id IS NOT NULL AS has_row,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN r.id IS NOT NULL AND r.status::text IS DISTINCT FROM (CASE WHEN lower(kir.status) IN ('success','completed','partial') THEN 'COMPLETED' ELSE 'FAILED' END) THEN 'ingestion_runs.status' END,
            CASE WHEN r.id IS NOT NULL AND r.started_at IS DISTINCT FROM (kir."startedAt" AT TIME ZONE 'UTC') THEN 'ingestion_runs.started_at' END,
            CASE WHEN r.id IS NOT NULL AND r.completed_at IS DISTINCT FROM (kir."finishedAt" AT TIME ZONE 'UTC') THEN 'ingestion_runs.completed_at' END,
            CASE WHEN r.id IS NOT NULL AND r.legacy_status IS DISTINCT FROM kir.status THEN 'ingestion_runs.legacy_status' END,
            CASE WHEN r.id IS NOT NULL AND r.origin_kind::text IS DISTINCT FROM 'GLOBAL_WATCH_PIPELINE' THEN 'ingestion_runs.origin_kind' END
          ], NULL) AS mismatched_fields
        FROM "KnowledgeIngestionRun" kir
        LEFT JOIN ingest.ingestion_runs r ON r.legacy_source = 'KnowledgeIngestionRun' AND r.legacy_record_id = kir.id
        WHERE $1::text[] IS NULL OR kir.id = ANY($1::text[])
      )
      SELECT legacy_id, 'MIGRATED' AS expected, CASE WHEN has_row THEN 'MIGRATED' ELSE 'NONE' END AS actual,
        mismatched_fields, NULL::text AS detail
      FROM cmp`,
    orphanSql: [orphanSql("ingest.ingestion_runs", "KnowledgeIngestionRun", "KnowledgeIngestionRun")],
  },
  {
    domain: "ExternalEvent",
    legacyTable: "ExternalEvent",
    unmappedLegacyColumns: [
      "severity",
      "confidence",
      "latitude/longitude (observations.location left NULL by design)",
      "locationName",
      "country",
      "sourceUrl",
      "lastSeenAt",
      "expiresAt",
      "normalized",
      "category",
      "description",
    ],
    comparisonSql: `
      WITH cmp AS (
        SELECT ee.id AS legacy_id,
          sr.id IS NOT NULL AS has_sr,
          o.id IS NOT NULL AS has_obs,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN sr.id IS NOT NULL AND sr.external_id IS DISTINCT FROM ee."externalId" THEN 'source_records.external_id' END,
            CASE WHEN sr.id IS NOT NULL AND sr.raw_content IS DISTINCT FROM COALESCE(ee.raw, '{}') THEN 'source_records.raw_content' END,
            CASE WHEN sr.id IS NOT NULL AND sr.content_hash IS DISTINCT FROM encode(sha256(convert_to(COALESCE(ee.raw, '{}')::text, 'UTF8')), 'hex') THEN 'source_records.content_hash' END,
            CASE WHEN sr.id IS NOT NULL AND sr.received_at IS DISTINCT FROM (COALESCE(ee."fetchedAt", ee."createdAt") AT TIME ZONE 'UTC') THEN 'source_records.received_at' END,
            CASE WHEN sr.id IS NOT NULL AND s.endpoint_signature IS DISTINCT FROM ee."sourceId" THEN 'source_records.source_id' END,
            CASE WHEN o.id IS NOT NULL AND o.claim_text IS DISTINCT FROM ee.title THEN 'observations.claim_text' END,
            CASE WHEN o.id IS NOT NULL AND o.occurred_at IS DISTINCT FROM (COALESCE(ee."occurredAt", ee."fetchedAt", ee."createdAt") AT TIME ZONE 'UTC') THEN 'observations.occurred_at' END,
            CASE WHEN o.id IS NOT NULL AND o.reported_at IS DISTINCT FROM (COALESCE(ee."fetchedAt", ee."createdAt") AT TIME ZONE 'UTC') THEN 'observations.reported_at' END,
            CASE WHEN o.id IS NOT NULL AND o.source_record_id IS DISTINCT FROM sr.id THEN 'relation:observations.source_record_id' END
          ], NULL) AS mismatched_fields
        FROM "ExternalEvent" ee
        LEFT JOIN ingest.source_records sr ON sr.legacy_source = 'ExternalEvent' AND sr.legacy_record_id = ee.id
        LEFT JOIN ingest.sources s ON s.id = sr.source_id
        LEFT JOIN evidence.observations o ON o.legacy_source = 'ExternalEvent' AND o.legacy_record_id = ee.id
        WHERE $1::text[] IS NULL OR ee.id = ANY($1::text[])
      )
      SELECT legacy_id, 'MIGRATED' AS expected,
        CASE WHEN has_sr AND has_obs THEN 'MIGRATED' WHEN has_sr OR has_obs THEN 'PARTIAL' ELSE 'NONE' END AS actual,
        mismatched_fields, NULL::text AS detail
      FROM cmp`,
    orphanSql: [
      orphanSql("ingest.source_records", "ExternalEvent", "ExternalEvent"),
      orphanSql("evidence.observations", "ExternalEvent", "ExternalEvent"),
    ],
  },
  {
    domain: "Report",
    legacyTable: "Report",
    unmappedLegacyColumns: [
      "status (moderation state has no observation column yet)",
      "severity",
      "category",
      "title",
      "latitude/longitude",
      "locationText",
      "aiSummary/aiRecommendation/aiConfidence",
      "falseReportRisk",
    ],
    comparisonSql: `
      WITH cmp AS (
        SELECT r.id AS legacy_id,
          o.id IS NOT NULL AS has_row,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN o.id IS NOT NULL AND o.claim_text IS DISTINCT FROM r.description THEN 'observations.claim_text' END,
            CASE WHEN o.id IS NOT NULL AND o.occurred_at IS DISTINCT FROM (r."createdAt" AT TIME ZONE 'UTC') THEN 'observations.occurred_at' END,
            CASE WHEN o.id IS NOT NULL AND o.reported_at IS DISTINCT FROM (r."createdAt" AT TIME ZONE 'UTC') THEN 'observations.reported_at' END,
            CASE WHEN o.id IS NOT NULL AND o.author_person_id IS DISTINCT FROM p.id THEN 'relation:observations.author_person_id' END,
            CASE WHEN o.id IS NOT NULL AND o.author_type::text IS DISTINCT FROM 'CITIZEN' THEN 'observations.author_type' END
          ], NULL) AS mismatched_fields
        FROM "Report" r
        LEFT JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = r."userId"
        LEFT JOIN evidence.observations o ON o.legacy_source = 'Report' AND o.legacy_record_id = r.id
        WHERE $1::text[] IS NULL OR r.id = ANY($1::text[])
      )
      SELECT legacy_id, 'MIGRATED' AS expected, CASE WHEN has_row THEN 'MIGRATED' ELSE 'NONE' END AS actual,
        mismatched_fields, NULL::text AS detail
      FROM cmp`,
    orphanSql: [orphanSql("evidence.observations", "Report", "Report")],
  },
  {
    domain: "KnowledgeEvidence",
    legacyTable: "KnowledgeEvidence",
    unmappedLegacyColumns: ["incidentId (kept inside chain_of_custody, no incident_evidence_link row yet)"],
    comparisonSql: `
      WITH cmp AS (
        SELECT ke.id AS legacy_id,
          er.id IS NOT NULL AS has_row,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN er.id IS NOT NULL AND er.chain_of_custody IS DISTINCT FROM jsonb_build_object('sourceId', ke."sourceId", 'sourceName', ke."sourceName", 'legacy_record_id', ke.id, 'legacyIncidentId', ke."incidentId") THEN 'evidence_records.chain_of_custody' END,
            CASE WHEN er.id IS NOT NULL AND er.created_at IS DISTINCT FROM (ke."createdAt" AT TIME ZONE 'UTC') THEN 'evidence_records.created_at' END
          ], NULL) AS mismatched_fields
        FROM "KnowledgeEvidence" ke
        LEFT JOIN evidence.evidence_records er ON er.legacy_source = 'KnowledgeEvidence' AND er.legacy_record_id = ke.id
        WHERE $1::text[] IS NULL OR ke.id = ANY($1::text[])
      )
      SELECT legacy_id, 'MIGRATED' AS expected, CASE WHEN has_row THEN 'MIGRATED' ELSE 'NONE' END AS actual,
        mismatched_fields, NULL::text AS detail
      FROM cmp`,
    orphanSql: [orphanSql("evidence.evidence_records", "KnowledgeEvidence", "KnowledgeEvidence")],
  },
  {
    domain: "KnowledgeIncident",
    legacyTable: "KnowledgeIncident",
    unmappedLegacyColumns: [
      "severity/effectiveSeverity (no target severity dimension yet)",
      "confidenceScore/actionabilityScore/sourceReliabilityScore",
      "latitude/longitude/geometryJson (geography left to Ola 8)",
      "casualtiesJson/impactJson/technicalFactorsJson/causesJson",
      "reviewStatus",
      "occurredAt/detectedAt/startedAt/confirmedAt/resolvedAt/archivedAt",
      "domain/subtype beyond the incident type match",
    ],
    comparisonSql: `
      WITH cmp AS (
        SELECT ki.id AS legacy_id,
          (ki."verificationStatus" IS NOT NULL AND lower(ki."verificationStatus") IN ('unverified','candidate')) AS expect_candidate,
          i.id IS NOT NULL AS has_incident,
          c.id IS NOT NULL AS has_candidate,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN i.id IS NOT NULL AND i.verification_status::text IS DISTINCT FROM COALESCE(mv.target_value, 'UNCONFIRMED') THEN 'incidents.verification_status' END,
            CASE WHEN i.id IS NOT NULL AND i.operational_status::text IS DISTINCT FROM COALESCE(mo.target_value, 'ASSESSING') THEN 'incidents.operational_status' END,
            CASE WHEN i.id IS NOT NULL AND i.title IS DISTINCT FROM ki.title THEN 'incidents.title' END,
            CASE WHEN i.id IS NOT NULL AND i.description IS DISTINCT FROM ki.summary THEN 'incidents.description' END,
            CASE WHEN i.id IS NOT NULL AND i.created_at IS DISTINCT FROM (ki."createdAt" AT TIME ZONE 'UTC') THEN 'incidents.created_at' END,
            CASE WHEN i.id IS NOT NULL AND i.legacy_status IS DISTINCT FROM concat_ws('|', ki."verificationStatus", ki.status) THEN 'incidents.legacy_status' END,
            CASE WHEN i.id IS NOT NULL AND i.incident_type_id IS DISTINCT FROM COALESCE(
                   (SELECT it.id FROM governance.incident_types it WHERE lower(it.code) = lower(ki.domain) LIMIT 1),
                   (SELECT id FROM governance.incident_types WHERE code = 'UNCLASSIFIED_LEGACY')) THEN 'incidents.incident_type_id' END,
            CASE WHEN c.id IS NOT NULL AND c.legacy_status IS DISTINCT FROM ki."verificationStatus" THEN 'incident_candidates.legacy_status' END,
            CASE WHEN c.id IS NOT NULL AND c.correlation_key IS DISTINCT FROM (CASE WHEN ki."sourceId" IS NOT NULL AND ki."canonicalKey" IS NOT NULL THEN ki."sourceId" || ':' || ki."canonicalKey" ELSE NULL END) THEN 'incident_candidates.correlation_key' END,
            CASE WHEN c.id IS NOT NULL AND c.created_at IS DISTINCT FROM (ki."createdAt" AT TIME ZONE 'UTC') THEN 'incident_candidates.created_at' END,
            CASE WHEN (SELECT count(*) FROM "KnowledgeEvidence" ke WHERE ke."incidentId" = ki.id)
                   <> (SELECT count(*) FROM evidence.evidence_records er WHERE er.legacy_source = 'KnowledgeEvidence'
                         AND er.legacy_record_id IN (SELECT ke2.id FROM "KnowledgeEvidence" ke2 WHERE ke2."incidentId" = ki.id)) THEN 'relation:evidence.evidence_records' END
          ], NULL) AS mismatched_fields
        FROM "KnowledgeIncident" ki
        LEFT JOIN incident.incidents i ON i.legacy_source = 'KnowledgeIncident' AND i.legacy_record_id = ki.id
        LEFT JOIN incident.incident_candidates c ON c.legacy_source = 'KnowledgeIncident' AND c.legacy_record_id = ki.id
        LEFT JOIN migration_meta.legacy_status_mapping mv
          ON mv.source_table = 'KnowledgeIncident' AND mv.source_status_value = lower(ki."verificationStatus") AND mv.target_dimension = 'verification_status'
        LEFT JOIN migration_meta.legacy_status_mapping mo
          ON mo.source_table = 'KnowledgeIncident' AND mo.source_status_value = lower(COALESCE(ki.status, 'detected')) AND mo.target_dimension = 'operational_status'
        WHERE $1::text[] IS NULL OR ki.id = ANY($1::text[])
      )
      SELECT legacy_id, 'MIGRATED' AS expected,
        CASE
          WHEN expect_candidate AND has_candidate AND NOT has_incident THEN 'MIGRATED'
          WHEN NOT expect_candidate AND has_incident AND NOT has_candidate THEN 'MIGRATED'
          WHEN has_incident OR has_candidate THEN 'PARTIAL'
          ELSE 'NONE'
        END AS actual,
        CASE
          WHEN expect_candidate AND has_incident THEN array_append(mismatched_fields, 'disposition:expected_candidate_found_incident')
          WHEN NOT expect_candidate AND has_candidate AND NOT has_incident THEN array_append(mismatched_fields, 'disposition:expected_incident_found_candidate')
          ELSE mismatched_fields
        END AS mismatched_fields,
        CASE WHEN expect_candidate THEN 'incident.incident_candidates' ELSE 'incident.incidents' END AS detail
      FROM cmp`,
    orphanSql: [
      orphanSql("incident.incidents", "KnowledgeIncident", "KnowledgeIncident"),
      orphanSql("incident.incident_candidates", "KnowledgeIncident", "KnowledgeIncident"),
    ],
  },
  {
    domain: "IncidentTransition",
    legacyTable: "IncidentTransition",
    unmappedLegacyColumns: [
      "previousSeverity/newSeverity (no target severity dimension)",
      "reason",
      "actorId (actor class was never recorded; migrated rows carry the documented AUTOMATION_RULE nil actor)",
    ],
    comparisonSql: `
      WITH cmp AS (
        SELECT it.id AS legacy_id,
          (it."newStatus" IS NOT NULL AND i.id IS NOT NULL) AS expect_migrated,
          t.id IS NOT NULL AS has_row,
          d.legacy_record_id IS NOT NULL AS has_deferral,
          d.reason AS deferral_reason,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN t.id IS NOT NULL AND t.occurred_at IS DISTINCT FROM (it."createdAt" AT TIME ZONE 'UTC') THEN 'incident_transitions.occurred_at' END,
            CASE WHEN t.id IS NOT NULL AND t.new_value IS DISTINCT FROM COALESCE(mn.target_value, it."newStatus") THEN 'incident_transitions.new_value' END,
            CASE WHEN t.id IS NOT NULL AND t.previous_value IS DISTINCT FROM COALESCE(mp.target_value, it."previousStatus") THEN 'incident_transitions.previous_value' END,
            CASE WHEN t.id IS NOT NULL AND t.incident_id IS DISTINCT FROM i.id THEN 'relation:incident_transitions.incident_id' END
          ], NULL) AS mismatched_fields
        FROM "IncidentTransition" it
        LEFT JOIN incident.incidents i ON i.legacy_source = 'KnowledgeIncident' AND i.legacy_record_id = it."incidentId"
        LEFT JOIN incident.incident_transitions t ON t.legacy_source = 'IncidentTransition' AND t.legacy_record_id = it.id
        LEFT JOIN migration_meta.legacy_deferred_rows d ON d.source_table = 'IncidentTransition' AND d.legacy_record_id = it.id
        LEFT JOIN migration_meta.legacy_status_mapping mp ON mp.source_table = 'KnowledgeIncident' AND mp.source_status_value = lower(it."previousStatus") AND mp.target_dimension = 'operational_status'
        LEFT JOIN migration_meta.legacy_status_mapping mn ON mn.source_table = 'KnowledgeIncident' AND mn.source_status_value = lower(it."newStatus") AND mn.target_dimension = 'operational_status'
        WHERE $1::text[] IS NULL OR it.id = ANY($1::text[])
      )
      SELECT legacy_id,
        CASE WHEN expect_migrated THEN 'MIGRATED' ELSE 'DEFERRED' END AS expected,
        CASE WHEN has_row THEN 'MIGRATED' WHEN has_deferral THEN 'DEFERRED' ELSE 'NONE' END AS actual,
        mismatched_fields, deferral_reason AS detail
      FROM cmp`,
    orphanSql: [
      orphanSql("incident.incident_transitions", "IncidentTransition", "IncidentTransition"),
      deferredOrphanSql("IncidentTransition", "IncidentTransition"),
    ],
  },
  {
    domain: "HelpRequest",
    legacyTable: "HelpRequest",
    unmappedLegacyColumns: [
      "category",
      "title",
      "description",
      "latitude/longitude",
      "locationText",
      "priority",
      "restrictedMode",
      "aiSummary/aiRecommendation/aiConfidence",
    ],
    comparisonSql: `
      WITH cmp AS (
        SELECT hr.id AS legacy_id,
          (p.id IS NOT NULL AND COALESCE(m.target_value, 'RECEIVED') NOT IN ('RESOLVED','CLOSED')) AS expect_migrated,
          h.id IS NOT NULL AS has_row,
          d.legacy_record_id IS NOT NULL AS has_deferral,
          d.reason AS deferral_reason,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN h.id IS NOT NULL AND h.status::text IS DISTINCT FROM COALESCE(m.target_value, 'RECEIVED') THEN 'help_requests.status' END,
            CASE WHEN h.id IS NOT NULL AND h.legacy_status IS DISTINCT FROM hr.status THEN 'help_requests.legacy_status' END,
            CASE WHEN h.id IS NOT NULL AND h.created_at IS DISTINCT FROM (hr."createdAt" AT TIME ZONE 'UTC') THEN 'help_requests.created_at' END,
            CASE WHEN h.id IS NOT NULL AND h.requester_person_id IS DISTINCT FROM p.id THEN 'relation:help_requests.requester_person_id' END,
            CASE WHEN h.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM help.affected_people ap WHERE ap.legacy_source = 'HelpRequest' AND ap.legacy_record_id = hr.id) THEN 'relation:help.affected_people' END
          ], NULL) AS mismatched_fields
        FROM "HelpRequest" hr
        LEFT JOIN identity.people p ON p.legacy_source = 'User' AND p.legacy_record_id = hr."userId"
        LEFT JOIN migration_meta.legacy_status_mapping m
          ON m.source_table = 'HelpRequest' AND m.target_dimension = 'status' AND m.source_status_value = lower(hr.status)
        LEFT JOIN help.help_requests h ON h.legacy_source = 'HelpRequest' AND h.legacy_record_id = hr.id
        LEFT JOIN migration_meta.legacy_deferred_rows d ON d.source_table = 'HelpRequest' AND d.legacy_record_id = hr.id
        WHERE $1::text[] IS NULL OR hr.id = ANY($1::text[])
      )
      SELECT legacy_id,
        CASE WHEN expect_migrated THEN 'MIGRATED' ELSE 'DEFERRED' END AS expected,
        CASE WHEN has_row THEN 'MIGRATED' WHEN has_deferral THEN 'DEFERRED' ELSE 'NONE' END AS actual,
        mismatched_fields, deferral_reason AS detail
      FROM cmp`,
    orphanSql: [
      orphanSql("help.help_requests", "HelpRequest", "HelpRequest"),
      orphanSql("help.affected_people", "HelpRequest", "HelpRequest"),
      deferredOrphanSql("HelpRequest", "HelpRequest"),
    ],
  },
  {
    domain: "CriticalPoi",
    legacyTable: "CriticalPoi",
    unmappedLegacyColumns: [
      "name",
      "category/priority (the D-06 classifier inputs, kept in the review queue)",
      "latitude/longitude (geo.* is Ola 8)",
      "address/city/adminLevel1/adminLevel2/countryCode",
      "confidence",
      "lastSeenAt/lastVerifiedAt",
      "tagsJson/sourceUrl/isPersistent/isVisibleByDefault",
    ],
    comparisonSql: `
      WITH cmp AS (
        SELECT cp.id AS legacy_id,
          EXISTS (SELECT 1 FROM "CriticalPoiOperationalStatus" cos WHERE cos."poiId" = cp.id) AS has_op,
          r.id IS NOT NULL AS in_route_a,
          f.id IS NOT NULL AS has_facility,
          q.id IS NOT NULL AS in_queue,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN r.id IS NOT NULL AND r.status::text IS DISTINCT FROM (CASE lower(cp.status) WHEN 'active' THEN 'AVAILABLE' ELSE 'UNAVAILABLE' END) THEN 'resources.status' END,
            CASE WHEN r.id IS NOT NULL AND r.created_at IS DISTINCT FROM (cp."createdAt" AT TIME ZONE 'UTC') THEN 'resources.created_at' END,
            CASE WHEN f.id IS NOT NULL AND f.capacity_total IS DISTINCT FROM (SELECT COALESCE(cos."capacityTotal", cos."capacityDeclared", 0) FROM "CriticalPoiOperationalStatus" cos WHERE cos."poiId" = cp.id) THEN 'facilities.capacity_total' END,
            CASE WHEN f.id IS NOT NULL AND f.occupancy_current IS DISTINCT FROM (SELECT COALESCE(cos."occupancyCurrent", 0) FROM "CriticalPoiOperationalStatus" cos WHERE cos."poiId" = cp.id) THEN 'facilities.occupancy_current' END,
            CASE WHEN r.id IS NOT NULL AND f.id IS NULL THEN 'relation:resource.facilities' END,
            CASE WHEN q.id IS NOT NULL AND q.poi_category IS DISTINCT FROM cp.category THEN 'critical_poi_review_queue.poi_category' END
          ], NULL) AS mismatched_fields
        FROM "CriticalPoi" cp
        LEFT JOIN resource.resources r ON r.legacy_source = 'CriticalPoi' AND r.legacy_record_id = cp.id
        LEFT JOIN resource.facilities f ON f.legacy_source = 'CriticalPoi' AND f.legacy_record_id = cp.id
        LEFT JOIN migration_meta.critical_poi_review_queue q ON q.critical_poi_id = cp.id
        WHERE $1::text[] IS NULL OR cp.id = ANY($1::text[])
      )
      SELECT legacy_id,
        CASE WHEN has_op THEN 'MIGRATED' ELSE 'QUEUE' END AS expected,
        CASE WHEN in_route_a THEN 'MIGRATED' WHEN in_queue THEN 'QUEUE' ELSE 'NONE' END AS actual,
        mismatched_fields,
        CASE WHEN NOT has_op THEN 'D-06' END AS detail
      FROM cmp`,
    orphanSql: [
      orphanSql("resource.resources", "CriticalPoi", "CriticalPoi"),
      orphanSql("resource.facilities", "CriticalPoi", "CriticalPoi"),
      `SELECT q.critical_poi_id AS legacy_id, 'QUEUE' AS disposition
       FROM migration_meta.critical_poi_review_queue q
       WHERE NOT EXISTS (SELECT 1 FROM "CriticalPoi" cp WHERE cp.id = q.critical_poi_id)`,
    ],
  },
  {
    domain: "CriticalPoiStatusEvidence",
    legacyTable: "CriticalPoiStatusEvidence",
    unmappedLegacyColumns: ["every column: the whole table waits on D-06's route decision"],
    comparisonSql: `
      SELECT cse.id AS legacy_id, 'DEFERRED' AS expected,
        CASE WHEN d.legacy_record_id IS NOT NULL THEN 'DEFERRED' ELSE 'NONE' END AS actual,
        ARRAY[]::text[] AS mismatched_fields, d.reason AS detail
      FROM "CriticalPoiStatusEvidence" cse
      LEFT JOIN migration_meta.legacy_deferred_rows d ON d.source_table = 'CriticalPoiStatusEvidence' AND d.legacy_record_id = cse.id
      WHERE $1::text[] IS NULL OR cse.id = ANY($1::text[])`,
    orphanSql: [deferredOrphanSql("CriticalPoiStatusEvidence", "CriticalPoiStatusEvidence")],
  },
  {
    domain: "RiskAssessment",
    legacyTable: "RiskAssessment",
    unmappedLegacyColumns: ["riskType beyond the hazard match (T-09)", "scope/score columns"],
    comparisonSql: `
      WITH cmp AS (
        SELECT ra.id AS legacy_id,
          EXISTS (SELECT 1 FROM governance.hazard_types ht WHERE upper(ht.code) = upper(ra."riskType")) AS expect_migrated,
          t.id IS NOT NULL AS has_row,
          d.legacy_record_id IS NOT NULL AS has_deferral,
          d.reason AS deferral_reason,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN t.id IS NOT NULL AND t.status::text IS DISTINCT FROM (CASE WHEN lower(ra.status) = 'active' THEN 'ACTIVE' ELSE 'REVISED' END) THEN 'risk_assessments.status' END,
            CASE WHEN t.id IS NOT NULL AND t.created_at IS DISTINCT FROM (ra."createdAt" AT TIME ZONE 'UTC') THEN 'risk_assessments.created_at' END,
            CASE WHEN t.id IS NOT NULL AND t.legacy_status IS DISTINCT FROM ra.status THEN 'risk_assessments.legacy_status' END
          ], NULL) AS mismatched_fields
        FROM "RiskAssessment" ra
        LEFT JOIN risk.risk_assessments t ON t.legacy_source = 'RiskAssessment' AND t.legacy_record_id = ra.id
        LEFT JOIN migration_meta.legacy_deferred_rows d ON d.source_table = 'RiskAssessment' AND d.legacy_record_id = ra.id
        WHERE $1::text[] IS NULL OR ra.id = ANY($1::text[])
      )
      SELECT legacy_id,
        CASE WHEN expect_migrated THEN 'MIGRATED' ELSE 'DEFERRED' END AS expected,
        CASE WHEN has_row THEN 'MIGRATED' WHEN has_deferral THEN 'DEFERRED' ELSE 'NONE' END AS actual,
        mismatched_fields, deferral_reason AS detail
      FROM cmp`,
    orphanSql: [
      orphanSql("risk.risk_assessments", "RiskAssessment", "RiskAssessment"),
      deferredOrphanSql("RiskAssessment", "RiskAssessment"),
    ],
  },
  {
    domain: "RiskAssessmentRevision",
    legacyTable: "RiskAssessmentRevision",
    unmappedLegacyColumns: ["previousStatus/newStatus/reason/evidence (kept inside content_snapshot)"],
    comparisonSql: `
      WITH cmp AS (
        SELECT rar.id AS legacy_id,
          (ra.id IS NOT NULL) AS expect_migrated,
          t.id IS NOT NULL AS has_row,
          d.legacy_record_id IS NOT NULL AS has_deferral,
          d.reason AS deferral_reason,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN t.id IS NOT NULL AND t.created_at IS DISTINCT FROM (rar."createdAt" AT TIME ZONE 'UTC') THEN 'risk_assessment_revisions.created_at' END,
            CASE WHEN t.id IS NOT NULL AND t.risk_assessment_id IS DISTINCT FROM ra.id THEN 'relation:risk_assessment_revisions.risk_assessment_id' END
          ], NULL) AS mismatched_fields
        FROM "RiskAssessmentRevision" rar
        LEFT JOIN risk.risk_assessments ra ON ra.legacy_source = 'RiskAssessment' AND ra.legacy_record_id = rar."assessmentId"
        LEFT JOIN risk.risk_assessment_revisions t ON t.legacy_source = 'RiskAssessmentRevision' AND t.legacy_record_id = rar.id
        LEFT JOIN migration_meta.legacy_deferred_rows d ON d.source_table = 'RiskAssessmentRevision' AND d.legacy_record_id = rar.id
        WHERE $1::text[] IS NULL OR rar.id = ANY($1::text[])
      )
      SELECT legacy_id,
        CASE WHEN expect_migrated THEN 'MIGRATED' ELSE 'DEFERRED' END AS expected,
        CASE WHEN has_row THEN 'MIGRATED' WHEN has_deferral THEN 'DEFERRED' ELSE 'NONE' END AS actual,
        mismatched_fields, deferral_reason AS detail
      FROM cmp`,
    orphanSql: [
      orphanSql("risk.risk_assessment_revisions", "RiskAssessmentRevision", "RiskAssessmentRevision"),
      deferredOrphanSql("RiskAssessmentRevision", "RiskAssessmentRevision"),
    ],
  },
];

export const DUAL_READ_DOMAINS = SPECS.map((spec) => spec.domain);

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

interface ComparisonRow {
  legacy_id: string;
  expected: string;
  actual: string;
  mismatched_fields: string[] | null;
  detail: string | null;
}

interface OrphanRow {
  legacy_id: string;
  disposition: string;
}

interface ReadOnlyClientLike {
  $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T[]>;
  $transaction?: <T>(fn: (tx: ReadOnlyClientLike) => Promise<T>) => Promise<T>;
}

export interface DualReadDeps {
  env?: FlagEnvSource;
  getClient?: () => Promise<ReadOnlyClientLike>;
  /** Cap on the divergence rows carried in the report (the counts are always complete). Default 50. */
  maxRowsReported?: number;
}

async function defaultGetClient(env: FlagEnvSource): Promise<ReadOnlyClientLike> {
  const mod = await import("../client/targetPrismaClient");
  const client = await mod.getTargetPrismaClient({ env: env as Record<string, string | undefined> });
  return client as unknown as ReadOnlyClientLike;
}

function classify(row: ComparisonRow): DualReadRowResult {
  const fields = row.mismatched_fields ?? [];
  const expected = row.expected;
  const actual = row.actual;

  if (actual === "NONE") {
    // Expected in the target and absent = real loss. Expected deferred and not
    // even recorded as deferred = also a gap, and a worse one: nothing anywhere
    // says why the row is missing.
    return {
      domain: "",
      legacyId: row.legacy_id,
      outcome: "MISSING_TARGET",
      disposition: null,
      mismatchedFields: expected === "MIGRATED" ? fields : [...fields, "disposition:no_deferral_recorded"],
      detail: row.detail,
    };
  }
  if (expected !== actual) {
    return {
      domain: "",
      legacyId: row.legacy_id,
      outcome: "VALUE_MISMATCH",
      disposition: actual,
      mismatchedFields: [...fields, `disposition:expected_${expected}_actual_${actual}`],
      detail: row.detail,
    };
  }
  if (fields.length > 0) {
    return {
      domain: "",
      legacyId: row.legacy_id,
      outcome: "VALUE_MISMATCH",
      disposition: actual,
      mismatchedFields: fields,
      detail: row.detail,
    };
  }
  return {
    domain: "",
    legacyId: row.legacy_id,
    outcome: expected === "MIGRATED" ? "MATCH" : "DEFERRED_EXPECTED",
    disposition: actual,
    mismatchedFields: [],
    detail: row.detail,
  };
}

function safeErrorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const candidate = err as { code?: unknown; name?: unknown };
    if (typeof candidate.code === "string" && candidate.code.length > 0) return candidate.code;
    if (typeof candidate.name === "string" && candidate.name.length > 0) return candidate.name;
  }
  return "UNKNOWN_ERROR";
}

/** Runs `fn` with the connection in a READ ONLY transaction whenever the client supports one. */
async function inReadOnlyTransaction<T>(
  client: ReadOnlyClientLike,
  fn: (tx: ReadOnlyClientLike) => Promise<T>
): Promise<T> {
  if (typeof client.$transaction !== "function") {
    // No interactive transaction available (a test double): still assert
    // read-only at the statement level so a write would fail.
    await client.$queryRawUnsafe("SET TRANSACTION READ ONLY").catch(() => undefined);
    return fn(client);
  }
  return client.$transaction(async (tx) => {
    await tx.$queryRawUnsafe("SET TRANSACTION READ ONLY");
    return fn(tx);
  });
}

/**
 * Compares one domain. `legacyIds` null/undefined compares every legacy row
 * (the reconciliation pass); a list compares just those rows (the per-request
 * dual read).
 */
export async function dualReadDomain(
  domain: string,
  legacyIds: readonly string[] | null,
  deps: DualReadDeps = {}
): Promise<DualReadDomainReport> {
  const env = deps.env ?? (process.env as FlagEnvSource);
  const startedAt = Date.now();
  const spec = SPECS.find((candidate) => candidate.domain === domain);
  if (!spec) {
    throw new Error(`dualReadDomain: unknown domain ${JSON.stringify(domain)} — add a spec instead of guessing one`);
  }

  const base: DualReadDomainReport = {
    domain,
    status: "COMPLETED",
    legacyRows: 0,
    counts: ZERO_COUNTS(),
    unmappedLegacyColumns: spec.unmappedLegacyColumns,
    divergences: [],
    errorCode: null,
    durationMs: 0,
  };

  // Dual-read needs BOTH flags: reading the target at all is gated by
  // targetDatabaseRead, and comparing is gated by targetDatabaseDualRead.
  // Either one off = no target access whatsoever (fail closed).
  if (!isDualReadEnabled(env)) {
    return { ...base, status: "SKIPPED_FLAG_OFF", durationMs: Date.now() - startedAt };
  }

  const maxRows = deps.maxRowsReported ?? 50;
  try {
    const client = deps.getClient ? await deps.getClient() : await defaultGetClient(env);
    const ids = legacyIds && legacyIds.length > 0 ? [...legacyIds] : null;

    const { comparisons, orphans } = await inReadOnlyTransaction(client, async (tx) => {
      const comparisonRows = await tx.$queryRawUnsafe<ComparisonRow>(spec.comparisonSql, ids);
      const orphanRows: OrphanRow[] = [];
      // Orphan scans are whole-table by nature (a target row whose legacy row
      // is gone cannot be found by legacy id) and only run in a full pass.
      if (ids === null) {
        for (const sql of spec.orphanSql) {
          orphanRows.push(...(await tx.$queryRawUnsafe<OrphanRow>(sql)));
        }
      }
      return { comparisons: comparisonRows, orphans: orphanRows };
    });

    const counts = ZERO_COUNTS();
    const divergences: DualReadRowResult[] = [];
    for (const raw of comparisons) {
      const result = { ...classify(raw), domain };
      counts[result.outcome] += 1;
      // Only divergences are logged per row. A full pass compares tens of
      // thousands of rows; one line each would bury the findings it exists to
      // surface. The MATCH/DEFERRED_EXPECTED totals still ship, in
      // `dual_read_run_total` and in the returned report.
      if (result.outcome !== "MATCH" && result.outcome !== "DEFERRED_EXPECTED") {
        recordDualReadComparison({ domain, outcome: result.outcome });
      }
      for (const field of result.mismatchedFields) {
        recordDualReadFieldDivergence({ domain, field });
      }
      if (result.outcome !== "MATCH" && result.outcome !== "DEFERRED_EXPECTED" && divergences.length < maxRows) {
        divergences.push(result);
      }
    }

    const seenOrphans = new Set<string>();
    for (const orphan of orphans) {
      if (seenOrphans.has(orphan.legacy_id)) continue;
      seenOrphans.add(orphan.legacy_id);
      counts.MISSING_LEGACY += 1;
      recordDualReadComparison({ domain, outcome: "MISSING_LEGACY" });
      if (divergences.length < maxRows) {
        divergences.push({
          domain,
          legacyId: orphan.legacy_id,
          outcome: "MISSING_LEGACY",
          disposition: orphan.disposition,
          mismatchedFields: ["legacy row no longer exists"],
          detail: null,
        });
      }
    }

    const divergenceCount = counts.MISSING_TARGET + counts.MISSING_LEGACY + counts.VALUE_MISMATCH;
    const durationMs = Date.now() - startedAt;
    recordDualReadRun({ domain, compared: comparisons.length, divergences: divergenceCount, durationMs });

    return {
      ...base,
      legacyRows: comparisons.length,
      counts,
      divergences,
      durationMs,
    };
  } catch (err) {
    const errorCode = safeErrorCode(err);
    recordDualReadFailure({ domain, errorCode });
    return { ...base, status: "FAILED", errorCode, durationMs: Date.now() - startedAt };
  }
}

/** The full reconciliation matrix: every domain, every legacy row. */
export async function dualReadAllDomains(deps: DualReadDeps = {}): Promise<DualReadReport> {
  const domains: DualReadDomainReport[] = [];
  for (const spec of SPECS) {
    domains.push(await dualReadDomain(spec.domain, null, deps));
  }
  const totals = ZERO_COUNTS();
  for (const report of domains) {
    for (const key of Object.keys(totals) as DualReadOutcome[]) {
      totals[key] += report.counts[key];
    }
  }
  const reconciled =
    domains.every((report) => report.status === "COMPLETED") &&
    totals.MISSING_TARGET === 0 &&
    totals.MISSING_LEGACY === 0 &&
    totals.VALUE_MISMATCH === 0;
  return { domains, totals, reconciled };
}

/**
 * The read-path hook: observe a dual read for the rows a legacy read just
 * returned. Never throws, never returns anything to the caller's response —
 * the caller's own legacy payload is already built and is not touched.
 */
export async function observeDualRead(
  domain: string,
  legacyIds: readonly string[],
  deps: DualReadDeps = {}
): Promise<DualReadDomainReport | null> {
  if (legacyIds.length === 0) return null;
  try {
    return await dualReadDomain(domain, legacyIds, deps);
  } catch {
    return null;
  }
}
