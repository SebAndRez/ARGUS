import { afterAll, describe, expect, it } from "vitest";
import {
  closeTargetPrismaClient,
  getTargetPrismaClient,
  type TargetPrismaClientLike,
} from "../../src/lib/database-target/client/targetPrismaClient";
import {
  auditPartitionDockerShouldRun,
  dropTestPartitions,
  raw,
  readWave010File,
} from "./auditPartitionTestHelpers";
import {
  AUDIT_LOG_PARTITION_WINDOW_MONTHS_AFTER,
  AUDIT_LOG_PARTITION_WINDOW_MONTHS_BEFORE,
  ensureAuditLogPartitionWindow,
} from "../../src/lib/database-target/repositories/auditLogPartitionRepository";

/**
 * tests/database-target/audit-log-partition-window.test.ts
 *
 * The maintenance window must be contiguous, idempotent, bounded, and
 * strictly additive: it may never drop, detach, or alter anything.
 */

const YEAR_PREFIX = "audit_logs_y2042";

describe("audit_logs partition window — contract", () => {
  const migration = readWave010File("migration.sql");

  it("the operational window the repository defaults to is 1 month before and 3 months after", () => {
    expect(AUDIT_LOG_PARTITION_WINDOW_MONTHS_BEFORE).toBe(1);
    expect(AUDIT_LOG_PARTITION_WINDOW_MONTHS_AFTER).toBe(3);
  });

  it("the SQL window function caps each side at 24 months and rejects negatives", () => {
    expect(migration).toContain("AUDIT_PARTITION_WINDOW_NEGATIVE");
    expect(migration).toContain("AUDIT_PARTITION_WINDOW_TOO_WIDE");
    expect(migration).toContain("IF p_months_before > 24 OR p_months_after > 24 THEN");
  });

  it("the window function contains no DROP, DETACH, TRUNCATE, DELETE or UPDATE", () => {
    const start = migration.indexOf("CREATE OR REPLACE FUNCTION security.fn_ensure_audit_log_partition_window(");
    const end = migration.indexOf("REVOKE ALL ON FUNCTION security.fn_audit_log_month_start", start);
    const body = migration.slice(start, end);
    expect(body).not.toMatch(/\bDROP\b/i);
    expect(body).not.toMatch(/\bDETACH\b/i);
    expect(body).not.toMatch(/\bTRUNCATE\b/i);
    expect(body).not.toMatch(/\bDELETE\b/i);
    expect(body).not.toMatch(/\bUPDATE\b/i);
  });

  it("migration.sql installs the initial window (previous month + current + next 3) so a fresh install can accept an audit write immediately", () => {
    expect(migration).toContain("SELECT * FROM security.fn_ensure_audit_log_partition_window(now(), 1, 3);");
  });
});

describe.skipIf(!auditPartitionDockerShouldRun)("audit_logs partition window — real PostgreSQL", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    if (client) await dropTestPartitions(client, [YEAR_PREFIX, "audit_logs_y2043m01"]);
    await closeTargetPrismaClient();
  });

  it("creates a contiguous 5-month window (anchor -1 .. +3) with zero gaps", async () => {
    client = await getTargetPrismaClient();
    const window = await ensureAuditLogPartitionWindow(raw(client), new Date("2042-06-15T00:00:00Z"), 1, 3, "test");

    expect(window.map((row) => row.partitionName)).toEqual([
      "audit_logs_y2042m05",
      "audit_logs_y2042m06",
      "audit_logs_y2042m07",
      "audit_logs_y2042m08",
      "audit_logs_y2042m09",
    ]);
    expect(window.every((row) => row.result === "CREATED")).toBe(true);

    // Contiguity: each month's end is the next month's start, exactly.
    for (let i = 1; i < window.length; i += 1) {
      expect(window[i]!.rangeStart.toISOString()).toBe(window[i - 1]!.rangeEnd.toISOString());
    }
    expect(window[0]!.rangeStart.toISOString()).toBe("2042-05-01T00:00:00.000Z");
    expect(window[4]!.rangeEnd.toISOString()).toBe("2042-10-01T00:00:00.000Z");
  });

  it("is idempotent: a second run creates nothing and reports ALREADY_EXISTS for every month", async () => {
    client = await getTargetPrismaClient();
    const second = await ensureAuditLogPartitionWindow(raw(client), new Date("2042-06-15T00:00:00Z"), 1, 3, "test");
    expect(second.every((row) => row.result === "ALREADY_EXISTS")).toBe(true);
  });

  it("crosses a year boundary as a calendar window (Nov 2042 .. Jan 2043)", async () => {
    client = await getTargetPrismaClient();
    const window = await ensureAuditLogPartitionWindow(raw(client), new Date("2042-12-05T00:00:00Z"), 1, 1, "test");
    expect(window.map((row) => row.partitionName)).toEqual([
      "audit_logs_y2042m11",
      "audit_logs_y2042m12",
      "audit_logs_y2043m01",
    ]);
    expect(window[2]!.rangeStart.toISOString()).toBe("2043-01-01T00:00:00.000Z");
    expect(window[2]!.rangeEnd.toISOString()).toBe("2043-02-01T00:00:00.000Z");
  });

  it("accepts a zero-width window (0 before, 0 after) as exactly the anchor month", async () => {
    client = await getTargetPrismaClient();
    const window = await ensureAuditLogPartitionWindow(raw(client), new Date("2042-06-15T00:00:00Z"), 0, 0, "test");
    expect(window).toHaveLength(1);
    expect(window[0]!.partitionName).toBe("audit_logs_y2042m06");
  });

  it("rejects a negative side", async () => {
    client = await getTargetPrismaClient();
    await expect(
      ensureAuditLogPartitionWindow(raw(client), new Date("2042-06-15T00:00:00Z"), -1, 3, "test")
    ).rejects.toThrow(/AUDIT_PARTITION_WINDOW_NEGATIVE/);
  });

  it("rejects a window wider than 24 months per side", async () => {
    client = await getTargetPrismaClient();
    await expect(
      ensureAuditLogPartitionWindow(raw(client), new Date("2042-06-15T00:00:00Z"), 1, 25, "test")
    ).rejects.toThrow(/AUDIT_PARTITION_WINDOW_TOO_WIDE/);
  });

  it("rejects a NULL anchor", async () => {
    client = await getTargetPrismaClient();
    await expect(
      raw(client).$queryRawUnsafe(
        `SELECT * FROM security.fn_ensure_audit_log_partition_window(NULL::timestamptz, 1, 3)`
      )
    ).rejects.toThrow(/AUDIT_PARTITION_WINDOW_NULL_ANCHOR/);
  });

  it("never removes an existing partition outside the window", async () => {
    client = await getTargetPrismaClient();
    await raw(client).$queryRawUnsafe(
      `SELECT security.fn_ensure_audit_log_partition($1::timestamptz)`,
      new Date("2042-01-10T00:00:00Z")
    );
    await ensureAuditLogPartitionWindow(raw(client), new Date("2042-06-15T00:00:00Z"), 1, 3, "test");
    const rows = await raw(client).$queryRawUnsafe<{ relname: string }>(
      `SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = 'security.audit_logs'::regclass AND c.relname = 'audit_logs_y2042m01'`
    );
    expect(rows).toHaveLength(1);
  });
});
