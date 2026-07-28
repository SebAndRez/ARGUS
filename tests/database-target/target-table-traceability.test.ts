import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/target-table-traceability.test.ts
 *
 * Unlike the other 11 files in this directory, this test does NOT depend
 * on `prisma/schema.target.prisma` or `prisma/target-migrations/*` existing
 * — it only reads two files that are already final: the current 33-model
 * `prisma/schema.prisma` (unmodified by this session, read-only here) and
 * the frozen `ARGUS_TARGET_CURRENT_MAPPING_v1.1_FROZEN.md`. It therefore
 * never skips.
 *
 * Asserts every current Prisma model name is referenced somewhere in the
 * frozen mapping document — i.e. no current table was silently left out of
 * the migration mapping exercise.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const CURRENT_SCHEMA_PATH = join(REPO_ROOT, "prisma", "schema.prisma");
const MAPPING_DOC_PATH = join(
  REPO_ROOT,
  "docs",
  "architecture",
  "private",
  "ARGUS_TARGET_CURRENT_MAPPING_v1.1_FROZEN.md"
);

function currentModelNames(): string[] {
  const content = readFileSync(CURRENT_SCHEMA_PATH, "utf8");
  const matches = [...content.matchAll(/^model\s+(\w+)\s*\{/gm)];
  return matches.map((m) => m[1]);
}

describe("target-table-traceability — every current model is referenced in the frozen mapping", () => {
  const models = currentModelNames();
  const mappingText = readFileSync(MAPPING_DOC_PATH, "utf8");

  it("reads the 33 current Prisma models from prisma/schema.prisma", () => {
    expect(models.length).toBe(33);
  });

  it.each(models.map((model) => [model] as const))(
    "current model `%s` appears somewhere in ARGUS_TARGET_CURRENT_MAPPING_v1.1_FROZEN.md",
    (model) => {
      expect(mappingText.includes(model)).toBe(true);
    }
  );
});
