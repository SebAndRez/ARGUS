import { afterAll, describe, expect, it } from "vitest";
import {
  assertNonPrivilegedPrincipal,
  closeTargetPrincipalClients,
  closeTargetPrismaClient,
  describeTargetPrincipal,
  getTargetPrincipalClient,
  TargetPrincipalPrivilegeError,
  type TargetPrincipalIdentity,
} from "../../src/lib/database-target/client/targetPrismaClient";
import { accessRoleDockerShouldRun, ownerClient, readRepoFile } from "./accessRoleTestHelpers";

/**
 * tests/database-target/audit-writer-no-owner-runtime.test.ts
 *
 * Regression lock. The defect being prevented is not hypothetical: the audit
 * writer resolved its client from `TARGET_DATABASE_URL`, which in the rehearsal
 * is the container's bootstrap superuser — owner of the schema, owner of
 * `security.audit_logs`, owner of every SECURITY DEFINER function, BYPASSRLS,
 * CREATE ON SCHEMA security. Nothing about RLS or function grants was ever
 * actually exercised by the code that claimed to be constrained by them.
 *
 * These assertions make the reintroduction of that arrangement fail loudly:
 * both at the source level (no runtime path may reach the owner variable) and
 * at runtime (the guard rejects a privileged connection instead of continuing).
 */

const PRIVILEGED: TargetPrincipalIdentity = {
  sessionUser: "argus_rehearsal_user",
  currentUser: "argus_rehearsal_user",
  isSuperuser: true,
  isBypassRls: true,
  ownsSecuritySchema: true,
  hasCreateOnSecuritySchema: true,
  ownsAuditLogs: true,
};

const CLEAN: TargetPrincipalIdentity = {
  sessionUser: "app_api",
  currentUser: "app_api",
  isSuperuser: false,
  isBypassRls: false,
  ownsSecuritySchema: false,
  hasCreateOnSecuritySchema: false,
  ownsAuditLogs: false,
};

describe("runtime principal guard — unit", () => {
  it("accepts a genuinely non-privileged principal", () => {
    expect(() => assertNonPrivilegedPrincipal(CLEAN, "app_api")).not.toThrow();
  });

  it("rejects the owner/migration principal outright", () => {
    expect(() => assertNonPrivilegedPrincipal(PRIVILEGED, "app_api")).toThrow(TargetPrincipalPrivilegeError);
    expect(() => assertNonPrivilegedPrincipal(PRIVILEGED, "app_api")).toThrow(/AUDIT_WRITER_PRINCIPAL_VIOLATION/);
  });

  it.each([
    ["isSuperuser", { ...CLEAN, isSuperuser: true }, /SUPERUSER/],
    ["isBypassRls", { ...CLEAN, isBypassRls: true }, /BYPASSRLS/],
    ["ownsSecuritySchema", { ...CLEAN, ownsSecuritySchema: true }, /owns schema security/],
    ["hasCreateOnSecuritySchema", { ...CLEAN, hasCreateOnSecuritySchema: true }, /CREATE ON SCHEMA security/],
    ["ownsAuditLogs", { ...CLEAN, ownsAuditLogs: true }, /owns security\.audit_logs/],
  ])("rejects a principal that only has %s", (_label, identity, pattern) => {
    expect(() => assertNonPrivilegedPrincipal(identity as TargetPrincipalIdentity, "app_api")).toThrow(pattern);
  });

  it("rejects the right role connecting under the wrong name", () => {
    expect(() => assertNonPrivilegedPrincipal({ ...CLEAN, currentUser: "jobs_worker" }, "app_api")).toThrow(
      /connected as jobs_worker, expected app_api/
    );
  });
});

describe("runtime principal guard — source-level", () => {
  const client = readRepoFile("src", "lib", "database-target", "client", "targetPrismaClient.ts");
  const auditPartitionRepo = readRepoFile(
    "src",
    "lib",
    "database-target",
    "repositories",
    "auditLogPartitionRepository.ts"
  );

  it("the runtime and admin principals read their OWN env var and never fall back to another", () => {
    expect(client).toContain('runtime: "TARGET_RUNTIME_DATABASE_URL"');
    expect(client).toContain('admin: "TARGET_ADMIN_DATABASE_URL"');
    // No `??`/`||` fallback chain between principal URLs.
    expect(client).not.toMatch(/TARGET_RUNTIME_DATABASE_URL\s*(\?\?|\|\|)/);
    expect(client).not.toMatch(/TARGET_ADMIN_DATABASE_URL\s*(\?\?|\|\|)/);
    expect(client).not.toMatch(/env\.DATABASE_URL|env\.DIRECT_URL/);
  });

  it("only the owner principal may skip the non-privileged assertion", () => {
    expect(client).toContain('if (kind !== "owner" && !options.skipPrincipalAssertion)');
  });

  it("the guard is fatal, not advisory: the client is disconnected and the error rethrown", () => {
    expect(client).toMatch(/await client\.\$disconnect\(\)[\s\S]{0,80}throw err;/);
  });

  it("the audit writer's ensure step calls the horizon-bounded runtime entry point, not the unbounded creator", () => {
    expect(auditPartitionRepo).toContain("security.fn_ensure_audit_log_partition_for_write($1::timestamptz)");
    const executable = auditPartitionRepo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(executable).not.toMatch(/fn_ensure_audit_log_partition\(\$1/);
  });

  it("only the runtime roles are granted the runtime entry point, and only jobs_worker the window", () => {
    const migration = readRepoFile("prisma", "target-migrations", "010_foundation", "migration.sql");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION security.fn_ensure_audit_log_partition_for_write(timestamptz) TO app_api, ingest_worker, jobs_worker;"
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION security.fn_ensure_audit_log_partition_window(timestamptz, integer, integer) TO jobs_worker;"
    );
    // The unbounded single-month creator is granted to nobody.
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION security\.fn_ensure_audit_log_partition\(timestamptz\) TO/
    );
  });

  it("the rehearsal harness sets runtime credentials outside the migrations — no credential in version control", () => {
    const common = readRepoFile("scripts", "migration-rehearsal", "lib", "Common.ps1");
    expect(common).toContain("TARGET_RUNTIME_DATABASE_URL=postgresql://app_api");
    expect(common).toContain("TARGET_ADMIN_DATABASE_URL=postgresql://access_admin");
    for (const wave of ["000_preflight", "010_foundation", "020_identity"]) {
      const sql = readRepoFile("prisma", "target-migrations", wave, "migration.sql");
      expect(sql, `${wave} must not contain a password`).not.toMatch(/PASSWORD\s+'/i);
    }
  });
});

describe.skipIf(!accessRoleDockerShouldRun)("runtime principal guard — real PostgreSQL", () => {
  afterAll(async () => {
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("refuses to hand out a 'runtime' client when TARGET_RUNTIME_DATABASE_URL points at the owner", async () => {
    await expect(
      getTargetPrincipalClient("runtime", {
        env: {
          ...process.env,
          // Deliberately the OWNER url under the runtime variable: this is the
          // exact misconfiguration that used to be the default behaviour.
          TARGET_RUNTIME_DATABASE_URL: process.env.TARGET_DATABASE_URL,
        },
      })
    ).rejects.toThrow(/AUDIT_WRITER_PRINCIPAL_VIOLATION/);
  }, 30_000);

  it("the owner principal really is privileged (so the check above is testing something real)", async () => {
    const identity = await describeTargetPrincipal(await ownerClient());
    expect(identity.isSuperuser || identity.ownsAuditLogs || identity.hasCreateOnSecuritySchema).toBe(true);
  });

  it("requires the runtime variable to be present rather than silently borrowing another", async () => {
    const env = { ...process.env };
    delete env.TARGET_RUNTIME_DATABASE_URL;
    await expect(getTargetPrincipalClient("runtime", { env })).rejects.toThrow(
      /TARGET_RUNTIME_DATABASE_URL is required/
    );
  });

  it("rejects a non-loopback runtime URL with the same guard as every other principal", async () => {
    await expect(
      getTargetPrincipalClient("runtime", {
        env: { ...process.env, TARGET_RUNTIME_DATABASE_URL: "postgresql://app_api:x@db.example.com:5432/argus" },
      })
    ).rejects.toThrow(/is not 127\.0\.0\.1 or localhost/);
  });
});
