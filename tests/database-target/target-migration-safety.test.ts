import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/target-migration-safety.test.ts
 *
 * Every `migration.sql` currently present under `prisma/target-migrations/`
 * must open with the literal marker `-- NOT EXECUTED` — the whole-of-plan
 * guardrail that these are draft SQL for human review, never something a
 * tool or CI job could apply automatically. Never executes any SQL itself,
 * never touches a database.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const TARGET_MIGRATIONS_DIR = join(REPO_ROOT, "prisma", "target-migrations");
const REQUIRED_MARKER = "-- NOT EXECUTED";

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

describe("prisma/target-migrations/**/migration.sql — safety marker", () => {
  const migrationFiles = findMigrationSqlFiles(TARGET_MIGRATIONS_DIR);

  if (migrationFiles.length === 0) {
    it.skip(
      "no migration.sql files exist yet under prisma/target-migrations/ — skipping " +
        "(parallel agent may still be producing them)",
      () => {}
    );
    return;
  }

  it(`found ${migrationFiles.length} migration.sql file(s) to check`, () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  it.each(migrationFiles.map((filePath) => [filePath] as const))(
    "%s starts with the literal marker `-- NOT EXECUTED`",
    (filePath) => {
      const content = readFileSync(filePath, "utf8");
      expect(content.startsWith(REQUIRED_MARKER)).toBe(true);
    }
  );
});
