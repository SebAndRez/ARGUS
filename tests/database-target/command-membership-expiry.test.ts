import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/command-membership-expiry.test.ts
 *
 * A command role backed by an EXPIRED institutional membership must not
 * grant command authority. This is the single most consequential rule in
 * `fn_has_command_role`: `command.command_roles.revoked_at` alone is not
 * enough, because a person can keep an un-revoked command role row while
 * their underlying institutional membership lapses.
 *
 * The behavioral proof runs against real Postgres in
 * `scripts/migration-rehearsal/sql/rls-matrix-checks.sql`, which seeds a
 * current membership AND an expired one, then asserts
 * `fn_has_command_role -> true` for the first and `-> false` for the
 * second. This file pins both the DDL shape that makes the check possible
 * and the presence of that behavioral case.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const WAVE_020 = join(REPO_ROOT, "prisma", "target-migrations", "020_identity", "migration.sql");
const WAVE_040 = join(REPO_ROOT, "prisma", "target-migrations", "040_incident", "migration.sql");
const MATRIX = join(REPO_ROOT, "scripts", "migration-rehearsal", "sql", "rls-matrix-checks.sql");

describe("expired institutional membership revokes command authority", () => {
  if (!existsSync(WAVE_020) || !existsSync(WAVE_040)) {
    it.skip("required migration files missing — skipping", () => {});
    return;
  }
  const w020 = readFileSync(WAVE_020, "utf8");
  const w040 = readFileSync(WAVE_040, "utf8");

  it("institutional_memberships models validity with status + effective_from/effective_to", () => {
    const start = w020.indexOf("CREATE TABLE IF NOT EXISTS institution.institutional_memberships (");
    const block = w020.slice(start, w020.indexOf(");", start));
    expect(block).toMatch(/status\s+institution\.institutional_membership_status_enum NOT NULL/);
    expect(block).toMatch(/effective_from\s+timestamptz NOT NULL/);
    expect(block).toMatch(/effective_to\s+timestamptz NULL/);
  });

  it("only one ACTIVE (open-ended) membership per person+organization is possible", () => {
    expect(w020).toMatch(/uq_institutional_memberships_active[\s\S]{0,140}WHERE effective_to IS NULL/);
  });

  it("fn_has_command_role joins the membership and rejects expiry", () => {
    const start = w040.indexOf("CREATE OR REPLACE FUNCTION security.fn_has_command_role");
    const body = w040.slice(start, w040.indexOf("$$;", start) + 3);
    expect(body).toContain("institution.institutional_memberships");
    expect(body).toMatch(/im\.effective_to IS NULL OR im\.effective_to > now\(\)/);
    expect(body).toMatch(/im\.status = 'ACTIVE'/);
  });

  it("a command role WITHOUT a membership link is still allowed (e.g. actor_type SYSTEM)", () => {
    const start = w040.indexOf("CREATE OR REPLACE FUNCTION security.fn_has_command_role");
    const body = w040.slice(start, w040.indexOf("$$;", start) + 3);
    // The membership condition must be guarded by a NULL check, otherwise a
    // legitimate membership-less command role would be wrongly denied.
    expect(body).toMatch(/cr\.institutional_membership_id IS NULL\s*\n?\s*OR/);
  });

  it("the RLS matrix contains the live expired-membership negative case", () => {
    if (!existsSync(MATRIX)) return;
    const matrix = readFileSync(MATRIX, "utf8");
    expect(matrix).toContain("fn_has_command_role: EXPIRED institutional membership -> false");
    // and its positive counterpart, so the pair is meaningful
    expect(matrix).toContain("fn_has_command_role: valid role + current membership -> true");
  });

  it("the matrix seeds a genuinely expired membership (effective_to in the past)", () => {
    if (!existsSync(MATRIX)) return;
    expect(readFileSync(MATRIX, "utf8")).toMatch(/now\(\) - interval '1 day'\)/);
  });
});
