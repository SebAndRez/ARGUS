/**
 * src/lib/database-target/adapters/alert.ts
 *
 * Functional compatibility adapter for BC 12 (Alertas e Instrucciones
 * Críticas), target `alert.alerts`. Completely new domain (Ola 7,
 * CREATE_EMPTY) — today's "alert" is a read-side projection of
 * `KnowledgeIncident`/`ExternalEvent` via the canonical mapper, with no
 * authorization record of its own. This adapter does not replace that
 * mapper or its output (`ArgusEvent`); it only ever creates a NEW,
 * additional `alert.alerts` row from an explicit authorization request —
 * there is no legacy row to migrate.
 */

import type { Alert, AlertKind, Audience } from "../alert";
import {
  type AdapterOutcome,
  type AdapterWriteContext,
  migrationBlocked,
  notEnabled,
} from "./types";

/** 1. "Current-read" interface — deliberately absent; `alert.*` has no legacy source (the existing "alert" is a read projection, not a row to migrate). */
export type LegacyAlertSource = never;

/** 2. Target-read interface — reuses `alert.ts`'s `Alert`. */
export type AlertTarget = Alert;

/** An explicit, authorized alert-issuance request — the only legitimate input to this domain. */
export interface AlertIssuanceRequest {
  alertKind: AlertKind;
  incidentId: string | null;
  audience: Audience;
  authorizedByActorId: string;
}

/** 3. "current -> target" transform — N/A (no legacy source); forward-only issuance transform instead. */
export function alertRequestToTarget(request: AlertIssuanceRequest, newId: string, now: Date = new Date()): AlertTarget {
  return {
    id: newId,
    alertKind: request.alertKind,
    incidentId: request.incidentId,
    riskAssessmentId: null,
    audience: request.audience,
    audienceSchemaVersion: 1,
    targetArea: null,
    relatedInstructionId: null,
    classification: "RESTRICTED",
    createdAt: now.toISOString(),
  };
}

/** 4. target -> legacy-payload transform — projects onto the existing `ArgusEvent`-shaped alert fields the current map/notifications read, so a persisted `alert.alerts` row can coexist with the unchanged canonical-mapper read path. */
export function alertTargetToLegacyPayload(target: AlertTarget): {
  id: string;
  incidentId: string | null;
  severity: string;
} {
  return {
    id: target.id,
    incidentId: target.incidentId,
    severity: target.alertKind.toLowerCase(),
  };
}

/** 5-9. Shadow write — always blocked/not-enabled without an explicit authorization request; never derives an Alert from the read-side projection automatically. */
export function shadowWriteAlert(
  request: AlertIssuanceRequest | undefined,
  ctx: AdapterWriteContext
): AdapterOutcome<AlertTarget> {
  if (!ctx.shadowWriteEnabled) {
    return notEnabled("targetDatabaseShadowWrite is disabled — alert shadow write not attempted");
  }
  if (!request) {
    return migrationBlocked("alert.alerts has no legacy source — requires an explicit AlertIssuanceRequest");
  }
  if (!request.authorizedByActorId) {
    return migrationBlocked("an alert.alert_authorizations row is mandatory — authorizedByActorId is required");
  }
  return migrationBlocked(
    "alert shadow write is scaffolded but not yet connected to a real ID generator/persistence call"
  );
}
