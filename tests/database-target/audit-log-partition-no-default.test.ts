import { afterAll, describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  closeTargetPrismaClient,
  getTargetPrismaClient,
  type TargetPrismaClientLike,
} from "../../src/lib/database-target/client/targetPrismaClient";
import {
  auditPartitionDockerShouldRun,
  dropTestPartitions,
  ensurePartition,
  raw,
  readRepoFile,
  readWave010File,
} from "./auditPartitionTestHelpers";

/**
 * tests/database-target/audit-log-partition-no-default.test.ts
 *
 * `security.audit_logs` must never have a DEFAULT partition. A DEFAULT
 * partition would make the original bug invisible instead of fixed: every
 * out-of-range audit row would land in it silently, mis-partitioned, and
 * every later ATTACH would then require a full scan of it.
 *
 * A missing month must therefore fail loudly (or be created explicitly),
 * never be absorbed.
 */

const YEAR_PREFIX = "audit_logs_y2054";
const TARGET_MIGRATIONS = join(__dirname, "..", "..", "prisma", "target-migrations");

describe("audit_logs has no DEFAULT partition — SQL sources", () => {
  it("no target migration declares a DEFAULT partition of audit_logs", () => {
    const offenders: string[] = [];
    for (const wave of readdirSync(TARGET_MIGRATIONS)) {
      for (const file of readdirSync(join(TARGET_MIGRATIONS, wave))) {
        if (!file.endsWith(".sql")) continue;
        const sql = readRepoFile("prisma", "target-migrations", wave, file);
        // `PARTITION OF security.audit_logs DEFAULT` in any spelling.
        if (/PARTITION\s+OF\s+security\.audit_logs\s+DEFAULT/i.test(sql)) {
          offenders.push(`${wave}/${file}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the ensure function documents and enforces the no-DEFAULT rule instead of leaving it implicit", () => {
    const migration = readWave010File("migration.sql");
    expect(migration).toContain("AUDIT_PARTITION_UNEXPECTED_DEFAULT");
    expect(migration).toMatch(/NO DEFAULT partition, deliberately/);
  });

  it("wave 010 validation blocks on the presence of a DEFAULT partition", () => {
    const validation = readWave010File("validation.sql");
    expect(validation).toContain("AUDIT_PARTITION_NO_DEFAULT_FAIL");
    expect(validation).toContain("AUDIT_PARTITION_NO_DEFAULT_PASS");
    expect(validation).toContain(`pg_get_expr(c.relpartbound, c.oid) = 'DEFAULT'`);
  });
});

describe.skipIf(!auditPartitionDockerShouldRun)("audit_logs has no DEFAULT partition — real PostgreSQL", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    if (client) await dropTestPartitions(client, [YEAR_PREFIX]);
    await closeTargetPrismaClient();
  });

  it("zero partitions of security.audit_logs are DEFAULT", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ relname: string }>(
      `SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = 'security.audit_logs'::regclass
          AND pg_get_expr(c.relpartbound, c.oid) = 'DEFAULT'`
    );
    expect(rows).toEqual([]);
  });

  it("an insert for an uncovered month FAILS loudly rather than being absorbed", async () => {
    client = await getTargetPrismaClient();
    // 2054-11 is deliberately never ensured before this assertion.
    await expect(
      raw(client).$executeRawUnsafe(
        `INSERT INTO security.audit_logs
           (id, actor_type, actor_id, action, target_table, target_id, classification, result, integrity_value, occurred_at)
         VALUES (gen_random_uuid(), 'SYSTEM', gen_random_uuid(), 'NO_DEFAULT_PROBE', 'security.audit_logs',
                 gen_random_uuid(), 'RESTRICTED', 'SUCCESS', 'test-probe', $1::timestamptz)`,
        new Date("2054-11-11T11:11:11Z")
      )
    ).rejects.toThrow(/no partition of relation/i);
  });

  it("...and succeeds once the month is explicitly ensured, with the row in the right partition", async () => {
    client = await getTargetPrismaClient();
    expect(await ensurePartition(client, "2054-11-11T11:11:11Z")).toBe("CREATED");
    await raw(client).$executeRawUnsafe(
      `INSERT INTO security.audit_logs
         (id, actor_type, actor_id, action, target_table, target_id, classification, result, integrity_value, occurred_at)
       VALUES (gen_random_uuid(), 'SYSTEM', gen_random_uuid(), 'NO_DEFAULT_PROBE', 'security.audit_logs',
               gen_random_uuid(), 'RESTRICTED', 'SUCCESS', 'test-probe', $1::timestamptz)`,
      new Date("2054-11-11T11:11:11Z")
    );
    const rows = await raw(client).$queryRawUnsafe<{ landed: string }>(
      `SELECT tableoid::regclass::text AS landed FROM security.audit_logs WHERE action = 'NO_DEFAULT_PROBE'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.landed).toBe("security.audit_logs_y2054m11");
  });
});
