import { afterAll, describe, expect, it } from "vitest";
import {
  closeTargetPrismaClient,
  getTargetPrismaClient,
  type TargetPrismaClientLike,
} from "../../src/lib/database-target/client/targetPrismaClient";
import {
  auditPartitionDockerShouldRun,
  dropTestPartitions,
  ensurePartition,
  listPartitions,
  raw,
  readPartitionBounds,
  readWave010File,
} from "./auditPartitionTestHelpers";
import { ensureAuditLogPartitionWindow } from "../../src/lib/database-target/repositories/auditLogPartitionRepository";

/**
 * tests/database-target/audit-log-partition-idempotency.test.ts
 *
 * "Idempotent" here means something specific and testable: repeated calls
 * leave the catalog byte-identical AND report the distinction honestly
 * (CREATED once, ALREADY_EXISTS thereafter). A function that returned
 * "CREATED" every time, or that swallowed a duplicate_table error, would pass
 * a naive "it didn't crash" check and fail this one.
 */

const YEAR_PREFIX = "audit_logs_y2045";

describe("audit_logs partition idempotency — contract", () => {
  it("does not hide errors behind a blanket exception handler in the ensure path", () => {
    const migration = readWave010File("migration.sql");
    const start = migration.indexOf("CREATE OR REPLACE FUNCTION security.fn_ensure_audit_log_partition(");
    const end = migration.indexOf("CREATE OR REPLACE FUNCTION security.fn_ensure_audit_log_partition_window(");
    const body = migration.slice(start, end);
    // No `EXCEPTION WHEN duplicate_table` / `WHEN OTHERS` swallowing.
    expect(body).not.toMatch(/EXCEPTION\s+WHEN/i);
    expect(body).toContain("pg_advisory_xact_lock");
  });
});

describe.skipIf(!auditPartitionDockerShouldRun)("audit_logs partition idempotency — real PostgreSQL", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    if (client) await dropTestPartitions(client, [YEAR_PREFIX]);
    await closeTargetPrismaClient();
  });

  it("reports CREATED exactly once and ALREADY_EXISTS on every subsequent call", async () => {
    client = await getTargetPrismaClient();
    const results: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      results.push(await ensurePartition(client, "2045-04-18T09:30:00Z"));
    }
    expect(results).toEqual(["CREATED", "ALREADY_EXISTS", "ALREADY_EXISTS", "ALREADY_EXISTS", "ALREADY_EXISTS"]);
  });

  it("different instants inside the SAME month resolve to the same single partition", async () => {
    client = await getTargetPrismaClient();
    for (const instant of ["2045-06-01T00:00:00Z", "2045-06-15T12:00:00Z", "2045-06-30T23:59:59Z"]) {
      await ensurePartition(client, instant);
    }
    const partitions = (await listPartitions(client)).filter((name) => name.startsWith("audit_logs_y2045m06"));
    expect(partitions).toEqual(["audit_logs_y2045m06"]);
  });

  it("leaves the catalog identical across repeated ensure + window runs", async () => {
    client = await getTargetPrismaClient();
    // Scoped to this file's own year: other test files run in parallel and
    // legitimately create partitions in their own years, so an unscoped
    // catalog comparison would be flaky for a reason unrelated to
    // idempotency.
    const own = async () => (await listPartitions(client)).filter((name) => name.startsWith(YEAR_PREFIX));

    await ensureAuditLogPartitionWindow(raw(client), new Date("2045-09-10T00:00:00Z"), 1, 3, "test");
    const before = await own();

    await ensureAuditLogPartitionWindow(raw(client), new Date("2045-09-10T00:00:00Z"), 1, 3, "test");
    await ensurePartition(client, "2045-09-10T00:00:00Z");
    await ensureAuditLogPartitionWindow(raw(client), new Date("2045-09-10T00:00:00Z"), 1, 3, "test");

    expect(await own()).toEqual(before);
  });

  it("keeps rows and bounds intact when the month is ensured again after data exists in it", async () => {
    client = await getTargetPrismaClient();
    await ensurePartition(client, "2045-11-02T00:00:00Z");
    await raw(client).$executeRawUnsafe(
      `INSERT INTO security.audit_logs
         (id, actor_type, actor_id, action, target_table, target_id, classification, result, integrity_value, occurred_at)
       VALUES (gen_random_uuid(), 'SYSTEM', gen_random_uuid(), 'IDEMPOTENCY_PROBE', 'security.audit_logs',
               gen_random_uuid(), 'RESTRICTED', 'SUCCESS', 'test-probe', $1::timestamptz)`,
      new Date("2045-11-02T00:00:00Z")
    );

    expect(await ensurePartition(client, "2045-11-20T00:00:00Z")).toBe("ALREADY_EXISTS");

    const rows = await raw(client).$queryRawUnsafe<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM security.audit_logs WHERE action = 'IDEMPOTENCY_PROBE'`
    );
    expect(rows[0]!.count).toBe("1");

    // Bounds compared as real instants, not as a rendered string (which would
    // depend on the connection's TimeZone).
    const bounds = await readPartitionBounds(client, "audit_logs_y2045m11");
    expect(bounds!.range_start.toISOString()).toBe("2045-11-01T00:00:00.000Z");
    expect(bounds!.range_end.toISOString()).toBe("2045-12-01T00:00:00.000Z");
  });
});
