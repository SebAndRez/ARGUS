import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/risk-schema-reconciliation.test.ts
 *
 * Pins the `risk.*` reconciliation performed in the corrective session
 * against `prisma/schema.target.prisma` (the authority). Before it, wave
 * 040 carried `risk.*` as explicitly "OUT OF SCOPE ... VERIFY_AGAINST_V1.0"
 * and diverged in enum value sets, column names, nullability and FK
 * actions. Each assertion below encodes one drift that was found and fixed,
 * so a silent regression fails here rather than in a future rehearsal.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const WAVE_040 = join(REPO_ROOT, "prisma", "target-migrations", "040_incident", "migration.sql");
const SCHEMA = join(REPO_ROOT, "prisma", "schema.target.prisma");

function tableBlock(sql: string, table: string): string {
  const start = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
  expect(start, `${table} not found`).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf(");", start));
}

describe("risk.* reconciled against schema.target.prisma", () => {
  if (!existsSync(WAVE_040)) {
    it.skip("040_incident/migration.sql missing — skipping", () => {});
    return;
  }
  const sql = readFileSync(WAVE_040, "utf8");
  const schema = readFileSync(SCHEMA, "utf8");

  describe("enums match the Prisma enum value sets exactly", () => {
    it("risk_assessment_status_enum is (ACTIVE, REVISED) — not the invented (ACTIVE, CLOSED)", () => {
      expect(sql).toMatch(/risk\.risk_assessment_status_enum AS ENUM \('ACTIVE','REVISED'\)/);
      expect(sql).not.toContain("risk_assessment_status_enum AS ENUM ('ACTIVE','CLOSED')");
      expect(schema).toMatch(/enum RiskAssessmentStatus \{\s*ACTIVE\s*REVISED/);
    });

    it("risk_scenario_status_enum is (ACTIVE, REPLACED) — not the invented (ACTIVE, DISCARDED)", () => {
      expect(sql).toMatch(/risk\.risk_scenario_status_enum AS ENUM \('ACTIVE','REPLACED'\)/);
      expect(schema).toMatch(/enum RiskScenarioStatus \{\s*ACTIVE\s*REPLACED/);
    });

    it("forecast_status_enum is (ACTIVE, SUPERSEDED)", () => {
      expect(sql).toMatch(/risk\.forecast_status_enum AS ENUM \('ACTIVE','SUPERSEDED'\)/);
    });
  });

  describe("risk.forecasts", () => {
    const block = () => tableBlock(sql, "risk.forecasts");

    it("risk_assessment_id is NULLABLE (Prisma String? with onDelete: SetNull)", () => {
      expect(block()).toMatch(/risk_assessment_id\s+uuid NULL/);
    });

    it("its FK uses ON DELETE SET NULL, which a NOT NULL column could never satisfy", () => {
      expect(sql).toMatch(/fk_forecasts_risk_assessment[\s\S]{0,160}ON DELETE SET NULL/);
    });

    it("has `horizon` NOT NULL (renamed from forecast_horizon, was nullable)", () => {
      expect(block()).toMatch(/horizon\s+interval NOT NULL/);
      expect(block()).not.toContain("forecast_horizon");
    });

    it("has `scenario` text NOT NULL, which was missing entirely", () => {
      expect(block()).toMatch(/scenario\s+text NOT NULL/);
    });

    it("timestamp column is issued_at, not created_at", () => {
      expect(block()).toMatch(/issued_at/);
    });
  });

  describe("risk.risk_scenarios", () => {
    it("has `probability` numeric(5,2) NULL, which was missing", () => {
      expect(tableBlock(sql, "risk.risk_scenarios")).toMatch(/probability\s+numeric\(5,2\) NULL/);
    });

    it("cascades from its risk_assessment (Prisma onDelete: Cascade)", () => {
      expect(sql).toMatch(/fk_risk_scenarios_risk_assessment[\s\S]{0,160}ON DELETE CASCADE/);
    });
  });

  describe("risk.exposed_populations", () => {
    const block = () => tableBlock(sql, "risk.exposed_populations");

    it("uses population_estimate (renamed from estimated_count)", () => {
      expect(block()).toMatch(/population_estimate/);
      expect(block()).not.toContain("estimated_count");
    });

    it("carries its own classification column, defaulting RESTRICTED", () => {
      expect(block()).toMatch(/classification\s+security\.information_classification_enum NOT NULL DEFAULT 'RESTRICTED'/);
    });

    it("its RLS policy reads the row's own classification, not a hardcoded literal", () => {
      const start = sql.indexOf("CREATE POLICY exposed_populations_restricted");
      expect(start).toBeGreaterThan(-1);
      const policy = sql.slice(start, sql.indexOf(";", start));
      expect(policy).toContain("fn_classification_allowed");
      expect(policy).toMatch(/,\s*classification\s*\)/);
      expect(policy).not.toContain("'RESTRICTED'");
    });
  });

  describe("risk.risk_assessment_revisions", () => {
    it("uses content_snapshot jsonb NOT NULL (renamed from nullable `changes`)", () => {
      const block = tableBlock(sql, "risk.risk_assessment_revisions");
      expect(block).toMatch(/content_snapshot\s+jsonb NOT NULL/);
      expect(block).not.toMatch(/\bchanges\s+jsonb/);
    });

    it("its backfill writes content_snapshot, not the old column name", () => {
      const backfill = readFileSync(join(REPO_ROOT, "prisma", "target-migrations", "040_incident", "backfill.sql"), "utf8");
      expect(backfill).toMatch(/risk\.risk_assessment_revisions \(risk_assessment_id, revision_number, content_snapshot/);
    });

    it("uses the Prisma @@unique map name", () => {
      expect(sql).toContain("uq_risk_assessment_revisions_number");
    });
  });

  describe("D-02 legacy provenance is applied only where backfill actually lands", () => {
    it("risk_assessments carries the mixin (45 rows backfilled)", () => {
      expect(tableBlock(sql, "risk.risk_assessments")).toMatch(/legacy_source/);
    });

    it("risk_assessment_revisions carries the mixin (50 rows backfilled)", () => {
      expect(tableBlock(sql, "risk.risk_assessment_revisions")).toMatch(/legacy_source/);
    });

    it.each(["risk.forecasts", "risk.risk_scenarios", "risk.exposed_populations", "risk.risk_area_versions"])(
      "%s does NOT carry the mixin (receives no backfill)",
      (table) => {
        expect(tableBlock(sql, table)).not.toMatch(/legacy_source/);
      }
    );

    it("both mixin-carrying tables also declare it on the Prisma model", () => {
      expect(schema).toMatch(/model RiskAssessment \{[\s\S]*?legacyRecordId[\s\S]*?@@map\("risk_assessments"\)/);
      expect(schema).toMatch(/model RiskAssessmentRevision \{[\s\S]*?legacyRecordId[\s\S]*?@@map\("risk_assessment_revisions"\)/);
    });
  });

  it("no risk.* table still carries a VERIFY_AGAINST_V1.0 out-of-scope marker", () => {
    const riskSection = sql.slice(sql.indexOf("-- 3. risk schema"), sql.indexOf("-- 4. command schema"));
    // The section's own header states that no marker remains, so exclude
    // lines that merely NAME the marker while asserting its absence.
    const offenders = riskSection
      .split(/\r?\n/)
      .filter((l) => /VERIFY_AGAINST_V1\.0|OUT OF SCOPE/.test(l))
      .filter((l) => !/marker remains|no `VERIFY_AGAINST_V1\.0`/i.test(l));
    expect(offenders).toEqual([]);
  });
});
