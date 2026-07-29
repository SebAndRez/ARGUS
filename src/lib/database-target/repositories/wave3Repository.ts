/**
 * src/lib/database-target/repositories/wave3Repository.ts
 *
 * Real, idempotent target repositories for Ola 3 (Fase 9 of the wave-3
 * mandate), backed by the isolated target Prisma client
 * (`client/targetPrismaClient.ts`). Development/tests only — never
 * imported by production runtime code, never reachable without an
 * explicit local `TARGET_DATABASE_URL`.
 *
 * ## A real, newly-discovered blocker this module works around
 *
 * Running wave 030/040 against a real local Postgres (Fase 11) surfaced a
 * PRE-EXISTING drift between `prisma/schema.target.prisma` (this package's
 * TS layer is grounded in that file, which cites the v1.1_FROZEN physical
 * catalogs as its authority) and the actually-applied
 * `prisma/target-migrations/{030,040}/migration.sql` DDL, which is
 * self-marked throughout as `VERIFY_AGAINST_V1.0`/`HUMAN REVIEW REQUIRED`
 * ("reconstructed from cross-referenced clues... since the v1.0 ficha
 * source is not available in this session"). Confirmed mismatches include
 * (non-exhaustive): `ingest.source_connectors.connector_kind` (real column,
 * NOT NULL, absent from the Prisma model); `ingest.ingestion_runs.origin_kind`
 * (real, NOT NULL, CHECK'd against `('EXTERNAL_EVENT_PIPELINE',
 * 'GLOBAL_WATCH_PIPELINE')`, absent from the Prisma model);
 * `ingest.source_record_origin_enum`/`evidence.observation_origin_enum`/
 * `evidence.report_author_type_enum`/`evidence.observation_verification_status_enum`/
 * `evidence.evidence_origin_enum`/`incident.incident_candidate_status_enum`
 * all use DIFFERENT VALUE SETS in migration.sql than in schema.target.prisma;
 * `evidence.evidence_records` has `content_summary`/`structured_content`
 * instead of `chain_of_custody`/`license_terms`/`consent_id`;
 * `evidence.evidence_assets` has `asset_uri` (no `content_hash` column);
 * `incident.incident_candidates` has `opened_at`/`closed_at` instead of
 * `correlation_key`/`classification`/`promotion_started_at`/`created_at`.
 *
 * Reconciling migration.sql itself against schema.target.prisma is a
 * substantial, separate effort spanning 17 tables across 2 waves, requires
 * the human review its own comments already call for, and is out of scope
 * for wave-3 shadow-mode implementation. This repository module is
 * therefore the explicit, documented TRANSLATION BOUNDARY: every function
 * below takes the clean, wave-3-transformer-produced TS value (grounded in
 * schema.target.prisma, the higher-authority source) and maps it onto the
 * REAL, currently-applied columns/enum values via raw parameterized SQL
 * (Prisma's generated model client can't be used here — its input types
 * are generated from schema.target.prisma and reject columns/enum values
 * the real, drifted table actually requires). Every translation is
 * documented inline. Nothing here is silently dropped without a comment
 * explaining why the real table has no equivalent column.
 *
 * PostGIS `geography` columns (e.g. `evidence.observations.location`) are
 * left NULL by this module — valid (nullable column), and out of scope for
 * this pass (would require a raw `ST_MakePoint` follow-up).
 *
 * No binary storage: `evidence_assets.asset_uri` is a metadata reference
 * only — this module never touches Supabase Storage or writes bytes to
 * Postgres.
 */

import type { TargetPrismaClientLike } from "../client/targetPrismaClient";
import type { Wave3PersistResult } from "../shadow-write/wave3ShadowWriteRunner";
import type { Source, Connector, IngestionRun, SourceRecord } from "../ingest";
import type { Observation, EvidenceRecord, EvidenceAsset } from "../evidence";
import type { IncidentCandidate } from "../incident";
import { uuidFromSeed } from "./deterministicId";

interface RawSqlClient {
  $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T[]>;
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
}

function raw(client: TargetPrismaClientLike): RawSqlClient {
  return client as unknown as RawSqlClient;
}

async function findExistingId(client: TargetPrismaClientLike, table: string, id: string): Promise<boolean> {
  const rows = await raw(client).$queryRawUnsafe<{ id: string }>(`SELECT id FROM ${table} WHERE id = $1::uuid`, id);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Enum-value translations: clean TS value -> real, currently-applied DB value.
// ---------------------------------------------------------------------------

const REAL_INGESTION_RUN_STATUS: Record<IngestionRun["status"], string> = {
  RUNNING: "RUNNING",
  COMPLETED: "SUCCEEDED",
  FAILED: "FAILED",
};

/** `ingest.source_record_origin_enum` real values: AUTOMATED_FEED/MANUAL_UPLOAD/API_PULL (retrieval-method taxonomy) vs the clean `SourceRecordOrigin` (logical-origin taxonomy: EXTERNAL_EVENT/DIRECT_CAPTURE/DERIVED). Mapped by closest retrieval-method equivalent. */
const REAL_SOURCE_RECORD_ORIGIN: Record<SourceRecord["originKind"], string> = {
  EXTERNAL_EVENT: "AUTOMATED_FEED",
  DIRECT_CAPTURE: "MANUAL_UPLOAD",
  DERIVED: "API_PULL",
};

/** `evidence.observation_origin_enum` real values: CITIZEN_REPORT/AUTOMATED_INGESTION vs the clean `OriginType` PRIMARY/DERIVED. A citizen-authored row (`authorType === 'CITIZEN'`) maps to CITIZEN_REPORT; everything else to AUTOMATED_INGESTION. */
function realObservationOrigin(observation: Observation): string {
  return observation.authorType === "CITIZEN" ? "CITIZEN_REPORT" : "AUTOMATED_INGESTION";
}

/** `evidence.report_author_type_enum` real values: CITIZEN/PROFESSIONAL/SYSTEM vs the clean `ReportAuthorType` CITIZEN/PROFESSIONAL/INSTITUTIONAL. INSTITUTIONAL -> SYSTEM (closest). */
const REAL_AUTHOR_TYPE: Record<NonNullable<Observation["authorType"]>, string> = {
  CITIZEN: "CITIZEN",
  PROFESSIONAL: "PROFESSIONAL",
  INSTITUTIONAL: "SYSTEM",
};

/** `evidence.observation_verification_status_enum` real values: UNVERIFIED/PENDING/VERIFIED/DISPUTED vs the clean `ObservationVerificationStatus` UNVERIFIED/PARTIALLY_VERIFIED/VERIFIED/REFUTED. */
const REAL_VERIFICATION_STATUS: Record<Observation["verificationStatus"], string> = {
  UNVERIFIED: "UNVERIFIED",
  PARTIALLY_VERIFIED: "PENDING",
  VERIFIED: "VERIFIED",
  REFUTED: "DISPUTED",
};

/** `evidence.evidence_origin_enum` real values: INTERNAL/EXTERNAL vs the clean `OriginType` PRIMARY/DERIVED. */
const REAL_EVIDENCE_ORIGIN: Record<EvidenceRecord["originType"], string> = {
  PRIMARY: "INTERNAL",
  DERIVED: "EXTERNAL",
};

/** `incident.incident_candidate_status_enum` real values: OPEN/CORRELATING/PROMOTED/DISCARDED vs the clean `IncidentCandidateStatus` UNDER_ASSESSMENT/PROMOTING/PROMOTED/DISCARDED. */
const REAL_CANDIDATE_STATUS: Record<IncidentCandidate["status"], string> = {
  UNDER_ASSESSMENT: "OPEN",
  PROMOTING: "CORRELATING",
  PROMOTED: "PROMOTED",
  DISCARDED: "DISCARDED",
};

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

/** Ensures at least one `ingest.providers` row exists for a given stable name — never invents an `institution.organizations` row (D-01). */
export async function upsertProvider(
  client: TargetPrismaClientLike,
  input: { name: string; organizationId?: string | null }
): Promise<Wave3PersistResult<string>> {
  const id = uuidFromSeed(`Provider:${input.name}`);
  if (await findExistingId(client, "ingest.providers", id)) return { targetId: id, created: false };
  await raw(client).$executeRawUnsafe(
    `INSERT INTO ingest.providers (id, name, organization_id, status) VALUES ($1::uuid, $2, $3::uuid, 'ACTIVE'::ingest.provider_status_enum)`,
    id,
    input.name,
    input.organizationId ?? null
  );
  return { targetId: id, created: true };
}

export async function upsertSource(
  client: TargetPrismaClientLike,
  target: Source,
  idempotencyKey: string
): Promise<Wave3PersistResult<string>> {
  const id = uuidFromSeed(idempotencyKey);
  if (await findExistingId(client, "ingest.sources", id)) return { targetId: id, created: false };
  await raw(client).$executeRawUnsafe(
    `INSERT INTO ingest.sources (id, name, provider_id, endpoint_signature, status, created_at) VALUES ($1::uuid, $2, $3::uuid, $4, $5::ingest.source_status_enum, now())`,
    id,
    target.name,
    target.providerId || null,
    target.endpointSignature,
    target.status
  );
  return { targetId: id, created: true };
}

/** `connectorKind` has no equivalent on the clean `Connector` TS type (schema.target.prisma has no such column) — the real table requires one; `"GENERIC_HTTP"` is a documented, stable placeholder, never a per-row-varying invented value. */
export async function upsertConnector(
  client: TargetPrismaClientLike,
  target: Connector,
  idempotencyKey: string
): Promise<Wave3PersistResult<string>> {
  const id = uuidFromSeed(idempotencyKey);
  if (await findExistingId(client, "ingest.source_connectors", id)) return { targetId: id, created: false };
  await raw(client).$executeRawUnsafe(
    `INSERT INTO ingest.source_connectors (id, source_id, connector_kind, status, config) VALUES ($1::uuid, $2::uuid, $3, $4::ingest.connector_status_enum, $5::jsonb)`,
    id,
    target.sourceId,
    "GENERIC_HTTP",
    target.status,
    JSON.stringify(target.config)
  );
  return { targetId: id, created: true };
}

/** `origin_kind` has no equivalent on the clean `IngestionRun` TS type — derived here from `legacySource` ("KnowledgeIngestionRun" -> GLOBAL_WATCH_PIPELINE; anything else, including "IngestionRun" -> EXTERNAL_EVENT_PIPELINE), matching the real CHECK constraint's 2 allowed values. */
export async function upsertIngestionRun(
  client: TargetPrismaClientLike,
  target: IngestionRun,
  idempotencyKey: string
): Promise<Wave3PersistResult<string>> {
  const id = uuidFromSeed(idempotencyKey);
  if (await findExistingId(client, "ingest.ingestion_runs", id)) return { targetId: id, created: false };
  const originKind = target.legacySource === "KnowledgeIngestionRun" ? "GLOBAL_WATCH_PIPELINE" : "EXTERNAL_EVENT_PIPELINE";
  await raw(client).$executeRawUnsafe(
    `INSERT INTO ingest.ingestion_runs (id, source_id, origin_kind, status, started_at, finished_at, legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status)
     VALUES ($1::uuid, $2::uuid, $3, $4::ingest.ingestion_run_status_enum, $5::timestamptz, $6::timestamptz, $7, $8, $9, $10, $11)`,
    id,
    target.sourceId,
    originKind,
    REAL_INGESTION_RUN_STATUS[target.status],
    target.startedAt,
    target.completedAt,
    target.legacyStatus ?? null,
    target.legacySource ?? null,
    target.legacyRecordId ?? null,
    target.migrationConfidence ?? null,
    target.migrationReviewStatus ?? null
  );
  return { targetId: id, created: true };
}

export async function upsertSourceRecord(
  client: TargetPrismaClientLike,
  target: SourceRecord,
  idempotencyKey: string
): Promise<Wave3PersistResult<string>> {
  const id = uuidFromSeed(idempotencyKey);
  if (await findExistingId(client, "ingest.source_records", id)) return { targetId: id, created: false };
  await raw(client).$executeRawUnsafe(
    `INSERT INTO ingest.source_records (id, source_id, ingestion_run_id, origin, external_id, raw_content, legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status, received_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::ingest.source_record_origin_enum, $5, $6::jsonb, $7, $8, $9, $10, $11, $12::timestamptz)`,
    id,
    target.sourceId,
    target.ingestionRunId,
    REAL_SOURCE_RECORD_ORIGIN[target.originKind],
    target.externalId,
    JSON.stringify(target.rawContent),
    target.legacyStatus ?? null,
    target.legacySource ?? null,
    target.legacyRecordId ?? null,
    target.migrationConfidence ?? null,
    target.migrationReviewStatus ?? null,
    target.receivedAt
  );
  return { targetId: id, created: true };
}

/** Shared by Report/PrimaryObservation/Observation/TelecomConnectivityStatus-derived rows — all physically the same `evidence.observations` table. `location` is intentionally never set (see file header). */
export async function upsertObservation(
  client: TargetPrismaClientLike,
  target: Observation,
  idempotencyKey: string
): Promise<Wave3PersistResult<string>> {
  const id = uuidFromSeed(idempotencyKey);
  if (await findExistingId(client, "evidence.observations", id)) return { targetId: id, created: false };
  await raw(client).$executeRawUnsafe(
    `INSERT INTO evidence.observations
       (id, origin_type, author_type, author_person_id, source_record_id, claim_text, claim_structured, claim_schema_version, provenance, provenance_schema_version, occurred_at, reported_at, verification_status, confidence_level, legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status, created_at)
     VALUES ($1::uuid, $2::evidence.observation_origin_enum, $3::evidence.report_author_type_enum, $4::uuid, $5::uuid, $6, $7::jsonb, $8, $9::jsonb, $10, $11::timestamptz, $12::timestamptz, $13::evidence.observation_verification_status_enum, $14::evidence.confidence_level_enum, $15, $16, $17, $18, $19, now())`,
    id,
    realObservationOrigin(target),
    target.authorType ? REAL_AUTHOR_TYPE[target.authorType] : null,
    target.authorPersonId,
    target.sourceRecordId,
    target.claimText,
    target.claimStructured ? JSON.stringify(target.claimStructured) : null,
    target.claimSchemaVersion,
    JSON.stringify(target.provenance),
    target.provenanceSchemaVersion,
    target.occurredAt,
    target.reportedAt,
    REAL_VERIFICATION_STATUS[target.verificationStatus],
    target.confidenceLevel,
    target.legacyStatus ?? null,
    target.legacySource ?? null,
    target.legacyRecordId ?? null,
    target.migrationConfidence ?? null,
    target.migrationReviewStatus ?? null
  );
  return { targetId: id, created: true };
}

/** `chainOfCustody` (required on the clean type) has no dedicated real column — mapped into `structured_content` (jsonb), the closest available column; `content_summary` carries a short human-readable label derived from `originType`, never fabricated free text. */
export async function upsertEvidence(
  client: TargetPrismaClientLike,
  target: EvidenceRecord,
  idempotencyKey: string
): Promise<Wave3PersistResult<string>> {
  const id = uuidFromSeed(idempotencyKey);
  if (await findExistingId(client, "evidence.evidence_records", id)) return { targetId: id, created: false };
  await raw(client).$executeRawUnsafe(
    `INSERT INTO evidence.evidence_records (id, evidence_origin, content_summary, structured_content, classification, legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status, created_at)
     VALUES ($1::uuid, $2::evidence.evidence_origin_enum, $3, $4::jsonb, $5::security.information_classification_enum, $6, $7, $8, $9, $10, now())`,
    id,
    REAL_EVIDENCE_ORIGIN[target.originType],
    `${target.originType} evidence (${target.legacySource ?? "wave3"})`,
    JSON.stringify(target.chainOfCustody),
    target.classification,
    target.legacyStatus ?? null,
    target.legacySource ?? null,
    target.legacyRecordId ?? null,
    target.migrationConfidence ?? null,
    target.migrationReviewStatus ?? null
  );
  return { targetId: id, created: true };
}

/** Metadata + a synthetic local reference only — never a binary payload (Fase 9: "No implementar Storage productivo"). `contentHash` (on the clean type) has no real column here — never fabricated, simply not written. */
export async function upsertEvidenceAsset(
  client: TargetPrismaClientLike,
  target: EvidenceAsset,
  idempotencyKey: string
): Promise<Wave3PersistResult<string>> {
  const id = uuidFromSeed(idempotencyKey);
  if (await findExistingId(client, "evidence.evidence_assets", id)) return { targetId: id, created: false };
  await raw(client).$executeRawUnsafe(
    `INSERT INTO evidence.evidence_assets (id, evidence_id, asset_uri, mime_type, created_at) VALUES ($1::uuid, $2::uuid, $3, $4, now())`,
    id,
    target.evidenceId,
    target.storageRef,
    target.mimeType
  );
  return { targetId: id, created: true };
}

/** Only the real physical columns of `incident.incident_candidates` are written. `correlationKey`/`classification`/`promotionStartedAt` (on the clean type) have no real column here — never fabricated, simply not written; `createdAt` maps to the real `opened_at`. Never creates/touches `incident.incidents`. */
export async function upsertIncidentCandidate(
  client: TargetPrismaClientLike,
  target: IncidentCandidate,
  idempotencyKey: string
): Promise<Wave3PersistResult<string>> {
  const id = uuidFromSeed(idempotencyKey);
  if (await findExistingId(client, "incident.incident_candidates", id)) return { targetId: id, created: false };
  await raw(client).$executeRawUnsafe(
    `INSERT INTO incident.incident_candidates (id, status, legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status, opened_at)
     VALUES ($1::uuid, $2::incident.incident_candidate_status_enum, $3, $4, $5, $6, $7, now())`,
    id,
    REAL_CANDIDATE_STATUS[target.status],
    target.legacyStatus ?? null,
    target.legacySource ?? null,
    target.legacyRecordId ?? null,
    target.migrationConfidence ?? null,
    target.migrationReviewStatus ?? null
  );
  return { targetId: id, created: true };
}

/** `incident.incident_candidate_observations` — matches the clean `IncidentCandidateObservation` shape exactly (no drift found here). Idempotent on the (incidentCandidateId, observationId) pair per `uq_ico_candidate_observation`. */
export async function linkObservationToIncidentCandidate(
  client: TargetPrismaClientLike,
  input: { incidentCandidateId: string; observationId: string; correlationConfidence: string }
): Promise<Wave3PersistResult<string>> {
  const id = uuidFromSeed(`IncidentCandidateObservation:${input.incidentCandidateId}:${input.observationId}`);
  if (await findExistingId(client, "incident.incident_candidate_observations", id)) return { targetId: id, created: false };
  await raw(client).$executeRawUnsafe(
    `INSERT INTO incident.incident_candidate_observations (id, incident_candidate_id, observation_id, correlation_confidence, created_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::evidence.confidence_level_enum, now())`,
    id,
    input.incidentCandidateId,
    input.observationId,
    input.correlationConfidence
  );
  return { targetId: id, created: true };
}

/** `evidence.observation_evidence_links` — the real table additionally requires `status`/`confidence` (absent from the clean `ObservationEvidenceLink` type, which instead has `linkedByActorType`/`linkedByActorId`, absent from the real table). `status` defaults to `'ACTIVE'`; `confidence` is supplied by the caller (never fabricated). */
export async function linkObservationToEvidence(
  client: TargetPrismaClientLike,
  input: {
    observationId: string;
    evidenceId: string;
    linkType: string;
    linkMethod: string;
    confidence: string;
  }
): Promise<Wave3PersistResult<string>> {
  const id = uuidFromSeed(`ObservationEvidenceLink:${input.observationId}:${input.evidenceId}`);
  if (await findExistingId(client, "evidence.observation_evidence_links", id)) return { targetId: id, created: false };
  await raw(client).$executeRawUnsafe(
    `INSERT INTO evidence.observation_evidence_links (id, observation_id, evidence_id, link_type, link_method, status, confidence)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::evidence.observation_evidence_link_type_enum, $5::evidence.link_method_enum, 'ACTIVE'::evidence.link_status_enum, $6::evidence.confidence_level_enum)`,
    id,
    input.observationId,
    input.evidenceId,
    input.linkType,
    input.linkMethod,
    input.confidence
  );
  return { targetId: id, created: true };
}
