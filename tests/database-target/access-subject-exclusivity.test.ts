import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeTargetPrincipalClients,
  closeTargetPrismaClient,
} from "../../src/lib/database-target/client/targetPrismaClient";
import {
  accessRoleDockerShouldRun,
  createAccessFixture,
  dropAccessFixture,
  ownerClient,
  raw,
  readRepoFile,
  type AccessFixture,
} from "./accessRoleTestHelpers";

/**
 * tests/database-target/access-subject-exclusivity.test.ts
 *
 * "Each subject points at exactly one real identity" is the invariant that makes
 * `fn_resolve_access_subject` unambiguous. If a row could carry two references,
 * or none, or a reference that contradicts its declared type, then "which
 * subject is this actor?" would have more than one answer — and the wrong answer
 * is somebody else's clearance.
 *
 * Enforced by CHECK constraints, so it holds for every writer including a direct
 * INSERT by the table owner, not only for the registration function.
 */

describe("access_subjects exclusivity — declared constraints", () => {
  const migration = readRepoFile("prisma", "target-migrations", "020_identity", "migration.sql");

  it("counts the populated references and requires exactly one", () => {
    expect(migration).toContain("CONSTRAINT ck_access_subjects_exactly_one_identity CHECK (");
    expect(migration).toMatch(/CASE WHEN person_id\s+IS NOT NULL THEN 1 ELSE 0 END/);
    expect(migration).toMatch(/=\s*1\s*\n?\s*\)/);
  });

  it("requires the populated reference to match the declared subject_type", () => {
    expect(migration).toContain("CONSTRAINT ck_access_subjects_type_matches_identity CHECK (");
    expect(migration).toMatch(/subject_type = 'PERSON'\s+AND person_id\s+IS NOT NULL/);
    expect(migration).toMatch(/subject_type = 'SYSTEM'\s+AND system_key\s+IS NOT NULL/);
  });
});

describe.skipIf(!accessRoleDockerShouldRun)("access_subjects exclusivity — real PostgreSQL", () => {
  let fixture: AccessFixture;

  beforeAll(async () => {
    fixture = await createAccessFixture("SubjectExclusivity");
  }, 60_000);

  afterAll(async () => {
    if (fixture) await dropAccessFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("zero identity references is rejected", async () => {
    await expect(
      raw(await ownerClient()).$executeRawUnsafe(
        `INSERT INTO security.access_subjects (subject_type) VALUES ('PERSON')`
      )
    ).rejects.toThrow(/ck_access_subjects_exactly_one_identity/);
  });

  it.each([
    ["person + organization", `person_id, organization_id`, `$1::uuid, $2::uuid`],
    ["person + system_key", `person_id, system_key`, `$1::uuid, 'ARGUS_TWO_REFS'`],
  ])("two identity references (%s) is rejected", async (_label, columns, values) => {
    await expect(
      raw(await ownerClient()).$executeRawUnsafe(
        `INSERT INTO security.access_subjects (subject_type, ${columns}) VALUES ('PERSON', ${values})`,
        fixture.personAId,
        fixture.orgAId
      )
    ).rejects.toThrow(/ck_access_subjects_exactly_one_identity/);
  });

  it("all four references at once is rejected", async () => {
    await expect(
      raw(await ownerClient()).$executeRawUnsafe(
        `INSERT INTO security.access_subjects (subject_type, person_id, organization_id, automation_rule_id, system_key)
         VALUES ('PERSON', $1::uuid, $2::uuid, NULL, 'ARGUS_ALL_REFS')`,
        fixture.personAId,
        fixture.orgAId
      )
    ).rejects.toThrow(/ck_access_subjects_exactly_one_identity/);
  });

  it.each([
    ["PERSON pointing at an organization", "PERSON", "organization_id"],
    ["ORGANIZATION pointing at a person", "ORGANIZATION", "person_id"],
    ["SYSTEM pointing at a person", "SYSTEM", "person_id"],
  ])("a type/reference mismatch (%s) is rejected", async (_label, subjectType, column) => {
    const value = column === "organization_id" ? fixture.orgBId : fixture.personBId;
    await expect(
      raw(await ownerClient()).$executeRawUnsafe(
        `INSERT INTO security.access_subjects (subject_type, ${column}) VALUES ($1::security.actor_type_enum, $2::uuid)`,
        subjectType,
        value
      )
    ).rejects.toThrow(/ck_access_subjects_type_matches_identity/);
  });

  it("a valid single reference of each supported type is accepted", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ id: string }>(
      `INSERT INTO security.access_subjects (subject_type, organization_id) VALUES ('ORGANIZATION', $1::uuid) RETURNING id`,
      fixture.orgBId
    );
    expect(rows).toHaveLength(1);
    await owner.$executeRawUnsafe(`DELETE FROM security.access_subjects WHERE id = $1::uuid`, rows[0]!.id);
  });

  it("exclusivity survives an UPDATE, not only an INSERT", async () => {
    await expect(
      raw(await ownerClient()).$executeRawUnsafe(
        `UPDATE security.access_subjects SET organization_id = $2::uuid WHERE id = $1::uuid`,
        fixture.subjectAId,
        fixture.orgAId
      )
    ).rejects.toThrow(/ck_access_subjects_exactly_one_identity/);
  });
});
