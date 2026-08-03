/**
 * src/lib/database-target/services/auditLogPartitionMaintenanceService.ts
 *
 * The target-side maintenance operation that keeps `security.audit_logs`'
 * monthly partition window ahead of real time: previous month, current
 * month, next 3 months.
 *
 * Flag posture (mandate Fase 11). While EVERY target migration flag is off —
 * which is their state in current production, and their default everywhere —
 * this function:
 *   * returns `{ status: "NOT_ENABLED" }`;
 *   * does NOT construct a target Prisma client;
 *   * does NOT open a connection;
 *   * does NOT execute any DDL.
 * The flag check is therefore the FIRST thing that happens, before any
 * env-var resolution, so a machine with no `TARGET_DATABASE_URL` at all still
 * gets a clean `NOT_ENABLED` instead of a configuration error.
 *
 * Connection posture. The only URL this service can ever use is
 * `TARGET_DATABASE_URL`, resolved through
 * `client/targetPrismaClient.getTargetPrismaClient()`, which already refuses
 * to fall back to `DATABASE_URL`/`DIRECT_URL`, refuses any non-loopback host,
 * refuses any managed-host substring, and refuses to construct anything when
 * `NODE_ENV === "production"`. This service adds no second code path and no
 * override: the anti-remote guard is reused, not reimplemented.
 *
 * There is deliberately no cron wiring here. Scheduling is a separate,
 * explicit decision that belongs to a later step of the frozen plan; this
 * module is the operation, invocable on demand via
 * `npm run db:target:audit-partitions`.
 */

import { getTargetPrismaClient, type TargetPrismaClientLike } from "../client/targetPrismaClient";
import {
  getTargetMigrationFlags,
  type FlagEnvSource,
  type TargetMigrationFlagName,
} from "../flags/targetMigrationFlags";
import {
  AUDIT_LOG_PARTITION_WINDOW_MONTHS_AFTER,
  AUDIT_LOG_PARTITION_WINDOW_MONTHS_BEFORE,
  ensureAuditLogPartitionWindow,
  type AuditLogPartitionWindowRow,
} from "../repositories/auditLogPartitionRepository";
import { recordAuditPartitionMaintenanceSkipped } from "../observability/auditPartitionMetrics";
import type { RawSqlClient } from "../repositories/incidentPromotionRepository";

export type AuditLogPartitionMaintenanceResult =
  | { status: "NOT_ENABLED"; enabledFlags: TargetMigrationFlagName[] }
  | { status: "COMPLETED"; window: AuditLogPartitionWindowRow[]; created: number; alreadyExisting: number };

export interface RunAuditLogPartitionMaintenanceOptions {
  env?: FlagEnvSource;
  /** Injected in tests so the flags-off path can be proven to open no client at all. */
  loadClient?: () => Promise<TargetPrismaClientLike>;
  /** Anchor for the window. Defaults to "now" — the whole point of the operation is to track real time. */
  anchor?: Date;
  monthsBefore?: number;
  monthsAfter?: number;
}

/** True when at least one target migration flag is on. With all four off there is no target database in play at all, so there is nothing to maintain. */
function enabledTargetFlags(env: FlagEnvSource): TargetMigrationFlagName[] {
  const flags = getTargetMigrationFlags(env);
  return (Object.keys(flags) as TargetMigrationFlagName[]).filter((name) => flags[name]);
}

export async function runAuditLogPartitionMaintenance(
  options: RunAuditLogPartitionMaintenanceOptions = {}
): Promise<AuditLogPartitionMaintenanceResult> {
  const env = options.env ?? (process.env as FlagEnvSource);

  const enabled = enabledTargetFlags(env);
  if (enabled.length === 0) {
    recordAuditPartitionMaintenanceSkipped({ reason: "NOT_ENABLED" });
    return { status: "NOT_ENABLED", enabledFlags: [] };
  }

  const client = await (options.loadClient ?? (() => getTargetPrismaClient({ env })))();
  const window = await ensureAuditLogPartitionWindow(
    client as unknown as RawSqlClient,
    options.anchor ?? new Date(),
    options.monthsBefore ?? AUDIT_LOG_PARTITION_WINDOW_MONTHS_BEFORE,
    options.monthsAfter ?? AUDIT_LOG_PARTITION_WINDOW_MONTHS_AFTER,
    "window-maintenance"
  );

  return {
    status: "COMPLETED",
    window,
    created: window.filter((row) => row.result === "CREATED").length,
    alreadyExisting: window.filter((row) => row.result === "ALREADY_EXISTS").length,
  };
}
