/**
 * src/lib/database-target/repositories/auditLogPartitionRepository.ts
 *
 * The single TypeScript entry point to the `security.audit_logs` monthly
 * partition lifecycle. Development/tests only, same isolation rules as every
 * other file under `src/lib/database-target/` — never imported by production
 * runtime code.
 *
 * This module deliberately contains NO partition SQL of its own beyond the
 * two function calls below. All naming, all UTC month arithmetic, all bound
 * computation, all concurrency handling and all DDL live in
 * `prisma/target-migrations/010_foundation/migration.sql`
 * (`security.fn_ensure_audit_log_partition` /
 * `security.fn_ensure_audit_log_partition_window`). Duplicating any of it
 * here would create a second source of truth that could drift from the one
 * the database actually enforces — and the SQL side is the only one that can
 * hold the advisory lock that makes concurrent creation safe.
 *
 * Two hard rules for callers:
 *   1. ENSURE BEFORE INSERT, in that order, within the same transaction.
 *      Reversing the order (insert first, then ensure) makes two concurrent
 *      audit transactions deadlock: each would hold ROW EXCLUSIVE on the
 *      parent from its insert while requesting ACCESS EXCLUSIVE for the
 *      CREATE TABLE. With ensure first, the ensure is either a lock-free
 *      catalog read (the normal case, because the maintenance window has
 *      already created the month) or an advisory-serialized creation, and
 *      neither can cycle against the other.
 *   2. Never pass a table name, schema name, or any other identifier. There
 *      is no parameter for one. The partition is derived exclusively from the
 *      timestamp by the SQL layer.
 */

import {
  recordAuditPartitionCreated,
  recordAuditPartitionEnsureAttempt,
  recordAuditPartitionEnsureLatencyMs,
  recordAuditPartitionExisting,
  recordAuditPartitionFailure,
  recordAuditPartitionWindowGap,
  type AuditPartitionProcess,
} from "../observability/auditPartitionMetrics";
import type { RawSqlClient } from "./incidentPromotionRepository";

/** Exactly the two values `security.fn_ensure_audit_log_partition` can return. */
export type EnsureAuditLogPartitionResult = "CREATED" | "ALREADY_EXISTS";

export interface AuditLogPartitionWindowRow {
  partitionName: string;
  rangeStart: Date;
  rangeEnd: Date;
  result: EnsureAuditLogPartitionResult;
}

/** The operational window this repository (and the maintenance service) uses: previous month, current month, next 3 months. */
export const AUDIT_LOG_PARTITION_WINDOW_MONTHS_BEFORE = 1;
export const AUDIT_LOG_PARTITION_WINDOW_MONTHS_AFTER = 3;

/**
 * Safe, low-cardinality error code for the failure metric. Deliberately does
 * NOT forward the exception message: a Postgres error text can quote the
 * offending row, and an audit row is exactly the content that must never
 * reach a log. The AUDIT_PARTITION_* prefix the SQL layer raises is
 * extracted when present because it is a fixed vocabulary, not free text.
 */
function safeAuditPartitionErrorCode(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const known = /\b(AUDIT_PARTITION_[A-Z_]+)\b/.exec(message);
  if (known) return known[1];
  if (err instanceof Error && err.name) return err.name;
  return "UNKNOWN_ERROR";
}

/** UTC calendar labels for the metrics — computed here only so the metric can be emitted when the SQL call itself throws. */
function utcMonthLabels(occurredAt: Date): { year: number; month: number } {
  return { year: occurredAt.getUTCFullYear(), month: occurredAt.getUTCMonth() + 1 };
}

/**
 * Guarantees the monthly partition covering `occurredAt` exists, then
 * returns whether it had to be created. Idempotent and safe to call
 * concurrently for the same month from any number of connections.
 *
 * Errors are NEVER swallowed: a failure is recorded as a metric and
 * rethrown, so an audit write can never silently proceed against a database
 * that could not accept it.
 */
export async function ensureAuditLogPartition(
  tx: RawSqlClient,
  occurredAt: Date,
  process: AuditPartitionProcess = "audit-writer"
): Promise<EnsureAuditLogPartitionResult> {
  const labels = { ...utcMonthLabels(occurredAt), process };
  recordAuditPartitionEnsureAttempt(labels);
  const startedAt = Date.now();
  try {
    // fn_ensure_audit_log_partition_for_write, NOT fn_ensure_audit_log_partition.
    //
    // The unbounded creator is executable only by nobody-in-particular (PUBLIC
    // revoked, granted to no application role), which is why the previous
    // arrangement could not have been running as the runtime principal — and
    // was not: it connected as the schema owner. The runtime entry point is
    // granted to app_api/ingest_worker/jobs_worker and bounds the request to a
    // sane write horizon around now, so a compromised runtime credential cannot
    // create partitions for arbitrary centuries, alter one, or drop one.
    // Historical backfills and deliberate future windows use the unbounded
    // function under an operator/maintenance principal.
    const rows = await tx.$queryRawUnsafe<{ result: EnsureAuditLogPartitionResult }>(
      `SELECT security.fn_ensure_audit_log_partition_for_write($1::timestamptz) AS result`,
      occurredAt
    );
    const result = rows[0]?.result;
    if (result !== "CREATED" && result !== "ALREADY_EXISTS") {
      throw new Error(`AUDIT_PARTITION_UNEXPECTED_RESULT: ${String(result)}`);
    }
    if (result === "CREATED") {
      recordAuditPartitionCreated(labels);
    } else {
      recordAuditPartitionExisting(labels);
    }
    return result;
  } catch (err) {
    recordAuditPartitionFailure({ ...labels, errorCode: safeAuditPartitionErrorCode(err) });
    throw err;
  } finally {
    recordAuditPartitionEnsureLatencyMs({ durationMs: Date.now() - startedAt, process });
  }
}

/**
 * Ensures a contiguous monthly window around `anchor`. The SQL function
 * enforces the 0..24-months-per-side cap and rejects negatives — this
 * wrapper does not re-implement those checks, it only surfaces the
 * structured per-month result and the gap metric.
 */
export async function ensureAuditLogPartitionWindow(
  tx: RawSqlClient,
  anchor: Date,
  monthsBefore: number = AUDIT_LOG_PARTITION_WINDOW_MONTHS_BEFORE,
  monthsAfter: number = AUDIT_LOG_PARTITION_WINDOW_MONTHS_AFTER,
  process: AuditPartitionProcess = "window-maintenance"
): Promise<AuditLogPartitionWindowRow[]> {
  const startedAt = Date.now();
  try {
    const rows = await tx.$queryRawUnsafe<{
      partition_name: string;
      range_start: Date;
      range_end: Date;
      result: EnsureAuditLogPartitionResult;
    }>(
      `SELECT partition_name, range_start, range_end, result
         FROM security.fn_ensure_audit_log_partition_window($1::timestamptz, $2::integer, $3::integer)`,
      anchor,
      monthsBefore,
      monthsAfter
    );

    const window: AuditLogPartitionWindowRow[] = rows.map((row) => ({
      partitionName: row.partition_name,
      rangeStart: new Date(row.range_start),
      rangeEnd: new Date(row.range_end),
      result: row.result,
    }));

    // A month the window had to CREATE is a month that was NOT covered when
    // maintenance ran — that is the gap signal, and it is the number worth
    // alerting on, not the total window size.
    recordAuditPartitionWindowGap({ count: window.filter((row) => row.result === "CREATED").length, process });
    return window;
  } catch (err) {
    const labels = { ...utcMonthLabels(anchor), process };
    recordAuditPartitionFailure({ ...labels, errorCode: safeAuditPartitionErrorCode(err) });
    throw err;
  } finally {
    recordAuditPartitionEnsureLatencyMs({ durationMs: Date.now() - startedAt, process });
  }
}
