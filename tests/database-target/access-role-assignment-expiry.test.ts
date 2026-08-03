import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  closeTargetPrincipalClients,
  closeTargetPrismaClient,
} from "../../src/lib/database-target/client/targetPrismaClient";
import {
  grantAccessRole,
  readActiveAccessRoles,
} from "../../src/lib/database-target/repositories/accessRoleAssignmentRepository";
import { applyTargetSessionContext } from "../../src/lib/database-target/session/targetSessionContext";
import {
  accessRoleDockerShouldRun,
  adminClient,
  createAccessFixture,
  dropAccessFixture,
  ownerClient,
  raw,
  readRepoFile,
  runtimeClient,
  type AccessFixture,
} from "./accessRoleTestHelpers";
import type { RawSqlClient } from "../../src/lib/database-target/repositories/incidentPromotionRepository";

/**
 * tests/database-target/access-role-assignment-expiry.test.ts
 *
 * Validity is evaluated against now(), never against a stored "EXPIRED" status.
 * That is deliberate: a status would be a second source of truth that a missed
 * sweep job could leave stale — an "ACTIVE" row past its valid_until still
 * authorizing. Here the window IS the authority.
 */

async function activeRoleCodes(fixture: AccessFixture, actorId: string): Promise<string[]> {
  const runtime = await runtimeClient();
  const transactional = runtime as unknown as { $transaction: <T>(fn: (tx: RawSqlClient) => Promise<T>) => Promise<T> };
  return transactional.$transaction(async (tx) => {
    await applyTargetSessionContext(tx, { actorId });
    return (await readActiveAccessRoles(tx, actorId)).map((row) => row.code);
  });
}

describe("assignment expiry — declared contract", () => {
  const migration = readRepoFile("prisma", "target-migrations", "010_foundation", "migration.sql");
  const policies = readRepoFile("prisma", "target-migrations", "010_foundation", "rls_policies.sql");

  it("the status enum deliberately has no EXPIRED member", () => {
    const block = migration.slice(
      migration.indexOf("CREATE TYPE security.access_role_assignment_status_enum"),
      migration.indexOf("CREATE TYPE security.access_purpose_enum")
    );
    expect(block).toContain("('ACTIVE','SUSPENDED','REVOKED')");
    expect(block).not.toContain("EXPIRED'");
  });

  it("the resolver compares valid_from/valid_until against now()", () => {
    expect(policies).toContain("AND a.valid_from <= now()");
    expect(policies).toContain("AND (a.valid_until IS NULL OR a.valid_until > now())");
  });
});

describe.skipIf(!accessRoleDockerShouldRun)("assignment expiry — real PostgreSQL", () => {
  let fixture: AccessFixture;

  beforeAll(async () => {
    fixture = await createAccessFixture("Expiry");
  }, 60_000);

  afterAll(async () => {
    if (fixture) await dropAccessFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("an open-ended ACTIVE grant authorizes", async () => {
    await grantAccessRole(raw(await adminClient()), {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "RESTRICTED_ANALYST",
      idempotencyKey: randomUUID(),
    });
    expect(await activeRoleCodes(fixture, fixture.personAId)).toContain("RESTRICTED_ANALYST");
  });

  it("an ALREADY-EXPIRED grant does not authorize, even though its status is still ACTIVE", async () => {
    const id = await grantAccessRole(raw(await adminClient()), {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "ADMIN",
      validFrom: new Date(Date.now() - 10 * 86_400_000),
      validUntil: new Date(Date.now() - 86_400_000),
      idempotencyKey: randomUUID(),
    });
    const stored = await raw(await ownerClient()).$queryRawUnsafe<{ status: string }>(
      `SELECT status FROM security.access_role_assignments WHERE id = $1::uuid`,
      id
    );
    // The row is untouched by any sweep — expiry is computed, not stored.
    expect(stored[0]!.status).toBe("ACTIVE");
    expect(await activeRoleCodes(fixture, fixture.personAId)).not.toContain("ADMIN");
  });

  it("a NOT-YET-VALID grant does not authorize", async () => {
    await grantAccessRole(raw(await adminClient()), {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "SECURITY",
      validFrom: new Date(Date.now() + 10 * 86_400_000),
      idempotencyKey: randomUUID(),
    });
    expect(await activeRoleCodes(fixture, fixture.personAId)).not.toContain("SECURITY");
  });

  it("a grant that expires DURING the test stops authorizing without any status change", async () => {
    const admin = raw(await adminClient());
    const validUntil = new Date(Date.now() + 1_200);
    const id = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "SENSITIVE_HANDLER",
      validUntil,
      idempotencyKey: randomUUID(),
    });
    expect(await activeRoleCodes(fixture, fixture.personBId)).toContain("SENSITIVE_HANDLER");

    await new Promise((resolve) => setTimeout(resolve, 1_600));

    expect(await activeRoleCodes(fixture, fixture.personBId)).not.toContain("SENSITIVE_HANDLER");
    const stored = await raw(await ownerClient()).$queryRawUnsafe<{ status: string }>(
      `SELECT status FROM security.access_role_assignments WHERE id = $1::uuid`,
      id
    );
    expect(stored[0]!.status).toBe("ACTIVE");
  }, 30_000);

  it("a SUSPENDED grant does not authorize either", async () => {
    const admin = raw(await adminClient());
    const id = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "AUDIT_READER",
      idempotencyKey: randomUUID(),
    });
    expect(await activeRoleCodes(fixture, fixture.personBId)).toContain("AUDIT_READER");

    await raw(await ownerClient()).$executeRawUnsafe(
      `UPDATE security.access_role_assignments SET status = 'SUSPENDED' WHERE id = $1::uuid`,
      id
    );
    expect(await activeRoleCodes(fixture, fixture.personBId)).not.toContain("AUDIT_READER");
  });

  it("a grant of a role that becomes DEPRECATED stops authorizing", async () => {
    const owner = raw(await ownerClient());
    const roleCode = `EXPIRY_TEST_ROLE_${Date.now()}`;
    await owner.$executeRawUnsafe(
      `INSERT INTO security.access_roles (code, version, status, classification_ceiling) VALUES ($1, 1, 'ACTIVE', 'CRITICAL')`,
      roleCode
    );
    await grantAccessRole(raw(await adminClient()), {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: roleCode,
      idempotencyKey: randomUUID(),
    });
    expect(await activeRoleCodes(fixture, fixture.personAId)).toContain(roleCode);

    await owner.$executeRawUnsafe(`UPDATE security.access_roles SET status = 'DEPRECATED' WHERE code = $1`, roleCode);
    expect(await activeRoleCodes(fixture, fixture.personAId)).not.toContain(roleCode);

    await owner.$executeRawUnsafe(
      `DELETE FROM security.access_role_assignments WHERE access_role_id = (SELECT id FROM security.access_roles WHERE code = $1)`,
      roleCode
    );
    await owner.$executeRawUnsafe(`DELETE FROM security.access_roles WHERE code = $1`, roleCode);
  });
});
