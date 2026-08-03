import { afterAll, describe, expect, it } from "vitest";
import {
  closeTargetPrismaClient,
  getTargetPrismaClient,
  type TargetPrismaClientLike,
} from "../../src/lib/database-target/client/targetPrismaClient";
import {
  auditPartitionDockerShouldRun,
  dropTestPartitions,
  listPartitions,
  raw,
  readPartitionBounds,
  readWave010File,
} from "./auditPartitionTestHelpers";

/**
 * tests/database-target/audit-log-partition-concurrency.test.ts
 *
 * Two or more processes will inevitably try to ensure the same month at the
 * same time (the maintenance job and an audit write, or two audit writes on
 * the first event of a new month). Without serialization, the loser gets
 * `duplicate_table`; with the wrong serialization, they deadlock.
 *
 * These cases exercise REAL simultaneity: the promises are started together
 * and each lands on its own pooled connection, so the advisory lock is
 * genuinely contended. The rehearsal harness additionally runs the same
 * scenario across separate OS processes
 * (Test-ArgusRehearsal.ps1 -> AUDIT_PARTITION_CONCURRENCY_PASS).
 */

const YEAR_PREFIX = "audit_logs_y2046";

describe("audit_logs partition concurrency — contract", () => {
  const migration = readWave010File("migration.sql");

  it("serializes on a deterministic per-month advisory transaction lock", () => {
    expect(migration).toContain("pg_advisory_xact_lock(v_lock_key)");
    expect(migration).toContain(
      `('x' || substr(md5('security.audit_logs:' || to_char(v_month_start, 'YYYY-MM')), 1, 16))::bit(64)::bigint`
    );
  });

  it("re-checks existence AFTER acquiring the lock (double-checked, not lock-then-assume)", () => {
    const start = migration.indexOf("CREATE OR REPLACE FUNCTION security.fn_ensure_audit_log_partition(");
    const end = migration.indexOf("CREATE OR REPLACE FUNCTION security.fn_ensure_audit_log_partition_window(");
    const body = migration.slice(start, end);
    const lockIndex = body.indexOf("pg_advisory_xact_lock");
    const check = /SELECT c\.oid INTO v_oid/g;
    const checksBeforeLock = body.slice(0, lockIndex).match(check) ?? [];
    const checksAfterLock = body.slice(lockIndex).match(check) ?? [];
    expect(checksBeforeLock).toHaveLength(1);
    expect(checksAfterLock).toHaveLength(1);
  });

  it("checks existence against pg_class, not to_regclass — the syscache path is not refreshed by waiting on the lock", () => {
    const start = migration.indexOf("CREATE OR REPLACE FUNCTION security.fn_ensure_audit_log_partition(");
    const end = migration.indexOf("CREATE OR REPLACE FUNCTION security.fn_ensure_audit_log_partition_window(");
    // The comment in the function body explains WHY to_regclass is avoided,
    // so the prohibition is asserted against executable lines only.
    const body = migration.slice(start, end).replace(/--.*$/gm, "");
    expect(body).not.toContain("to_regclass");
    expect(body).toContain("FROM pg_class c");
    expect(body).toContain("JOIN pg_namespace n ON n.oid = c.relnamespace");
  });
});

describe.skipIf(!auditPartitionDockerShouldRun)("audit_logs partition concurrency — real PostgreSQL", () => {
  let client: TargetPrismaClientLike;

  async function ensureConcurrently(instants: string[]): Promise<Array<{ status: string; value?: string; reason?: string }>> {
    const settled = await Promise.allSettled(
      instants.map((instant) =>
        raw(client)
          .$queryRawUnsafe<{ result: string }>(
            `SELECT security.fn_ensure_audit_log_partition($1::timestamptz) AS result`,
            new Date(instant)
          )
          .then((rows) => rows[0]!.result)
      )
    );
    return settled.map((entry) =>
      entry.status === "fulfilled"
        ? { status: entry.status, value: entry.value }
        : { status: entry.status, reason: entry.reason instanceof Error ? entry.reason.message : String(entry.reason) }
    );
  }

  afterAll(async () => {
    if (client) await dropTestPartitions(client, [YEAR_PREFIX, "audit_logs_y2047m01"]);
    await closeTargetPrismaClient();
  });

  it("2 simultaneous requests for the same month produce exactly one partition, one CREATED, zero errors", async () => {
    client = await getTargetPrismaClient();
    const results = await ensureConcurrently(["2046-02-05T00:00:00Z", "2046-02-25T00:00:00Z"]);

    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    expect(results.filter((r) => r.value === "CREATED")).toHaveLength(1);
    expect(results.filter((r) => r.value === "ALREADY_EXISTS")).toHaveLength(1);
    expect((await listPartitions(client)).filter((n) => n === "audit_logs_y2046m02")).toHaveLength(1);
  });

  it("10 simultaneous requests for the same month produce exactly one partition, no duplicate_table, no deadlock", async () => {
    client = await getTargetPrismaClient();
    const instants = Array.from({ length: 10 }, (_unused, i) => `2046-04-${String(i + 1).padStart(2, "0")}T00:00:00Z`);
    const results = await ensureConcurrently(instants);

    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected, `unexpected failures: ${JSON.stringify(rejected)}`).toEqual([]);
    const joined = results.map((r) => r.reason ?? "").join(" ");
    expect(joined).not.toMatch(/duplicate_table|already exists|deadlock/i);

    expect(results.filter((r) => r.value === "CREATED")).toHaveLength(1);
    expect(results.filter((r) => r.value === "ALREADY_EXISTS")).toHaveLength(9);
    expect((await listPartitions(client)).filter((n) => n === "audit_logs_y2046m04")).toHaveLength(1);

    const bounds = await readPartitionBounds(client, "audit_logs_y2046m04");
    expect(bounds!.range_start.toISOString()).toBe("2046-04-01T00:00:00.000Z");
    expect(bounds!.range_end.toISOString()).toBe("2046-05-01T00:00:00.000Z");
  });

  it("simultaneous requests for DIFFERENT months all succeed and do not deadlock on the parent lock", async () => {
    client = await getTargetPrismaClient();
    const instants = [
      "2046-07-01T00:00:00Z",
      "2046-08-01T00:00:00Z",
      "2046-09-01T00:00:00Z",
      "2046-10-01T00:00:00Z",
      "2046-11-01T00:00:00Z",
      "2046-12-01T00:00:00Z",
      "2047-01-01T00:00:00Z",
    ];
    const results = await ensureConcurrently(instants);

    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    expect(results.filter((r) => r.value === "CREATED")).toHaveLength(instants.length);

    const created = await listPartitions(client);
    for (const expected of [
      "audit_logs_y2046m07",
      "audit_logs_y2046m08",
      "audit_logs_y2046m09",
      "audit_logs_y2046m10",
      "audit_logs_y2046m11",
      "audit_logs_y2046m12",
      "audit_logs_y2047m01",
    ]) {
      expect(created.filter((n) => n === expected), `${expected} must exist exactly once`).toHaveLength(1);
    }
  });

  it("mixed same-month and different-month load stays consistent", async () => {
    client = await getTargetPrismaClient();
    const instants = [
      "2046-05-01T00:00:00Z",
      "2046-05-15T00:00:00Z",
      "2046-05-31T00:00:00Z",
      "2046-06-01T00:00:00Z",
      "2046-06-20T00:00:00Z",
      "2046-05-10T00:00:00Z",
    ];
    const results = await ensureConcurrently(instants);

    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    // Exactly two months are involved, so exactly two CREATED.
    expect(results.filter((r) => r.value === "CREATED")).toHaveLength(2);
    const partitions = await listPartitions(client);
    expect(partitions.filter((n) => n === "audit_logs_y2046m05")).toHaveLength(1);
    expect(partitions.filter((n) => n === "audit_logs_y2046m06")).toHaveLength(1);
  });
});
