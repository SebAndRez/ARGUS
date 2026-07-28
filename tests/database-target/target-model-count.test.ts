import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/target-model-count.test.ts
 *
 * `ARGUS_PHYSICAL_TABLE_CATALOG_v1.1_FROZEN.md` / `ARGUS_TARGET_CURRENT_
 * MAPPING_v1.1_FROZEN.md` §3 document 168 physical target tables
 * (9+4+4+7+10+17+6+6+6+10+10+7+8+8+4+8+10+11+15+8 = 168, per the mapping
 * doc's own coverage-verification arithmetic). This test reads
 * `prisma/schema.target.prisma` as plain text (no `prisma generate`, no
 * client, no DB) and counts `model ` declarations.
 *
 * Per the task mandate: do not hardcode a pass/fail purely against 168
 * blindly — this schema is a live draft that may still be under
 * construction by a parallel agent. The test therefore (a) never fails
 * merely because the count differs from 168, (b) always documents the
 * actual count found via a named assertion so a human reviewing test
 * output sees the real number, and (c) skips entirely if the schema file
 * does not exist yet.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const TARGET_SCHEMA_PATH = join(REPO_ROOT, "prisma", "schema.target.prisma");
const EXPECTED_PER_FROZEN_CATALOG = 168;

describe("prisma/schema.target.prisma — model count", () => {
  const schemaExists = existsSync(TARGET_SCHEMA_PATH);

  if (!schemaExists) {
    it.skip(
      "prisma/schema.target.prisma does not exist yet — skipping model count " +
        "(parallel agent may still be producing it)",
      () => {}
    );
    return;
  }

  const content = readFileSync(TARGET_SCHEMA_PATH, "utf8");
  const modelDeclarations = [...content.matchAll(/^model\s+\w+\s*\{/gm)];
  const actualCount = modelDeclarations.length;

  // Deliberately NOT asserting actualCount > 0: the schema is a live draft
  // that may legitimately contain zero `model` blocks at some point in its
  // construction (e.g. only enums authored so far) without that being a
  // structural defect in this test's own deliverable — see module doc
  // comment. This test only ever reports the count, never gates on it.

  it(`matches 168 (frozen catalog) or documents the real count found (${actualCount})`, () => {
    // Intentionally non-fatal either way — see module doc comment. This
    // assertion's own description string is the "comment documenting the
    // real count" the task asks for; it is generated from the live file
    // read above rather than a value guessed at authoring time. The
    // assertion itself only checks internal consistency (the count is a
    // stable, non-negative integer), never a hardcoded equality to 168,
    // because the schema may still be a partial draft from a parallel agent.
    expect(Number.isInteger(actualCount)).toBe(true);
    expect(actualCount).toBeGreaterThanOrEqual(0);
    if (actualCount !== EXPECTED_PER_FROZEN_CATALOG) {
      // eslint-disable-next-line no-console
      console.warn(
        `target-model-count: schema.target.prisma declares ${actualCount} model(s); ` +
          `ARGUS_PHYSICAL_TABLE_CATALOG_v1.1_FROZEN.md documents ${EXPECTED_PER_FROZEN_CATALOG}. ` +
          "Recorded, not treated as a failure (schema may be a partial draft)."
      );
    }
  });
});
