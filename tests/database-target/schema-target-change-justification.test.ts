import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/schema-target-change-justification.test.ts
 *
 * Guards against a silent re-divergence of the two schema changes audited
 * during the corrective session that followed the 030/040 reconciliation:
 *
 *   1. JUSTIFIED and kept: `IngestionRun.originKind` (+ `IngestionRunOriginKind`
 *      enum) and the D-02 legacy-provenance mixin (`legacyStatus`/
 *      `legacySource`/`legacyRecordId`/`migrationConfidence`/
 *      `migrationReviewStatus`) on the 6 models that
 *      `ARGUS_BACKFILL_CATALOG_v1.0.md` (Fase 9, D-02's own text) names as
 *      real backfill recipients — `ARGUS_EXECUTABLE_DATABASE_MIGRATION_PLAN_v1.0.md`
 *      line ~212 explicitly says "IngestionRun+KnowledgeIngestionRun→
 *      ingest.ingestion_runs (fusión, discriminador origin_kind)", and
 *      `ARGUS_MIGRATION_DECISION_REGISTER_v1.0_FROZEN.md` D-02 explicitly
 *      mandates the mixin on "toda tabla objetivo que reciba backfill".
 *   2. NOT JUSTIFIED and reverted: `Incident.location`
 *      (`geography(Point,4326)`) — absent from the frozen `incident.incidents`
 *      ficha (`ARGUS_PHYSICAL_TABLE_CATALOG_v1.0.md` §incident.incidents,
 *      never modified for this table by v1.1), never populated by any
 *      backfill, never read by any view/query in the target-migrations
 *      package — its only "authority" was a self-referential comment
 *      pointing at the very migration.sql written in the same session that
 *      introduced it. Geography for an incident lives on the child
 *      `incident.affected_area_versions` table instead.
 *
 * Static text-based check (no DB, no Docker) so it runs on every commit.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const TARGET_SCHEMA_PATH = join(REPO_ROOT, "prisma", "schema.target.prisma");

const D02_MIXIN_FIELDS = ["legacyStatus", "legacySource", "legacyRecordId", "migrationConfidence", "migrationReviewStatus"];

const BACKFILL_RECIPIENT_MODELS = ["IngestionRun", "SourceRecord", "Observation", "IncidentCandidate", "Incident", "IncidentTransition"];

function extractModelBlock(content: string, modelName: string): string {
  const marker = `model ${modelName} {`;
  const start = content.indexOf(marker);
  if (start === -1) throw new Error(`model ${modelName} not found in schema.target.prisma`);
  const end = content.indexOf("\n}", start);
  if (end === -1) throw new Error(`closing brace for model ${modelName} not found`);
  return content.slice(start, end + 2);
}

describe("prisma/schema.target.prisma — audited change justification", () => {
  const schemaExists = existsSync(TARGET_SCHEMA_PATH);

  if (!schemaExists) {
    it.skip("prisma/schema.target.prisma does not exist yet — skipping", () => {});
    return;
  }

  const content = readFileSync(TARGET_SCHEMA_PATH, "utf8");

  describe("JUSTIFIED — IngestionRunOriginKind (ARGUS_EXECUTABLE_DATABASE_MIGRATION_PLAN_v1.0.md: 'fusión, discriminador origin_kind')", () => {
    it("declares the IngestionRunOriginKind enum mapped to ingest.ingestion_run_origin_kind_enum", () => {
      expect(content).toMatch(/enum IngestionRunOriginKind\s*\{[\s\S]*?EXTERNAL_EVENT_PIPELINE[\s\S]*?GLOBAL_WATCH_PIPELINE[\s\S]*?\}/);
    });

    it("IngestionRun.originKind is declared and typed IngestionRunOriginKind", () => {
      const block = extractModelBlock(content, "IngestionRun");
      expect(block).toMatch(/originKind\s+IngestionRunOriginKind/);
    });
  });

  describe("JUSTIFIED — D-02 legacy provenance mixin (ARGUS_MIGRATION_DECISION_REGISTER_v1.0_FROZEN.md D-02 + ARGUS_BACKFILL_CATALOG_v1.0.md Fase 9)", () => {
    it.each(BACKFILL_RECIPIENT_MODELS)("model %s declares all 5 D-02 mixin fields", (modelName) => {
      const block = extractModelBlock(content, modelName);
      for (const field of D02_MIXIN_FIELDS) {
        expect(block, `${modelName} is missing D-02 mixin field ${field}`).toMatch(new RegExp(`\\b${field}\\b`));
      }
    });
  });

  describe("REVERTED — Incident.location (not in the frozen physical ficha, never read anywhere)", () => {
    it("Incident model does NOT declare a location field", () => {
      const block = extractModelBlock(content, "Incident");
      expect(block).not.toMatch(/\blocation\b/);
    });

    it("040_incident/migration.sql does not create a location column or gix_incidents_location index", () => {
      const migrationPath = join(REPO_ROOT, "prisma", "target-migrations", "040_incident", "migration.sql");
      if (!existsSync(migrationPath)) return;
      const migrationContent = readFileSync(migrationPath, "utf8");
      expect(migrationContent).not.toContain("gix_incidents_location");
      // The incident.incidents CREATE TABLE block specifically must not declare a location column.
      const tableStart = migrationContent.indexOf("CREATE TABLE IF NOT EXISTS incident.incidents (");
      const tableEnd = migrationContent.indexOf(");", tableStart);
      const tableBlock = migrationContent.slice(tableStart, tableEnd);
      expect(tableBlock).not.toMatch(/\blocation\b/);
    });
  });
});
