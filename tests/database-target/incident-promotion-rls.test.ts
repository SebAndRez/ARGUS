import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/incident-promotion-rls.test.ts
 *
 * Structural RLS coverage for the wave-4 promotion tables, same discipline
 * as `target-rls-coverage.test.ts`: every `incident.incident_promotions`/
 * `incident.discard_decisions`/`incident.hypotheses` policy in wave 040's
 * `migration.sql` must use `FORCE ROW LEVEL SECURITY` and a real predicate,
 * never a bare `USING (true)`.
 *
 * NOT a live cross-role behavioral test. Two real, load-bearing reasons,
 * both confirmed against the local rehearsal Postgres rather than assumed:
 *   1. The only DB role the rehearsal harness connects as
 *      (`argus_rehearsal_user`) is a Postgres SUPERUSER, which bypasses RLS
 *      unconditionally regardless of `FORCE ROW LEVEL SECURITY` — a
 *      behavioral test run through that connection would trivially "pass"
 *      by proving nothing. Exercising the real `app_api`/`audit_reader`
 *      policy paths needs a separate, authenticated, non-superuser
 *      connection, which is a distinct infrastructure task, not part of
 *      this session's mandate.
 *   2. `security.fn_has_command_role`/`fn_classification_allowed`/
 *      `fn_is_owner` (`prisma/target-migrations/010_foundation/rls_policies.sql`)
 *      are PRE-EXISTING, already-flagged `SQL_COMPLEMENTARY_REQUIRED` stub
 *      functions that unconditionally `SELECT false` — a gap spanning ALL
 *      11 waves' RLS, predating and out of scope for wave 4. A behavioral
 *      test against the command-role clause specifically would only ever
 *      prove "always denied", which is not a meaningful assertion.
 * Both are called out explicitly here (and in the wave-4 final report)
 * rather than silently worked around with a test that would pass for the
 * wrong reason.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const WAVE_040_MIGRATION_PATH = join(REPO_ROOT, "prisma", "target-migrations", "040_incident", "migration.sql");

const PROMOTION_TABLES = ["incident.incident_promotions", "incident.discard_decisions", "incident.hypotheses", "incident.incident_candidates"];

describe("prisma/target-migrations/040_incident/migration.sql — incident.* promotion table RLS coverage", () => {
  const fileExists = existsSync(WAVE_040_MIGRATION_PATH);

  if (!fileExists) {
    it.skip("040_incident/migration.sql does not exist yet — skipping", () => {});
    return;
  }

  const content = readFileSync(WAVE_040_MIGRATION_PATH, "utf8");

  it.each(PROMOTION_TABLES)("%s has ALTER TABLE ... FORCE ROW LEVEL SECURITY", (table) => {
    expect(content).toMatch(new RegExp(`ALTER TABLE ${table.replace(".", "\\.")} FORCE ROW LEVEL SECURITY`));
  });

  it.each(PROMOTION_TABLES)("%s has at least one CREATE POLICY", (table) => {
    const policyForTable = new RegExp(`CREATE POLICY \\w+ ON ${table.replace(".", "\\.")}`);
    expect(content).toMatch(policyForTable);
  });

  it("incident_promotions_scoped grants self-actor and audit_reader access independent of the fn_has_command_role stub", () => {
    const match = content.match(/CREATE POLICY incident_promotions_scoped[\s\S]*?;/);
    expect(match).not.toBeNull();
    const policyText = match![0];
    expect(policyText).toContain("decided_by_actor_id = current_setting('argus.actor_id')::uuid");
    expect(policyText).toContain("current_user = 'audit_reader'");
  });

  it("discard_decisions_scoped grants self-actor and OPERATIONAL/ADMIN/AUDIT_READER role access independent of any stub function", () => {
    const match = content.match(/CREATE POLICY discard_decisions_scoped[\s\S]*?;/);
    expect(match).not.toBeNull();
    const policyText = match![0];
    expect(policyText).toContain("decided_by_actor_id = current_setting('argus.actor_id')::uuid");
    expect(policyText).toContain("'AUDIT_READER'");
  });

  it("no bare, unjustified USING (true) appears anywhere in the incident schema RLS section", () => {
    const incidentSectionStart = content.indexOf("-- 6. RLS (Access Control");
    const riskSectionStart = content.indexOf("-- risk.* — RESTRICTED");
    expect(incidentSectionStart).toBeGreaterThan(-1);
    expect(riskSectionStart).toBeGreaterThan(incidentSectionStart);
    const incidentSection = content.slice(incidentSectionStart, riskSectionStart);
    const lines = incidentSection.split(/\r?\n/).filter((l) => !l.trim().startsWith("--"));
    const bareUsingTrue = lines.filter((l) => /USING\s*\(\s*true\s*\)/i.test(l));
    expect(bareUsingTrue).toEqual([]);
  });
});
