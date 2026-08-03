import { describe, expect, it } from "vitest";
import { readRepoFile } from "./accessRoleTestHelpers";

/**
 * tests/database-target/access-role-rollback.test.ts
 *
 * The rollback contract for the authorization substrate, asserted statically so
 * it runs on every commit. `access-role-zero-residue.test.ts` proves the effect
 * against a real post-rollback database.
 *
 * Ordering is the whole difficulty here: the two tables reference
 * identity.people / institution.organizations (Wave 020) and
 * security.access_roles (Wave 010), so they must be dropped inside Wave 020's
 * rollback, BEFORE the tables they point at and before Wave 010 runs — and the
 * child before the parent.
 */

const WAVE_010 = ["prisma", "target-migrations", "010_foundation"] as const;
const WAVE_020 = ["prisma", "target-migrations", "020_identity"] as const;

describe("wave 020 rollback — access subjects and assignments", () => {
  const rollback = readRepoFile(...WAVE_020, "rollback.sql");

  it("drops the assignment table before the subject table", () => {
    const child = rollback.indexOf("DROP TABLE IF EXISTS security.access_role_assignments;");
    const parent = rollback.indexOf("DROP TABLE IF EXISTS security.access_subjects;");
    expect(child).toBeGreaterThan(-1);
    expect(parent).toBeGreaterThan(child);
  });

  it("drops both tables BEFORE the identity/institution tables they reference", () => {
    const subjects = rollback.indexOf("DROP TABLE IF EXISTS security.access_subjects;");
    const organizations = rollback.indexOf("DROP TABLE IF EXISTS institution.organizations;");
    const people = rollback.indexOf("DROP TABLE IF EXISTS identity.people;");
    expect(organizations).toBeGreaterThan(subjects);
    expect(people).toBeGreaterThan(subjects);
  });

  it("drops the policies before the tables", () => {
    const policy = rollback.indexOf("DROP POLICY IF EXISTS access_role_assignments_self_or_governance");
    const table = rollback.indexOf("DROP TABLE IF EXISTS security.access_role_assignments;");
    expect(policy).toBeGreaterThan(-1);
    expect(table).toBeGreaterThan(policy);
  });

  it("drops all four administration functions with their exact signatures", () => {
    for (const signature of [
      "security.fn_revoke_access_role(uuid, varchar, uuid)",
      "security.fn_grant_access_role(uuid, varchar, uuid, security.access_purpose_enum, timestamptz, timestamptz, uuid, varchar, uuid)",
      "security.fn_audit_access_role_change(varchar, uuid, uuid, text, varchar, uuid)",
      "security.fn_register_access_subject(security.actor_type_enum, uuid, uuid, uuid, varchar)",
    ]) {
      expect(rollback).toContain(`DROP FUNCTION IF EXISTS ${signature};`);
    }
  });

  it("revokes every grant it made, including the access_admin schema USAGE", () => {
    expect(rollback).toContain("REVOKE ALL ON security.access_subjects, security.access_role_assignments FROM access_admin;");
    expect(rollback).toContain("REVOKE USAGE ON SCHEMA security FROM access_admin;");
    expect(rollback).toContain("REVOKE USAGE ON SCHEMA identity, institution FROM access_admin;");
  });

  it("never uses CASCADE, and never drops a legacy table or an extension", () => {
    const statements = rollback.replace(/--.*$/gm, "");
    expect(statements).not.toMatch(/DROP\s+(TABLE|FUNCTION|SCHEMA)[^;]*CASCADE/i);
    expect(statements).not.toMatch(/DROP EXTENSION/i);
    expect(statements).not.toMatch(/DROP TABLE[^;]*"(User|AuditLog|KnowledgeIncident)"/);
  });

  it("every table and function wave 020 creates for this feature is dropped (no drift between the files)", () => {
    const migration = readRepoFile(...WAVE_020, "migration.sql");
    const createdTables = [
      ...migration.matchAll(/CREATE TABLE IF NOT EXISTS (security\.access_\w+)/g),
    ].map((m) => m[1]!);
    expect(new Set(createdTables)).toEqual(new Set(["security.access_subjects", "security.access_role_assignments"]));
    for (const table of createdTables) {
      expect(rollback, `${table} is created but never dropped`).toContain(`DROP TABLE IF EXISTS ${table};`);
    }

    const createdFunctions = [
      ...migration.matchAll(/CREATE OR REPLACE FUNCTION (security\.fn_\w*access\w*)\(/g),
    ].map((m) => m[1]!);
    expect(createdFunctions.length).toBe(4);
    for (const fn of createdFunctions) {
      expect(rollback, `${fn} is created but never dropped`).toContain(`DROP FUNCTION IF EXISTS ${fn}(`);
    }
  });
});

describe("wave 010 rollback — the persisted-authorization helpers and enums", () => {
  const rollback = readRepoFile(...WAVE_010, "rollback.sql");
  const policies = readRepoFile(...WAVE_010, "rls_policies.sql");

  it("drops all four authorization helper functions", () => {
    for (const signature of [
      "security.fn_classification_allowed(uuid, security.information_classification_enum)",
      "security.fn_has_access_role(uuid, text[])",
      "security.fn_has_any_access_role(uuid)",
      "security.fn_active_access_roles(uuid)",
      "security.fn_resolve_access_subject(uuid)",
    ]) {
      expect(rollback).toContain(`DROP FUNCTION IF EXISTS ${signature};`);
    }
  });

  it("every authorization helper wave 010 creates is dropped", () => {
    const created = [
      ...policies.matchAll(/CREATE OR REPLACE FUNCTION (security\.fn_(?:resolve_access_subject|active_access_roles|has_access_role|has_any_access_role|classification_allowed))\(/g),
    ].map((m) => m[1]!);
    expect(new Set(created).size).toBe(5);
    for (const fn of new Set(created)) {
      expect(rollback, `${fn} is created but never dropped`).toContain(`DROP FUNCTION IF EXISTS ${fn}(`);
    }
  });

  it("drops the three new security enums", () => {
    for (const enumName of [
      "security.access_purpose_enum",
      "security.access_role_assignment_status_enum",
      "security.access_subject_status_enum",
    ]) {
      expect(rollback).toContain(`DROP TYPE IF EXISTS ${enumName};`);
    }
  });

  it("drops the horizon-bounded runtime partition entry point too", () => {
    expect(rollback).toContain("DROP FUNCTION IF EXISTS security.fn_ensure_audit_log_partition_for_write(timestamptz);");
  });
});

describe("wave 000 rollback — the access_admin role", () => {
  const rollback = readRepoFile("prisma", "target-migrations", "000_preflight", "rollback.sql");
  const migration = readRepoFile("prisma", "target-migrations", "000_preflight", "migration.sql");

  it("creates and drops access_admin, guarded both ways", () => {
    expect(migration).toContain("CREATE ROLE access_admin LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;");
    expect(rollback).toContain("DROP ROLE access_admin;");
    expect(rollback).toContain("IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'access_admin') THEN");
  });

  it("access_admin is created without SUPERUSER, BYPASSRLS, CREATEDB or CREATEROLE", () => {
    const line = migration.split(/\r?\n/).find((l) => l.includes("CREATE ROLE access_admin"))!;
    expect(line).toContain("NOSUPERUSER");
    expect(line).toContain("NOBYPASSRLS");
    expect(line).toContain("NOCREATEDB");
    expect(line).toContain("NOCREATEROLE");
  });
});
