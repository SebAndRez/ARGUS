import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/target-no-destructive-cascade.test.ts
 *
 * For whatever `migration.sql` files currently exist under
 * `prisma/target-migrations/` (forward migrations only — `rollback.sql`
 * files are expected to contain `DROP TABLE IF EXISTS` and are
 * intentionally out of scope here), asserts:
 *   1. No unguarded `DROP TABLE` (i.e. without `IF EXISTS`) — forward
 *      migrations in this draft never drop tables at all today, but this
 *      guards against a future wave silently introducing one.
 *   2. No `ON DELETE CASCADE` applied to `security.audit_logs` or
 *      `security.legal_holds` — these are the two tables where a cascaded
 *      delete would silently destroy audit/legal-hold history, which must
 *      never happen regardless of what deletes its parent.
 *
 * Never executes any SQL, never touches a database.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const TARGET_MIGRATIONS_DIR = join(REPO_ROOT, "prisma", "target-migrations");
const PROTECTED_TABLES = ["security.audit_logs", "security.legal_holds"];

function findMigrationSqlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...findMigrationSqlFiles(fullPath));
    } else if (entry === "migration.sql") {
      results.push(fullPath);
    }
  }
  return results;
}

describe("prisma/target-migrations/**/migration.sql — no destructive/unguarded cascade", () => {
  const migrationFiles = findMigrationSqlFiles(TARGET_MIGRATIONS_DIR);

  if (migrationFiles.length === 0) {
    it.skip(
      "no migration.sql files exist yet under prisma/target-migrations/ — skipping " +
        "(parallel agent may still be producing them)",
      () => {}
    );
    return;
  }

  for (const filePath of migrationFiles) {
    const relativePath = filePath.slice(REPO_ROOT.length + 1);
    const content = readFileSync(filePath, "utf8");

    it(`${relativePath} — no unguarded DROP TABLE (missing IF EXISTS)`, () => {
      const unguardedDrops = [...content.matchAll(/DROP\s+TABLE\s+(?!IF\s+EXISTS)\S+/gi)];
      expect(unguardedDrops.map((m) => m[0])).toEqual([]);
    });

    it(`${relativePath} — no ON DELETE CASCADE targeting security.audit_logs or security.legal_holds`, () => {
      const offendingLines = content
        .split(/\r?\n/)
        .filter((line) => /ON\s+DELETE\s+CASCADE/i.test(line))
        .filter((line) => PROTECTED_TABLES.some((table) => line.includes(table)));
      expect(offendingLines).toEqual([]);
    });
  }
});
