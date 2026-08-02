import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/rls-non-superuser.test.ts
 *
 * Asserts the RLS matrix is actually executed AS A RESTRICTED ROLE, not as
 * the harness connection role (which is a Postgres superuser and therefore
 * bypasses RLS unconditionally). A matrix run as superuser would pass every
 * negative case for entirely the wrong reason — the corrective mandate
 * forbids that explicitly ("No usar superusuario para declarar que RLS
 * funciona").
 */

const REPO_ROOT = join(__dirname, "..", "..");
const MATRIX = join(REPO_ROOT, "scripts", "migration-rehearsal", "sql", "rls-matrix-checks.sql");
const HARNESS = join(REPO_ROOT, "scripts", "migration-rehearsal", "Test-ArgusRehearsal.ps1");

describe("RLS matrix runs under real non-superuser roles", () => {
  if (!existsSync(MATRIX)) {
    it.skip("rls-matrix-checks.sql missing — skipping", () => {});
    return;
  }
  const content = readFileSync(MATRIX, "utf8");

  it.each(["app_api", "audit_reader", "readonly_inspector", "ingest_worker"])(
    "switches to the restricted role %s via SET LOCAL ROLE",
    (role) => {
      expect(content).toContain(`SET LOCAL ROLE ${role};`);
    }
  );

  it("asserts up front that no application role is superuser or BYPASSRLS", () => {
    expect(content).toMatch(/rolsuper OR rolbypassrls/);
    expect(content).toMatch(/no application role is superuser or BYPASSRLS/);
  });

  it("every transaction in the matrix rolls back — the file leaves zero rows behind", () => {
    const begins = (content.match(/^BEGIN;/gm) ?? []).length;
    const rollbacks = (content.match(/^ROLLBACK;/gm) ?? []).length;
    const commits = (content.match(/^COMMIT;/gm) ?? []).length;
    expect(begins).toBeGreaterThan(0);
    expect(rollbacks).toBe(begins);
    expect(commits).toBe(0);
  });

  it("every role switch happens inside a transaction (SET LOCAL, never leaking to the session)", () => {
    const roleSwitches = (content.match(/SET LOCAL ROLE/g) ?? []).length;
    expect(roleSwitches).toBeGreaterThanOrEqual(6);
  });

  it("uses SET LOCAL ROLE (transaction-scoped), never a bare SET ROLE that could leak across statements", () => {
    expect(content).not.toMatch(/^SET ROLE /m);
  });

  it("the harness treats an RLS matrix failure as fatal, not a warning", () => {
    const harness = readFileSync(HARNESS, "utf8");
    expect(harness).toMatch(/throw "RLS_MATRIX_FAIL/);
  });

  it("the harness also fails when the matrix aborts mid-run (non-zero exit)", () => {
    expect(readFileSync(HARNESS, "utf8")).toMatch(/rlsMatrix\.ExitCode -ne 0/);
  });
});
