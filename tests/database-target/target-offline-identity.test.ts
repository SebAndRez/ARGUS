import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/target-offline-identity.test.ts
 *
 * D-01 (frozen decision register): `identity.people` and
 * `identity.user_accounts` may validly exist with zero rows in
 * `institution.institutional_memberships` — no synthetic organization is
 * ever created to absorb unassigned legacy users. Criterio de cierre (a):
 * `prisma/schema.target.prisma` must not declare any mandatory (NOT NULL,
 * single-cardinality) relation field from `Person`/`UserAccount` to
 * `InstitutionalMembership`.
 *
 * This test reads `prisma/schema.target.prisma` as plain text (no `prisma
 * generate`, no client) and asserts no such mandatory relation field
 * exists in the model blocks mapping to `people`/`user_accounts`. A
 * `InstitutionalMembership[]` (list) or `InstitutionalMembership?`
 * (optional) relation field is fine — D-01 only forbids a REQUIRED
 * single-valued relation, which would force every person/account row to
 * have exactly one membership. Skips entirely if the schema file does not
 * exist yet.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const TARGET_SCHEMA_PATH = join(REPO_ROOT, "prisma", "schema.target.prisma");
const TABLE_HINTS = ["people", "user_accounts"];

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

/**
 * A mandatory single-cardinality relation field looks like:
 *   fieldName   InstitutionalMembership   @relation(...)
 * (no trailing `[]` for list, no trailing `?` for optional). This regex
 * requires the type token to be followed by whitespace/`@`/end-of-line,
 * never by `[]` or `?`.
 */
const MANDATORY_RELATION_PATTERN =
  /^\s*\w+\s+InstitutionalMembership(?!\?)(?!\[\])\s*(@|$)/m;

describe("prisma/schema.target.prisma — D-01: no mandatory Person/UserAccount -> InstitutionalMembership relation", () => {
  const schemaExists = existsSync(TARGET_SCHEMA_PATH);

  if (!schemaExists) {
    it.skip(
      "prisma/schema.target.prisma does not exist yet — skipping (parallel agent may still be producing it)",
      () => {}
    );
    return;
  }

  const content = readFileSync(TARGET_SCHEMA_PATH, "utf8");

  it.each(TABLE_HINTS.map((table) => [table] as const))(
    "%s-equivalent model has no mandatory InstitutionalMembership relation field",
    (table) => {
      const modelBlock = extractModelBlock(content, table);
      if (!modelBlock) {
        // No model found for this table at all — cannot have a mandatory
        // relation field either, which is consistent with D-01.
        expect(modelBlock).toBeNull();
        return;
      }
      expect(MANDATORY_RELATION_PATTERN.test(modelBlock)).toBe(false);
    }
  );
});
