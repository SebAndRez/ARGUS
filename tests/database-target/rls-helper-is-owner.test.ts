import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/rls-helper-is-owner.test.ts
 *
 * Static guard that `security.fn_is_owner` is a REAL implementation, not
 * the `SELECT false` stub it was before the corrective session.
 *
 * The real body lives in `050_help_mission/migration.sql` — NOT in
 * `010_foundation/rls_policies.sql`, where it is deliberately still a stub.
 * Reason, confirmed empirically (not assumed): `CREATE FUNCTION ...
 * LANGUAGE sql` validates table references against the catalog at creation
 * time, so a real body in wave 010 fails that wave outright with
 * "relation identity.people does not exist" — the tables it dispatches on
 * only appear in waves 020 (identity/institution), 040 (incident) and 050
 * (help). Wave 050 is the last of those, so that is where the real body is
 * installed via a second CREATE OR REPLACE.
 *
 * Behavioral proof (positive AND negative, under a real non-superuser
 * role) lives in `scripts/migration-rehearsal/sql/rls-matrix-checks.sql`.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const WAVE_050 = join(REPO_ROOT, "prisma", "target-migrations", "050_help_mission", "migration.sql");
const WAVE_010_RLS = join(REPO_ROOT, "prisma", "target-migrations", "010_foundation", "rls_policies.sql");

function realBody(): string {
  const content = readFileSync(WAVE_050, "utf8");
  const start = content.indexOf("CREATE OR REPLACE FUNCTION security.fn_is_owner");
  expect(start, "fn_is_owner real body not found in 050_help_mission/migration.sql").toBeGreaterThan(-1);
  return content.slice(start, content.indexOf("$$;", start) + 3);
}

describe("security.fn_is_owner — real implementation, not a stub", () => {
  if (!existsSync(WAVE_050)) {
    it.skip("050_help_mission/migration.sql missing — skipping", () => {});
    return;
  }

  it("the real body is defined in wave 050 (after every dispatch table exists)", () => {
    expect(realBody().length).toBeGreaterThan(500);
  });

  it("is NOT the bare 'SELECT false' stub", () => {
    expect(realBody()).not.toMatch(/AS \$\$\s*SELECT false;\s*\$\$/);
  });

  it.each([
    "identity.people",
    "identity.user_accounts",
    "identity.devices",
    "identity.consents",
    "institution.institutional_memberships",
    "help.help_requests",
    "incident.incident_promotions",
    "incident.discard_decisions",
  ])("dispatches on the real owning table %s", (table) => {
    expect(realBody()).toContain(table);
  });

  it("fails closed on a NULL actor / table / target id", () => {
    expect(realBody()).toMatch(/p_actor_id IS NULL OR p_target_table IS NULL OR p_target_id IS NULL THEN false/);
  });

  it("returns false (never an error) for an unsupported target_table", () => {
    expect(realBody()).toMatch(/ELSE false/);
  });

  it("uses no dynamic SQL — every branch is a literal, pre-written query", () => {
    const body = realBody();
    expect(body).not.toMatch(/\bEXECUTE\b/i);
    expect(body).not.toMatch(/\bformat\s*\(/i);
  });

  it("wave 010 keeps an explicitly documented stub for the same signature", () => {
    expect(readFileSync(WAVE_010_RLS, "utf8")).toMatch(/STUB in this wave, deliberately/);
  });
});
