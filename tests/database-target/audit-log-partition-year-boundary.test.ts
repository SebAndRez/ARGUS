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
  insertProbeAndReadTableoid,
  partitionName,
  raw,
  readPartitionBounds,
} from "./auditPartitionTestHelpers";
import { ensureAuditLogPartitionWindow } from "../../src/lib/database-target/repositories/auditLogPartitionRepository";

/**
 * tests/database-target/audit-log-partition-year-boundary.test.ts
 *
 * December -> January is where naive month arithmetic breaks: a
 * "month + 1" that forgets to roll the year produces month 13, and a
 * 30-day interval drifts. The whole point of deriving the next boundary with
 * `interval '1 month'` on a truncated month is that the calendar does this,
 * so this file proves the calendar actually did.
 */

const PREFIXES = ["audit_logs_y2047m1", "audit_logs_y2048m", "audit_logs_y2049m"];

describe.skipIf(!auditPartitionDockerShouldRun)("audit_logs partitions across a year boundary", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    if (client) await dropTestPartitions(client, PREFIXES);
    await closeTargetPrismaClient();
  });

  it("December's range ends exactly at the following January 1st, 00:00 UTC", async () => {
    client = await getTargetPrismaClient();
    expect(await ensurePartition(client, "2047-12-31T23:59:59Z")).toBe("CREATED");
    const bounds = await readPartitionBounds(client, "audit_logs_y2047m12");
    expect(bounds!.range_start.toISOString()).toBe("2047-12-01T00:00:00.000Z");
    expect(bounds!.range_end.toISOString()).toBe("2048-01-01T00:00:00.000Z");
  });

  it("January of the NEXT year is a distinct partition starting where December ended", async () => {
    client = await getTargetPrismaClient();
    expect(await ensurePartition(client, "2048-01-01T00:00:00Z")).toBe("CREATED");
    const december = await readPartitionBounds(client, "audit_logs_y2047m12");
    const january = await readPartitionBounds(client, "audit_logs_y2048m01");
    expect(january!.range_start.toISOString()).toBe(december!.range_end.toISOString());
    expect(january!.range_end.toISOString()).toBe("2048-02-01T00:00:00.000Z");
  });

  it("names roll the year, never producing month 13", async () => {
    client = await getTargetPrismaClient();
    expect(await partitionName(client, "2047-12-31T23:59:59.999Z")).toBe("audit_logs_y2047m12");
    expect(await partitionName(client, "2048-01-01T00:00:00.000Z")).toBe("audit_logs_y2048m01");
    const rows = await raw(client).$queryRawUnsafe<{ name: string }>(
      `SELECT security.fn_audit_log_partition_name($1::timestamptz) AS name`,
      new Date("2048-01-01T00:00:00Z")
    );
    expect(rows[0]!.name).not.toContain("m13");
  });

  it("routes the two adjacent instants across midnight of New Year into different partitions (verified by tableoid)", async () => {
    client = await getTargetPrismaClient();
    expect(await insertProbeAndReadTableoid(client, "2047-12-31T23:59:59.999Z", "YEAR_BOUNDARY_PROBE_DEC")).toBe(
      "security.audit_logs_y2047m12"
    );
    expect(await insertProbeAndReadTableoid(client, "2048-01-01T00:00:00.000Z", "YEAR_BOUNDARY_PROBE_JAN")).toBe(
      "security.audit_logs_y2048m01"
    );
  });

  it("a maintenance window anchored in December spans into the next year contiguously", async () => {
    client = await getTargetPrismaClient();
    const window = await ensureAuditLogPartitionWindow(raw(client), new Date("2048-12-10T00:00:00Z"), 1, 3, "test");
    expect(window.map((row) => row.partitionName)).toEqual([
      "audit_logs_y2048m11",
      "audit_logs_y2048m12",
      "audit_logs_y2049m01",
      "audit_logs_y2049m02",
      "audit_logs_y2049m03",
    ]);
    for (let i = 1; i < window.length; i += 1) {
      expect(window[i]!.rangeStart.toISOString()).toBe(window[i - 1]!.rangeEnd.toISOString());
    }
  });
});
