import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  closeTargetPrismaClient,
  getTargetPrismaClient,
  type TargetPrismaClientLike,
} from "../../src/lib/database-target/client/targetPrismaClient";
import {
  insertAuditLog,
  type RawSqlClient,
} from "../../src/lib/database-target/repositories/incidentPromotionRepository";
import {
  auditPartitionDockerShouldRun,
  dropTestPartitions,
  raw,
  readRepoFile,
} from "./auditPartitionTestHelpers";
import type { AuditLogInput } from "../../src/lib/database-target/security";

/**
 * tests/database-target/audit-log-writer-ensures-partition.test.ts
 *
 * The canonical target audit writer must ensure the partition BEFORE its
 * INSERT, in the same transaction, and must not alter `occurred_at` to make a
 * row fit an existing partition.
 *
 * The first block proves the ORDER with a recording fake — order is the part
 * that a live test cannot distinguish from "it happened to work because the
 * partition already existed". The Docker block proves the real effect against
 * PostgreSQL, including a write in a month that has no partition yet.
 */

const YEAR_PREFIX = "audit_logs_y2050";

function baseInput(overrides: Partial<AuditLogInput> = {}): AuditLogInput {
  return {
    actorType: "SYSTEM",
    actorId: "11111111-1111-1111-1111-111111111111",
    action: "WRITER_ENSURES_PARTITION_PROBE",
    targetTable: "security.audit_logs",
    targetId: "22222222-2222-2222-2222-222222222222",
    classification: "RESTRICTED",
    context: null,
    purpose: null,
    decision: null,
    result: "SUCCESS",
    beforeState: null,
    afterState: null,
    ...overrides,
  };
}

/** Records every statement in order so the ensure-before-insert sequence is observable. */
function recordingClient(): { client: RawSqlClient; statements: string[]; params: unknown[][] } {
  const statements: string[] = [];
  const params: unknown[][] = [];
  const client: RawSqlClient = {
    $queryRawUnsafe: async <T = unknown>(query: string, ...values: unknown[]): Promise<T[]> => {
      statements.push(query);
      params.push(values);
      if (query.includes("fn_ensure_audit_log_partition")) {
        return [{ result: "ALREADY_EXISTS" } as unknown as T];
      }
      return [];
    },
    $executeRawUnsafe: async (query: string, ...values: unknown[]): Promise<number> => {
      statements.push(query);
      params.push(values);
      return 1;
    },
  };
  return { client, statements, params };
}

describe("canonical audit writer — ensure-before-insert ordering", () => {
  it("calls fn_ensure_audit_log_partition before the INSERT into security.audit_logs", async () => {
    const { client, statements } = recordingClient();
    await insertAuditLog(client, randomUUID(), baseInput({ occurredAt: new Date("2050-05-05T05:05:05Z") }));

    const ensureIndex = statements.findIndex((sql) => sql.includes("fn_ensure_audit_log_partition"));
    const insertIndex = statements.findIndex((sql) => sql.includes("INSERT INTO security.audit_logs"));
    expect(ensureIndex).toBeGreaterThanOrEqual(0);
    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(ensureIndex).toBeLessThan(insertIndex);
  });

  it("passes the SAME instant to the ensure call and to the INSERT — no drift, no re-derivation", async () => {
    const occurredAt = new Date("2050-05-05T05:05:05.000Z");
    const { client, statements, params } = recordingClient();
    await insertAuditLog(client, randomUUID(), baseInput({ occurredAt }));

    const ensureIndex = statements.findIndex((sql) => sql.includes("fn_ensure_audit_log_partition"));
    const insertIndex = statements.findIndex((sql) => sql.includes("INSERT INTO security.audit_logs"));
    expect(params[ensureIndex]![0]).toEqual(occurredAt);
    // occurred_at is the last bound parameter of the INSERT.
    const insertParams = params[insertIndex]!;
    expect(insertParams[insertParams.length - 1]).toEqual(occurredAt);
  });

  it("binds occurred_at explicitly instead of leaving it to the database's now() default", async () => {
    const { client, statements } = recordingClient();
    await insertAuditLog(client, randomUUID(), baseInput({ occurredAt: new Date("2050-05-05T05:05:05Z") }));
    const insert = statements.find((sql) => sql.includes("INSERT INTO security.audit_logs"))!;
    expect(insert).toContain("$18::timestamptz");
    expect(insert).not.toMatch(/occurred_at\)\s*\n?\s*VALUES[\s\S]*now\(\)\)/);
  });

  it("defaults occurredAt to 'now' when the caller omits it, without inventing a different month", async () => {
    const before = Date.now();
    const { client, params, statements } = recordingClient();
    await insertAuditLog(client, randomUUID(), baseInput());
    const after = Date.now();

    const ensureIndex = statements.findIndex((sql) => sql.includes("fn_ensure_audit_log_partition"));
    const used = params[ensureIndex]![0] as Date;
    expect(used.getTime()).toBeGreaterThanOrEqual(before);
    expect(used.getTime()).toBeLessThanOrEqual(after);
  });

  it("propagates an ensure failure instead of inserting anyway", async () => {
    const statements: string[] = [];
    const failing: RawSqlClient = {
      $queryRawUnsafe: async <T = unknown>(query: string): Promise<T[]> => {
        statements.push(query);
        throw new Error("AUDIT_PARTITION_BOUND_MISMATCH: simulated");
      },
      $executeRawUnsafe: async (query: string): Promise<number> => {
        statements.push(query);
        return 1;
      },
    };
    await expect(insertAuditLog(failing, randomUUID(), baseInput())).rejects.toThrow(
      /AUDIT_PARTITION_BOUND_MISMATCH/
    );
    expect(statements.some((sql) => sql.includes("INSERT INTO security.audit_logs"))).toBe(false);
  });

  it("is the only place in the target layer that inserts into security.audit_logs", () => {
    const repository = readRepoFile("src", "lib", "database-target", "repositories", "incidentPromotionRepository.ts");
    const service = readRepoFile("src", "lib", "database-target", "services", "incidentPromotionService.ts");
    expect(repository.match(/INSERT INTO security\.audit_logs/g) ?? []).toHaveLength(1);
    expect(service).not.toContain("INSERT INTO security.audit_logs");
    // The service goes through the repository helper, never raw SQL.
    expect(service).toContain("insertAuditLog(");
  });
});

describe.skipIf(!auditPartitionDockerShouldRun)("canonical audit writer — real PostgreSQL", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    if (client) await dropTestPartitions(client, [YEAR_PREFIX]);
    await closeTargetPrismaClient();
  });

  it("writes an audit row in a month that has NO partition yet — the exact case that used to fail", async () => {
    client = await getTargetPrismaClient();
    const id = randomUUID();
    const occurredAt = new Date("2050-08-15T10:00:00Z");

    await insertAuditLog(raw(client), id, baseInput({ occurredAt }));

    const rows = await raw(client).$queryRawUnsafe<{ landed: string; occurred_at: Date }>(
      `SELECT tableoid::regclass::text AS landed, occurred_at FROM security.audit_logs WHERE id = $1::uuid`,
      id
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.landed).toBe("security.audit_logs_y2050m08");
    expect(rows[0]!.occurred_at.toISOString()).toBe("2050-08-15T10:00:00.000Z");
  });

  it("stores occurred_at exactly as supplied, including an offset-bearing instant that routes to the previous month", async () => {
    client = await getTargetPrismaClient();
    const id = randomUUID();
    // 2050-10-01T00:30:00+02:00 === 2050-09-30T22:30:00Z
    const occurredAt = new Date("2050-10-01T00:30:00+02:00");

    await insertAuditLog(raw(client), id, baseInput({ occurredAt }));

    const rows = await raw(client).$queryRawUnsafe<{ landed: string; occurred_at: Date }>(
      `SELECT tableoid::regclass::text AS landed, occurred_at FROM security.audit_logs WHERE id = $1::uuid`,
      id
    );
    expect(rows[0]!.occurred_at.toISOString()).toBe("2050-09-30T22:30:00.000Z");
    expect(rows[0]!.landed).toBe("security.audit_logs_y2050m09");
  });

  it("writes across a year boundary in a single sequence of calls", async () => {
    client = await getTargetPrismaClient();
    const decemberId = randomUUID();
    const januaryId = randomUUID();
    await insertAuditLog(raw(client), decemberId, baseInput({ occurredAt: new Date("2050-12-31T23:59:59Z") }));
    await insertAuditLog(raw(client), januaryId, baseInput({ occurredAt: new Date("2051-01-01T00:00:00Z") }));

    const rows = await raw(client).$queryRawUnsafe<{ id: string; landed: string }>(
      `SELECT id::text AS id, tableoid::regclass::text AS landed FROM security.audit_logs WHERE id IN ($1::uuid, $2::uuid)`,
      decemberId,
      januaryId
    );
    const landed = new Map(rows.map((row) => [row.id, row.landed]));
    expect(landed.get(decemberId)).toBe("security.audit_logs_y2050m12");
    expect(landed.get(januaryId)).toBe("security.audit_logs_y2051m01");

    await raw(client).$executeRawUnsafe(`DROP TABLE IF EXISTS security.audit_logs_y2051m01`);
  });

  it("rolls the partition back with the transaction when the audit write is rolled back", async () => {
    client = await getTargetPrismaClient();
    const transactional = client as unknown as {
      $transaction: <T>(fn: (tx: RawSqlClient) => Promise<T>) => Promise<T>;
    };

    await expect(
      transactional.$transaction(async (tx) => {
        await insertAuditLog(tx, randomUUID(), baseInput({ occurredAt: new Date("2050-11-11T00:00:00Z") }));
        throw new Error("deliberate rollback");
      })
    ).rejects.toThrow("deliberate rollback");

    const rows = await raw(client).$queryRawUnsafe<{ relname: string }>(
      `SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = 'security.audit_logs'::regclass AND c.relname = 'audit_logs_y2050m11'`
    );
    expect(rows).toEqual([]);
  });
});
