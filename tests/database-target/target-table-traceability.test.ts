import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/target-table-traceability.test.ts
 *
 * Unlike the other 11 files in this directory, this test does NOT depend
 * on `prisma/schema.target.prisma` or `prisma/target-migrations/*` existing
 * — it only reads two tracked files: the current 33-model
 * `prisma/schema.prisma` (read-only here) and the versioned fixture
 * `fixtures/target-table-traceability.json`. It therefore never skips.
 *
 * The frozen `ARGUS_TARGET_CURRENT_MAPPING_v1.1_FROZEN.md` is private and
 * gitignored, so it does not exist in CI. The fixture carries the only data
 * this test needs from it: the names of the current models the frozen mapping
 * references (names already public in `prisma/schema.prisma`; no mapping
 * content).
 *
 * Asserts every current Prisma model name is referenced by the frozen
 * mapping — i.e. no current table was silently left out of the migration
 * mapping exercise. When the private document is present locally, it also
 * checks that the fixture still agrees with it.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const CURRENT_SCHEMA_PATH = join(REPO_ROOT, "prisma", "schema.prisma");
const FIXTURE_PATH = join(__dirname, "fixtures", "target-table-traceability.json");
const PRIVATE_MAPPING_DOC_PATH = join(
  REPO_ROOT,
  "docs",
  "architecture",
  "private",
  "ARGUS_TARGET_CURRENT_MAPPING_v1.1_FROZEN.md"
);

interface TraceabilityFixture {
  sourceDocument: string;
  mappedCurrentModels: string[];
}

function currentModelNames(): string[] {
  const content = readFileSync(CURRENT_SCHEMA_PATH, "utf8");
  const matches = [...content.matchAll(/^model\s+(\w+)\s*\{/gm)];
  return matches.map((m) => m[1]);
}

describe("target-table-traceability — every current model is referenced in the frozen mapping", () => {
  const models = currentModelNames();
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as TraceabilityFixture;
  const mapped = new Set(fixture.mappedCurrentModels);

  it("reads the 33 current Prisma models from prisma/schema.prisma", () => {
    expect(models.length).toBe(33);
  });

  it("the fixture was extracted from ARGUS_TARGET_CURRENT_MAPPING_v1.1_FROZEN.md and lists no stale or duplicate models", () => {
    expect(fixture.sourceDocument).toBe("ARGUS_TARGET_CURRENT_MAPPING_v1.1_FROZEN.md");
    expect(mapped.size).toBe(fixture.mappedCurrentModels.length);
    expect([...mapped].filter((name) => !models.includes(name))).toEqual([]);
  });

  it.each(models.map((model) => [model] as const))(
    "current model `%s` appears somewhere in ARGUS_TARGET_CURRENT_MAPPING_v1.1_FROZEN.md",
    (model) => {
      expect(mapped.has(model)).toBe(true);
    }
  );

  it.runIf(existsSync(PRIVATE_MAPPING_DOC_PATH))(
    "fixture agrees with the private frozen mapping document (local only)",
    () => {
      const mappingText = readFileSync(PRIVATE_MAPPING_DOC_PATH, "utf8");
      const derived = models.filter((model) => mappingText.includes(model)).sort();
      expect([...fixture.mappedCurrentModels].sort()).toEqual(derived);
    }
  );
});
