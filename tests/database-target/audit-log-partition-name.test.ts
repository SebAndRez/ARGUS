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
  partitionName,
  readWave010File,
} from "./auditPartitionTestHelpers";

/**
 * tests/database-target/audit-log-partition-name.test.ts
 *
 * The partition name must be a pure function of the (validated) timestamp and
 * of nothing else. That is the whole safety story for the dynamic DDL: if no
 * caller can influence the identifier, no caller can inject one.
 */

const YEAR_PREFIX = "audit_logs_y2040";

describe("audit_logs partition naming — contract of the SQL source", () => {
  const migration = readWave010File("migration.sql");

  it("derives the name inside SQL from the timestamp only — the name function takes exactly one timestamptz parameter", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION security.fn_audit_log_partition_name(p_occurred_at timestamptz)");
    // The body must not reference any other parameter, and there must be no
    // second parameter to reference.
    const body = migration.slice(
      migration.indexOf("fn_audit_log_partition_name(p_occurred_at timestamptz)"),
      migration.indexOf("CREATE OR REPLACE FUNCTION security.fn_assert_audit_log_partition")
    );
    expect(body).toContain("audit_logs_y");
    expect(body).not.toMatch(/p_schema|p_table|p_name|p_relation/);
  });

  it("neither ensure entry point accepts a schema name, table name, or any text identifier", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION security.fn_ensure_audit_log_partition(p_occurred_at timestamptz)");
    const ensureSignature = /fn_ensure_audit_log_partition\(([^)]*)\)\s*\nRETURNS text/.exec(migration);
    expect(ensureSignature?.[1]).toBe("p_occurred_at timestamptz");

    const windowSignature = /fn_ensure_audit_log_partition_window\(\s*([\s\S]*?)\)\s*\nRETURNS TABLE/.exec(migration);
    expect(windowSignature?.[1]).toMatch(/p_anchor\s+timestamptz/);
    expect(windowSignature?.[1]).toMatch(/p_months_before\s+integer/);
    expect(windowSignature?.[1]).toMatch(/p_months_after\s+integer/);
    expect(windowSignature?.[1]).not.toMatch(/text|varchar|name\b/);
  });

  it("interpolates the identifier with format('%I', ...) and the bounds with %L — never bare concatenation of a value into DDL", () => {
    expect(migration).toContain("'CREATE TABLE security.%I PARTITION OF security.audit_logs FOR VALUES FROM (%L) TO (%L)'");
  });
});

describe.skipIf(!auditPartitionDockerShouldRun)("audit_logs partition naming — real PostgreSQL", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    if (client) await dropTestPartitions(client, [YEAR_PREFIX]);
    await closeTargetPrismaClient();
  });

  const cases: Array<[string, string]> = [
    ["2040-01-01T00:00:00Z", "audit_logs_y2040m01"],
    ["2040-01-31T23:59:59Z", "audit_logs_y2040m01"],
    ["2040-02-29T12:00:00Z", "audit_logs_y2040m02"],
    ["2040-09-30T23:59:59Z", "audit_logs_y2040m09"],
    ["2040-10-01T00:00:00Z", "audit_logs_y2040m10"],
    ["2040-12-31T23:59:59Z", "audit_logs_y2040m12"],
  ];

  it.each(cases)("fn_audit_log_partition_name(%s) = %s", async (instant, expected) => {
    client = await getTargetPrismaClient();
    expect(await partitionName(client, instant)).toBe(expected);
  });

  it("pads single-digit months to two digits (audit_logs_y2040m03, never m3)", async () => {
    client = await getTargetPrismaClient();
    expect(await partitionName(client, "2040-03-15T00:00:00Z")).toBe("audit_logs_y2040m03");
  });

  it("creates a relation whose actual catalog name equals the derived name", async () => {
    client = await getTargetPrismaClient();
    const expected = await partitionName(client, "2040-05-20T08:00:00Z");
    const result = await ensurePartition(client, "2040-05-20T08:00:00Z");
    expect(result).toBe("CREATED");
    const rows = await (client as unknown as {
      $queryRawUnsafe: <T>(q: string, ...v: unknown[]) => Promise<T[]>;
    }).$queryRawUnsafe<{ relname: string }>(
      `SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = 'security.audit_logs'::regclass AND c.relname = $1`,
      expected
    );
    expect(rows).toHaveLength(1);
  });
});
