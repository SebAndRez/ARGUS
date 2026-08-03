import { afterAll, describe, expect, it } from "vitest";
import {
  closeTargetPrismaClient,
  getTargetPrismaClient,
  type TargetPrismaClientLike,
} from "../../src/lib/database-target/client/targetPrismaClient";
import {
  auditPartitionDockerShouldRun,
  raw,
  readRepoFile,
  readWave010File,
} from "./auditPartitionTestHelpers";

/**
 * tests/database-target/audit-log-backfill-partitions.test.ts
 *
 * A historical backfill's months are dictated by the SOURCE DATA, not by a
 * window around today. This file pins both halves of that:
 *   * the backfill prepares exactly the distinct UTC months present in the
 *     legacy `AuditLog` table, before inserting, and invents none;
 *   * `occurred_at` is the untouched legacy `createdAt`, so a row can never be
 *     nudged into a month that happens to have a partition.
 *
 * The Docker half runs against the fully-backfilled rehearsal database and is
 * read-only, so it neither creates nor drops partitions.
 */

describe("audit_logs backfill partition preparation — SQL source", () => {
  const backfill = readWave010File("backfill.sql");

  it("ensures a partition for every DISTINCT UTC month of the legacy source", () => {
    expect(backfill).toContain(`SELECT DISTINCT date_trunc('month', al."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`);
    expect(backfill).toContain("security.fn_ensure_audit_log_partition(v_month)");
  });

  it("prepares partitions BEFORE the INSERT that needs them", () => {
    const ensureIndex = backfill.indexOf("security.fn_ensure_audit_log_partition(v_month)");
    const insertIndex = backfill.indexOf("INSERT INTO security.audit_logs (");
    expect(ensureIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(-1);
    expect(ensureIndex).toBeLessThan(insertIndex);
  });

  it("passes the legacy createdAt straight through as occurred_at — never shifted, rounded, or defaulted", () => {
    expect(backfill).toMatch(/al\."createdAt",\s*\n\s*al\.action,/);
    expect(backfill).not.toMatch(/date_trunc\([^)]*\)\s+AS\s+occurred_at/i);
    // No attempt to clamp a row into an existing partition.
    expect(backfill).not.toMatch(/occurred_at\s*=\s*(now\(\)|TIMESTAMPTZ)/i);
  });

  it("does not derive backfill months from now() — that is the window maintenance's job, not the backfill's", () => {
    const start = backfill.indexOf("2.0 Historical partition preparation");
    const end = backfill.indexOf("INSERT INTO security.audit_logs (");
    expect(backfill.slice(start, end)).not.toContain("now()");
  });

  it("the rehearsal fixtures span several months including a year boundary and a leap day", () => {
    const fixtures = readRepoFile("scripts", "migration-rehearsal", "fixtures", "000_legacy_synthetic_fixtures.sql");
    for (const instant of [
      "2026-04-15 12:00:00+00",
      "2026-07-31 23:59:59+00",
      "2026-08-01 00:00:00+00",
      "2026-12-31 23:59:59+00",
      "2027-01-01 00:00:00+00",
      "2028-02-29 12:00:00+00",
      "2026-08-01 00:30:00+02:00",
      "2026-07-31 23:30:00-03:00",
    ]) {
      expect(fixtures, `fixtures must include ${instant}`).toContain(instant);
    }
    // The stale instruction that pinned every fixture inside the single
    // July-2026 partition must be gone.
    expect(fixtures).not.toContain("createdAt values MUST fall inside security.audit_logs_y2026m07");
  });
});

describe.skipIf(!auditPartitionDockerShouldRun)("audit_logs backfill partition preparation — real PostgreSQL", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    await closeTargetPrismaClient();
  });

  it("every distinct UTC month present in legacy AuditLog has a partition", async () => {
    client = await getTargetPrismaClient();
    const missing = await raw(client).$queryRawUnsafe<{ month: string }>(
      `SELECT to_char(s.m, 'YYYY-MM') AS month
         FROM (
           SELECT DISTINCT date_trunc('month', al."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS m
           FROM "AuditLog" al WHERE al."createdAt" IS NOT NULL
         ) s
        WHERE NOT EXISTS (
          SELECT 1 FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
           WHERE i.inhparent = 'security.audit_logs'::regclass
             AND c.relname = security.fn_audit_log_partition_name(s.m)
        )`
    );
    expect(missing).toEqual([]);
  });

  it("the legacy source genuinely spans at least 4 distinct UTC months (otherwise this proves nothing)", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ months: string }>(
      `SELECT COUNT(DISTINCT date_trunc('month', "createdAt" AT TIME ZONE 'UTC'))::text AS months FROM "AuditLog"`
    );
    expect(Number(rows[0]!.months)).toBeGreaterThanOrEqual(4);
  });

  it("row count parity: every legacy AuditLog row has a backfilled target row", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ legacy: string; target: string }>(
      `SELECT (SELECT COUNT(*)::text FROM "AuditLog") AS legacy,
              (SELECT COUNT(*)::text FROM security.audit_logs WHERE legacy_source = 'AuditLog') AS target`
    );
    expect(rows[0]!.target).toBe(rows[0]!.legacy);
    expect(Number(rows[0]!.legacy)).toBeGreaterThan(0);
  });

  it("occurred_at equals the legacy createdAt exactly, for every backfilled row", async () => {
    client = await getTargetPrismaClient();
    const drifted = await raw(client).$queryRawUnsafe<{ legacy_record_id: string }>(
      `SELECT a.legacy_record_id
         FROM security.audit_logs a
         JOIN "AuditLog" al ON al.id = a.legacy_record_id
        WHERE a.legacy_source = 'AuditLog'
          AND a.occurred_at <> al."createdAt"`
    );
    expect(drifted).toEqual([]);
  });

  it("every audit row physically lives in the partition its own occurred_at demands (tableoid, not name guessing)", async () => {
    client = await getTargetPrismaClient();
    const misrouted = await raw(client).$queryRawUnsafe<{ landed: string; expected: string }>(
      `SELECT a.tableoid::regclass::text AS landed,
              'security.' || security.fn_audit_log_partition_name(a.occurred_at) AS expected
         FROM security.audit_logs a
        WHERE a.tableoid::regclass::text <> 'security.' || security.fn_audit_log_partition_name(a.occurred_at)`
    );
    expect(misrouted).toEqual([]);
  });

  it("backfilled rows land in the specific months the fixtures declare, including the offset-bearing ones", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ landed: string; occurred_at: Date }>(
      `SELECT tableoid::regclass::text AS landed, occurred_at
         FROM security.audit_logs
        WHERE legacy_source = 'AuditLog'
        ORDER BY occurred_at`
    );
    const byMonth = new Map(rows.map((row) => [row.occurred_at.toISOString(), row.landed]));
    expect(byMonth.get("2026-04-15T12:00:00.000Z")).toBe("security.audit_logs_y2026m04");
    expect(byMonth.get("2026-07-31T23:59:59.000Z")).toBe("security.audit_logs_y2026m07");
    expect(byMonth.get("2026-08-01T00:00:00.000Z")).toBe("security.audit_logs_y2026m08");
    expect(byMonth.get("2026-12-31T23:59:59.000Z")).toBe("security.audit_logs_y2026m12");
    expect(byMonth.get("2027-01-01T00:00:00.000Z")).toBe("security.audit_logs_y2027m01");
    expect(byMonth.get("2028-02-29T12:00:00.000Z")).toBe("security.audit_logs_y2028m02");
    // +02:00 input -> previous month by UTC instant.
    expect(byMonth.get("2026-07-31T22:30:00.000Z")).toBe("security.audit_logs_y2026m07");
    // -03:00 input -> next month by UTC instant.
    expect(byMonth.get("2026-08-01T02:30:00.000Z")).toBe("security.audit_logs_y2026m08");
  });

  it("no partition exists for a month absent from the source AND absent from the operational window", async () => {
    client = await getTargetPrismaClient();
    // 2026-05 and 2026-06 are neither legacy months nor inside
    // [now-1mo, now+3mo] for the rehearsal's install date — the backfill must
    // not have padded the range between April and July.
    const rows = await raw(client).$queryRawUnsafe<{ relname: string }>(
      `SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = 'security.audit_logs'::regclass
          AND c.relname IN ('audit_logs_y2026m05','audit_logs_y2026m06')
          AND c.relname <> security.fn_audit_log_partition_name(now())
          AND c.relname <> security.fn_audit_log_partition_name(now() - interval '1 month')
          AND c.relname <> security.fn_audit_log_partition_name(now() + interval '1 month')
          AND c.relname <> security.fn_audit_log_partition_name(now() + interval '2 month')
          AND c.relname <> security.fn_audit_log_partition_name(now() + interval '3 month')`
    );
    expect(rows).toEqual([]);
  });
});
