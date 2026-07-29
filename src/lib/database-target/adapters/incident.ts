/**
 * src/lib/database-target/adapters/incident.ts
 *
 * Functional compatibility adapter for BC 6 (Incidente Canónico), current
 * `KnowledgeIncident` -> target `incident.incidents` (Ola 4, the
 * highest-risk/highest-volume transformation in the whole plan). Applies
 * D-02 (frozen decision register) literally: `status`/`verificationStatus`
 * are NEVER collapsed via an inline `CASE WHEN` in this file. The 5-status
 * split is resolved ONLY by looking up `governance.legacy_status_mapping`
 * (injected here as `LegacyStatusMappingTable` — the real table, once
 * populated and product-approved, is the actual source; this adapter never
 * invents its own mapping). Absent an approved mapping entry, the
 * transform returns `null` and `shadowWriteIncident` reports
 * `REQUIRES_REVIEW`, never a guessed classification.
 */

import type {
  Incident,
  IncidentCandidate,
  IncidentCandidateOriginType,
  IncidentOperationalStatus,
  IncidentPreventiveStatus,
  IncidentStructuralStatus,
  IncidentTrend,
  IncidentVerificationStatus,
  ProposedIncidentProfile,
} from "../incident";
import {
  type AdapterOutcome,
  type AdapterWriteContext,
  migrationBlocked,
  requiresReview,
  notEnabled,
} from "./types";

/** 1. Current-read interface — the exact subset of `KnowledgeIncident` (prisma/schema.prisma) this adapter touches. */
export interface LegacyKnowledgeIncidentRecord {
  id: string;
  title: string;
  summary: string;
  status: string | null;
  verificationStatus: string | null;
  effectiveSeverity: string | null;
  incidentTypeId: string;
  /** db: domain — NOT NULL (proposed-category source for `IncidentCandidate.proposedProfile`, never invented if absent). */
  domain: string;
  /** db: subtype — NULL. */
  subtype: string | null;
  /** db: confidenceLevel — NULL (low/medium/high/very_high, legacy free text). */
  confidenceLevel: string | null;
  /** db: sourceId — the `IngestionRun`/`ExternalEvent` source this row correlates with, per `@@unique([sourceId, externalId])`. */
  sourceId: string;
  /** db: externalId — NULL; paired with sourceId to resolve the originating `ExternalEvent` row (`ingest.source_records` link once Ola 3 lands). */
  externalId: string | null;
  /** db: latitude — NULL. */
  latitude: number | null;
  /** db: longitude — NULL. */
  longitude: number | null;
  /** db: occurredAt — NULL. */
  occurredAt: Date | null;
  createdAt: Date;
}

/** The 5 target dimensions a single `governance.legacy_status_mapping` row resolves to, keyed by the legacy `(status, verificationStatus)` pair — D-02. */
export interface LegacyStatusMappingEntry {
  operationalStatus: IncidentOperationalStatus;
  verificationStatus: IncidentVerificationStatus;
  preventiveStatus: IncidentPreventiveStatus;
  trend: IncidentTrend;
  structuralStatus: IncidentStructuralStatus;
}

/** Injected lookup standing in for `governance.legacy_status_mapping` — keyed `"<status>|<verificationStatus>"`. Never hardcoded inline in this adapter (D-02). */
export type LegacyStatusMappingTable = ReadonlyMap<string, LegacyStatusMappingEntry>;

function mappingKey(status: string | null, verificationStatus: string | null): string {
  return `${status ?? "null"}|${verificationStatus ?? "null"}`;
}

/** 2. Target-read interface — reuses `incident.ts`'s `Incident`. */
export type IncidentTarget = Incident;

/** 3. current -> target transform. Returns `null` (never a guess) when no approved mapping entry covers this legacy `(status, verificationStatus)` pair. */
export function knowledgeIncidentToTarget(
  record: LegacyKnowledgeIncidentRecord,
  mappingTable: LegacyStatusMappingTable
): IncidentTarget | null {
  const entry = mappingTable.get(mappingKey(record.status, record.verificationStatus));
  if (!entry) return null;

  return {
    id: record.id,
    originCandidateId: null,
    verificationStatus: entry.verificationStatus,
    operationalStatus: entry.operationalStatus,
    preventiveStatus: entry.preventiveStatus,
    trend: entry.trend,
    structuralStatus: entry.structuralStatus,
    incidentTypeId: record.incidentTypeId,
    classification: "CRITICAL",
    title: record.title,
    description: record.summary,
    createdAt: record.createdAt.toISOString(),
    closedAt: null,
    legacyStatus: record.status,
    legacySource: "KnowledgeIncident",
    legacyRecordId: record.id,
    migrationConfidence: "HIGH",
    migrationReviewStatus: "AUTO_MAPPED",
  };
}

/** 4. target -> legacy-payload transform — the canonical mapper (`canonicalKnowledgeIncidentToArgusEvent()`) output shape this adapter must stay compatible with: `effectiveSeverity` derived from `classification`, never re-collapsing the 5 dimensions back into `KnowledgeIncident.status`. */
export function incidentTargetToLegacyPayload(target: IncidentTarget): {
  id: string;
  title: string;
  summary: string;
  effectiveSeverity: string;
} {
  return {
    id: target.id,
    title: target.title,
    summary: target.description ?? "",
    effectiveSeverity: target.classification.toLowerCase(),
  };
}

/** 5-9. Shadow write — NOT_ENABLED when the flag is off; REQUIRES_REVIEW when no approved status mapping covers this row (D-02 — never guessed); never a fake success. */
export function shadowWriteIncident(
  record: LegacyKnowledgeIncidentRecord,
  mappingTable: LegacyStatusMappingTable,
  ctx: AdapterWriteContext
): AdapterOutcome<IncidentTarget> {
  if (!ctx.shadowWriteEnabled) {
    return notEnabled("targetDatabaseShadowWrite is disabled — incident shadow write not attempted");
  }
  if (!record.id) {
    return migrationBlocked("LegacyKnowledgeIncidentRecord.id is required to derive incidents.legacy_record_id");
  }
  const target = knowledgeIncidentToTarget(record, mappingTable);
  if (!target) {
    return requiresReview(
      `no approved governance.legacy_status_mapping entry for (status=${record.status ?? "null"}, ` +
        `verificationStatus=${record.verificationStatus ?? "null"}) — D-02 forbids guessing this mapping`
    );
  }
  return {
    kind: "PERSISTED",
    target,
    legacyId: record.id,
    migrationConfidence: target.migrationConfidence ?? "HIGH",
    reviewStatus: target.migrationReviewStatus ?? "AUTO_MAPPED",
  };
}

/** Stable idempotency key for `KnowledgeIncident` -> `Incident` — legacy table + legacy id, never a random UUID (Fase 7). */
export function incidentIdempotencyKey(record: LegacyKnowledgeIncidentRecord): string {
  return `KnowledgeIncident:${record.id}`;
}

/** Stable idempotency key for `KnowledgeIncident` -> `IncidentCandidate` — distinct namespace from `incidentIdempotencyKey` so the two writers never collide in a shared idempotency store. */
export function incidentCandidateIdempotencyKey(record: LegacyKnowledgeIncidentRecord): string {
  return `KnowledgeIncident:candidate:${record.id}`;
}

/**
 * `KnowledgeIncident` -> `IncidentCandidate` ONLY (Ola 3/4 controlled handoff).
 * This function NEVER returns an `Incident` — Ola 4's promotion step (a
 * human/automation-rule decision recorded in `incident.incident_promotions`)
 * is explicitly out of scope for this transform and for every shadow-write
 * caller built on top of it. `proposedProfile` is `null` (never guessed)
 * when D-02's approved status-mapping table has no entry for this row's
 * `(status, verificationStatus)` pair.
 */
export function knowledgeIncidentToCandidate(
  record: LegacyKnowledgeIncidentRecord,
  mappingTable: LegacyStatusMappingTable,
  originType: IncidentCandidateOriginType = "LEGACY_KNOWLEDGE_INCIDENT"
): IncidentCandidate {
  const entry = mappingTable.get(mappingKey(record.status, record.verificationStatus));

  const proposedProfile: ProposedIncidentProfile | null = entry
    ? {
        proposedIncidentTypeId: record.incidentTypeId,
        proposedCategory: record.subtype ?? record.domain,
        verificationStatus: entry.verificationStatus,
        operationalStatus: entry.operationalStatus,
        preventiveStatus: entry.preventiveStatus,
        trend: entry.trend,
        structuralStatus: entry.structuralStatus,
        confidence: confidenceLevelFromLegacy(record.confidenceLevel),
      }
    : null;

  return {
    id: record.id,
    status: "UNDER_ASSESSMENT",
    correlationKey: record.externalId ? `${record.sourceId}:${record.externalId}` : null,
    classification: "OPERATIONAL",
    promotionStartedAt: null,
    createdAt: record.createdAt.toISOString(),

    candidateOriginType: originType,
    proposedProfile,

    jurisdictionId: null,
    administrativeAreaId: null,
    location:
      record.latitude !== null && record.longitude !== null
        ? { latitude: record.latitude, longitude: record.longitude }
        : null,
    occurredAt: record.occurredAt ? record.occurredAt.toISOString() : null,
    receivedAt: null,
    clientCreatedAt: null,

    sourceRecordIds: [],
    observationIds: [],
    evidenceIds: [],

    automationRuleId: null,
    actorType: null,
    actorId: null,

    provenance: null,

    legacyStatus: record.status,
    legacySource: "KnowledgeIncident",
    legacyRecordId: record.id,
    migrationConfidence: entry ? "HIGH" : "LOW",
    migrationReviewStatus: entry ? "AUTO_MAPPED" : "REQUIRES_REVIEW",
  };
}

function confidenceLevelFromLegacy(value: string | null): "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH" | "CONFIRMED" {
  switch (value) {
    case "low":
      return "LOW";
    case "medium":
      return "MEDIUM";
    case "high":
      return "HIGH";
    case "very_high":
      return "CONFIRMED";
    default:
      return "UNKNOWN";
  }
}

/**
 * Shadow write for `KnowledgeIncident` -> `IncidentCandidate`. Unlike
 * `shadowWriteIncident` (which requires an approved mapping to produce
 * anything), this ALWAYS persists a candidate — an unmapped legacy row is
 * still a real candidate, just one with `proposedProfile: null` and
 * `reviewStatus: REQUIRES_REVIEW` (D-02: never guessed, never dropped).
 * Never promotes to `Incident` — there is no code path in this function
 * that constructs one.
 */
export function shadowWriteIncidentCandidate(
  record: LegacyKnowledgeIncidentRecord,
  mappingTable: LegacyStatusMappingTable,
  ctx: AdapterWriteContext
): AdapterOutcome<IncidentCandidate> {
  if (!ctx.shadowWriteEnabled) {
    return notEnabled("targetDatabaseShadowWrite is disabled — incident-candidate shadow write not attempted");
  }
  if (!record.id) {
    return migrationBlocked("LegacyKnowledgeIncidentRecord.id is required to derive incident_candidates.legacy_record_id");
  }
  const target = knowledgeIncidentToCandidate(record, mappingTable);
  return {
    kind: "PERSISTED",
    target,
    legacyId: record.id,
    migrationConfidence: target.migrationConfidence ?? "LOW",
    reviewStatus: target.migrationReviewStatus ?? "REQUIRES_REVIEW",
  };
}
