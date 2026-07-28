import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/target-help-request-close.test.ts
 *
 * `help.help_requests` **[MODIFIED v1.1 — P1-04/Corrección#5]** adds
 * `closed_by_actor_id` / `close_reason` / `closed_at` as the physical
 * materialization of the authorized-close mechanism (previously only
 * narrative) — see src/lib/database-target/help.ts `HelpRequest`. This
 * test reads `prisma/schema.target.prisma` as plain text (no `prisma
 * generate`, no client) and asserts the model block mapping to
 * `help_requests` declares all three fields. Skips entirely if the schema
 * file does not exist yet.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const TARGET_SCHEMA_PATH = join(REPO_ROOT, "prisma", "schema.target.prisma");
const TABLE_HINT = "help_requests";
const REQUIRED_FIELDS = ["closed_by_actor_id", "close_reason", "closed_at"];

/**
 * Extraction of the Prisma model block that physically maps to a given
 * table name via `@@map("tableHint")`. Anchoring on the `@@map(...)`
 * directive (rather than the first plain-text occurrence of the table
 * name anywhere in the file) avoids false negatives when an earlier,
 * unrelated model's doc-comment mentions the same table name in prose
 * before the real model definition appears further down the file —
 * see the identical fix in target-critical-instruction-version.test.ts
 * (kept duplicated per-file rather than shared, matching this
 * directory's one-file-stands-alone convention).
 */
function extractModelBlock(content: string, tableHint: string): string | null {
  const mapMarker = `@@map("${tableHint}")`;
  const mapIndex = content.indexOf(mapMarker);
  if (mapIndex === -1) return null;
  const beforeMap = content.slice(0, mapIndex);
  const modelStarts = [...beforeMap.matchAll(/model\s+\w+\s*\{/g)];
  const lastModelStart = modelStarts.at(-1);
  if (!lastModelStart || lastModelStart.index === undefined) return null;
  const modelStart = lastModelStart.index;
  const closingBraceIndex = content.indexOf("\n}", mapIndex);
  if (closingBraceIndex === -1) return null;
  return content.slice(modelStart, closingBraceIndex + 2);
}

describe("prisma/schema.target.prisma — help.help_requests authorized-close columns", () => {
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
    "help_requests-equivalent model declares `%s`",
    (field) => {
      if (!modelBlock) {
        throw new Error(`No model block found for ${TABLE_HINT} — cannot check field ${field}`);
      }
      expect(modelBlock.includes(field)).toBe(true);
    }
  );
});
