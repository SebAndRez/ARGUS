import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/rollback-object-ownership.test.ts
 *
 * Static (no Docker) guard against the exact bug class found and fixed in
 * the corrective session's Fase 3/4 audit: `migration_meta.critical_poi_review_queue`
 * (created by `060_resources/backfill.sql`) and `migration_meta` schema +
 * `migration_meta.legacy_status_mapping`/`migration_checkpoints` (created by
 * `000_preflight/backfill.sql`) survived a full 100->000 rollback because no
 * `rollback.sql` anywhere dropped them — confirmed by a real
 * apply-then-rollback cycle against local Postgres
 * (`catalog-object-inventory.sql` diff), not assumed from the scripts
 * exiting 0.
 *
 * This test parses every wave's `migration.sql`+`backfill.sql` for
 * `CREATE TABLE`/`CREATE SCHEMA` statements and asserts a matching
 * `DROP TABLE`/`DROP SCHEMA` exists SOMEWHERE across the full package's
 * `rollback.sql` files — deliberately package-wide, not same-wave-only,
 * because `migration_meta` is a legitimate cross-wave-shared schema
 * (created by wave 000, added to by wave 060) and its DROP SCHEMA
 * correctly lives in wave 000's rollback (the last to run in reverse
 * order), not wave 060's.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_ROOT = join(REPO_ROOT, "prisma", "target-migrations");

const WAVES = readdirSync(MIGRATIONS_ROOT).filter((name) => existsSync(join(MIGRATIONS_ROOT, name, "migration.sql")));

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

interface CreatedObject {
  kind: "TABLE" | "SCHEMA";
  name: string;
  wave: string;
  sourceFile: string;
}

function extractCreated(content: string, wave: string, sourceFile: string): CreatedObject[] {
  const created: CreatedObject[] = [];
  for (const m of content.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi)) {
    created.push({ kind: "TABLE", name: m[1].toLowerCase(), wave, sourceFile });
  }
  for (const m of content.matchAll(/CREATE SCHEMA IF NOT EXISTS ([a-z_][a-z0-9_]*)/gi)) {
    created.push({ kind: "SCHEMA", name: m[1].toLowerCase(), wave, sourceFile });
  }
  return created;
}

describe("rollback.sql object ownership — every CREATE TABLE/SCHEMA has a matching DROP somewhere in the package", () => {
  const allCreated: CreatedObject[] = [];
  let combinedRollbackText = "";

  for (const wave of WAVES) {
    const waveDir = join(MIGRATIONS_ROOT, wave);
    const migrationSql = readIfExists(join(waveDir, "migration.sql"));
    const backfillSql = readIfExists(join(waveDir, "backfill.sql"));
    allCreated.push(...extractCreated(migrationSql, wave, "migration.sql"));
    allCreated.push(...extractCreated(backfillSql, wave, "backfill.sql"));
    combinedRollbackText += readIfExists(join(waveDir, "rollback.sql")) + "\n";
  }

  it("found at least one CREATE TABLE across the package (sanity check the parser works)", () => {
    expect(allCreated.filter((c) => c.kind === "TABLE").length).toBeGreaterThan(50);
  });

  const tables = allCreated.filter((c) => c.kind === "TABLE");
  it.each(tables.map((t) => [`${t.wave}/${t.sourceFile}: ${t.name}`, t.name] as const))(
    "%s has a matching DROP TABLE IF EXISTS somewhere in the package's rollback.sql files",
    (_label, name) => {
      const pattern = new RegExp(`DROP TABLE IF EXISTS ${name.replace(".", "\\.")}\\b`, "i");
      expect(combinedRollbackText, `no rollback.sql drops ${name}`).toMatch(pattern);
    }
  );

  const schemas = allCreated.filter((c) => c.kind === "SCHEMA");
  it.each(schemas.map((s) => [`${s.wave}/${s.sourceFile}: ${s.name}`, s.name] as const))(
    "%s has a matching DROP SCHEMA IF EXISTS somewhere in the package's rollback.sql files",
    (_label, name) => {
      const pattern = new RegExp(`DROP SCHEMA IF EXISTS ${name}\\b`, "i");
      expect(combinedRollbackText, `no rollback.sql drops schema ${name}`).toMatch(pattern);
    }
  );
});
