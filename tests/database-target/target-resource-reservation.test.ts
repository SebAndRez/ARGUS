import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/target-resource-reservation.test.ts
 *
 * `resource.resource_reservations` **[MODIFIED v1.1 — P2-10, refuerzo de
 * P1-01]** carries `expires_at` / `extended_once` / `extension_ceiling` —
 * see src/lib/database-target/resource.ts `ResourceReservation`. This test
 * reads `prisma/schema.target.prisma` as plain text (no `prisma generate`,
 * no client) and asserts the model block mapping to
 * `resource_reservations` declares all three fields. Skips entirely if the
 * schema file does not exist yet.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const TARGET_SCHEMA_PATH = join(REPO_ROOT, "prisma", "schema.target.prisma");
const TABLE_HINT = "resource_reservations";
const REQUIRED_FIELDS = ["expires_at", "extended_once", "extension_ceiling"];

/**
 * Best-effort extraction of the Prisma model block referencing a given
 * physical table name — see the identical helper in
 * target-critical-instruction-version.test.ts for the same heuristic and
 * rationale (kept duplicated per-file rather than shared, matching this
 * directory's one-file-stands-alone convention).
 */
function extractModelBlock(content: string, tableHint: string): string | null {
  const tableIndex = content.indexOf(tableHint);
  if (tableIndex === -1) return null;
  const beforeTable = content.slice(0, tableIndex);
  const modelStarts = [...beforeTable.matchAll(/model\s+\w+\s*\{/g)];
  const lastModelStart = modelStarts.at(-1);
  if (!lastModelStart || lastModelStart.index === undefined) return null;
  const modelStart = lastModelStart.index;
  const closingBraceIndex = content.indexOf("\n}", modelStart);
  if (closingBraceIndex === -1) return null;
  return content.slice(modelStart, closingBraceIndex + 2);
}

describe("prisma/schema.target.prisma — resource.resource_reservations extension columns", () => {
  const schemaExists = existsSync(TARGET_SCHEMA_PATH);

  if (!schemaExists) {
    it.skip(
      "prisma/schema.target.prisma does not exist yet — skipping (parallel agent may still be producing it)",
      () => {}
    );
    return;
  }

  const content = readFileSync(TARGET_SCHEMA_PATH, "utf8");
  const modelBlock = extractModelBlock(content, TABLE_HINT);

  it(`finds a model block referencing \`${TABLE_HINT}\``, () => {
    expect(modelBlock).not.toBeNull();
  });

  it.each(REQUIRED_FIELDS.map((field) => [field] as const))(
    "resource_reservations-equivalent model declares `%s`",
    (field) => {
      if (!modelBlock) {
        throw new Error(`No model block found for ${TABLE_HINT} — cannot check field ${field}`);
      }
      expect(modelBlock.includes(field)).toBe(true);
    }
  );
});
