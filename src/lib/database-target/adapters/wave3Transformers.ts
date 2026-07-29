/**
 * src/lib/database-target/adapters/wave3Transformers.ts
 *
 * The 10 concrete Ola 3 transformers named by Fase 6 of the wave-3
 * mandate. Every function here returns a `Wave3TransformResult` (never a
 * bare value, never a fabricated success) and derives its idempotency key
 * exclusively via `wave3Idempotency.ts` (never a random UUID).
 *
 * None of these are wired to any real endpoint yet — pure, isolated,
 * tested functions consumed by `shadow-write/wave3Domains.ts`.
 */

import { createHash } from "node:crypto";
import type { SourceRecord, SourceRecordOrigin, Source, Connector, IngestionRun, IngestionRunStatus } from "../ingest";
import type { PrimaryObservation, Report, Observation, EvidenceRecord, EvidenceAsset } from "../evidence";
import type { IncidentCandidate } from "../incident";
import {
  knowledgeIncidentToCandidate,
  incidentCandidateIdempotencyKey as incidentCandidateKeyFromKnowledgeIncident,
  type LegacyKnowledgeIncidentRecord,
  type LegacyStatusMappingTable,
} from "./incident";
import type { CanonicalSourceEntry } from "./sourceRegistryConsolidation";
import {
  connectorIdempotencyKey,
  externalEventIdempotencyKey,
  ingestionRunIdempotencyKey,
  observationIdempotencyKey,
  reportIdempotencyKey,
  sourceIdempotencyKey,
  telecomConnectivityEvidenceIdempotencyKey,
  telecomConnectivityStatusIdempotencyKey,
} from "./wave3Idempotency";
import {
  migrationBlockedResult,
  notReconstructableResult,
  readyResult,
  requiresReviewResult,
  type Wave3TransformResult,
} from "./wave3Types";

function stableContentHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

// ---------------------------------------------------------------------------
// 1-2. ExternalEvent -> SourceRecord / PrimaryObservation
// ---------------------------------------------------------------------------

/** Current-read interface — the exact subset of `ExternalEvent` (prisma/schema.prisma) these 2 transformers touch. */
export interface LegacyExternalEventRecordFull {
  id: string;
  sourceId: string;
  externalId: string;
  category: string;
  title: string;
  description: string | null;
  severity: string | null;
  confidence: number | null;
  latitude: number | null;
  longitude: number | null;
  occurredAt: Date | null;
  fetchedAt: Date | null;
  raw: Record<string, unknown> | null;
  createdAt: Date;
  /** Resolved `ingest.ingestion_runs.id` this record belongs to — required by the physical FK; never invented, `MIGRATION_BLOCKED` when absent. */
  ingestionRunId: string | null;
}

/** 1. `ExternalEvent` -> `ingest.source_records` (`origin_kind = 'EXTERNAL_EVENT'`). Never mutates the original — `rawContent` preserves `raw` verbatim. */
export function externalEventToSourceRecord(
  record: LegacyExternalEventRecordFull
): Wave3TransformResult<SourceRecord> {
  const legacyReference = { table: "ExternalEvent", id: record.id };
  const idempotencyKey = externalEventIdempotencyKey({
    sourceId: record.sourceId,
    externalId: record.externalId,
    stableVersion: (record.fetchedAt ?? record.createdAt).toISOString(),
  });

  if (!record.ingestionRunId) {
    return migrationBlockedResult({
      reason: "ingest.source_records.ingestion_run_id is NOT NULL — no resolved IngestionRun for this ExternalEvent yet",
      legacyReference,
      idempotencyKey,
    });
  }

  const originKind: SourceRecordOrigin = "EXTERNAL_EVENT";
  const rawContent = record.raw ?? { title: record.title, description: record.description, category: record.category };

  const value: SourceRecord = {
    id: record.id,
    ingestionRunId: record.ingestionRunId,
    sourceId: record.sourceId,
    originKind,
    externalId: record.externalId,
    provenance: { chain: [{ stepKind: "EXTERNAL_EVENT_INGESTION", timestamp: record.createdAt.toISOString() }] },
    rawContent,
    contentHash: stableContentHash(rawContent),
    classification: "OPERATIONAL",
    receivedAt: (record.fetchedAt ?? record.createdAt).toISOString(),
    createdAt: record.createdAt.toISOString(),
    legacyStatus: null,
    legacySource: "ExternalEvent",
    legacyRecordId: record.id,
    migrationConfidence: "HIGH",
    migrationReviewStatus: "AUTO_MAPPED",
  };

  return readyResult({
    value,
    migrationConfidence: "HIGH",
    reviewStatus: "AUTO_MAPPED",
    legacyReference,
    idempotencyKey,
  });
}

/** 2. `ExternalEvent` -> `evidence.observations` as a `PrimaryObservation` (machine-authored, `authorType: null`). */
export function externalEventToPrimaryObservation(
  record: LegacyExternalEventRecordFull,
  sourceRecordId: string | null
): Wave3TransformResult<PrimaryObservation> {
  const legacyReference = { table: "ExternalEvent", id: record.id };
  const idempotencyKey = observationIdempotencyKey({
    originTable: "ExternalEvent",
    legacyId: record.id,
    derivationKind: "PRIMARY",
  });

  const missingFields: string[] = [];
  if (record.latitude === null || record.longitude === null) missingFields.push("latitude/longitude");
  if (!sourceRecordId) missingFields.push("sourceRecordId");

  const value: PrimaryObservation = {
    id: record.id,
    originType: "PRIMARY",
    authorType: null,
    authorPersonId: null,
    sourceRecordId,
    claimText: record.description ? `${record.title}\n\n${record.description}` : record.title,
    claimStructured: null,
    claimSchemaVersion: 1,
    provenance: {
      chain: [{ stepKind: "EXTERNAL_EVENT_INGESTION", sourceRecordId: sourceRecordId ?? undefined, timestamp: record.createdAt.toISOString() }],
      depth: 1,
    },
    provenanceSchemaVersion: 1,
    location: record.latitude !== null && record.longitude !== null ? { latitude: record.latitude, longitude: record.longitude } : null,
    occurredAt: record.occurredAt ? record.occurredAt.toISOString() : null,
    reportedAt: (record.fetchedAt ?? record.createdAt).toISOString(),
    verificationStatus: "UNVERIFIED",
    confidenceLevel: record.confidence !== null ? confidenceScoreToLevel(record.confidence) : "UNKNOWN",
    correctsObservationId: null,
    retractsObservationId: null,
    createdAt: record.createdAt.toISOString(),
    legacyStatus: null,
    legacySource: "ExternalEvent",
    legacyRecordId: record.id,
    migrationConfidence: missingFields.length === 0 ? "HIGH" : "MEDIUM",
    migrationReviewStatus: missingFields.length === 0 ? "AUTO_MAPPED" : "REQUIRES_REVIEW",
  };

  if (missingFields.length > 0) {
    return requiresReviewResult({ value, missingFields, legacyReference, idempotencyKey });
  }
  return readyResult({ value, migrationConfidence: "HIGH", reviewStatus: "AUTO_MAPPED", legacyReference, idempotencyKey });
}

function confidenceScoreToLevel(score: number): "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH" | "CONFIRMED" {
  if (score >= 90) return "CONFIRMED";
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  if (score > 0) return "LOW";
  return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// 3-4. Report -> Report target / PrimaryObservation
// ---------------------------------------------------------------------------

/** Current-read interface — the exact subset of `Report` (prisma/schema.prisma) these 2 transformers touch. */
export interface LegacyReportRecordFull {
  id: string;
  userId: string;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  status: string;
  createdAt: Date;
}

/** 3. `Report` -> `evidence.observations` as `Report` target (`originType: PRIMARY`, `authorType: CITIZEN` — D-01). */
export function reportToReportTarget(record: LegacyReportRecordFull): Wave3TransformResult<Report> {
  const legacyReference = { table: "Report", id: record.id };
  const idempotencyKey = reportIdempotencyKey(record.id);

  const value: Report = {
    id: record.id,
    originType: "PRIMARY",
    authorType: "CITIZEN",
    authorPersonId: record.userId,
    sourceRecordId: null,
    claimText: `${record.title}\n\n${record.description}`,
    claimStructured: null,
    claimSchemaVersion: 1,
    provenance: { chain: [{ stepKind: "CITIZEN_REPORT", actorType: "PERSON", actorId: record.userId, timestamp: record.createdAt.toISOString() }], depth: 1 },
    provenanceSchemaVersion: 1,
    location: { latitude: record.latitude, longitude: record.longitude },
    occurredAt: record.createdAt.toISOString(),
    reportedAt: record.createdAt.toISOString(),
    verificationStatus: "UNVERIFIED",
    confidenceLevel: "UNKNOWN",
    correctsObservationId: null,
    retractsObservationId: null,
    createdAt: record.createdAt.toISOString(),
    legacyStatus: record.status,
    legacySource: "Report",
    legacyRecordId: record.id,
    migrationConfidence: "HIGH",
    migrationReviewStatus: "AUTO_MAPPED",
  };

  return readyResult({ value, migrationConfidence: "HIGH", reviewStatus: "AUTO_MAPPED", legacyReference, idempotencyKey });
}

/** 4. `Report` -> `PrimaryObservation` — structurally the same row as #3 (a `Report` IS a `PrimaryObservation`), exposed as its own transformer per the Ola 3 mandate's explicit numbered list. */
export function reportToPrimaryObservation(record: LegacyReportRecordFull): Wave3TransformResult<PrimaryObservation> {
  const reportResult = reportToReportTarget(record);
  if (reportResult.status !== "READY" || !reportResult.value) {
    return reportResult as Wave3TransformResult<PrimaryObservation>;
  }
  return { ...reportResult, value: reportResult.value };
}

// ---------------------------------------------------------------------------
// 5. TelecomConnectivityStatus -> Observation
// ---------------------------------------------------------------------------

export interface LegacyTelecomConnectivityStatusRecord {
  id: string;
  countryCode: string;
  adminLevel1: string;
  adminLevel2: string | null;
  carrierScope: string;
  networkState: string;
  activationScope: string | null;
  centroidLatitude: number | null;
  centroidLongitude: number | null;
  startedAt: Date | null;
  createdAt: Date;
}

/** 5. `TelecomConnectivityStatus` -> `evidence.observations` (D-04: migrates to `evidence.*`, never `comms.*`). */
export function telecomConnectivityStatusToObservation(
  record: LegacyTelecomConnectivityStatusRecord
): Wave3TransformResult<Observation> {
  const legacyReference = { table: "TelecomConnectivityStatus", id: record.id };
  const idempotencyKey = telecomConnectivityStatusIdempotencyKey(record.id);

  const missingFields: string[] = [];
  if (record.centroidLatitude === null || record.centroidLongitude === null) missingFields.push("centroidLatitude/centroidLongitude");

  const value: Observation = {
    id: record.id,
    originType: "PRIMARY",
    authorType: "INSTITUTIONAL",
    authorPersonId: null,
    sourceRecordId: null,
    claimText: `Estado de red ${record.carrierScope} en ${record.adminLevel1}${record.adminLevel2 ? "/" + record.adminLevel2 : ""}: ${record.networkState}${record.activationScope ? ` (${record.activationScope})` : ""}`,
    claimStructured: {
      domain: "telecom_connectivity",
      countryCode: record.countryCode,
      adminLevel1: record.adminLevel1,
      adminLevel2: record.adminLevel2,
      carrierScope: record.carrierScope,
      networkState: record.networkState,
    },
    claimSchemaVersion: 1,
    provenance: { chain: [{ stepKind: "TELECOM_CONNECTIVITY_STATUS", timestamp: record.createdAt.toISOString() }], depth: 1 },
    provenanceSchemaVersion: 1,
    location:
      record.centroidLatitude !== null && record.centroidLongitude !== null
        ? { latitude: record.centroidLatitude, longitude: record.centroidLongitude }
        : null,
    occurredAt: record.startedAt ? record.startedAt.toISOString() : null,
    reportedAt: record.createdAt.toISOString(),
    verificationStatus: "UNVERIFIED",
    confidenceLevel: "UNKNOWN",
    correctsObservationId: null,
    retractsObservationId: null,
    createdAt: record.createdAt.toISOString(),
    legacyStatus: record.networkState,
    legacySource: "TelecomConnectivityStatus",
    legacyRecordId: record.id,
    migrationConfidence: missingFields.length === 0 ? "HIGH" : "MEDIUM",
    migrationReviewStatus: missingFields.length === 0 ? "AUTO_MAPPED" : "REQUIRES_REVIEW",
  };

  if (missingFields.length > 0) {
    return requiresReviewResult({ value, missingFields, legacyReference, idempotencyKey });
  }
  return readyResult({ value, migrationConfidence: "HIGH", reviewStatus: "AUTO_MAPPED", legacyReference, idempotencyKey });
}

// ---------------------------------------------------------------------------
// 6. TelecomConnectivityEvidence -> Evidence/EvidenceAsset
// ---------------------------------------------------------------------------

export interface LegacyTelecomConnectivityEvidenceRecord {
  id: string;
  subjectType: string;
  regionKey: string | null;
  poiId: string | null;
  eventType: string;
  sourceType: string;
  sourceName: string;
  sourceUrl: string | null;
  confidenceScore: number;
  createdAt: Date;
}

/** 6. `TelecomConnectivityEvidence` -> `evidence.evidence_records` (+ `evidence_assets` metadata when a `sourceUrl` exists — no binary storage, D-04). */
export function telecomConnectivityEvidenceToEvidence(
  record: LegacyTelecomConnectivityEvidenceRecord
): Wave3TransformResult<{ evidence: EvidenceRecord; asset: EvidenceAsset | null }> {
  const legacyReference = { table: "TelecomConnectivityEvidence", id: record.id };
  const idempotencyKey = telecomConnectivityEvidenceIdempotencyKey(record.id);

  const evidence: EvidenceRecord = {
    id: record.id,
    originType: "PRIMARY",
    classification: "OPERATIONAL",
    chainOfCustody: {
      subjectType: record.subjectType,
      regionKey: record.regionKey,
      poiId: record.poiId,
      eventType: record.eventType,
      sourceType: record.sourceType,
      sourceName: record.sourceName,
      confidenceScore: record.confidenceScore,
    },
    licenseTerms: null,
    consentId: null,
    derivedFromEvidenceId: null,
    createdAt: record.createdAt.toISOString(),
    legacyStatus: record.eventType,
    legacySource: "TelecomConnectivityEvidence",
    legacyRecordId: record.id,
    migrationConfidence: "HIGH",
    migrationReviewStatus: "AUTO_MAPPED",
  };

  const asset: EvidenceAsset | null = record.sourceUrl
    ? {
        id: `${record.id}-asset`,
        evidenceId: record.id,
        storageRef: record.sourceUrl,
        contentHash: stableContentHash({ sourceUrl: record.sourceUrl, sourceName: record.sourceName }),
        mimeType: "text/html",
        createdAt: record.createdAt.toISOString(),
      }
    : null;

  return readyResult({
    value: { evidence, asset },
    migrationConfidence: "HIGH",
    reviewStatus: "AUTO_MAPPED",
    warnings: asset ? [] : ["no sourceUrl on legacy record — evidence created without an EvidenceAsset"],
    legacyReference,
    idempotencyKey,
  });
}

// ---------------------------------------------------------------------------
// 7. KnowledgeIncident -> IncidentCandidate (wraps adapters/incident.ts)
// ---------------------------------------------------------------------------

/** 7. `KnowledgeIncident` -> `incident.incident_candidates` ONLY — wraps `knowledgeIncidentToCandidate`, never creates an `Incident`. */
export function knowledgeIncidentToIncidentCandidateResult(
  record: LegacyKnowledgeIncidentRecord,
  mappingTable: LegacyStatusMappingTable
): Wave3TransformResult<IncidentCandidate> {
  const legacyReference = { table: "KnowledgeIncident", id: record.id };
  const idempotencyKey = incidentCandidateKeyFromKnowledgeIncident(record);
  const candidate = knowledgeIncidentToCandidate(record, mappingTable);

  if (!candidate.proposedProfile) {
    return requiresReviewResult({
      value: candidate,
      missingFields: ["proposedProfile (no approved governance.legacy_status_mapping entry)"],
      legacyReference,
      idempotencyKey,
    });
  }
  return readyResult({
    value: candidate,
    migrationConfidence: candidate.migrationConfidence ?? "HIGH",
    reviewStatus: candidate.migrationReviewStatus ?? "AUTO_MAPPED",
    legacyReference,
    idempotencyKey,
  });
}

// ---------------------------------------------------------------------------
// 8-9. SourceRegistry entry -> Source / Connector
// ---------------------------------------------------------------------------

/** A resolved `Provider` id for a canonical source entry — providers are `institution.organizations`-scoped and, per D-01, are never synthesized; callers must resolve this externally (e.g. an operator-provisioned provider row) and pass it in. `null` when unresolved. */
export interface ProviderResolution {
  providerId: string | null;
}

/** 8. `CanonicalSourceEntry` (DUP-003 consolidation) -> `ingest.sources`. */
export function sourceRegistryEntryToSource(
  entry: CanonicalSourceEntry,
  provider: ProviderResolution
): Wave3TransformResult<Source> {
  const legacyReference = { table: "SourceRegistry", id: entry.id };

  const name = entry.vigia?.name ?? entry.knowledgeIntake?.name ?? entry.id;
  const endpoint = entry.vigia?.endpoint ?? entry.knowledgeIntake?.baseUrl ?? null;
  const enabled = entry.vigia ? entry.vigia.enabled : entry.knowledgeIntake ? isKnowledgeIntakeActive(entry.knowledgeIntake.status) : false;

  const idempotencyKey = sourceIdempotencyKey({
    providerId: provider.providerId ?? "UNRESOLVED",
    endpointSignature: endpoint ?? entry.id,
  });

  const missingFields: string[] = [];
  if (!provider.providerId) missingFields.push("providerId");
  if (!endpoint) missingFields.push("endpoint");
  if (entry.hasEnabledStateDrift) missingFields.push("enabled (drift between vigia and knowledge-intake registries)");

  const value: Source = {
    id: entry.id,
    providerId: provider.providerId ?? "",
    endpointSignature: endpoint ?? entry.id,
    name,
    status: enabled ? "ACTIVE" : "INACTIVE",
    createdAt: new Date().toISOString(),
    legacyStatus: null,
    legacySource: "SourceRegistry",
    legacyRecordId: entry.id,
    migrationConfidence: missingFields.length === 0 ? "HIGH" : "LOW",
    migrationReviewStatus: missingFields.length === 0 ? "AUTO_MAPPED" : "REQUIRES_REVIEW",
  };

  if (missingFields.length > 0) {
    return requiresReviewResult({ value, missingFields, legacyReference, idempotencyKey });
  }
  return readyResult({ value, migrationConfidence: "HIGH", reviewStatus: "AUTO_MAPPED", legacyReference, idempotencyKey });
}

function isKnowledgeIntakeActive(status: string): boolean {
  return status === "active" || status === "active_contextual" || status === "active_historical" || status === "active_institutional";
}

/** 9. `CanonicalSourceEntry` -> `ingest.source_connectors` (1:1 with the Source produced by #8 — `sourceId` must match). */
export function sourceRegistryIntegrationToConnector(
  entry: CanonicalSourceEntry,
  sourceId: string
): Wave3TransformResult<Connector> {
  const legacyReference = { table: "SourceRegistry", id: entry.id };
  const idempotencyKey = connectorIdempotencyKey(sourceId);

  const config: Record<string, unknown> = {
    endpoint: entry.vigia?.endpoint ?? entry.knowledgeIntake?.baseUrl ?? null,
    refreshIntervalMinutes: entry.vigia?.refreshIntervalMinutes ?? null,
    accessMethod: entry.knowledgeIntake?.accessMethod ?? null,
    requiresEnvVar: entry.vigia?.requiresEnvVar ?? null,
  };

  const missingFields: string[] = [];
  if (!config.endpoint) missingFields.push("config.endpoint");

  const value: Connector = {
    id: `${sourceId}-connector`,
    sourceId,
    config,
    status: entry.vigia?.enabled ?? (entry.knowledgeIntake ? isKnowledgeIntakeActive(entry.knowledgeIntake.status) : false) ? "ACTIVE" : "INACTIVE",
  };

  if (missingFields.length > 0) {
    return requiresReviewResult({ value, missingFields, legacyReference, idempotencyKey });
  }
  return readyResult({ value, migrationConfidence: "HIGH", reviewStatus: "AUTO_MAPPED", legacyReference, idempotencyKey });
}

// ---------------------------------------------------------------------------
// 10. Ingestion execution -> IngestionRun
// ---------------------------------------------------------------------------

/** Fusion input — either legacy `IngestionRun` or `KnowledgeIngestionRun` row, discriminated at the adapter layer (never a physical column) per `ingest.ts`'s file-level doc comment. */
export type LegacyIngestionExecution =
  | { originKind: "LEGACY_INGESTION_RUN"; id: string; sourceId: string; status: string; fetchedAt: Date; completedAt: Date | null }
  | { originKind: "KNOWLEDGE_INGESTION_RUN"; id: string; sourceId: string; status: string; startedAt: Date; finishedAt: Date | null };

const RUN_STATUS_MAP: Record<string, IngestionRunStatus> = {
  running: "RUNNING",
  pending: "RUNNING",
  success: "COMPLETED",
  completed: "COMPLETED",
  partial: "COMPLETED",
  failed: "FAILED",
  error: "FAILED",
};

/** 10. A legacy ingestion execution row -> `ingest.ingestion_runs`, only "cuando haya datos suficientes" (sourceId + status resolvable) — otherwise `NOT_RECONSTRUCTABLE`. */
export function ingestionExecutionToIngestionRun(
  execution: LegacyIngestionExecution,
  cycleMarker: string
): Wave3TransformResult<IngestionRun> {
  const legacyTable = execution.originKind === "LEGACY_INGESTION_RUN" ? "IngestionRun" : "KnowledgeIngestionRun";
  const legacyReference = { table: legacyTable, id: execution.id };
  const idempotencyKey = ingestionRunIdempotencyKey({ sourceId: execution.sourceId, cycleMarker });

  if (!execution.sourceId || !execution.status) {
    return notReconstructableResult({
      reason: "insufficient data to reconstruct an IngestionRun (missing sourceId/status)",
      legacyReference,
      idempotencyKey,
    });
  }

  const startedAt = execution.originKind === "LEGACY_INGESTION_RUN" ? execution.fetchedAt : execution.startedAt;
  const completedAt = execution.originKind === "LEGACY_INGESTION_RUN" ? execution.completedAt : execution.finishedAt;
  const mappedStatus = RUN_STATUS_MAP[execution.status.toLowerCase()];

  const value: IngestionRun = {
    id: execution.id,
    sourceId: execution.sourceId,
    idempotencyKey,
    status: mappedStatus ?? "RUNNING",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt ? completedAt.toISOString() : null,
    legacyStatus: execution.status,
    legacySource: legacyTable,
    legacyRecordId: execution.id,
    migrationConfidence: mappedStatus ? "HIGH" : "MEDIUM",
    migrationReviewStatus: mappedStatus ? "AUTO_MAPPED" : "REQUIRES_REVIEW",
  };

  if (!mappedStatus) {
    return requiresReviewResult({
      value,
      missingFields: [`unmapped legacy status "${execution.status}"`],
      legacyReference,
      idempotencyKey,
    });
  }
  return readyResult({ value, migrationConfidence: "HIGH", reviewStatus: "AUTO_MAPPED", legacyReference, idempotencyKey });
}
