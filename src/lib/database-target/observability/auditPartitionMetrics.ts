/**
 * src/lib/database-target/observability/auditPartitionMetrics.ts
 *
 * The 7 audit-partition-lifecycle metrics, on the same
 * `logOperationalEvent` infrastructure as `wave3Metrics.ts` /
 * `wave4Metrics.ts` and with the same discipline: the ONLY labels these
 * functions accept are a result vocabulary, a calendar year/month, the
 * technical process that acted, and a safe error code.
 *
 * What is structurally impossible to log here (mandate Fase 12): audit
 * content, actor id, target id, email, name, IP, coordinates, free-text
 * reason, metadata. None of those is a parameter of any function in this
 * file, so no caller can pass one even by accident — the redaction guarantee
 * is enforced by the type signatures, not by a convention someone has to
 * remember.
 *
 * A note on `year`/`month`: a partition's calendar month is derived from
 * `occurred_at`, which is operational metadata about WHEN an audit event was
 * recorded, at month granularity. It carries no information about who or
 * what the event concerned, and it is already visible in the partition's own
 * relation name, so emitting it as a label discloses nothing new while
 * making the metrics actually diagnosable ("which month failed to be
 * created?").
 */

import { logOperationalEvent } from "@/lib/observability/operationalEvents";

const COMPONENT = "database-target.audit-partition";

/** Result vocabulary of the SQL lifecycle — mirrors `security.fn_ensure_audit_log_partition`'s return values plus the maintenance-level outcomes. */
export type AuditPartitionResult = "CREATED" | "ALREADY_EXISTS" | "NOT_ENABLED" | "FAILED";

/** The technical process/actor that requested the ensure. Never a human identity — this is a code-path label, not a user. */
export type AuditPartitionProcess =
  | "audit-writer"
  | "window-maintenance"
  | "backfill"
  | "test";

export interface AuditPartitionMonthLabels {
  /** Calendar year of the partition, e.g. 2026. */
  year: number;
  /** Calendar month of the partition, 1-12. */
  month: number;
  process: AuditPartitionProcess;
}

function monthLabels(input: AuditPartitionMonthLabels): { moduleId: string; outcome: string } {
  // moduleId carries `YYYY-MM`, outcome carries the technical process. Both
  // are fixed-shape, low-cardinality strings — never interpolated from
  // caller-supplied free text.
  const month = String(input.month).padStart(2, "0");
  return { moduleId: `${input.year}-${month}`, outcome: input.process };
}

/** audit_partition_ensure_attempt_total */
export function recordAuditPartitionEnsureAttempt(input: AuditPartitionMonthLabels): void {
  logOperationalEvent({
    event: "audit_partition_ensure_attempt_total",
    level: "debug",
    component: COMPONENT,
    ...monthLabels(input),
  });
}

/** audit_partition_created_total — a partition that did not exist now does. */
export function recordAuditPartitionCreated(input: AuditPartitionMonthLabels): void {
  logOperationalEvent({
    event: "audit_partition_created_total",
    level: "info",
    component: COMPONENT,
    ...monthLabels(input),
  });
}

/** audit_partition_existing_total — the idempotent hit; the month was already covered. */
export function recordAuditPartitionExisting(input: AuditPartitionMonthLabels): void {
  logOperationalEvent({
    event: "audit_partition_existing_total",
    level: "debug",
    component: COMPONENT,
    ...monthLabels(input),
  });
}

/** audit_partition_failure_total — `errorCode` is a safe, enum-like code (a SQLSTATE, an `Error.name`, or one of the AUDIT_PARTITION_* codes the SQL layer raises), never an exception message. */
export function recordAuditPartitionFailure(input: AuditPartitionMonthLabels & { errorCode: string }): void {
  logOperationalEvent({
    event: "audit_partition_failure_total",
    level: "error",
    component: COMPONENT,
    errorCode: input.errorCode,
    ...monthLabels(input),
  });
}

/** audit_partition_window_gap_total — the maintenance window found a month it had to create, i.e. coverage had drifted. `count` is how many months were missing. */
export function recordAuditPartitionWindowGap(input: { count: number; process: AuditPartitionProcess }): void {
  logOperationalEvent({
    event: "audit_partition_window_gap_total",
    level: input.count > 0 ? "warn" : "debug",
    component: COMPONENT,
    count: input.count,
    outcome: input.process,
  });
}

/** audit_partition_maintenance_skipped_total — maintenance ran while every target flag was off, so no client was opened and no DDL was attempted. */
export function recordAuditPartitionMaintenanceSkipped(input: { reason: "NOT_ENABLED" }): void {
  logOperationalEvent({
    event: "audit_partition_maintenance_skipped_total",
    level: "debug",
    component: COMPONENT,
    outcome: input.reason,
  });
}

/** audit_partition_ensure_latency_ms */
export function recordAuditPartitionEnsureLatencyMs(input: { durationMs: number; process: AuditPartitionProcess }): void {
  logOperationalEvent({
    event: "audit_partition_ensure_latency_ms",
    level: "debug",
    component: COMPONENT,
    durationMs: input.durationMs,
    outcome: input.process,
  });
}
