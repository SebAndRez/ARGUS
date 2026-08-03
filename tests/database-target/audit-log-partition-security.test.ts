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
  raw,
  readWave010File,
} from "./auditPartitionTestHelpers";

/**
 * tests/database-target/audit-log-partition-security.test.ts
 *
 * The lifecycle grants a narrow, deliberate privilege escalation (SECURITY
 * DEFINER DDL) to exactly one role for exactly one function. This file pins
 * that boundary in both directions: what jobs_worker CAN do, and what
 * app_api / ingest_worker / PUBLIC cannot.
 */

const YEAR_PREFIX = "audit_logs_y2044";

describe("audit_logs partition lifecycle security — SQL source", () => {
  const migration = readWave010File("migration.sql");

  it("both DDL entry points are SECURITY DEFINER with a pinned search_path", () => {
    for (const fn of ["security.fn_ensure_audit_log_partition(", "security.fn_ensure_audit_log_partition_window("]) {
      const start = migration.indexOf(`CREATE OR REPLACE FUNCTION ${fn}`);
      expect(start, `${fn} not found`).toBeGreaterThan(-1);
      const header = migration.slice(start, start + 1400);
      expect(header).toContain("SECURITY DEFINER");
      expect(header).toContain("SET search_path = pg_catalog, security");
    }
  });

  it("PUBLIC loses EXECUTE on all six lifecycle functions", () => {
    for (const signature of [
      "security.fn_audit_log_month_start(timestamptz)",
      "security.fn_audit_log_next_month_start(timestamptz)",
      "security.fn_audit_log_partition_name(timestamptz)",
      "security.fn_assert_audit_log_partition(regclass, timestamptz, timestamptz)",
      "security.fn_ensure_audit_log_partition(timestamptz)",
      "security.fn_ensure_audit_log_partition_window(timestamptz, integer, integer)",
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`);
    }
  });

  it("the only EXECUTE grants are the window function to jobs_worker and the horizon-bounded write entry point to the runtime roles", () => {
    const grants = migration.match(/GRANT EXECUTE ON FUNCTION security\.fn_[^;]+;/g) ?? [];
    // fn_ensure_audit_log_partition_for_write was added so the canonical audit
    // writer can ensure its month AS THE RUNTIME PRINCIPAL. The unbounded
    // creator and the window maintenance stay out of the runtime's reach.
    expect(grants).toEqual([
      "GRANT EXECUTE ON FUNCTION security.fn_ensure_audit_log_partition_window(timestamptz, integer, integer) TO jobs_worker;",
      "GRANT EXECUTE ON FUNCTION security.fn_ensure_audit_log_partition_for_write(timestamptz) TO app_api, ingest_worker, jobs_worker;",
    ]);
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION security\.fn_ensure_audit_log_partition\(timestamptz\) TO/);
  });

  it("the runtime write entry point is horizon-bounded, so a runtime credential cannot spray partitions", () => {
    expect(migration).toContain("AUDIT_PARTITION_WRITE_HORIZON_EXCEEDED");
    expect(migration).toContain("interval '24 months'");
    expect(migration).toContain("interval '3 months'");
  });

  it("no migration ever grants CREATE ON SCHEMA security to an application role", () => {
    for (const file of ["migration.sql", "backfill.sql", "rls_roles.sql", "rls_policies.sql", "rollback.sql"]) {
      expect(readWave010File(file)).not.toMatch(/GRANT\s+[^;]*\bCREATE\b[^;]*ON\s+SCHEMA\s+security/i);
    }
  });

  it("every partition is created with RLS enabled and forced", () => {
    expect(migration).toContain("ALTER TABLE security.%I ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE security.%I FORCE ROW LEVEL SECURITY");
  });

  it("audit_logs.sequence_number's sequence is granted USAGE (without it the authorized append-only write is unreachable)", () => {
    expect(migration).toContain(
      "GRANT USAGE ON SEQUENCE security.audit_logs_sequence_number_seq TO app_api, ingest_worker, jobs_worker;"
    );
    // USAGE only — never UPDATE, which would let a role setval() the audit sequence.
    expect(migration).not.toMatch(/GRANT[^;]*\bUPDATE\b[^;]*ON SEQUENCE security\.audit_logs_sequence_number_seq/i);
  });
});

describe.skipIf(!auditPartitionDockerShouldRun)("audit_logs partition lifecycle security — real PostgreSQL", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    if (client) await dropTestPartitions(client, [YEAR_PREFIX]);
    await closeTargetPrismaClient();
  });

  const LIFECYCLE_FUNCTIONS = [
    "security.fn_audit_log_month_start(timestamptz)",
    "security.fn_audit_log_next_month_start(timestamptz)",
    "security.fn_audit_log_partition_name(timestamptz)",
    "security.fn_assert_audit_log_partition(regclass,timestamptz,timestamptz)",
    "security.fn_ensure_audit_log_partition(timestamptz)",
    "security.fn_ensure_audit_log_partition_window(timestamptz,integer,integer)",
  ];

  it.each(LIFECYCLE_FUNCTIONS)("PUBLIC cannot EXECUTE %s", async (signature) => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ allowed: boolean }>(
      `SELECT has_function_privilege('public', $1, 'EXECUTE') AS allowed`,
      signature
    );
    expect(rows[0]!.allowed).toBe(false);
  });

  it.each(["app_api", "ingest_worker"])("%s cannot EXECUTE any lifecycle function", async (role) => {
    client = await getTargetPrismaClient();
    for (const signature of LIFECYCLE_FUNCTIONS) {
      const rows = await raw(client).$queryRawUnsafe<{ allowed: boolean }>(
        `SELECT has_function_privilege($1, $2, 'EXECUTE') AS allowed`,
        role,
        signature
      );
      expect(rows[0]!.allowed, `${role} must not execute ${signature}`).toBe(false);
    }
  });

  it("jobs_worker can EXECUTE the window function but NOT the single-month DDL entry point", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ window_ok: boolean; single_ok: boolean }>(
      `SELECT has_function_privilege('jobs_worker', 'security.fn_ensure_audit_log_partition_window(timestamptz,integer,integer)', 'EXECUTE') AS window_ok,
              has_function_privilege('jobs_worker', 'security.fn_ensure_audit_log_partition(timestamptz)', 'EXECUTE') AS single_ok`
    );
    expect(rows[0]!.window_ok).toBe(true);
    expect(rows[0]!.single_ok).toBe(false);
  });

  it.each(["app_api", "ingest_worker", "jobs_worker", "audit_reader", "readonly_inspector"])(
    "%s holds no CREATE on schema security",
    async (role) => {
      client = await getTargetPrismaClient();
      const rows = await raw(client).$queryRawUnsafe<{ allowed: boolean }>(
        `SELECT has_schema_privilege($1, 'security', 'CREATE') AS allowed`,
        role
      );
      expect(rows[0]!.allowed).toBe(false);
    }
  );

  it("a newly created partition is owned by the parent's owner, never by a runtime role, and has RLS enabled + forced", async () => {
    client = await getTargetPrismaClient();
    await ensurePartition(client, "2044-03-09T00:00:00Z");
    const rows = await raw(client).$queryRawUnsafe<{
      owner: string;
      parent_owner: string;
      rls: boolean;
      force_rls: boolean;
    }>(
      `SELECT pg_get_userbyid(c.relowner) AS owner,
              pg_get_userbyid(p.relowner) AS parent_owner,
              c.relrowsecurity AS rls,
              c.relforcerowsecurity AS force_rls
         FROM pg_class c, pg_class p
        WHERE c.oid = 'security.audit_logs_y2044m03'::regclass
          AND p.oid = 'security.audit_logs'::regclass`
    );
    expect(rows[0]!.owner).toBe(rows[0]!.parent_owner);
    expect(["app_api", "ingest_worker", "jobs_worker"]).not.toContain(rows[0]!.owner);
    expect(rows[0]!.rls).toBe(true);
    expect(rows[0]!.force_rls).toBe(true);
  });

  it("no runtime role holds a direct grant on any partition — audit access is through the parent only", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ grantee: string; table_name: string; privilege_type: string }>(
      `SELECT g.grantee, g.table_name, g.privilege_type
         FROM information_schema.role_table_grants g
         JOIN pg_inherits i ON i.inhrelid = ('security.' || quote_ident(g.table_name))::regclass
        WHERE g.table_schema = 'security'
          AND i.inhparent = 'security.audit_logs'::regclass
          AND g.grantee IN ('app_api','ingest_worker','jobs_worker','audit_reader','readonly_inspector','PUBLIC')`
    );
    expect(rows).toEqual([]);
  });

  it("the ensure function refuses to adopt a same-named relation that is not a partition of audit_logs", async () => {
    client = await getTargetPrismaClient();
    await raw(client).$executeRawUnsafe(`CREATE TABLE security.audit_logs_y2044m07 (x integer)`);
    try {
      await expect(ensurePartition(client, "2044-07-04T00:00:00Z")).rejects.toThrow(
        /AUDIT_PARTITION_NOT_A_PARTITION/
      );
    } finally {
      await raw(client).$executeRawUnsafe(`DROP TABLE IF EXISTS security.audit_logs_y2044m07`);
    }
  });

  it("the ensure function refuses to adopt a partition whose bounds do not match the UTC month contract", async () => {
    client = await getTargetPrismaClient();
    // Deliberately wrong: a 15-day range under the canonical name.
    await raw(client).$executeRawUnsafe(
      `CREATE TABLE security.audit_logs_y2044m09 PARTITION OF security.audit_logs
         FOR VALUES FROM ('2044-09-01 00:00:00+00') TO ('2044-09-16 00:00:00+00')`
    );
    try {
      await expect(ensurePartition(client, "2044-09-05T00:00:00Z")).rejects.toThrow(
        /AUDIT_PARTITION_BOUND_MISMATCH/
      );
      // ...and it did NOT silently re-bound or drop the existing partition.
      const rows = await raw(client).$queryRawUnsafe<{ bound: string }>(
        `SELECT pg_get_expr(relpartbound, oid) AS bound FROM pg_class WHERE oid = 'security.audit_logs_y2044m09'::regclass`
      );
      expect(rows[0]!.bound).toContain("2044-09-16");
    } finally {
      await raw(client).$executeRawUnsafe(`DROP TABLE IF EXISTS security.audit_logs_y2044m09`);
    }
  });

  it("rejects a NULL timestamp instead of inventing a month", async () => {
    client = await getTargetPrismaClient();
    await expect(
      raw(client).$queryRawUnsafe(`SELECT security.fn_ensure_audit_log_partition(NULL::timestamptz)`)
    ).rejects.toThrow(/AUDIT_PARTITION_NULL_TIMESTAMP/);
  });
});
