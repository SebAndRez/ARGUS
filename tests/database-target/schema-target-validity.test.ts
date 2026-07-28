import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/schema-target-validity.test.ts
 *
 * Structural-only check: does `prisma/schema.target.prisma` exist, and if
 * so, does `npx prisma validate` accept it? This never connects to a live
 * database, never runs a migration, never runs `prisma generate` against
 * the target schema — `prisma validate` only parses the schema file and
 * checks it is internally well-formed.
 *
 * `prisma/schema.target.prisma` is produced by a parallel agent working on
 * the same mandate (`ARGUS_DATABASE_COMPATIBILITY_LAYER_PLAN_v1.0.md`) — at
 * the time this file was written it did not yet exist, so this test skips
 * with a clear message rather than failing the whole suite.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const TARGET_SCHEMA_RELATIVE = join("prisma", "schema.target.prisma");
const TARGET_SCHEMA_ABSOLUTE = join(REPO_ROOT, TARGET_SCHEMA_RELATIVE);

describe("prisma/schema.target.prisma — validity", () => {
  const schemaExists = existsSync(TARGET_SCHEMA_ABSOLUTE);

  if (!schemaExists) {
    it.skip(
      "prisma/schema.target.prisma does not exist yet — skipping `prisma validate` " +
        "(a parallel agent may still be producing prisma/schema.target.prisma and prisma/target-migrations/*)",
      () => {}
    );
    return;
  }

  it("`npx prisma validate --schema prisma/schema.target.prisma` exits 0", () => {
    expect(() =>
      execSync(`npx prisma validate --schema "${TARGET_SCHEMA_RELATIVE}"`, {
        cwd: REPO_ROOT,
        stdio: "pipe",
      })
    ).not.toThrow();
  });
});
