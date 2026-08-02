import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/command-jurisdiction-access.test.ts
 *
 * Jurisdiction is one of the six access dimensions
 * (ARGUS_PHYSICAL_ACCESS_CONTROL_v1.1_FROZEN.md §3) and, unlike the
 * others, it is NEVER a direct column comparison: it always resolves
 * through `governance.jurisdiction_scopes(scoped_table, scoped_id)` joined
 * to `governance.jurisdictions`, then to the actor's own organization
 * membership.
 *
 * Honest scope statement (not a silent omission): `fn_has_command_role`
 * as implemented gates on command role + command-structure status +
 * institutional-membership validity. It does NOT additionally intersect
 * the actor's jurisdiction with the incident's, because the target schema
 * has no jurisdiction column on `incident.incidents` — jurisdiction for an
 * incident resolves transitively via `geo.operational_zones` (Access
 * Control v1.1 §4.6 "R31"), a route whose physical join is not modeled in
 * any current wave. Inventing one would violate the mandate's
 * "no inventar ... jurisdicciones" rule. This file therefore asserts what
 * the schema really guarantees today, and pins the whitelist that keeps
 * jurisdiction_scopes from being used as a bypass.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const WAVE_010 = join(REPO_ROOT, "prisma", "target-migrations", "010_foundation", "migration.sql");
const WAVE_010_RLS = join(REPO_ROOT, "prisma", "target-migrations", "010_foundation", "rls_policies.sql");
const WAVE_040 = join(REPO_ROOT, "prisma", "target-migrations", "040_incident", "migration.sql");

describe("jurisdiction-scoped access is modeled through jurisdiction_scopes, never a bypass", () => {
  if (!existsSync(WAVE_010)) {
    it.skip("010_foundation/migration.sql missing — skipping", () => {});
    return;
  }
  const w010 = readFileSync(WAVE_010, "utf8");

  it("jurisdiction_scopes is polymorphic but its scoped_table is CHECK-whitelisted (no arbitrary target)", () => {
    expect(w010).toContain("ck_jurisdiction_scopes_table_whitelist");
    const start = w010.indexOf("ck_jurisdiction_scopes_table_whitelist");
    const block = w010.slice(start, start + 400);
    expect(block).toContain("'organizations'");
    expect(block).toContain("'resources'");
  });

  it("a jurisdiction always points at a real administrative area and declaring organization", () => {
    const start = w010.indexOf("CREATE TABLE IF NOT EXISTS governance.jurisdictions (");
    expect(start).toBeGreaterThan(-1);
    const block = w010.slice(start, w010.indexOf(");", start));
    expect(block).toMatch(/primary_administrative_area_id/);
    expect(block).toMatch(/declaring_organization_id/);
  });

  it("jurisdiction_scopes is RLS-protected and never readable via USING (true)", () => {
    const rls = readFileSync(WAVE_010_RLS, "utf8");
    expect(rls).toMatch(/ALTER TABLE governance\.jurisdiction_scopes FORCE ROW LEVEL SECURITY/);
    const start = rls.indexOf("CREATE POLICY jurisdiction_scopes_read_open");
    const policy = rls.slice(start, rls.indexOf(";", start));
    expect(policy).not.toMatch(/USING\s*\(\s*true\s*\)/);
    expect(policy).toMatch(/current_setting\('argus\.actor_role', true\) IS NOT NULL/);
  });

  it("writing a jurisdiction scope is restricted to ADMIN/SYSTEM (bridge-table bypass prevention)", () => {
    const rls = readFileSync(WAVE_010_RLS, "utf8");
    expect(rls).toMatch(/jurisdiction_scopes_write_owning_service[\s\S]{0,200}IN \('ADMIN','SYSTEM'\)/);
  });

  it("the jurisdiction-scoped policy template resolves via jurisdiction_scopes + membership, not a direct column", () => {
    const rls = readFileSync(WAVE_010_RLS, "utf8");
    const start = rls.indexOf("-- 3. Jurisdiction-scoped template");
    const section = rls.slice(start, start + 1200);
    expect(section).toContain("governance.jurisdiction_scopes");
    expect(section).toContain("institution.institutional_memberships");
    expect(section).toMatch(/never a direct column comparison/);
  });

  it("incident.incidents has NO jurisdiction column — jurisdiction is transitive, and this test says so rather than inventing one", () => {
    const w040 = readFileSync(WAVE_040, "utf8");
    const start = w040.indexOf("CREATE TABLE IF NOT EXISTS incident.incidents (");
    const block = w040.slice(start, w040.indexOf(");", start));
    expect(block).not.toMatch(/jurisdiction_id/);
  });

  it("command roles are scoped to an incident command structure, and institution is carried by the membership link", () => {
    const w040 = readFileSync(WAVE_040, "utf8");
    const start = w040.indexOf("CREATE TABLE IF NOT EXISTS command.command_roles (");
    const block = w040.slice(start, w040.indexOf(");", start));
    expect(block).toMatch(/incident_command_structure_id\s+uuid NOT NULL/);
    expect(block).toMatch(/institutional_membership_id\s+uuid NULL/);
    expect(block).toMatch(/fk_command_roles_membership FOREIGN KEY \(institutional_membership_id\) REFERENCES institution\.institutional_memberships\(id\)/);
  });
});
