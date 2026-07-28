import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/target-rls-coverage.test.ts
 *
 * D-08 (frozen decision register) requires the 6 `ice.*` tables to carry
 * real RLS policies, never a bare `USING (true)` fallback. This test
 * generalizes that guardrail to the whole
 * `prisma/target-migrations/010_foundation/rls_policies.sql` file: any
 * *executable* `USING (true)` (i.e. not inside a `--` comment line) must
 * have an explicit justification comment nearby, or the test fails.
 *
 * Skips entirely if the file does not exist yet (parallel agent scope).
 */

const REPO_ROOT = join(__dirname, "..", "..");
const RLS_POLICIES_PATH = join(
  REPO_ROOT,
  "prisma",
  "target-migrations",
  "010_foundation",
  "rls_policies.sql"
);

const BARE_USING_TRUE = /USING\s*\(\s*true\s*\)/i;
const JUSTIFICATION_HINT = /justif|exempt|exención|excepci[oó]n|interim containment|non-exemption/i;

describe("prisma/target-migrations/010_foundation/rls_policies.sql — no unjustified USING (true)", () => {
  const fileExists = existsSync(RLS_POLICIES_PATH);

  if (!fileExists) {
    it.skip(
      "010_foundation/rls_policies.sql does not exist yet — skipping RLS coverage check " +
        "(parallel agent may still be producing it)",
      () => {}
    );
    return;
  }

  const lines = readFileSync(RLS_POLICIES_PATH, "utf8").split(/\r?\n/);

  const unjustifiedOffenders: Array<{ lineNumber: number; text: string }> = [];

  lines.forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    // Skip pure comment lines — a `USING (true)` mentioned only in prose
    // (e.g. discussing what NOT to do) is not an executable policy.
    if (trimmed.startsWith("--")) return;
    if (!BARE_USING_TRUE.test(rawLine)) return;

    // Look for a justification comment in the 5 lines before or after.
    const windowStart = Math.max(0, index - 5);
    const windowEnd = Math.min(lines.length, index + 6);
    const nearbyText = lines.slice(windowStart, windowEnd).join("\n");
    if (!JUSTIFICATION_HINT.test(nearbyText)) {
      unjustifiedOffenders.push({ lineNumber: index + 1, text: rawLine.trim() });
    }
  });

  it("contains zero executable `USING (true)` policies without a nearby justification comment", () => {
    expect(unjustifiedOffenders).toEqual([]);
  });

  it("the file's own explicit non-exemption note (§10) is present, documenting the design intent", () => {
    const fullText = lines.join("\n");
    expect(/non-exemption/i.test(fullText)).toBe(true);
  });
});
