/**
 * src/lib/database-target/adapters/wave3Idempotency.ts
 *
 * Stable idempotency keys for every wave-3 domain (Fase 7 of the wave-3
 * mandate). None of these use a random UUID as the sole duplicate guard —
 * every key is deterministically derived from stable legacy identity, so
 * the SAME legacy row always produces the SAME key across retries, reruns,
 * and process restarts.
 */

/** ExternalEvent: source/provider + externalId + a stable version/timestamp component (never the row's own random id). */
export function externalEventIdempotencyKey(input: {
  sourceId: string;
  externalId: string;
  /** A stable version marker — e.g. the legacy row's own `updatedAt`/`fetchedAt` ISO string, or an explicit content version. Must be stable across retries of the SAME logical event; a fresh Date.now() would break idempotency and must never be passed here. */
  stableVersion: string;
}): string {
  return `ExternalEvent:${input.sourceId}:${input.externalId}:${input.stableVersion}`;
}

/** Report: legacy table + legacy id. */
export function reportIdempotencyKey(legacyId: string): string {
  return `Report:${legacyId}`;
}

/** KnowledgeIncident -> Incident: legacy table + legacy id (re-exported here for a single wave-3 lookup surface; canonical implementation lives in adapters/incident.ts). */
export function knowledgeIncidentIdempotencyKey(legacyId: string): string {
  return `KnowledgeIncident:${legacyId}`;
}

/** SourceRecord: source + external id + a versioned transformation tag (distinguishes re-derivations of the same raw content). */
export function sourceRecordIdempotencyKey(input: {
  sourceId: string;
  externalId: string;
  transformationVersion: string;
}): string {
  return `SourceRecord:${input.sourceId}:${input.externalId}:${input.transformationVersion}`;
}

/** Observation: origin (legacy table) + legacy id + derivation kind (distinguishes e.g. a PrimaryObservation from a DerivedObservation built off the same legacy row). */
export function observationIdempotencyKey(input: {
  originTable: string;
  legacyId: string;
  derivationKind: string;
}): string {
  return `Observation:${input.originTable}:${input.legacyId}:${input.derivationKind}`;
}

/** IncidentCandidate: legacy KnowledgeIncident id, OR an explicit documented correlation key when there is no single legacy row (e.g. a candidate correlated from a SourceRecord/Observation cluster). */
export function incidentCandidateIdempotencyKey(input: { legacyId?: string; correlationKey?: string }): string {
  if (input.legacyId) return `IncidentCandidate:KnowledgeIncident:${input.legacyId}`;
  if (input.correlationKey) return `IncidentCandidate:correlation:${input.correlationKey}`;
  throw new Error("incidentCandidateIdempotencyKey requires either legacyId or correlationKey — never a random fallback");
}

/** TelecomConnectivityStatus -> Observation: legacy table + legacy id. */
export function telecomConnectivityStatusIdempotencyKey(legacyId: string): string {
  return `TelecomConnectivityStatus:${legacyId}`;
}

/** TelecomConnectivityEvidence -> Evidence/EvidenceAsset: legacy table + legacy id. */
export function telecomConnectivityEvidenceIdempotencyKey(legacyId: string): string {
  return `TelecomConnectivityEvidence:${legacyId}`;
}

/** Source: provider id + endpoint signature (the table's own real unique pair — `uq_sources_provider_endpoint`). */
export function sourceIdempotencyKey(input: { providerId: string; endpointSignature: string }): string {
  return `Source:${input.providerId}:${input.endpointSignature}`;
}

/** Connector: source id (1:1 with Source — `uq_source_connectors_source_id`). */
export function connectorIdempotencyKey(sourceId: string): string {
  return `Connector:${sourceId}`;
}

/** IngestionRun: source id + the run's own stable idempotency marker (never the row's own random id — must be supplied by the caller, e.g. a cron cycle's scheduled timestamp truncated to the cycle boundary). */
export function ingestionRunIdempotencyKey(input: { sourceId: string; cycleMarker: string }): string {
  return `IngestionRun:${input.sourceId}:${input.cycleMarker}`;
}
