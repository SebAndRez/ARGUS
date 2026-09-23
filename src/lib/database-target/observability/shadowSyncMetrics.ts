/**
 * src/lib/database-target/observability/shadowSyncMetrics.ts
 *
 * Metrics for the connected shadow-write/dual-read path (Paso 5), on the same
 * `logOperationalEvent` infrastructure as `wave3Metrics.ts` — no second
 * logging mechanism. PII-free by construction: only domain names, target
 * table names, enum-like action/outcome codes, counts and durations. Never a
 * claim text, title, email, coordinate, or driver message.
 */

import { logOperationalEvent } from "@/lib/observability/operationalEvents";

const COMPONENT = "database-target.shadow-sync";
const DUAL_READ_COMPONENT = "database-target.dual-read";

/** shadow_sync_attempt_total */
export function recordShadowSyncAttempt(input: { domain: string; ids: number }): void {
  logOperationalEvent({
    event: "shadow_sync_attempt_total",
    level: "debug",
    component: COMPONENT,
    outcome: input.domain,
    count: input.ids,
  });
}

/**
 * shadow_sync_row_action_total — one per (legacy row, target table). The
 * action is what the database reported, so a BLOCKED_* or DEFERRED row is as
 * visible in the logs as a successful insert.
 */
export function recordShadowSyncRowAction(input: {
  domain: string;
  action: string;
  targetTable: string | null;
}): void {
  const isProblem =
    input.action === "BLOCKED_RECLASSIFICATION" ||
    input.action === "BLOCKED_REQUIRES_DECISION" ||
    input.action === "LEGACY_NOT_FOUND";
  logOperationalEvent({
    event: "shadow_sync_row_action_total",
    level: isProblem ? "warn" : "debug",
    component: COMPONENT,
    outcome: `${input.domain}:${input.action}`,
    detail: { targetTable: input.targetTable ?? "-" },
  });
}

/** shadow_sync_failure_total — the target side failed; legacy is unaffected by construction. */
export function recordShadowSyncFailure(input: { domain: string; errorCode: string }): void {
  logOperationalEvent({
    event: "shadow_sync_failure_total",
    level: "error",
    component: COMPONENT,
    outcome: input.domain,
    errorCode: input.errorCode,
  });
}

/** dual_read_comparison_total — one per compared legacy row. */
export function recordDualReadComparison(input: { domain: string; outcome: string }): void {
  const isDivergence = input.outcome !== "MATCH" && input.outcome !== "DEFERRED_EXPECTED";
  logOperationalEvent({
    event: "dual_read_comparison_total",
    level: isDivergence ? "warn" : "debug",
    component: DUAL_READ_COMPONENT,
    outcome: `${input.domain}:${input.outcome}`,
  });
}

/** dual_read_field_divergence_total — field NAMES only; values are never logged. */
export function recordDualReadFieldDivergence(input: { domain: string; field: string }): void {
  logOperationalEvent({
    event: "dual_read_field_divergence_total",
    level: "warn",
    component: DUAL_READ_COMPONENT,
    outcome: `${input.domain}:${input.field}`,
  });
}

/** dual_read_run_total — a whole reconciliation pass over one domain. */
export function recordDualReadRun(input: {
  domain: string;
  compared: number;
  divergences: number;
  durationMs: number;
}): void {
  logOperationalEvent({
    event: "dual_read_run_total",
    level: input.divergences > 0 ? "warn" : "info",
    component: DUAL_READ_COMPONENT,
    outcome: input.domain,
    count: input.compared,
    durationMs: input.durationMs,
    detail: { divergences: input.divergences },
  });
}

/** dual_read_failure_total — the target read itself failed; the legacy answer the user got is unaffected. */
export function recordDualReadFailure(input: { domain: string; errorCode: string }): void {
  logOperationalEvent({
    event: "dual_read_failure_total",
    level: "error",
    component: DUAL_READ_COMPONENT,
    outcome: input.domain,
    errorCode: input.errorCode,
  });
}

/** cutover_guard_evaluation_total — every evaluation, allowed or blocked, with the number of blocking gates. */
export function recordCutoverGuardEvaluation(input: { allowed: boolean; blockingGates: number }): void {
  logOperationalEvent({
    event: "cutover_guard_evaluation_total",
    level: input.allowed ? "warn" : "info",
    component: "database-target.cutover",
    outcome: input.allowed ? "ALLOWED" : "BLOCKED",
    count: input.blockingGates,
  });
}
