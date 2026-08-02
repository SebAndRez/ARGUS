import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/rls-helper-classification.test.ts
 *
 * Static guard that `security.fn_classification_allowed` is a REAL,
 * fail-closed implementation rather than the `SELECT false` stub it was
 * before the corrective session. It stays in
 * `010_foundation/rls_policies.sql` (unlike the other two helpers) because
 * it references no tables at all, so it has no forward-reference problem.
 *
 * Known, deliberately-not-hidden limitation documented in the function's
 * own comment: the target schema has NO physical actor->AccessRole junction
 * table, so clearance is resolved from the `argus.actor_role` session GUC —
 * the same real mechanism every other already-committed policy in this
 * package uses. Inventing a junction table would violate the mandate's
 * "no inventar roles" rule. A full AccessRole-table implementation remains
 * an explicitly separate gap.
 *
 * Behavioral proof (NULL actor -> false, no actor_role -> false, plus a
 * live positive path through incident_candidates) runs in
 * `scripts/migration-rehearsal/sql/rls-matrix-checks.sql`.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const WAVE_010_RLS = join(REPO_ROOT, "prisma", "target-migrations", "010_foundation", "rls_policies.sql");

function realBody(): string {
  const content = readFileSync(WAVE_010_RLS, "utf8");
  const start = content.indexOf("CREATE OR REPLACE FUNCTION security.fn_classification_allowed");
  expect(start, "fn_classification_allowed not found").toBeGreaterThan(-1);
  return content.slice(start, content.indexOf("$$;", start) + 3);
}

describe("security.fn_classification_allowed — real implementation, fails closed", () => {
  if (!existsSync(WAVE_010_RLS)) {
    it.skip("010_foundation/rls_policies.sql missing — skipping", () => {});
    return;
  }

  it("is NOT the bare 'SELECT false' stub", () => {
    expect(realBody()).not.toMatch(/AS \$\$\s*SELECT false;\s*\$\$/);
  });

  it("fails closed on a NULL actor or NULL classification", () => {
    expect(realBody()).toMatch(/p_actor_id IS NULL OR p_classification IS NULL THEN false/);
  });

  it("resolves clearance from the real argus.actor_role session signal", () => {
    expect(realBody()).toContain("argus.actor_role");
  });

  it("never grants universal access — has an explicit ELSE false", () => {
    expect(realBody()).toMatch(/ELSE false/);
  });

  it("gates any 'true' behind an explicit recognized-role list", () => {
    expect(realBody()).toMatch(/current_setting\('argus\.actor_role', true\) IN \(/);
  });

  it("documents the AccessRole-junction gap instead of silently inventing one", () => {
    const content = readFileSync(WAVE_010_RLS, "utf8");
    expect(content).toMatch(/NO junction table back to an actor/);
  });
});
