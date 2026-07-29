/**
 * src/lib/database-target/repositories/wave3Repository.ts
 *
 * Real, idempotent target repositories for Ola 3 (Fase 9 of the wave-3
 * mandate), backed by the isolated target Prisma client
 * (`client/targetPrismaClient.ts`). Development/tests only — never
 * imported by production runtime code, never reachable without an
 * explicit local `TARGET_DATABASE_URL`.
 *
 * The wave 030/040 DDL (`prisma/target-migrations/{030,040}/migration.sql`)
 * was reconciled against `prisma/schema.target.prisma` in a later session —
 * every column and enum value used below now matches the applied DDL
 * column-for-column, so this module writes the clean, transformer-produced
 * TS value directly via raw parameterized SQL (Prisma's generated model
 * client still can't be used here — its input types are generated from
 * schema.target.prisma's model shapes, not the raw-SQL access this module
 * needs for deterministic-id idempotency checks). There is no longer an
 * enum/column TRANSLATION layer: nothing here maps a clean value onto a
 * differently-named or differently-valued real column.
 *
 * PostGIS `geography` columns (e.g. `evidence.observations.location`) are
 * left NULL by this module — valid (nullable column), and out of scope for
 * this pass (would require a raw `ST_MakePoint` follow-up).
 *
 * No binary storage: `evidence_assets.storage_ref` is a metadata reference
 * only — this module never touches Supabase Storage or writes bytes to
 * Postgres.
 */

import type { TargetPrismaClientLike } from "../client/targetPrismaClient";
import type { Wave3PersistResult } from "../shadow-write/wave3ShadowWriteRunner";
import type { Source, Connector, IngestionRun, SourceRecord } from "../ingest";
import type { Observation, EvidenceRecord, EvidenceAsset } from "../evidence";
import type { IncidentCandidate } from "../incident";
import type { ActorType } from "../shared";
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
    target.providerId,
    target.endpointSignature,
    target.status
  );
  return { targetId: id, created: true };
}

export async function upsertConnector(
  client: TargetPrismaClientLike,
  target: Connector,
  idempotencyKey: string
): Promise<Wave3PersistResult<string>> {
  const id = uuidFromSeed(idempotencyKey);
  if (await findExistingId(client, "ingest.source_connectors", id)) return { targetId: id, created: false };
  await raw(client).$executeRawUnsafe(
    `INSERT INTO ingest.source_connectors (id, source_id, config, status) VALUES ($1::uuid, $2::uuid, $3::jsonb, $4::ingest.connector_status_enum)`,
    id,
    target.sourceId,
    JSON.stringify(target.config),
    target.status
  );
  return { targetId: id, created: true };
}

/** `idempotency_key` (real uuid column, part of `uq_ingestion_runs_source_idempotency`) is derived from the same seed as `id` — never a fabricated value, just the deterministic UUID form of the transformer's own idempotency key. */
export async function upsertIngestionRun(
  client: TargetPrismaClientLike,
  target: IngestionRun,
  idempotencyKey: string
): Promise<Wave3PersistResult<string>> {
  const id = uuidFromSeed(idempotencyKey);
  if (await findExistingId(client, "ingest.ingestion_runs", id)) return { targetId: id, created: false };
  await raw(client).$executeRawUnsafe(
    `INSERT INTO ingest.ingestion_runs (id, source_id, idempotency_key, origin_kind, status, started_at, completed_at, legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::ingest.ingestion_run_origin_kind_enum, $5::ingest.ingestion_run_status_enum, $6::timestamptz, $7::timestamptz, $8, $9, $10, $11, $12)`,
    id,
    target.sourceId,
    id,
    target.legacySource === "KnowledgeIngestionRun" ? "GLOBAL_WATCH_PIPELINE" : "EXTERNAL_EVENT_PIPELINE",
    target.status,
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
    `INSERT INTO ingest.source_records (id, source_id, ingestion_run_id, origin_kind, external_id, provenance, raw_content, content_hash, classification, legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status, received_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::ingest.source_record_origin_enum, $5, $6::jsonb, $7::jsonb, $8, $9::security.information_classification_enum, $10, $11, $12, $13, $14, $15::timestamptz)`,
    id,
    target.sourceId,
    target.ingestionRunId,
    target.originKind,
    target.externalId,
    JSON.stringify(target.provenance),
    JSON.stringify(target.rawContent),
    target.contentHash,
    target.classification,
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
    target.originType,
    target.authorType,
    target.authorPersonId,
    target.sourceRecordId,
    target.claimText,
    target.claimStructured ? JSON.stringify(target.claimStructured) : null,
    target.claimSchemaVersion,
    JSON.stringify(target.provenance),
    target.provenanceSchemaVersion,
    target.occurredAt,
    target.reportedAt,
    target.verificationStatus,
    target.confidenceLevel,
    target.legacyStatus ?? null,
    target.legacySource ?? null,
    target.legacyRecordId ?? null,
    target.migrationConfidence ?? null,
    target.migrationReviewStatus ?? null
  );
  return { targetId: id, created: true };
}

export async function upsertEvidence(
  client: TargetPrismaClientLike,
  target: EvidenceRecord,
  idempotencyKey: string
): Promise<Wave3PersistResult<string>> {
  const id = uuidFromSeed(idempotencyKey);
  if (await findExistingId(client, "evidence.evidence_records", id)) return { targetId: id, created: false };
  await raw(client).$executeRawUnsafe(
    `INSERT INTO evidence.evidence_records (id, evidence_origin, classification, chain_of_custody, license_terms, consent_id, derived_from_evidence_id, legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status, created_at)
     VALUES ($1::uuid, $2::evidence.evidence_origin_enum, $3::security.information_classification_enum, $4::jsonb, $5::jsonb, $6::uuid, $7::uuid, $8, $9, $10, $11, $12, now())`,
    id,
    target.originType,
    target.classification,
    JSON.stringify(target.chainOfCustody),
    target.licenseTerms ? JSON.stringify(target.licenseTerms) : null,
    target.consentId,
    target.derivedFromEvidenceId,
    target.legacyStatus ?? null,
    target.legacySource ?? null,
    target.legacyRecordId ?? null,
    target.migrationConfidence ?? null,
    target.migrationReviewStatus ?? null
  );
  return { targetId: id, created: true };
}

/** Metadata + a synthetic local reference only — never a binary payload (Fase 9: "No implementar Storage productivo"). */
export async function upsertEvidenceAsset(
  client: TargetPrismaClientLike,
  target: EvidenceAsset,
  idempotencyKey: string
): Promise<Wave3PersistResult<string>> {
  const id = uuidFromSeed(idempotencyKey);
  if (await findExistingId(client, "evidence.evidence_assets", id)) return { targetId: id, created: false };
  await raw(client).$executeRawUnsafe(
    `INSERT INTO evidence.evidence_assets (id, evidence_id, storage_ref, content_hash, mime_type, created_at) VALUES ($1::uuid, $2::uuid, $3, $4, $5, now())`,
    id,
    target.evidenceId,
    target.storageRef,
    target.contentHash,
    target.mimeType
  );
  return { targetId: id, created: true };
}

/** Never creates/touches `incident.incidents` — this is strictly the candidate table. `candidateOriginType` (on the clean type) is not a physical column and is never written. */
export async function upsertIncidentCandidate(
  client: TargetPrismaClientLike,
  target: IncidentCandidate,
  idempotencyKey: string
): Promise<Wave3PersistResult<string>> {
  const id = uuidFromSeed(idempotencyKey);
  if (await findExistingId(client, "incident.incident_candidates", id)) return { targetId: id, created: false };
  await raw(client).$executeRawUnsafe(
    `INSERT INTO incident.incident_candidates (id, status, correlation_key, classification, promotion_started_at, legacy_status, legacy_source, legacy_record_id, migration_confidence, migration_review_status, created_at)
     VALUES ($1::uuid, $2::incident.incident_candidate_status_enum, $3, $4::security.information_classification_enum, $5::timestamptz, $6, $7, $8, $9, $10, now())`,
    id,
    target.status,
    target.correlationKey,
    target.classification,
    target.promotionStartedAt,
    target.legacyStatus ?? null,
    target.legacySource ?? null,
    target.legacyRecordId ?? null,
    target.migrationConfidence ?? null,
    target.migrationReviewStatus ?? null
  );
  return { targetId: id, created: true };
}

/** `incident.incident_candidate_observations` — matches the clean `IncidentCandidateObservation` shape exactly. Idempotent on the (incidentCandidateId, observationId) pair per `uq_ico_candidate_observation`. */
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

/** `evidence.observation_evidence_links` — matches the clean `ObservationEvidenceLink` shape exactly, including the polymorphic `linkedByActorType`/`linkedByActorId` pair (no physical FK, per its own doc comment). `status` defaults to `'ACTIVE'` (not on the clean type, never fabricated per-row — every link starts active). */
export async function linkObservationToEvidence(
  client: TargetPrismaClientLike,
  input: {
    observationId: string;
    evidenceId: string;
    linkType: string;
    linkedByActorType: ActorType;
    linkedByActorId: string;
    linkMethod: string;
    confidence: string;
  }
): Promise<Wave3PersistResult<string>> {
  const id = uuidFromSeed(`ObservationEvidenceLink:${input.observationId}:${input.evidenceId}`);
  if (await findExistingId(client, "evidence.observation_evidence_links", id)) return { targetId: id, created: false };
  await raw(client).$executeRawUnsafe(
    `INSERT INTO evidence.observation_evidence_links (id, observation_id, evidence_id, link_type, linked_by_actor_type, linked_by_actor_id, link_method, confidence, status)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::evidence.observation_evidence_link_type_enum, $5::security.actor_type_enum, $6::uuid, $7::evidence.link_method_enum, $8::evidence.confidence_level_enum, 'ACTIVE'::evidence.link_status_enum)`,
    id,
    input.observationId,
    input.evidenceId,
    input.linkType,
    input.linkedByActorType,
    input.linkedByActorId,
    input.linkMethod,
    input.confidence
  );
  return { targetId: id, created: true };
}
