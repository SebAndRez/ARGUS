import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/rls-positive-access.test.ts
 *
 * The corrective mandate is explicit: "Un suite donde todo devuelve false
 * no se considera RLS validado." A policy set that denies everything is
 * trivially "secure" and completely useless. This file asserts the RLS
 * matrix contains REAL positive cases — each one asserting that a correctly
 * authorized restricted role DOES get access — and that the harness
 * enforces a floor on how many must pass.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const MATRIX = join(REPO_ROOT, "scripts", "migration-rehearsal", "sql", "rls-matrix-checks.sql");
const HARNESS = join(REPO_ROOT, "scripts", "migration-rehearsal", "Test-ArgusRehearsal.ps1");

const REQUIRED_POSITIVES = [
  "fn_has_command_role: valid role + current membership -> true",
  "fn_is_owner: person owns own identity.people row -> true",
  "fn_is_owner: person owns own institutional membership -> true",
  "fn_is_owner: decider owns own incident_promotion -> true",
  "app_api sees its OWN incident_promotion",
  "app_api WITH command role sees the CRITICAL incident",
  "app_api with OPERATIONAL role sees an OPERATIONAL incident_candidate",
  "audit_reader with AUDIT role reads security.audit_logs",
  "readonly_inspector reads governance.incident_types",
  "ingest_worker CAN insert a SourceRecord",
];

describe("RLS matrix — positive access cases exist and assert access is GRANTED", () => {
  if (!existsSync(MATRIX)) {
    it.skip("rls-matrix-checks.sql missing — skipping", () => {});
    return;
  }
  const content = readFileSync(MATRIX, "utf8");

  it.each(REQUIRED_POSITIVES)("declares positive case: %s", (label) => {
    expect(content).toContain(label);
  });

  it("has at least 10 positive assertions", () => {
    expect((content.match(/\| positive \|/g) ?? []).length).toBeGreaterThanOrEqual(10);
  });

  it("covers a positive path for each of the three helper functions", () => {
    expect(content).toMatch(/positive \| fn_has_command_role/);
    expect(content).toMatch(/positive \| fn_is_owner/);
    // fn_classification_allowed's positive path is exercised through the
    // incident_candidates policy, which ANDs it with the role check.
    expect(content).toMatch(/positive \| app_api with OPERATIONAL role sees an OPERATIONAL incident_candidate/);
  });

  it("the harness enforces a minimum positive-case count (cannot silently drop to zero)", () => {
    expect(readFileSync(HARNESS, "utf8")).toMatch(/matrixPositives\.Count -lt 5/);
  });
});
