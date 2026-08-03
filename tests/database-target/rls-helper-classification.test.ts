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

  it("fails closed on a NULL classification", () => {
    expect(realBody()).toMatch(/p_classification IS NOT NULL/);
  });

  // These four assertions are the INVERSE of what this file required before the
  // AccessSubject/AccessRoleAssignment session. The old body resolved clearance
  // from the `argus.actor_role` session GUC, and this test demanded exactly
  // that — which was correct for a schema with no physical actor->AccessRole
  // relationship, and is now the regression to prevent: a GUC is set by whoever
  // holds the connection, so believing it means any principal that can run
  // `SET argus.actor_role = 'ADMIN'` has CRITICAL clearance.
  it("does NOT read the session role GUC — a session-settable string is not an authorization decision", () => {
    expect(realBody()).not.toContain("argus.actor_role");
  });

  it("resolves clearance from persisted rows, through fn_active_access_roles", () => {
    expect(realBody()).toContain("security.fn_active_access_roles(p_actor_id)");
  });

  it("compares the requested classification against the ROLE's persisted ceiling", () => {
    expect(realBody()).toContain("p_classification <= ar.classification_ceiling");
  });

  it("never grants universal access — the only true comes from an EXISTS over real assignments", () => {
    const body = realBody();
    expect(body).toMatch(/EXISTS \(\s*\n\s*SELECT 1 FROM security\.fn_active_access_roles/);
    // No unconditional true anywhere in the body.
    expect(body.replace(/--.*$/gm, "")).not.toMatch(/THEN true|ELSE true|RETURN true/);
  });

  it("the resolver it delegates to requires an ACTIVE subject, an ACTIVE in-window assignment and an ACTIVE role", () => {
    const content = readFileSync(WAVE_010_RLS, "utf8");
    const resolver = content.slice(
      content.indexOf("CREATE OR REPLACE FUNCTION security.fn_active_access_roles("),
      content.indexOf("-- Does this actor currently hold ANY of the named access roles?")
    );
    expect(resolver).toContain("security.fn_resolve_access_subject(p_actor_id)");
    expect(resolver).toContain("AND a.status = 'ACTIVE'");
    expect(resolver).toContain("AND a.valid_from <= now()");
    expect(resolver).toContain("AND (a.valid_until IS NULL OR a.valid_until > now())");
    expect(resolver).toContain("AND r.status = 'ACTIVE'");
    // And it is session-bound, so it cannot answer about another actor.
    expect(resolver).toContain("IF p_actor_id IS DISTINCT FROM current_setting('argus.actor_id', true)::uuid THEN");
  });

  it("the AccessRole-junction gap it used to document is now closed by real tables", () => {
    const content = readFileSync(WAVE_010_RLS, "utf8");
    expect(content).not.toMatch(/NO junction table back to an actor/);
    expect(content).toContain("security.access_role_assignments");
    const wave020 = readFileSync(
      join(REPO_ROOT, "prisma", "target-migrations", "020_identity", "migration.sql"),
      "utf8"
    );
    expect(wave020).toContain("CREATE TABLE IF NOT EXISTS security.access_subjects (");
    expect(wave020).toContain("CREATE TABLE IF NOT EXISTS security.access_role_assignments (");
  });
});
