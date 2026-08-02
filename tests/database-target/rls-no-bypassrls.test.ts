import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/rls-no-bypassrls.test.ts
 *
 * Asserts no ARGUS role is ever created with BYPASSRLS or SUPERUSER — at
 * the DDL level (`000_preflight/migration.sql`), and that the RLS matrix
 * re-verifies it at runtime rather than trusting the DDL. A BYPASSRLS role
 * would silently void every RLS policy in the package.
 *
 * `migration_owner` is included deliberately: every RLS-bearing table in
 * this package uses FORCE ROW LEVEL SECURITY specifically so the owner is
 * bound by the same policies, which only holds if the owner is also
 * NOBYPASSRLS.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const PREFLIGHT = join(REPO_ROOT, "prisma", "target-migrations", "000_preflight", "migration.sql");
const MATRIX = join(REPO_ROOT, "scripts", "migration-rehearsal", "sql", "rls-matrix-checks.sql");

const APP_ROLES = ["app_api", "ingest_worker", "jobs_worker", "audit_reader", "readonly_inspector"];

describe("no ARGUS role is created with BYPASSRLS or SUPERUSER", () => {
  if (!existsSync(PREFLIGHT)) {
    it.skip("000_preflight/migration.sql missing — skipping", () => {});
    return;
  }
  const content = readFileSync(PREFLIGHT, "utf8");

  it.each(APP_ROLES)("CREATE ROLE %s declares NOSUPERUSER and NOBYPASSRLS", (role) => {
    const m = content.match(new RegExp(`CREATE ROLE ${role}[^;]*;`));
    expect(m, `no CREATE ROLE statement found for ${role}`).not.toBeNull();
    expect(m![0]).toContain("NOSUPERUSER");
    expect(m![0]).toContain("NOBYPASSRLS");
    expect(m![0]).toContain("NOCREATEROLE");
    expect(m![0]).toContain("NOCREATEDB");
  });

  it("migration_owner is also NOBYPASSRLS (FORCE RLS must bind the owner too)", () => {
    const m = content.match(/CREATE ROLE migration_owner[^;]*;/);
    expect(m).not.toBeNull();
    expect(m![0]).toContain("NOBYPASSRLS");
    expect(m![0]).toContain("NOSUPERUSER");
  });

  it("no CREATE ROLE anywhere in preflight grants BYPASSRLS or SUPERUSER", () => {
    expect(content).not.toMatch(/CREATE ROLE[^;]*\sBYPASSRLS/);
    expect(content).not.toMatch(/CREATE ROLE[^;]*\sSUPERUSER/);
  });

  it("no ALTER ROLE anywhere in the wave package re-grants BYPASSRLS", () => {
    const waves = ["000_preflight", "010_foundation", "020_identity", "030_ingestion_observation_evidence",
                   "040_incident", "050_help_mission", "060_resources", "070_alerts_communications",
                   "080_geography", "090_ice_media", "100_projections_legacy_retirement"];
    for (const wave of waves) {
      for (const file of ["migration.sql", "rls_roles.sql", "rls_policies.sql", "backfill.sql"]) {
        const p = join(REPO_ROOT, "prisma", "target-migrations", wave, file);
        if (!existsSync(p)) continue;
        const c = readFileSync(p, "utf8");
        // `ALTER ROLE x NOBYPASSRLS` is fine; `ALTER ROLE x BYPASSRLS` is not.
        expect(c, `${wave}/${file} grants BYPASSRLS`).not.toMatch(/ALTER ROLE\s+\w+\s+BYPASSRLS/);
      }
    }
  });

  it("the runtime matrix re-verifies role security rather than trusting the DDL", () => {
    expect(readFileSync(MATRIX, "utf8")).toMatch(/role_security \| no application role is superuser or BYPASSRLS/);
  });
});
