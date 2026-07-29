/**
 * src/lib/database-target/observability/wave3Metrics.ts
 *
 * The 9 wave-3-specific metrics Fase 13 of the wave-3 mandate names,
 * reusing the existing `logOperationalEvent` infrastructure (no new
 * logging/metrics service introduced — same discipline as
 * `observability/metrics.ts`). Every function accepts only opaque ids,
 * domain names, and durations — never free-text content, names, emails,
 * exact coordinates, or evidence.
 */

import { logOperationalEvent } from "@/lib/observability/operationalEvents";

const COMPONENT = "database-target.wave3";

export interface Wave3MetricBase {
  domain: string;
  legacyId?: string;
}

/** wave3_shadow_write_attempt_total */
export function recordShadowWriteAttempt(input: Wave3MetricBase): void {
  logOperationalEvent({
    event: "wave3_shadow_write_attempt_total",
    level: "debug",
    component: COMPONENT,
    incidentId: input.legacyId,
    outcome: input.domain,
  });
}

/** wave3_shadow_write_success_total */
export function recordShadowWriteSuccess(input: Wave3MetricBase): void {
  logOperationalEvent({
    event: "wave3_shadow_write_success_total",
    level: "info",
    component: COMPONENT,
    incidentId: input.legacyId,
    outcome: input.domain,
  });
}

/** wave3_shadow_write_failure_total */
export function recordShadowWriteFailure(input: Wave3MetricBase & { errorCode: string }): void {
  logOperationalEvent({
    event: "wave3_shadow_write_failure_total",
    level: "error",
    component: COMPONENT,
    incidentId: input.legacyId,
    outcome: input.domain,
    errorCode: input.errorCode,
  });
}

/** wave3_shadow_write_skipped_total — emitted ONLY when targetDatabaseShadowWrite is disabled (Fase 8 point 4: no client opened, no target write, this is the sole recorded signal). */
export function recordShadowWriteSkipped(input: Wave3MetricBase): void {
  logOperationalEvent({
    event: "wave3_shadow_write_skipped_total",
    level: "debug",
    component: COMPONENT,
    incidentId: input.legacyId,
    outcome: input.domain,
    errorCode: "NOT_ENABLED",
  });
}

/** wave3_idempotency_hit_total */
export function recordIdempotencyHit(input: Wave3MetricBase & { idempotencyKey: string }): void {
  logOperationalEvent({
    event: "wave3_idempotency_hit_total",
    level: "debug",
    component: COMPONENT,
    incidentId: input.legacyId,
    outcome: input.domain,
    requestId: input.idempotencyKey,
  });
}

/** wave3_reconciliation_review_total */
export function recordReconciliationReview(input: Wave3MetricBase): void {
  logOperationalEvent({
    event: "wave3_reconciliation_review_total",
    level: "warn",
    component: COMPONENT,
    incidentId: input.legacyId,
    outcome: input.domain,
  });
}

/** wave3_incident_candidate_created_total */
export function recordIncidentCandidateCreated(input: { legacyId: string }): void {
  logOperationalEvent({
    event: "wave3_incident_candidate_created_total",
    level: "info",
    component: COMPONENT,
    incidentId: input.legacyId,
    outcome: "IncidentCandidate",
  });
}

/** wave3_incident_candidate_duplicate_total */
export function recordIncidentCandidateDuplicate(input: { legacyId: string }): void {
  logOperationalEvent({
    event: "wave3_incident_candidate_duplicate_total",
    level: "debug",
    component: COMPONENT,
    incidentId: input.legacyId,
    outcome: "IncidentCandidate",
  });
}

/** wave3_target_latency_ms */
export function recordTargetLatencyMs(input: { domain: string; durationMs: number }): void {
  logOperationalEvent({
    event: "wave3_target_latency_ms",
    level: "debug",
    component: COMPONENT,
    outcome: input.domain,
    durationMs: input.durationMs,
  });
}
