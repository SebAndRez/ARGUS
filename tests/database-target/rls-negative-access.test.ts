import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/rls-negative-access.test.ts
 *
 * The other half of rls-positive-access.test.ts: asserts the RLS matrix
 * contains REAL negative cases — each asserting a restricted role sees
 * NOTHING / is denied — covering all three helper functions plus the
 * role-level grant boundaries. Together the two files make "everything
 * allowed" and "everything denied" both detectable failures.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const MATRIX = join(REPO_ROOT, "scripts", "migration-rehearsal", "sql", "rls-matrix-checks.sql");
const HARNESS = join(REPO_ROOT, "scripts", "migration-rehearsal", "Test-ArgusRehearsal.ps1");

const REQUIRED_NEGATIVES = [
  "fn_has_command_role: EXPIRED institutional membership -> false",
  "fn_has_command_role: actor with no command role -> false",
  "fn_has_command_role: NULL actor -> false",
  "fn_is_owner: other person''s identity.people row -> false",
  "fn_is_owner: unsupported target_table -> false",
  "fn_is_owner: nonexistent target row -> false",
  "fn_classification_allowed: no actor_role set -> false",
  "fn_classification_allowed: NULL actor -> false",
  "app_api does NOT see another actor''s incident_promotion",
  "app_api WITHOUT command role does NOT see the incident",
  "app_api with NO actor_role sees NO incident_candidate",
  "audit_reader cannot UPDATE security.audit_logs",
  "readonly_inspector cannot INSERT",
  "ingest_worker cannot INSERT into incident.incident_candidates",
];

describe("RLS matrix — negative access cases exist and assert access is DENIED", () => {
  if (!existsSync(MATRIX)) {
    it.skip("rls-matrix-checks.sql missing — skipping", () => {});
    return;
  }
  const content = readFileSync(MATRIX, "utf8");

  it.each(REQUIRED_NEGATIVES)("declares negative case: %s", (label) => {
    expect(content).toContain(label);
  });

  it("has at least 14 negative assertions", () => {
    expect((content.match(/\| negative \|/g) ?? []).length).toBeGreaterThanOrEqual(14);
  });

  it("covers denial for all three helper functions", () => {
    expect(content).toMatch(/negative \| fn_has_command_role/);
    expect(content).toMatch(/negative \| fn_is_owner/);
    expect(content).toMatch(/negative \| fn_classification_allowed/);
  });

  it("covers denial by RLS policy, not only by missing GRANT", () => {
    // ingest_worker HAS a SELECT grant on incident.* — being denied there
    // proves the policy is doing the work, not the grant.
    expect(content).toMatch(/ingest_worker with SYSTEM role reads NO restricted incident_candidate \(RLS, not just grants\)/);
  });

  it("the harness enforces a minimum negative-case count", () => {
    expect(readFileSync(HARNESS, "utf8")).toMatch(/matrixNegatives\.Count -lt 10/);
  });
});
