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
  readWave010File,
} from "./auditPartitionTestHelpers";

/**
 * tests/database-target/audit-log-partition-utc-bounds.test.ts
 *
 * Partition bounds must be exact UTC calendar-month half-open ranges
 * [month_start, next_month_start), and routing must follow the value's UTC
 * INSTANT — never its wall-clock month, never the server's local timezone,
 * never a 30-day approximation.
 */

const YEAR_PREFIX = "audit_logs_y2041";

describe("audit_logs partition bounds — contract of the SQL source", () => {
  const migration = readWave010File("migration.sql");

  it("computes month boundaries with date_trunc + AT TIME ZONE 'UTC', not with a fixed-day interval", () => {
    expect(migration).toContain("date_trunc('month', p_occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'");
    expect(migration).toContain("date_trunc('month', p_occurred_at AT TIME ZONE 'UTC') + interval '1 month'");
    expect(migration).not.toMatch(/interval\s+'30 days'/);
    expect(migration).not.toMatch(/interval\s+'31 days'/);
  });

  it("pins TimeZone and DateStyle on every function that renders or compares a bound", () => {
    for (const fn of [
      "security.fn_assert_audit_log_partition",
      "security.fn_ensure_audit_log_partition",
      "security.fn_ensure_audit_log_partition_window",
    ]) {
      const start = migration.indexOf(`CREATE OR REPLACE FUNCTION ${fn}(`);
      expect(start, `${fn} not found`).toBeGreaterThan(-1);
      const header = migration.slice(start, start + 1400);
      expect(header, `${fn} must pin TimeZone`).toContain("SET TimeZone = 'UTC'");
      expect(header, `${fn} must pin DateStyle`).toContain("SET DateStyle = 'ISO, MDY'");
    }
  });

  it("renders bound literals with an explicit +00 offset", () => {
    expect(migration).toContain(`to_char(v_month_start, 'YYYY-MM-DD HH24:MI:SS') || '+00'`);
    expect(migration).toContain(`to_char(v_next_start,  'YYYY-MM-DD HH24:MI:SS') || '+00'`);
  });
});

describe.skipIf(!auditPartitionDockerShouldRun)("audit_logs partition bounds — real PostgreSQL", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    if (client) await dropTestPartitions(client, [YEAR_PREFIX]);
    await closeTargetPrismaClient();
  });

  it("declares exactly [month_start_utc, next_month_start_utc) for a 31-day month", async () => {
    client = await getTargetPrismaClient();
    await ensurePartition(client, "2041-08-17T05:00:00Z");
    const bounds = await readPartitionBounds(client, "audit_logs_y2041m08");
    expect(bounds).not.toBeNull();
    expect(bounds!.range_start.toISOString()).toBe("2041-08-01T00:00:00.000Z");
    expect(bounds!.range_end.toISOString()).toBe("2041-09-01T00:00:00.000Z");
  });

  it("declares exactly [Feb 1, Mar 1) for a 28-day February — not a 30-day window", async () => {
    client = await getTargetPrismaClient();
    await ensurePartition(client, "2041-02-10T00:00:00Z");
    const bounds = await readPartitionBounds(client, "audit_logs_y2041m02");
    expect(bounds!.range_start.toISOString()).toBe("2041-02-01T00:00:00.000Z");
    expect(bounds!.range_end.toISOString()).toBe("2041-03-01T00:00:00.000Z");
  });

  it("routes the last representable instant of a month into that month, and midnight of the next into the next", async () => {
    client = await getTargetPrismaClient();
    await ensurePartition(client, "2041-04-15T00:00:00Z");
    await ensurePartition(client, "2041-05-15T00:00:00Z");

    expect(await insertProbeAndReadTableoid(client, "2041-04-30T23:59:59.999Z", "UTC_BOUNDS_PROBE_A")).toBe(
      "security.audit_logs_y2041m04"
    );
    expect(await insertProbeAndReadTableoid(client, "2041-05-01T00:00:00.000Z", "UTC_BOUNDS_PROBE_B")).toBe(
      "security.audit_logs_y2041m05"
    );
  });

  it("routes an offset-bearing timestamp by its UTC instant, not its wall clock (+02:00 case falls into the PREVIOUS month)", async () => {
    client = await getTargetPrismaClient();
    // 2041-07-01T00:30:00+02:00 === 2041-06-30T22:30:00Z -> June, not July.
    const iso = new Date("2041-07-01T00:30:00+02:00").toISOString();
    expect(iso).toBe("2041-06-30T22:30:00.000Z");
    expect(await partitionName(client, iso)).toBe("audit_logs_y2041m06");
    await ensurePartition(client, iso);
    expect(await insertProbeAndReadTableoid(client, iso, "UTC_BOUNDS_PROBE_C")).toBe("security.audit_logs_y2041m06");
  });

  it("routes an offset-bearing timestamp by its UTC instant (-03:00 case falls into the NEXT month)", async () => {
    client = await getTargetPrismaClient();
    // 2041-09-30T23:30:00-03:00 === 2041-10-01T02:30:00Z -> October, not September.
    const iso = new Date("2041-09-30T23:30:00-03:00").toISOString();
    expect(iso).toBe("2041-10-01T02:30:00.000Z");
    expect(await partitionName(client, iso)).toBe("audit_logs_y2041m10");
    await ensurePartition(client, iso);
    expect(await insertProbeAndReadTableoid(client, iso, "UTC_BOUNDS_PROBE_D")).toBe("security.audit_logs_y2041m10");
  });

  it("produces the same bounds regardless of the SESSION timezone (the function pins its own)", async () => {
    client = await getTargetPrismaClient();
    const rawClient = client as unknown as {
      $executeRawUnsafe: (q: string, ...v: unknown[]) => Promise<number>;
      $queryRawUnsafe: <T>(q: string, ...v: unknown[]) => Promise<T[]>;
    };
    const names: string[] = [];
    for (const tz of ["UTC", "America/Santiago", "Asia/Tokyo", "Pacific/Kiritimati"]) {
      await rawClient.$executeRawUnsafe(`SET TIME ZONE '${tz}'`);
      const rows = await rawClient.$queryRawUnsafe<{ name: string; s: Date; e: Date }>(
        `SELECT security.fn_audit_log_partition_name($1::timestamptz) AS name,
                security.fn_audit_log_month_start($1::timestamptz) AS s,
                security.fn_audit_log_next_month_start($1::timestamptz) AS e`,
        new Date("2041-11-01T00:30:00Z")
      );
      names.push(`${rows[0]!.name}|${rows[0]!.s.toISOString()}|${rows[0]!.e.toISOString()}`);
    }
    await rawClient.$executeRawUnsafe(`SET TIME ZONE 'UTC'`);
    expect(new Set(names).size).toBe(1);
    expect(names[0]).toBe("audit_logs_y2041m11|2041-11-01T00:00:00.000Z|2041-12-01T00:00:00.000Z");
  });
});
