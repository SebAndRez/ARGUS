import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  closeTargetPrincipalClients,
  closeTargetPrismaClient,
} from "../../src/lib/database-target/client/targetPrismaClient";
import { registerAccessSubject } from "../../src/lib/database-target/repositories/accessRoleAssignmentRepository";
import {
  accessRoleDockerShouldRun,
  adminClient,
  createAccessFixture,
  dropAccessFixture,
  ownerClient,
  raw,
  readRepoFile,
  registerSubjectAsOwner,
  type AccessFixture,
} from "./accessRoleTestHelpers";

/**
 * tests/database-target/access-subject.test.ts
 *
 * `security.access_subjects` is the canonical identity authorization is granted
 * to. It must support the four real actor kinds, must always point at exactly
 * one existing identity, must never authorize when disabled, must never hold
 * ANONYMOUS, and must never duplicate personal data.
 */

describe("security.access_subjects — declared contract", () => {
  const migration = readRepoFile("prisma", "target-migrations", "020_identity", "migration.sql");
  const schema = readRepoFile("prisma", "schema.target.prisma");

  it("carries real foreign keys for person / organization / automation rule — not a polymorphic uuid", () => {
    expect(migration).toContain("FOREIGN KEY (person_id) REFERENCES identity.people(id)");
    expect(migration).toContain("FOREIGN KEY (organization_id) REFERENCES institution.organizations(id)");
    expect(migration).toContain("FOREIGN KEY (automation_rule_id) REFERENCES governance.automation_rules(id)");
  });

  it("uses a controlled system_key for machine identities instead of inventing a table", () => {
    expect(migration).toContain("system_key IS NULL OR system_key ~ '^[A-Z][A-Z0-9_]{2,99}$'");
    // No new machine-identity table was created anywhere.
    expect(migration).not.toMatch(/CREATE TABLE[^;]*system_identities/i);
  });

  it("stores no personal data at all", () => {
    const block = migration.slice(
      migration.indexOf("CREATE TABLE IF NOT EXISTS security.access_subjects ("),
      migration.indexOf("CREATE UNIQUE INDEX IF NOT EXISTS uq_access_subjects_active_person")
    );
    for (const forbidden of ["email", "legal_name", "display_alias", "phone", "national_id", "address", "birth"]) {
      expect(block.replace(/--.*$/gm, ""), `access_subjects must not carry ${forbidden}`).not.toMatch(
        new RegExp(`\\b${forbidden}\\b`, "i")
      );
    }
  });

  it("is declared in schema.target.prisma with the same FK relations", () => {
    const block = schema.slice(schema.indexOf("model AccessSubject {"), schema.indexOf("model AccessRoleAssignment {"));
    expect(block).toMatch(/person\s+Person\?\s+@relation/);
    expect(block).toMatch(/organization\s+Organization\?\s+@relation/);
    expect(block).toMatch(/automationRule\s+AutomationRule\?\s+@relation/);
    expect(block).toMatch(/status\s+AccessSubjectStatus/);
  });
});

describe.skipIf(!accessRoleDockerShouldRun)("security.access_subjects — real PostgreSQL", () => {
  let fixture: AccessFixture;

  beforeAll(async () => {
    fixture = await createAccessFixture("AccessSubject");
  }, 60_000);

  afterAll(async () => {
    if (fixture) await dropAccessFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("supports PERSON, ORGANIZATION, AUTOMATION_RULE and SYSTEM", async () => {
    const orgSubject = await registerSubjectAsOwner({ subjectType: "ORGANIZATION", organizationId: fixture.orgAId });
    expect(orgSubject).toBeTruthy();

    const ruleId = randomUUID();
    await raw(await ownerClient()).$executeRawUnsafe(
      `INSERT INTO governance.automation_rules (id, name, version, status) VALUES ($1::uuid, $2, 1, 'APPROVED')`,
      ruleId,
      `${fixture.tag} rule`
    );
    const ruleSubject = await registerSubjectAsOwner({ subjectType: "AUTOMATION_RULE", automationRuleId: ruleId });
    expect(ruleSubject).toBeTruthy();

    const rows = await raw(await ownerClient()).$queryRawUnsafe<{ subject_type: string }>(
      `SELECT subject_type FROM security.access_subjects WHERE id = ANY($1::uuid[]) ORDER BY subject_type`,
      [fixture.subjectAId, orgSubject, ruleSubject, fixture.systemSubjectId]
    );
    expect(rows.map((r) => r.subject_type).sort()).toEqual(["AUTOMATION_RULE", "ORGANIZATION", "PERSON", "SYSTEM"]);

    await raw(await ownerClient()).$executeRawUnsafe(
      `DELETE FROM security.access_subjects WHERE id = ANY($1::uuid[])`,
      [orgSubject, ruleSubject]
    );
    await raw(await ownerClient()).$executeRawUnsafe(`DELETE FROM governance.automation_rules WHERE id = $1::uuid`, ruleId);
  });

  it("ANONYMOUS can never be registered, and cannot be inserted directly either", async () => {
    await expect(registerSubjectAsOwner({ subjectType: "ANONYMOUS" })).rejects.toThrow(
      /ACCESS_SUBJECT_ANONYMOUS_FORBIDDEN/
    );
    await expect(
      raw(await ownerClient()).$executeRawUnsafe(
        `INSERT INTO security.access_subjects (subject_type, person_id) VALUES ('ANONYMOUS', $1::uuid)`,
        fixture.personAId
      )
    ).rejects.toThrow(/ck_access_subjects_no_anonymous/);
  });

  it("a dangling identity reference is rejected by the foreign key", async () => {
    await expect(registerSubjectAsOwner({ subjectType: "PERSON", personId: randomUUID() })).rejects.toThrow(
      /violates foreign key constraint/i
    );
  });

  it("registration is idempotent per identity — one ACTIVE subject, never two", async () => {
    const again = await registerAccessSubject(raw(await adminClient()), {
      subjectType: "PERSON",
      personId: fixture.personAId,
    });
    expect(again).toBe(fixture.subjectAId);

    const rows = await raw(await ownerClient()).$queryRawUnsafe<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM security.access_subjects WHERE person_id = $1::uuid AND status = 'ACTIVE'`,
      fixture.personAId
    );
    expect(rows[0]!.n).toBe("1");
  });

  it("a second ACTIVE subject for the same identity is physically impossible", async () => {
    await expect(
      raw(await ownerClient()).$executeRawUnsafe(
        `INSERT INTO security.access_subjects (subject_type, person_id, status) VALUES ('PERSON', $1::uuid, 'ACTIVE')`,
        fixture.personAId
      )
      // Prisma reports the violated KEY rather than the index name, so the
      // assertion matches the unique-violation SQLSTATE and the offending
      // column instead of a string the driver does not surface.
    ).rejects.toThrow(/23505[\s\S]*person_id/);
  });

  it("a DISABLED subject must record when it was disabled, and an ACTIVE one must not", async () => {
    const owner = raw(await ownerClient());
    await expect(
      owner.$executeRawUnsafe(
        `UPDATE security.access_subjects SET status = 'DISABLED' WHERE id = $1::uuid`,
        fixture.subjectBId
      )
    ).rejects.toThrow(/ck_access_subjects_disabled_consistency/);

    await owner.$executeRawUnsafe(
      `UPDATE security.access_subjects SET status = 'DISABLED', disabled_at = now(), disabled_reason_code = 'OFFBOARDED' WHERE id = $1::uuid`,
      fixture.subjectBId
    );
    // Disabling frees the identity for a new ACTIVE subject without deleting history.
    const replacement = await registerSubjectAsOwner({ subjectType: "PERSON", personId: fixture.personBId });
    expect(replacement).not.toBe(fixture.subjectBId);

    await owner.$executeRawUnsafe(`DELETE FROM security.access_subjects WHERE id = $1::uuid`, replacement);
    await owner.$executeRawUnsafe(
      `UPDATE security.access_subjects SET status = 'ACTIVE', disabled_at = NULL, disabled_reason_code = NULL WHERE id = $1::uuid`,
      fixture.subjectBId
    );
  });

  it("a free-text system key is rejected; a controlled one is accepted", async () => {
    await expect(registerSubjectAsOwner({ subjectType: "SYSTEM", systemKey: "not a key" })).rejects.toThrow(
      /ck_access_subjects_system_key_shape/
    );
    const ok = await registerSubjectAsOwner({ subjectType: "SYSTEM", systemKey: "ARGUS_SUBJECT_SHAPE_OK" });
    expect(ok).toBeTruthy();
    await raw(await ownerClient()).$executeRawUnsafe(`DELETE FROM security.access_subjects WHERE id = $1::uuid`, ok);
  });
});
