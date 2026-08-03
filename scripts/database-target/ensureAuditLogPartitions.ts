/**
 * scripts/database-target/ensureAuditLogPartitions.ts
 *
 * CLI wrapper for the `security.audit_logs` monthly partition maintenance —
 * run via `npm run db:target:audit-partitions`.
 *
 * Contains ZERO partition SQL. It only invokes
 * `runAuditLogPartitionMaintenance()`, which in turn calls the canonical SQL
 * function `security.fn_ensure_audit_log_partition_window(...)`. There is one
 * implementation of the lifecycle and it lives in
 * `prisma/target-migrations/010_foundation/migration.sql`.
 *
 * Safety posture, all inherited rather than reimplemented here:
 *   * with every target migration flag off (the default, and the state of
 *     current production) this exits 0 having printed NOT_ENABLED, without
 *     constructing a client, opening a connection, or running DDL;
 *   * the only connection string reachable is `TARGET_DATABASE_URL`, and
 *     `client/targetPrismaClient.ts` rejects it unless it is a loopback,
 *     non-managed host, and refuses outright when NODE_ENV=production;
 *   * `DATABASE_URL` / `DIRECT_URL` are never read by this path.
 */

import { runAuditLogPartitionMaintenance } from "../../src/lib/database-target/services/auditLogPartitionMaintenanceService";
import { closeTargetPrismaClient } from "../../src/lib/database-target/client/targetPrismaClient";

async function main(): Promise<void> {
  const result = await runAuditLogPartitionMaintenance();

  if (result.status === "NOT_ENABLED") {
    process.stdout.write(
      "AUDIT_PARTITION_MAINTENANCE=NOT_ENABLED - every ARGUS_TARGET_DB_* flag is off; no target client was constructed, no connection was opened, no DDL was executed.\n"
    );
    return;
  }

  process.stdout.write(
    `AUDIT_PARTITION_MAINTENANCE=COMPLETED created=${result.created} already_existing=${result.alreadyExisting}\n`
  );
  for (const row of result.window) {
    process.stdout.write(
      `  ${row.partitionName} [${row.rangeStart.toISOString()}, ${row.rangeEnd.toISOString()}) ${row.result}\n`
    );
  }
}

main()
  .then(async () => {
    await closeTargetPrismaClient();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    // The message is printed as-is because this is an operator-facing CLI on a
    // local, synthetic database — but nothing here reads or echoes audit row
    // content, so there is no audit payload to leak.
    process.stderr.write(
      `AUDIT_PARTITION_MAINTENANCE=FAILED ${err instanceof Error ? err.message : String(err)}\n`
    );
    await closeTargetPrismaClient().catch(() => undefined);
    process.exit(1);
  });
