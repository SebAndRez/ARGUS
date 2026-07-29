/**
 * src/lib/database-target/adapters/evidence.ts
 *
 * Functional compatibility adapter for BC 5 (Reportes/Observaciones/
 * Evidencia), current `Report` (1 row, D-01 `authorType='CITIZEN'`) and
 * `ExternalEvent` (1,904 rows) -> target `evidence.observations` (Ola 3).
 * `KnowledgeEvidence`/`Evidence` follow the same `Observation`/
 * `EvidenceRecord` shape but are out of scope for this first adapter pass
 * (tracked as a follow-up wave item, not fabricated here).
 */

import type { Observation } from "../evidence";
import {
  type AdapterOutcome,
  type AdapterWriteContext,
  migrationBlocked,
  notEnabled,
} from "./types";

/** 1a. Current-read interface — the exact subset of `Report` (prisma/schema.prisma) this adapter touches. */
export interface LegacyReportRecord {
  id: string;
  userId: string;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  status: string;
  createdAt: Date;
}

/** 1b. Current-read interface — the exact subset of `ExternalEvent` this adapter touches. */
export interface LegacyExternalEventRecord {
  id: string;
  sourceId: string;
  title: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
}

export type LegacyEvidenceSource =
  | { kind: "REPORT"; record: LegacyReportRecord }
  | { kind: "EXTERNAL_EVENT"; record: LegacyExternalEventRecord };

/** 2. Target-read interface — reuses `evidence.ts`'s `Observation`. */
export type EvidenceTarget = Observation;

/** 3. current -> target transform (D-04: `Evidence`/`TelecomConnectivityStatus` migrate here, never to `comms.*` — not exercised by this adapter's 0-row current models, but the destination is the same one used here). */
export function evidenceSourceToTarget(source: LegacyEvidenceSource): EvidenceTarget {
  if (source.kind === "REPORT") {
    const r = source.record;
    return {
      id: r.id,
      originType: "PRIMARY",
      authorType: "CITIZEN",
      authorPersonId: r.userId,
      sourceRecordId: null,
      claimText: `${r.title}\n\n${r.description}`,
      claimStructured: null,
      claimSchemaVersion: 1,
      provenance: { chain: [{ stepKind: "CITIZEN_REPORT", timestamp: r.createdAt.toISOString() }], depth: 1 },
      provenanceSchemaVersion: 1,
      location: { latitude: r.latitude, longitude: r.longitude },
      occurredAt: r.createdAt.toISOString(),
      reportedAt: r.createdAt.toISOString(),
      verificationStatus: "UNVERIFIED",
      confidenceLevel: "UNKNOWN",
      correctsObservationId: null,
      retractsObservationId: null,
      createdAt: r.createdAt.toISOString(),
      legacyStatus: r.status,
      legacySource: "Report",
      legacyRecordId: r.id,
      migrationConfidence: "HIGH",
      migrationReviewStatus: "AUTO_MAPPED",
    };
  }

  const e = source.record;
  return {
    id: e.id,
    originType: "PRIMARY",
    authorType: null,
    authorPersonId: null,
    sourceRecordId: e.sourceId,
    claimText: e.description ? `${e.title}\n\n${e.description}` : e.title,
    claimStructured: null,
    claimSchemaVersion: 1,
    provenance: {
      chain: [{ stepKind: "EXTERNAL_INGESTION", sourceRecordId: e.sourceId, timestamp: e.createdAt.toISOString() }],
      depth: 1,
    },
    provenanceSchemaVersion: 1,
    location: e.latitude !== null && e.longitude !== null ? { latitude: e.latitude, longitude: e.longitude } : null,
    occurredAt: null,
    reportedAt: e.createdAt.toISOString(),
    verificationStatus: "UNVERIFIED",
    confidenceLevel: "UNKNOWN",
    correctsObservationId: null,
    retractsObservationId: null,
    createdAt: e.createdAt.toISOString(),
    legacyStatus: null,
    legacySource: "ExternalEvent",
    legacyRecordId: e.id,
    migrationConfidence: e.latitude !== null && e.longitude !== null ? "HIGH" : "MEDIUM",
    migrationReviewStatus: "AUTO_MAPPED",
  };
}

/** 4. target -> legacy-payload transform — the `Report`-compatible DTO shape for code not yet migrated. Only meaningful for CITIZEN-authored observations (mirrors `Report`'s shape); returns null for machine-authored (`ExternalEvent`-sourced) rows, which had no `Report` equivalent. */
export function evidenceTargetToLegacyPayload(
  target: EvidenceTarget
): { id: string; title: string; description: string; latitude: number; longitude: number } | null {
  if (target.authorType !== "CITIZEN" || !target.location) return null;
  const [title, ...rest] = target.claimText.split("\n\n");
  return {
    id: target.id,
    title,
    description: rest.join("\n\n"),
    latitude: target.location.latitude,
    longitude: target.location.longitude,
  };
}

/** 5-9. Shadow write — explicit NOT_ENABLED when the flag is off; never a fake success. */
export function shadowWriteEvidence(
  source: LegacyEvidenceSource,
  ctx: AdapterWriteContext
): AdapterOutcome<EvidenceTarget> {
  if (!ctx.shadowWriteEnabled) {
    return notEnabled("targetDatabaseShadowWrite is disabled — evidence shadow write not attempted");
  }
  const record = source.record;
  if (!record.id) {
    return migrationBlocked("legacy record has no id — cannot derive observations.id/legacy_record_id");
  }
  const target = evidenceSourceToTarget(source);
  return {
    kind: "PERSISTED",
    target,
    legacyId: record.id,
    migrationConfidence: target.migrationConfidence ?? "MEDIUM",
    reviewStatus: target.migrationReviewStatus ?? "AUTO_MAPPED",
  };
}
