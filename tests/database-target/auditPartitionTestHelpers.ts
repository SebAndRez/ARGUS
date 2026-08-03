import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TargetPrismaClientLike } from "../../src/lib/database-target/client/targetPrismaClient";
import type { RawSqlClient } from "../../src/lib/database-target/repositories/incidentPromotionRepository";

/**
 * tests/database-target/auditPartitionTestHelpers.ts
 *
 * Shared helpers for the `security.audit_logs` partition-lifecycle tests.
 *
 * Docker gating uses the same convention as the wave-3/wave-4 suites
 * (`ARGUS_WAVE3_INTEGRATION_TEST=true` + `TARGET_DATABASE_URL`) so
 * `npm run db:target:test` stays Docker-independent, while CI and a local
 * rehearsal exercise the real database.
 *
 * Each Docker test file owns a DISTINCT far-future year (see the constants in
 * each file) and drops every partition it created in `afterAll`. Two reasons:
 * the rehearsal catalog must be left exactly as found, and two test files must
 * never race for the same month and make each other's CREATED/ALREADY_EXISTS
 * assertions flaky.
 */
export const auditPartitionDockerShouldRun =
  process.env.ARGUS_WAVE3_INTEGRATION_TEST === "true" && Boolean(process.env.TARGET_DATABASE_URL);

export function raw(client: TargetPrismaClientLike): RawSqlClient {
  return client as unknown as RawSqlClient;
}

const REPO_ROOT = join(__dirname, "..", "..");

export function readWave010File(name: string): string {
  return readFileSync(join(REPO_ROOT, "prisma", "target-migrations", "010_foundation", name), "utf8");
}

export function readRepoFile(...segments: string[]): string {
  return readFileSync(join(REPO_ROOT, ...segments), "utf8");
}

/** `security.fn_ensure_audit_log_partition` for one instant. */
export async function ensurePartition(client: TargetPrismaClientLike, isoInstant: string): Promise<string> {
  const rows = await raw(client).$queryRawUnsafe<{ result: string }>(
    `SELECT security.fn_ensure_audit_log_partition($1::timestamptz) AS result`,
    new Date(isoInstant)
  );
  return rows[0]!.result;
}

export async function partitionName(client: TargetPrismaClientLike, isoInstant: string): Promise<string> {
  const rows = await raw(client).$queryRawUnsafe<{ name: string }>(
    `SELECT security.fn_audit_log_partition_name($1::timestamptz) AS name`,
    new Date(isoInstant)
  );
  return rows[0]!.name;
}

export interface PartitionBoundRow {
  relname: string;
  range_start: Date;
  range_end: Date;
}

/** Reads the partition's ACTUAL declared bounds back out of the catalog, parsed as real timestamps rather than compared as rendered text. */
export async function readPartitionBounds(
  client: TargetPrismaClientLike,
  relname: string
): Promise<PartitionBoundRow | null> {
  const rows = await raw(client).$queryRawUnsafe<PartitionBoundRow>(
    `SELECT c.relname,
            (regexp_match(pg_get_expr(c.relpartbound, c.oid), $2))[1]::timestamptz AS range_start,
            (regexp_match(pg_get_expr(c.relpartbound, c.oid), $2))[2]::timestamptz AS range_end
       FROM pg_inherits i
       JOIN pg_class c ON c.oid = i.inhrelid
      WHERE i.inhparent = 'security.audit_logs'::regclass
        AND c.relname = $1`,
    relname,
    // Two capture groups over the quoted bound literals; kept as a parameter
    // so the pattern's single quotes never need SQL-escaping.
    String.raw`FROM \('([^']+)'\) TO \('([^']+)'\)`
  );
  return rows[0] ?? null;
}

export async function listPartitions(client: TargetPrismaClientLike): Promise<string[]> {
  const rows = await raw(client).$queryRawUnsafe<{ relname: string }>(
    `SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
      WHERE i.inhparent = 'security.audit_logs'::regclass ORDER BY c.relname`
  );
  return rows.map((row) => row.relname);
}

/**
 * Inserts a minimal audit row at `isoInstant` and returns the partition it
 * physically landed in, read from `tableoid` — never from the name we expected.
 * Deletion afterwards is done by the caller via `dropTestPartitions`, which
 * removes the rows along with the partition.
 */
export async function insertProbeAndReadTableoid(
  client: TargetPrismaClientLike,
  isoInstant: string,
  action = "AUDIT_PARTITION_TEST_PROBE"
): Promise<string> {
  const when = new Date(isoInstant);
  await raw(client).$executeRawUnsafe(
    `INSERT INTO security.audit_logs
       (id, actor_type, actor_id, action, target_table, target_id, classification, result, integrity_value, occurred_at)
     VALUES (gen_random_uuid(), 'SYSTEM', gen_random_uuid(), $1, 'security.audit_logs',
             gen_random_uuid(), 'RESTRICTED', 'SUCCESS', 'test-probe', $2::timestamptz)`,
    action,
    when
  );
  const rows = await raw(client).$queryRawUnsafe<{ landed: string }>(
    `SELECT tableoid::regclass::text AS landed FROM security.audit_logs
      WHERE action = $1 AND occurred_at = $2::timestamptz LIMIT 1`,
    action,
    when
  );
  return rows[0]!.landed;
}

/** Drops every partition of `security.audit_logs` whose name starts with any of `prefixes` — how each test file returns the catalog to the state it found. */
export async function dropTestPartitions(client: TargetPrismaClientLike, prefixes: string[]): Promise<void> {
  const existing = await listPartitions(client);
  for (const relname of existing) {
    if (!prefixes.some((prefix) => relname.startsWith(prefix))) continue;
    await raw(client).$executeRawUnsafe(`DROP TABLE IF EXISTS security.${relname}`);
  }
}
