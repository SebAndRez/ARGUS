import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/risk-escalation-no-direct-incident.test.ts
 *
 * Doctrine guard (mandate Fase 8): a risk escalation may only ever produce
 * an `IncidentCandidate` — never an `Incident` directly. A Forecast/
 * RiskAssessment is an estimate, not a fact; promoting one straight to a
 * canonical Incident would bypass the entire Wave 4 promotion decision
 * (human decider or approved AutomationRule + IncidentPromotion record +
 * AuditLog).
 *
 * `schema.target.prisma`'s own Forecast doc comment states the rule
 * verbatim: "never treated as a fact, never auto-promoted to Incident."
 *
 * This is a structural proof: `risk.risk_assessments` may reference BOTH
 * `incident_candidate_id` and `incident_id` (an assessment can accompany an
 * already-promoted incident), but nothing in the risk domain may CREATE an
 * incident, and the only code path that inserts into `incident.incidents`
 * remains the Wave 4 promotion service.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const WAVE_040 = join(REPO_ROOT, "prisma", "target-migrations", "040_incident", "migration.sql");
const BACKFILL_040 = join(REPO_ROOT, "prisma", "target-migrations", "040_incident", "backfill.sql");
const SCHEMA = join(REPO_ROOT, "prisma", "schema.target.prisma");

describe("risk escalation never creates an Incident directly", () => {
  if (!existsSync(WAVE_040)) {
    it.skip("040_incident/migration.sql missing — skipping", () => {});
    return;
  }
  const sql = readFileSync(WAVE_040, "utf8");
  const schema = readFileSync(SCHEMA, "utf8");

  it("schema.target.prisma states the no-auto-promotion rule for Forecast", () => {
    expect(schema).toMatch(/never treated as a fact, never auto-promoted to Incident/);
  });

  it("risk.risk_assessments can reference an IncidentCandidate", () => {
    expect(sql).toMatch(/fk_risk_assessments_candidate FOREIGN KEY \(incident_candidate_id\) REFERENCES incident\.incident_candidates\(id\)/);
  });

  it("its incident_id reference is SET NULL, i.e. an observation of an existing incident — never an ownership/creation path", () => {
    expect(sql).toMatch(/fk_risk_assessments_incident FOREIGN KEY \(incident_id\) REFERENCES incident\.incidents\(id\) ON DELETE SET NULL/);
  });

  it("no risk.* table has a trigger that writes into incident.incidents", () => {
    const riskSection = sql.slice(sql.indexOf("-- 3. risk schema"), sql.indexOf("-- 4. command schema"));
    expect(riskSection).not.toMatch(/CREATE TRIGGER/i);
    expect(riskSection).not.toMatch(/INSERT INTO incident\.incidents/i);
  });

  it("wave 040's backfill never inserts into incident.incidents from a risk source", () => {
    const backfill = readFileSync(BACKFILL_040, "utf8");
    const riskInserts = backfill.match(/INSERT INTO incident\.incidents[\s\S]{0,600}/g) ?? [];
    for (const stmt of riskInserts) {
      expect(stmt).not.toMatch(/FROM\s+"?RiskAssessment/i);
      expect(stmt).not.toMatch(/risk\.risk_assessments/i);
    }
  });

  it("the promotion service is still the only module importing insertIncident", () => {
    const svc = join(REPO_ROOT, "src", "lib", "database-target", "services", "incidentPromotionService.ts");
    if (!existsSync(svc)) return;
    expect(readFileSync(svc, "utf8")).toContain("insertIncident");
  });

  it("no risk-named service exists that could promote to Incident", () => {
    const servicesDir = join(REPO_ROOT, "src", "lib", "database-target", "services");
    if (!existsSync(servicesDir)) return;
    for (const file of readdirSync(servicesDir)) {
      if (!file.endsWith(".ts")) continue;
      if (!/risk/i.test(file)) continue;
      const source = readFileSync(join(servicesDir, file), "utf8");
      expect(source, `${file} must not insert incidents`).not.toMatch(/insertIncident/);
    }
  });
});
