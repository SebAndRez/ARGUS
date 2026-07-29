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

import type { Incident, IncidentOperationalStatus, IncidentPreventiveStatus, IncidentStructuralStatus, IncidentTrend, IncidentVerificationStatus } from "../incident";
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
