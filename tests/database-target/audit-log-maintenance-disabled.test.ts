import { describe, expect, it, vi } from "vitest";
import { runAuditLogPartitionMaintenance } from "../../src/lib/database-target/services/auditLogPartitionMaintenanceService";
import { readRepoFile } from "./auditPartitionTestHelpers";
import type { TargetPrismaClientLike } from "../../src/lib/database-target/client/targetPrismaClient";

/**
 * tests/database-target/audit-log-maintenance-disabled.test.ts
 *
 * With every target migration flag off — their default, and their state in
 * current production — the maintenance operation must return NOT_ENABLED
 * without constructing a client, opening a connection, or running DDL.
 *
 * "Did not open a client" is asserted by injecting a loader that FAILS the
 * test if it is ever invoked, rather than by trusting the return value: a
 * function could return NOT_ENABLED after having already connected.
 */

const ALL_FLAG_VARS = [
  "ARGUS_TARGET_DB_READ_ENABLED",
  "ARGUS_TARGET_DB_SHADOW_WRITE_ENABLED",
  "ARGUS_TARGET_DB_DUAL_READ_ENABLED",
  "ARGUS_TARGET_DB_CUTOVER_ENABLED",
];

function neverLoadClient(): Promise<TargetPrismaClientLike> {
  throw new Error("the maintenance service must not construct a target client while every flag is off");
}

describe("audit log partition maintenance — disabled by default", () => {
  it("returns NOT_ENABLED with a completely empty environment", async () => {
    const result = await runAuditLogPartitionMaintenance({ env: {}, loadClient: neverLoadClient });
    expect(result.status).toBe("NOT_ENABLED");
  });

  it("returns NOT_ENABLED when all four flags are explicitly false", async () => {
    const env = Object.fromEntries(ALL_FLAG_VARS.map((name) => [name, "false"]));
    const result = await runAuditLogPartitionMaintenance({ env, loadClient: neverLoadClient });
    expect(result.status).toBe("NOT_ENABLED");
    if (result.status === "NOT_ENABLED") expect(result.enabledFlags).toEqual([]);
  });

  it.each(["1", "TRUE", "yes", "on", ""])(
    "treats the non-canonical flag value %j as OFF and still returns NOT_ENABLED",
    async (value) => {
      const env = Object.fromEntries(ALL_FLAG_VARS.map((name) => [name, value]));
      const result = await runAuditLogPartitionMaintenance({ env, loadClient: neverLoadClient });
      expect(result.status).toBe("NOT_ENABLED");
    }
  );

  it("never invokes the client loader while flags are off", async () => {
    const loadClient = vi.fn(neverLoadClient);
    await runAuditLogPartitionMaintenance({ env: {}, loadClient });
    expect(loadClient).not.toHaveBeenCalled();
  });

  it("returns NOT_ENABLED even when TARGET_DATABASE_URL is present but every flag is off", async () => {
    const result = await runAuditLogPartitionMaintenance({
      env: { TARGET_DATABASE_URL: "postgresql://u:p@127.0.0.1:55432/db" },
      loadClient: neverLoadClient,
    });
    expect(result.status).toBe("NOT_ENABLED");
  });

  it("does NOT fail with a configuration error when TARGET_DATABASE_URL is absent — the flag check comes first", async () => {
    // A NOT_ENABLED host with no target URL at all must get a clean skip, not
    // a thrown TargetDatabaseClientConfigError.
    await expect(runAuditLogPartitionMaintenance({ env: {}, loadClient: neverLoadClient })).resolves.toMatchObject({
      status: "NOT_ENABLED",
    });
  });

  it("runs the maintenance only once a flag is on, and then goes through the window function", async () => {
    const calls: string[] = [];
    const fakeClient = {
      $disconnect: async () => undefined,
      $queryRawUnsafe: async (query: string) => {
        calls.push(query);
        return [
          { partition_name: "audit_logs_y2026m08", range_start: new Date("2026-08-01T00:00:00Z"), range_end: new Date("2026-09-01T00:00:00Z"), result: "ALREADY_EXISTS" },
        ];
      },
      $executeRawUnsafe: async () => 0,
    } as unknown as TargetPrismaClientLike;

    const result = await runAuditLogPartitionMaintenance({
      env: { ARGUS_TARGET_DB_SHADOW_WRITE_ENABLED: "true" },
      loadClient: async () => fakeClient,
      anchor: new Date("2026-08-03T00:00:00Z"),
    });

    expect(result.status).toBe("COMPLETED");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("security.fn_ensure_audit_log_partition_window");
    if (result.status === "COMPLETED") {
      expect(result.created).toBe(0);
      expect(result.alreadyExisting).toBe(1);
    }
  });

  it("the maintenance path can only ever read TARGET_DATABASE_URL — never DATABASE_URL or DIRECT_URL", () => {
    const service = readRepoFile("src", "lib", "database-target", "services", "auditLogPartitionMaintenanceService.ts");
    const script = readRepoFile("scripts", "database-target", "ensureAuditLogPartitions.ts");
    for (const source of [service, script]) {
      expect(source).not.toMatch(/process\.env\.DATABASE_URL/);
      expect(source).not.toMatch(/process\.env\.DIRECT_URL/);
      expect(source).not.toMatch(/env\.DATABASE_URL/);
      expect(source).not.toMatch(/env\.DIRECT_URL/);
    }
    // The anti-remote guard is reused (getTargetPrismaClient), not reimplemented.
    expect(service).toContain("getTargetPrismaClient");
    expect(service).not.toMatch(/new URL\(|127\.0\.0\.1|supabase/);
  });

  it("the CLI script contains no partition SQL of its own — the SQL function is the single implementation", () => {
    const script = readRepoFile("scripts", "database-target", "ensureAuditLogPartitions.ts");
    expect(script).not.toMatch(/CREATE TABLE|PARTITION OF|date_trunc/i);
    expect(script).toContain("runAuditLogPartitionMaintenance");
  });

  it("is registered as an npm script and is not wired to any cron", () => {
    const pkg = JSON.parse(readRepoFile("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["db:target:audit-partitions"]).toBe("tsx scripts/database-target/ensureAuditLogPartitions.ts");
  });
});
