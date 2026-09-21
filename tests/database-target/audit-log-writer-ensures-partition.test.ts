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
  listPartitions,
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

/*
 * The runtime writer goes through security.fn_ensure_audit_log_partition_for_write,
 * which only accepts months inside the write horizon [now-24m, now+3m]
 * (010_foundation). Fixed far-future dates (the original 2050 fixtures) are
 * rejected by design, so the live block picks past months inside that horizon
 * that have no partition yet, at run time, and drops exactly what it created.
 */
const HORIZON_SEARCH_NEWEST_OFFSET = -6; // stays clear of the install-time window (prev month .. +3)
const HORIZON_SEARCH_OLDEST_OFFSET = -22; // stays inside the 24-month floor

function monthStartUtc(offsetMonths: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1));
}

function partitionRelname(monthStart: Date): string {
  return `audit_logs_y${monthStart.getUTCFullYear()}m${String(monthStart.getUTCMonth() + 1).padStart(2, "0")}`;
}

describe.skipIf(!auditPartitionDockerShouldRun)("canonical audit writer — real PostgreSQL", () => {
  let client: TargetPrismaClientLike;
  const reserved = new Set<string>();

  /** Oldest-first free past months inside the horizon, never reused across cases. */
  async function freeMonths(predicate: (offset: number, existing: Set<string>) => boolean): Promise<number> {
    const existing = new Set(await listPartitions(client));
    for (let offset = HORIZON_SEARCH_NEWEST_OFFSET; offset >= HORIZON_SEARCH_OLDEST_OFFSET; offset--) {
      if (predicate(offset, existing)) return offset;
    }
    throw new Error("no free month inside the audit write horizon — clean the rehearsal database");
  }

  function isFree(offset: number, existing: Set<string>): boolean {
    const name = partitionRelname(monthStartUtc(offset));
    return !existing.has(name) && !reserved.has(name);
  }

  function reserve(offset: number): string {
    const name = partitionRelname(monthStartUtc(offset));
    reserved.add(name);
    return name;
  }

  afterAll(async () => {
    if (client && reserved.size > 0) await dropTestPartitions(client, [...reserved]);
    await closeTargetPrismaClient();
  });

  it("writes an audit row in a month that has NO partition yet — the exact case that used to fail", async () => {
    client = await getTargetPrismaClient();
    const offset = await freeMonths(isFree);
    const name = reserve(offset);
    const monthStart = monthStartUtc(offset);
    const occurredAt = new Date(monthStart.getTime() + (14 * 24 + 10) * 60 * 60 * 1000); // day 15, 10:00Z
    const id = randomUUID();

    await insertAuditLog(raw(client), id, baseInput({ occurredAt }));

    const rows = await raw(client).$queryRawUnsafe<{ landed: string; occurred_at: Date }>(
      `SELECT tableoid::regclass::text AS landed, occurred_at FROM security.audit_logs WHERE id = $1::uuid`,
      id
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.landed).toBe(`security.${name}`);
    expect(rows[0]!.occurred_at.toISOString()).toBe(occurredAt.toISOString());
  });

  it("stores occurred_at exactly as supplied, including an offset-bearing instant that routes to the previous month", async () => {
    client = await getTargetPrismaClient();
    const offset = await freeMonths(isFree);
    const name = reserve(offset);
    // First day of the NEXT month at 00:30+02:00 is 22:30Z on the last day of the chosen month.
    const nextMonthStart = monthStartUtc(offset + 1);
    const y = nextMonthStart.getUTCFullYear();
    const m = String(nextMonthStart.getUTCMonth() + 1).padStart(2, "0");
    const occurredAt = new Date(`${y}-${m}-01T00:30:00+02:00`);
    const expectedUtc = new Date(nextMonthStart.getTime() - 90 * 60 * 1000).toISOString();
    const id = randomUUID();

    await insertAuditLog(raw(client), id, baseInput({ occurredAt }));

    const rows = await raw(client).$queryRawUnsafe<{ landed: string; occurred_at: Date }>(
      `SELECT tableoid::regclass::text AS landed, occurred_at FROM security.audit_logs WHERE id = $1::uuid`,
      id
    );
    expect(rows[0]!.occurred_at.toISOString()).toBe(expectedUtc);
    expect(rows[0]!.landed).toBe(`security.${name}`);
  });

  it("writes across a year boundary in a single sequence of calls", async () => {
    client = await getTargetPrismaClient();
    // A December whose following January is also free and still inside the search range.
    const decemberOffset = await freeMonths(
      (offset, existing) =>
        monthStartUtc(offset).getUTCMonth() === 11 &&
        offset + 1 <= HORIZON_SEARCH_NEWEST_OFFSET &&
        isFree(offset, existing) &&
        isFree(offset + 1, existing)
    );
    const decemberName = reserve(decemberOffset);
    const januaryName = reserve(decemberOffset + 1);
    const januaryStart = monthStartUtc(decemberOffset + 1);
    const decemberId = randomUUID();
    const januaryId = randomUUID();
    await insertAuditLog(raw(client), decemberId, baseInput({ occurredAt: new Date(januaryStart.getTime() - 1000) }));
    await insertAuditLog(raw(client), januaryId, baseInput({ occurredAt: januaryStart }));

    const rows = await raw(client).$queryRawUnsafe<{ id: string; landed: string }>(
      `SELECT id::text AS id, tableoid::regclass::text AS landed FROM security.audit_logs WHERE id IN ($1::uuid, $2::uuid)`,
      decemberId,
      januaryId
    );
    const landed = new Map(rows.map((row) => [row.id, row.landed]));
    expect(landed.get(decemberId)).toBe(`security.${decemberName}`);
    expect(landed.get(januaryId)).toBe(`security.${januaryName}`);
  });

  it("rolls the partition back with the transaction when the audit write is rolled back", async () => {
    client = await getTargetPrismaClient();
    const offset = await freeMonths(isFree);
    const name = reserve(offset);
    const occurredAt = new Date(monthStartUtc(offset).getTime() + 10 * 24 * 60 * 60 * 1000);
    const transactional = client as unknown as {
      $transaction: <T>(fn: (tx: RawSqlClient) => Promise<T>) => Promise<T>;
    };

    await expect(
      transactional.$transaction(async (tx) => {
        await insertAuditLog(tx, randomUUID(), baseInput({ occurredAt }));
        throw new Error("deliberate rollback");
      })
    ).rejects.toThrow("deliberate rollback");

    const rows = await raw(client).$queryRawUnsafe<{ relname: string }>(
      `SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = 'security.audit_logs'::regclass AND c.relname = $1`,
      name
    );
    expect(rows).toEqual([]);
  });

  it("rejects a month outside the runtime write horizon instead of creating it", async () => {
    client = await getTargetPrismaClient();
    await expect(
      insertAuditLog(raw(client), randomUUID(), baseInput({ occurredAt: new Date("2050-08-15T10:00:00Z") }))
    ).rejects.toThrow(/AUDIT_PARTITION_WRITE_HORIZON_EXCEEDED/);
    expect(await listPartitions(client)).not.toContain("audit_logs_y2050m08");
  });
});
