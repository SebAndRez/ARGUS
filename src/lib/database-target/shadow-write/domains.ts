/**
 * src/lib/database-target/shadow-write/domains.ts
 *
 * Wires the generic `runShadowWrite` engine to the 4 domains Fase 8 names
 * as the initial shadow-write scope: `Report`, `HelpRequest`,
 * `ExternalEvent` (-> `ingest.source_records`/`evidence.observations`), and
 * `KnowledgeIncident` (-> `incident.incidents`; `incident.incident_candidates`
 * is the natural next satellite once its target type is modeled — tracked,
 * not fabricated here).
 *
 * These are isolated services: nothing here is imported by
 * `src/app/api/**` or any real persistence path. Each function assumes the
 * legacy/canonical write already happened and its result is passed in.
 */

import {
  evidenceSourceToTarget,
  type LegacyExternalEventRecord,
  type LegacyReportRecord,
} from "../adapters/evidence";
import { helpRequestToTarget, type LegacyHelpRequestRecord } from "../adapters/help";
import {
  knowledgeIncidentToTarget,
  type LegacyKnowledgeIncidentRecord,
  type LegacyStatusMappingTable,
} from "../adapters/incident";
import type { AdapterWriteContext } from "../adapters/types";
import {
  runShadowWrite,
  type IdempotencyStore,
  type ShadowWriteRecord,
} from "./shadowWriteRunner";
import type { EvidenceTarget } from "../adapters/evidence";
import type { HelpRequestTarget } from "../adapters/help";
import type { IncidentTarget } from "../adapters/incident";

export interface ShadowWriteDeps {
  ctx: AdapterWriteContext;
  idempotencyStore?: IdempotencyStore;
  onOutcome?: (record: ShadowWriteRecord<unknown>) => void;
}

/** `Report` (citizen report) -> `evidence.observations`. */
export function shadowWriteReport(
  legacyResult: LegacyReportRecord,
  deps: ShadowWriteDeps
): ShadowWriteRecord<EvidenceTarget> {
  return runShadowWrite(legacyResult, {
    domain: "Report",
    legacyId: (r) => r.id,
    idempotencyKey: (r) => `report:${r.id}`,
    targetTransform: (r) => {
      const target = evidenceSourceToTarget({ kind: "REPORT", record: r });
      return {
        kind: "PERSISTED",
        target,
        legacyId: r.id,
        migrationConfidence: target.migrationConfidence ?? "HIGH",
        reviewStatus: target.migrationReviewStatus ?? "AUTO_MAPPED",
      };
    },
    ctx: deps.ctx,
    idempotencyStore: deps.idempotencyStore,
    onOutcome: deps.onOutcome as ((record: ShadowWriteRecord<EvidenceTarget>) => void) | undefined,
  });
}

/** `ExternalEvent` (-> `ingest.source_records` origin) -> `evidence.observations`. */
export function shadowWriteExternalEvent(
  legacyResult: LegacyExternalEventRecord,
  deps: ShadowWriteDeps
): ShadowWriteRecord<EvidenceTarget> {
  return runShadowWrite(legacyResult, {
    domain: "ExternalEvent",
    legacyId: (r) => r.id,
    idempotencyKey: (r) => `external_event:${r.id}`,
    targetTransform: (r) => {
      const target = evidenceSourceToTarget({ kind: "EXTERNAL_EVENT", record: r });
      return {
        kind: "PERSISTED",
        target,
        legacyId: r.id,
        migrationConfidence: target.migrationConfidence ?? "MEDIUM",
        reviewStatus: target.migrationReviewStatus ?? "AUTO_MAPPED",
      };
    },
    ctx: deps.ctx,
    idempotencyStore: deps.idempotencyStore,
    onOutcome: deps.onOutcome as ((record: ShadowWriteRecord<EvidenceTarget>) => void) | undefined,
  });
}

/** `HelpRequest` -> `help.help_requests`. */
export function shadowWriteHelpRequestDomain(
  legacyResult: LegacyHelpRequestRecord,
  deps: ShadowWriteDeps
): ShadowWriteRecord<HelpRequestTarget> {
  return runShadowWrite(legacyResult, {
    domain: "HelpRequest",
    legacyId: (r) => r.id,
    idempotencyKey: (r) => `help_request:${r.id}`,
    targetTransform: (r) => {
      const target = helpRequestToTarget(r);
      return {
        kind: "PERSISTED",
        target,
        legacyId: r.id,
        migrationConfidence: target.migrationConfidence ?? "HIGH",
        reviewStatus: target.migrationReviewStatus ?? "AUTO_MAPPED",
      };
    },
    ctx: deps.ctx,
    idempotencyStore: deps.idempotencyStore,
    onOutcome: deps.onOutcome as ((record: ShadowWriteRecord<HelpRequestTarget>) => void) | undefined,
  });
}

/**
 * `KnowledgeIncident` -> `incident.incidents` (`incident.incident_candidates`
 * is the natural precursor satellite for this same row once modeled — not
 * fabricated here; D-02 mapping table is required, never guessed).
 */
export function shadowWriteKnowledgeIncident(
  legacyResult: LegacyKnowledgeIncidentRecord,
  mappingTable: LegacyStatusMappingTable,
  deps: ShadowWriteDeps
): ShadowWriteRecord<IncidentTarget> {
  return runShadowWrite(legacyResult, {
    domain: "KnowledgeIncident",
    legacyId: (r) => r.id,
    idempotencyKey: (r) => `knowledge_incident:${r.id}`,
    targetTransform: (r) => {
      const target = knowledgeIncidentToTarget(r, mappingTable);
      if (!target) {
        return {
          kind: "REQUIRES_REVIEW",
          reason:
            `no approved governance.legacy_status_mapping entry for (status=${r.status ?? "null"}, ` +
            `verificationStatus=${r.verificationStatus ?? "null"}) — D-02 forbids guessing this mapping`,
        };
      }
      return {
        kind: "PERSISTED",
        target,
        legacyId: r.id,
        migrationConfidence: target.migrationConfidence ?? "HIGH",
        reviewStatus: target.migrationReviewStatus ?? "AUTO_MAPPED",
      };
    },
    ctx: deps.ctx,
    idempotencyStore: deps.idempotencyStore,
    onOutcome: deps.onOutcome as ((record: ShadowWriteRecord<IncidentTarget>) => void) | undefined,
  });
}
