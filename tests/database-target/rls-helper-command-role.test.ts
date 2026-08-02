import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/rls-helper-command-role.test.ts
 *
 * Static guard that `security.fn_has_command_role` is a REAL
 * implementation, not the `SELECT false` stub it was before the corrective
 * session. The real body lives in `040_incident/migration.sql`, the wave
 * that first creates `command.command_roles` and
 * `command.incident_command_structures` (same forward-reference constraint
 * documented in rls-helper-is-owner.test.ts).
 *
 * Behavioral proof runs in
 * `scripts/migration-rehearsal/sql/rls-matrix-checks.sql`, which asserts a
 * VALID role -> true AND an EXPIRED institutional membership -> false
 * against real Postgres.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const WAVE_040 = join(REPO_ROOT, "prisma", "target-migrations", "040_incident", "migration.sql");

function realBody(): string {
  const content = readFileSync(WAVE_040, "utf8");
  const start = content.indexOf("CREATE OR REPLACE FUNCTION security.fn_has_command_role");
  expect(start, "fn_has_command_role real body not found in 040_incident/migration.sql").toBeGreaterThan(-1);
  return content.slice(start, content.indexOf("$$;", start) + 3);
}

describe("security.fn_has_command_role — real implementation, not a stub", () => {
  if (!existsSync(WAVE_040)) {
    it.skip("040_incident/migration.sql missing — skipping", () => {});
    return;
  }

  it("is NOT the bare 'SELECT false' stub", () => {
    expect(realBody()).not.toMatch(/AS \$\$\s*SELECT false;\s*\$\$/);
  });

  it("joins command_roles to incident_command_structures", () => {
    const b = realBody();
    expect(b).toContain("command.command_roles");
    expect(b).toContain("command.incident_command_structures");
  });

  it("rejects a REVOKED command role", () => {
    expect(realBody()).toMatch(/cr\.revoked_at IS NULL/);
  });

  it("rejects a role not yet in effect", () => {
    expect(realBody()).toMatch(/cr\.assigned_at <= now\(\)/);
  });

  it("requires an ACTIVE, non-dissolved command structure", () => {
    const b = realBody();
    expect(b).toMatch(/ics\.status = 'ACTIVE'/);
    expect(b).toMatch(/ics\.dissolved_at IS NULL/);
  });

  it("rejects an EXPIRED or non-ACTIVE institutional membership when the role is tied to one", () => {
    const b = realBody();
    expect(b).toContain("institution.institutional_memberships");
    expect(b).toMatch(/im\.status = 'ACTIVE'/);
    expect(b).toMatch(/im\.effective_to IS NULL OR im\.effective_to > now\(\)/);
  });

  it("rejects a NULL actor or NULL incident", () => {
    const b = realBody();
    expect(b).toMatch(/p_actor_id IS NOT NULL/);
    expect(b).toMatch(/p_incident_id IS NOT NULL/);
  });

  it("does not invent a role — it only reads existing command_roles rows", () => {
    const b = realBody();
    expect(b).not.toMatch(/\bINSERT\b/i);
    expect(b).not.toMatch(/\bUPDATE\b/i);
  });
});
