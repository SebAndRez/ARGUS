/**
 * src/lib/database-target/observability/metrics.ts
 *
 * Structured migration-runtime metrics (Executable Migration Plan Fase 10).
 * Reuses the existing `logOperationalEvent` infrastructure
 * (`src/lib/observability/operationalEvents.ts`) — no new logging/metrics
 * service is introduced. Every function here is a thin, intention-revealing
 * wrapper; none of them are wired into a real request path yet.
 *
 * HARD RULE (Fase 10): never pass free-text content, exact coordinates,
 * emails, names, or evidence into any of these functions. Only pass
 * opaque ids, domain names, enum-like outcome strings, counts, and
 * durations. `logOperationalEvent`'s `redactForLog` already strips
 * key-name-matched sensitive fields as defense in depth, but the
 * discipline here is to never construct such a payload in the first place.
 */

import { logOperationalEvent } from "@/lib/observability/operationalEvents";

const COMPONENT = "database-target";

export interface MigrationMetricBase {
  domain: string;
  legacyId?: string;
  targetId?: string;
}

export function recordShadowWriteAttempted(input: MigrationMetricBase): void {
  logOperationalEvent({
    event: "shadow_write.attempted",
    level: "debug",
    component: COMPONENT,
    incidentId: input.legacyId,
    outcome: input.domain,
  });
}

export function recordShadowWriteSucceeded(input: MigrationMetricBase & { durationMs?: number }): void {
  logOperationalEvent({
    event: "shadow_write.succeeded",
    level: "info",
    component: COMPONENT,
    incidentId: input.legacyId,
    outcome: input.domain,
    durationMs: input.durationMs,
  });
}

export function recordShadowWriteFailed(
  input: MigrationMetricBase & { errorCode: string; durationMs?: number }
): void {
  logOperationalEvent({
    event: "shadow_write.failed",
    level: "error",
    component: COMPONENT,
    incidentId: input.legacyId,
    outcome: input.domain,
    errorCode: input.errorCode,
    durationMs: input.durationMs,
  });
}

export function recordReadDiscrepancy(
  input: MigrationMetricBase & { discrepancyKind: string }
): void {
  logOperationalEvent({
    event: "dual_read.discrepancy",
    level: "warn",
    component: COMPONENT,
    incidentId: input.legacyId,
    outcome: input.discrepancyKind,
  });
}

export function recordBackfillPending(input: { domain: string; pendingCount: number }): void {
  logOperationalEvent({
    event: "backfill.pending",
    level: "info",
    component: COMPONENT,
    outcome: input.domain,
    count: input.pendingCount,
  });
}

export function recordReviewQueueEntry(input: MigrationMetricBase): void {
  logOperationalEvent({
    event: "review_queue.entered",
    level: "warn",
    component: COMPONENT,
    incidentId: input.legacyId,
    outcome: input.domain,
  });
}

export function recordIdempotencySkip(input: MigrationMetricBase & { idempotencyKey: string }): void {
  logOperationalEvent({
    event: "shadow_write.idempotent_skip",
    level: "debug",
    component: COMPONENT,
    incidentId: input.legacyId,
    outcome: input.domain,
    requestId: input.idempotencyKey,
  });
}

export function recordLegacyLatency(input: { domain: string; durationMs: number }): void {
  logOperationalEvent({
    event: "read.legacy_latency",
    level: "debug",
    component: COMPONENT,
    outcome: input.domain,
    durationMs: input.durationMs,
  });
}

export function recordTargetLatency(input: { domain: string; durationMs: number }): void {
  logOperationalEvent({
    event: "read.target_latency",
    level: "debug",
    component: COMPONENT,
    outcome: input.domain,
    durationMs: input.durationMs,
  });
}

export function recordRollbackReadiness(input: { wave: string; ready: boolean }): void {
  logOperationalEvent({
    event: "rollback.readiness",
    level: input.ready ? "info" : "warn",
    component: COMPONENT,
    outcome: input.wave,
    errorCode: input.ready ? undefined : "ROLLBACK_NOT_READY",
  });
}
