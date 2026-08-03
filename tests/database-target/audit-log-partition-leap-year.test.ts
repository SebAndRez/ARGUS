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
  readPartitionBounds,
} from "./auditPartitionTestHelpers";

/**
 * tests/database-target/audit-log-partition-leap-year.test.ts
 *
 * February is the month that exposes any fixed-length interval. A 30-day
 * range starting Feb 1 overshoots into March in every year; a 28-day range
 * loses Feb 29 in a leap year — and a lost Feb 29 means a legitimate audit
 * event on that date cannot be recorded at all.
 *
 * 2052 is a leap year (divisible by 4, not a century); 2053 is not. 2100 is
 * the century exception (divisible by 100, not by 400) and is checked too,
 * because that is where a hand-rolled leap rule usually gets it wrong.
 */

const PREFIXES = ["audit_logs_y2052m", "audit_logs_y2053m", "audit_logs_y2100m"];

describe.skipIf(!auditPartitionDockerShouldRun)("audit_logs partitions in February / leap years", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    if (client) await dropTestPartitions(client, PREFIXES);
    await closeTargetPrismaClient();
  });

  it("February of a LEAP year is [Feb 1, Mar 1) — 29 days, not 28, not 30", async () => {
    client = await getTargetPrismaClient();
    expect(await ensurePartition(client, "2052-02-29T12:00:00Z")).toBe("CREATED");
    const bounds = await readPartitionBounds(client, "audit_logs_y2052m02");
    expect(bounds!.range_start.toISOString()).toBe("2052-02-01T00:00:00.000Z");
    expect(bounds!.range_end.toISOString()).toBe("2052-03-01T00:00:00.000Z");
    const days = (bounds!.range_end.getTime() - bounds!.range_start.getTime()) / 86_400_000;
    expect(days).toBe(29);
  });

  it("February of a NON-leap year is [Feb 1, Mar 1) — 28 days", async () => {
    client = await getTargetPrismaClient();
    expect(await ensurePartition(client, "2053-02-15T00:00:00Z")).toBe("CREATED");
    const bounds = await readPartitionBounds(client, "audit_logs_y2053m02");
    const days = (bounds!.range_end.getTime() - bounds!.range_start.getTime()) / 86_400_000;
    expect(days).toBe(28);
    expect(bounds!.range_end.toISOString()).toBe("2053-03-01T00:00:00.000Z");
  });

  it("February 2100 is 28 days (century non-leap) — the case a hand-rolled leap rule gets wrong", async () => {
    client = await getTargetPrismaClient();
    expect(await ensurePartition(client, "2100-02-10T00:00:00Z")).toBe("CREATED");
    const bounds = await readPartitionBounds(client, "audit_logs_y2100m02");
    const days = (bounds!.range_end.getTime() - bounds!.range_start.getTime()) / 86_400_000;
    expect(days).toBe(28);
  });

  it("Feb 29 of a leap year is nameable and routable (verified by tableoid)", async () => {
    client = await getTargetPrismaClient();
    expect(await partitionName(client, "2052-02-29T23:59:59Z")).toBe("audit_logs_y2052m02");
    expect(await insertProbeAndReadTableoid(client, "2052-02-29T23:59:59Z", "LEAP_PROBE_FEB29")).toBe(
      "security.audit_logs_y2052m02"
    );
  });

  it("the instant right after Feb 29 23:59:59 lands in March, not back in February", async () => {
    client = await getTargetPrismaClient();
    await ensurePartition(client, "2052-03-01T00:00:00Z");
    expect(await insertProbeAndReadTableoid(client, "2052-03-01T00:00:00Z", "LEAP_PROBE_MAR1")).toBe(
      "security.audit_logs_y2052m03"
    );
  });

  it("February and March never overlap in a leap year", async () => {
    client = await getTargetPrismaClient();
    const february = await readPartitionBounds(client, "audit_logs_y2052m02");
    const march = await readPartitionBounds(client, "audit_logs_y2052m03");
    expect(march!.range_start.toISOString()).toBe(february!.range_end.toISOString());
  });
});
