import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  closeTargetPrincipalClients,
  closeTargetPrismaClient,
} from "../../src/lib/database-target/client/targetPrismaClient";
import { grantAccessRole } from "../../src/lib/database-target/repositories/accessRoleAssignmentRepository";
import {
  accessRoleDockerShouldRun,
  adminClient,
  askClassificationAllowed,
  CLASSIFICATIONS,
  createAccessFixture,
  dropAccessFixture,
  ownerClient,
  raw,
  readRepoFile,
  type AccessFixture,
  type Classification,
} from "./accessRoleTestHelpers";

/**
 * tests/database-target/classification-with-persisted-role.test.ts
 *
 * `security.fn_classification_allowed` must resolve clearance from
 * session context -> access_subjects -> access_role_assignments -> access_roles
 * -> classification_ceiling, and from nothing else.
 *
 * Enum declaration order (PUBLIC < OPERATIONAL < SENSITIVE < RESTRICTED <
 * CRITICAL) IS the ceiling comparison, so there is no separate rank table to
 * drift. The five labels used here are the five that exist; the target schema
 * has no INTERNAL classification, so none is invented.
 */

describe("fn_classification_allowed — declared contract", () => {
  const policies = readRepoFile("prisma", "target-migrations", "010_foundation", "rls_policies.sql");

  it("does not read the session role GUC at all", () => {
    const body = policies.slice(
      policies.indexOf("CREATE OR REPLACE FUNCTION security.fn_classification_allowed("),
      policies.indexOf("CREATE OR REPLACE FUNCTION security.fn_has_emergency_access(")
    );
    expect(body).not.toContain("argus.actor_role");
  });

  it("resolves through fn_active_access_roles and compares against classification_ceiling", () => {
    const body = policies.slice(
      policies.indexOf("CREATE OR REPLACE FUNCTION security.fn_classification_allowed("),
      policies.indexOf("CREATE OR REPLACE FUNCTION security.fn_has_emergency_access(")
    );
    expect(body).toContain("security.fn_active_access_roles(p_actor_id)");
    expect(body).toContain("p_classification <= ar.classification_ceiling");
  });

  it("the resolver joins the real assignment and role tables, and requires an ACTIVE subject", () => {
    const body = policies.slice(
      policies.indexOf("CREATE OR REPLACE FUNCTION security.fn_active_access_roles("),
      policies.indexOf("-- Does this actor currently hold ANY of the named access roles?")
    );
    expect(body).toContain("FROM security.access_role_assignments a");
    expect(body).toContain("JOIN security.access_roles r ON r.id = a.access_role_id");
    expect(body).toContain("security.fn_resolve_access_subject(p_actor_id)");
    expect(body).toContain("AND r.status = 'ACTIVE'");
  });
});

describe.skipIf(!accessRoleDockerShouldRun)("fn_classification_allowed — real PostgreSQL", () => {
  let fixture: AccessFixture;

  beforeAll(async () => {
    fixture = await createAccessFixture("ClassPersisted");
    const admin = raw(await adminClient());
    // A: RESTRICTED ceiling. B: PUBLIC only.
    await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "RESTRICTED_ANALYST",
      idempotencyKey: randomUUID(),
    });
    await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "PUBLIC_VIEWER",
      idempotencyKey: randomUUID(),
    });
  }, 60_000);

  afterAll(async () => {
    if (fixture) await dropAccessFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it.each<[Classification, boolean]>([
    ["PUBLIC", true],
    ["OPERATIONAL", true],
    ["SENSITIVE", true],
    ["RESTRICTED", true],
    ["CRITICAL", false],
  ])("a RESTRICTED ceiling allows %s = %s", async (classification, expected) => {
    expect(await askClassificationAllowed({ actorId: fixture.personAId }, classification)).toBe(expected);
  });

  it.each<[Classification, boolean]>([
    ["PUBLIC", true],
    ["OPERATIONAL", false],
    ["SENSITIVE", false],
    ["RESTRICTED", false],
    ["CRITICAL", false],
  ])("a PUBLIC ceiling allows %s = %s", async (classification, expected) => {
    expect(await askClassificationAllowed({ actorId: fixture.personBId }, classification)).toBe(expected);
  });

  it("an actor with NO access_subject is denied every level, including PUBLIC", async () => {
    const unknown = randomUUID();
    for (const classification of CLASSIFICATIONS) {
      expect(await askClassificationAllowed({ actorId: unknown }, classification)).toBe(false);
    }
  });

  it("a subject with NO assignment is denied every level", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `DELETE FROM security.access_role_assignments WHERE access_subject_id = $1::uuid`,
      fixture.subjectBId
    );
    for (const classification of CLASSIFICATIONS) {
      expect(await askClassificationAllowed({ actorId: fixture.personBId }, classification)).toBe(false);
    }
    // Restore for any later case.
    await grantAccessRole(raw(await adminClient()), {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "PUBLIC_VIEWER",
      idempotencyKey: randomUUID(),
    });
  });

  it("a DISABLED subject is denied even though its assignment is still ACTIVE", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE security.access_subjects SET status = 'DISABLED', disabled_at = now(), disabled_reason_code = 'TEST' WHERE id = $1::uuid`,
      fixture.subjectAId
    );
    try {
      expect(await askClassificationAllowed({ actorId: fixture.personAId }, "PUBLIC")).toBe(false);
      expect(await askClassificationAllowed({ actorId: fixture.personAId }, "RESTRICTED")).toBe(false);
    } finally {
      await owner.$executeRawUnsafe(
        `UPDATE security.access_subjects SET status = 'ACTIVE', disabled_at = NULL, disabled_reason_code = NULL WHERE id = $1::uuid`,
        fixture.subjectAId
      );
    }
    expect(await askClassificationAllowed({ actorId: fixture.personAId }, "RESTRICTED")).toBe(true);
  });

  it("a NULL classification is denied rather than defaulted", async () => {
    const rows = await raw(await ownerClient()).$queryRawUnsafe<{ allowed: boolean }>(
      `SELECT security.fn_classification_allowed($1::uuid, NULL) AS allowed`,
      fixture.personAId
    );
    expect(Boolean(rows[0]!.allowed)).toBe(false);
  });

  it("the highest ceiling among several assignments wins, and no higher", async () => {
    await grantAccessRole(raw(await adminClient()), {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "PUBLIC_VIEWER",
      idempotencyKey: randomUUID(),
    });
    expect(await askClassificationAllowed({ actorId: fixture.personAId }, "RESTRICTED")).toBe(true);
    expect(await askClassificationAllowed({ actorId: fixture.personAId }, "CRITICAL")).toBe(false);
  });

  it("a machine identity authorizes through its own subject, not through a special case", async () => {
    await grantAccessRole(raw(await adminClient()), {
      accessSubjectId: fixture.systemSubjectId,
      accessRoleCode: "SYSTEM",
      idempotencyKey: randomUUID(),
    });
    // For a SYSTEM subject the subject's own id is its actor id.
    expect(await askClassificationAllowed({ actorId: fixture.systemSubjectId }, "CRITICAL")).toBe(true);
  });
});
