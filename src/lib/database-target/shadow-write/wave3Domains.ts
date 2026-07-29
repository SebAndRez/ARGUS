/**
 * src/lib/database-target/shadow-write/wave3Domains.ts
 *
 * Wires `runWave3ShadowWrite` to the 5 domains Fase 8 of the wave-3 mandate
 * names: `ExternalEvent`, `Report`, `KnowledgeIncident` (-> `IncidentCandidate`
 * ONLY — the controlled handoff, never `Incident`), `TelecomConnectivityStatus`,
 * `TelecomConnectivityEvidence`. Each function requires an injected
 * `persist` callback (the real target-repository call in
 * `src/lib/database-target/repositories/*`, or a test double in unit
 * tests) — this module never persists anything on its own.
 *
 * Not connected to any endpoint or UI component. Intended to be called
 * only from server-side canonical owners of these writes:
 * `persistExternalEvents.ts` (ExternalEvent), the `Report` creation
 * service, `knowledgePersistenceService.ts`/`masterIncidentEngine.ts`
 * (KnowledgeIncident), and the telecom-connectivity admin route's
 * server-side handlers — never from a React component.
 */

import type { AdapterWriteContext } from "../adapters/types";
import {
  externalEventToSourceRecord,
  reportToReportTarget,
  telecomConnectivityEvidenceToEvidence,
  telecomConnectivityStatusToObservation,
  type LegacyExternalEventRecordFull,
  type LegacyReportRecordFull,
  type LegacyTelecomConnectivityEvidenceRecord,
  type LegacyTelecomConnectivityStatusRecord,
} from "../adapters/wave3Transformers";
import {
  knowledgeIncidentToIncidentCandidateResult,
} from "../adapters/wave3Transformers";
import type { LegacyKnowledgeIncidentRecord, LegacyStatusMappingTable } from "../adapters/incident";
import type { SourceRecord } from "../ingest";
import type { EvidenceAsset, EvidenceRecord, Observation, Report } from "../evidence";
import type { IncidentCandidate } from "../incident";
import { runWave3ShadowWrite, type Wave3PersistResult, type Wave3ShadowWriteResult } from "./wave3ShadowWriteRunner";

type PersistFn<TTarget, TTargetId> = (target: TTarget, idempotencyKey: string) => Promise<Wave3PersistResult<TTargetId>>;

/** 1. `ExternalEvent` -> `ingest.source_records`. */
export function shadowWriteExternalEventWave3<TTargetId = string>(
  record: LegacyExternalEventRecordFull,
  ctx: AdapterWriteContext,
  persist: PersistFn<SourceRecord, TTargetId>
): Promise<Wave3ShadowWriteResult> {
  return runWave3ShadowWrite(record, {
    domain: "ExternalEvent",
    ctx,
    legacyId: (r) => r.id,
    transform: (r) => externalEventToSourceRecord(r),
    persist,
  });
}

/** 2. `Report` -> `evidence.observations` (Report target). */
export function shadowWriteReportWave3<TTargetId = string>(
  record: LegacyReportRecordFull,
  ctx: AdapterWriteContext,
  persist: PersistFn<Report, TTargetId>
): Promise<Wave3ShadowWriteResult> {
  return runWave3ShadowWrite(record, {
    domain: "Report",
    ctx,
    legacyId: (r) => r.id,
    transform: (r) => reportToReportTarget(r),
    persist,
  });
}

/**
 * 3. `KnowledgeIncident` -> `incident.incident_candidates` ONLY (the
 * controlled Ola 3 -> Ola 4 handoff). This function has no code path that
 * could construct/persist an `Incident` — `domain` is fixed to
 * `"IncidentCandidate"` so the runner's created/duplicate counters
 * (`wave3_incident_candidate_created_total`/`_duplicate_total`) fire
 * correctly, and so a caller can never accidentally point it at an
 * `Incident` repository by passing a different domain string.
 */
export function shadowWriteKnowledgeIncidentToCandidateWave3<TTargetId = string>(
  record: LegacyKnowledgeIncidentRecord,
  mappingTable: LegacyStatusMappingTable,
  ctx: AdapterWriteContext,
  persist: PersistFn<IncidentCandidate, TTargetId>
): Promise<Wave3ShadowWriteResult> {
  return runWave3ShadowWrite(record, {
    domain: "IncidentCandidate",
    ctx,
    legacyId: (r) => r.id,
    transform: (r) => knowledgeIncidentToIncidentCandidateResult(r, mappingTable),
    persist,
  });
}

/** 4. `TelecomConnectivityStatus` -> `evidence.observations` (D-04). */
export function shadowWriteTelecomConnectivityStatusWave3<TTargetId = string>(
  record: LegacyTelecomConnectivityStatusRecord,
  ctx: AdapterWriteContext,
  persist: PersistFn<Observation, TTargetId>
): Promise<Wave3ShadowWriteResult> {
  return runWave3ShadowWrite(record, {
    domain: "TelecomConnectivityStatus",
    ctx,
    legacyId: (r) => r.id,
    transform: (r) => telecomConnectivityStatusToObservation(r),
    persist,
  });
}

/** 5. `TelecomConnectivityEvidence` -> `evidence.evidence_records` (+ `evidence_assets` metadata, D-04). */
export function shadowWriteTelecomConnectivityEvidenceWave3<TTargetId = string>(
  record: LegacyTelecomConnectivityEvidenceRecord,
  ctx: AdapterWriteContext,
  persist: PersistFn<{ evidence: EvidenceRecord; asset: EvidenceAsset | null }, TTargetId>
): Promise<Wave3ShadowWriteResult> {
  return runWave3ShadowWrite(record, {
    domain: "TelecomConnectivityEvidence",
    ctx,
    legacyId: (r) => r.id,
    transform: (r) => telecomConnectivityEvidenceToEvidence(r),
    persist,
  });
}
