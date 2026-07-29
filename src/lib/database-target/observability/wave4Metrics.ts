/**
 * src/lib/database-target/observability/wave4Metrics.ts
 *
 * The 11 wave-4-specific metrics named by the mandate (Fase 13), reusing
 * the existing `logOperationalEvent` infrastructure — same discipline as
 * `wave3Metrics.ts`: every function accepts only opaque ids, domain names,
 * and durations, never free-text content, names, emails, exact
 * coordinates, or Report content.
 */

import { logOperationalEvent } from "@/lib/observability/operationalEvents";

const COMPONENT = "database-target.wave4";

export interface Wave4MetricBase {
  incidentCandidateId?: string;
  incidentId?: string;
}

/** incident_candidate_promotion_attempt_total */
export function recordPromotionAttempt(input: Wave4MetricBase & { actorType: string }): void {
  logOperationalEvent({
    event: "incident_candidate_promotion_attempt_total",
    level: "debug",
    component: COMPONENT,
    incidentId: input.incidentCandidateId,
    outcome: input.actorType,
  });
}

/** incident_candidate_promotion_success_total */
export function recordPromotionSuccess(input: Wave4MetricBase & { actorType: string }): void {
  logOperationalEvent({
    event: "incident_candidate_promotion_success_total",
    level: "info",
    component: COMPONENT,
    incidentId: input.incidentId ?? input.incidentCandidateId,
    outcome: input.actorType,
  });
}

/** incident_candidate_promotion_failure_total */
export function recordPromotionFailure(input: Wave4MetricBase & { errorCode: string }): void {
  logOperationalEvent({
    event: "incident_candidate_promotion_failure_total",
    level: "error",
    component: COMPONENT,
    incidentId: input.incidentCandidateId,
    errorCode: input.errorCode,
  });
}

/** incident_candidate_promotion_duplicate_total — idempotent retry hit, never a real duplicate row. */
export function recordPromotionDuplicate(input: Wave4MetricBase & { idempotencyKey: string }): void {
  logOperationalEvent({
    event: "incident_candidate_promotion_duplicate_total",
    level: "debug",
    component: COMPONENT,
    incidentId: input.incidentCandidateId,
    requestId: input.idempotencyKey,
  });
}

/** incident_candidate_discard_total */
export function recordDiscard(input: Wave4MetricBase): void {
  logOperationalEvent({
    event: "incident_candidate_discard_total",
    level: "info",
    component: COMPONENT,
    incidentId: input.incidentCandidateId,
  });
}

/** incident_candidate_discard_duplicate_total — retry against an already-discarded candidate. */
export function recordDiscardDuplicate(input: Wave4MetricBase): void {
  logOperationalEvent({
    event: "incident_candidate_discard_duplicate_total",
    level: "debug",
    component: COMPONENT,
    incidentId: input.incidentCandidateId,
  });
}

/** incident_hypothesis_created_total */
export function recordHypothesisCreated(input: Wave4MetricBase & { hypothesisId: string }): void {
  logOperationalEvent({
    event: "incident_hypothesis_created_total",
    level: "info",
    component: COMPONENT,
    incidentId: input.incidentCandidateId,
    requestId: input.hypothesisId,
  });
}

/** incident_hypothesis_superseded_total */
export function recordHypothesisSuperseded(input: Wave4MetricBase & { hypothesisId: string }): void {
  logOperationalEvent({
    event: "incident_hypothesis_superseded_total",
    level: "info",
    component: COMPONENT,
    incidentId: input.incidentCandidateId,
    requestId: input.hypothesisId,
  });
}

/** automated_promotion_blocked_total — an AutomationRule attempt rejected before any row was written (no approved rule, rule not applicable to the incident type, threshold not met, etc.). */
export function recordAutomatedPromotionBlocked(input: Wave4MetricBase & { errorCode: string }): void {
  logOperationalEvent({
    event: "automated_promotion_blocked_total",
    level: "warn",
    component: COMPONENT,
    incidentId: input.incidentCandidateId,
    errorCode: input.errorCode,
  });
}

/** human_promotion_denied_total — a human promotion attempt rejected by an invariant (candidate discarded, already promoted, missing actor, etc.). */
export function recordHumanPromotionDenied(input: Wave4MetricBase & { errorCode: string }): void {
  logOperationalEvent({
    event: "human_promotion_denied_total",
    level: "warn",
    component: COMPONENT,
    incidentId: input.incidentCandidateId,
    errorCode: input.errorCode,
  });
}

/** incident_promotion_latency_ms */
export function recordPromotionLatencyMs(input: { durationMs: number }): void {
  logOperationalEvent({
    event: "incident_promotion_latency_ms",
    level: "debug",
    component: COMPONENT,
    durationMs: input.durationMs,
  });
}
