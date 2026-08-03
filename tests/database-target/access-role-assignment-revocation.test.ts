import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  closeTargetPrincipalClients,
  closeTargetPrismaClient,
} from "../../src/lib/database-target/client/targetPrismaClient";
import {
  grantAccessRole,
  readActiveAccessRoles,
  revokeAccessRole,
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
 * tests/database-target/access-role-assignment-revocation.test.ts
 *
 * Revocation is a recorded decision, not a deletion: the row IS the history.
 * It must be idempotent, must record who/when/why with a controlled code, must
 * immediately stop authorizing, and must not be undoable by a direct UPDATE
 * from any role.
 */

async function activeRoleCodes(actorId: string): Promise<string[]> {
  const runtime = await runtimeClient();
  const transactional = runtime as unknown as { $transaction: <T>(fn: (tx: RawSqlClient) => Promise<T>) => Promise<T> };
  return transactional.$transaction(async (tx) => {
    await applyTargetSessionContext(tx, { actorId });
    return (await readActiveAccessRoles(tx, actorId)).map((row) => row.code);
  });
}

describe("assignment revocation — declared contract", () => {
  const migration = readRepoFile("prisma", "target-migrations", "020_identity", "migration.sql");

  it("revocation bookkeeping is enforced by CHECK, in both directions", () => {
    expect(migration).toContain("CONSTRAINT ck_access_role_assignments_revocation_consistency CHECK (");
    expect(migration).toMatch(/status = 'REVOKED' AND revoked_at IS NOT NULL AND revocation_reason_code IS NOT NULL/);
    expect(migration).toMatch(/status <> 'REVOKED' AND revoked_at IS NULL AND revoked_by_subject_id IS NULL/);
  });

  it("the revoke function requires a controlled reason code and locks the row", () => {
    const body = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION security.fn_revoke_access_role("),
      migration.indexOf("-- 8.3 Grants")
    );
    expect(body).toContain("ACCESS_ASSIGNMENT_INVALID_REASON_CODE");
    expect(body).toContain("^[A-Z][A-Z0-9_]{2,49}$");
    expect(body).toContain("FOR UPDATE OF a");
    // Never a DELETE.
    expect(body).not.toMatch(/\bDELETE\b/i);
  });
});

describe.skipIf(!accessRoleDockerShouldRun)("assignment revocation — real PostgreSQL", () => {
  let fixture: AccessFixture;

  beforeAll(async () => {
    fixture = await createAccessFixture("Revocation");
  }, 60_000);

  afterAll(async () => {
    if (fixture) await dropAccessFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("revoking stops authorization immediately and records who/when/why", async () => {
    const admin = raw(await adminClient());
    const id = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "ADMIN",
      grantedBySubjectId: fixture.subjectBId,
      idempotencyKey: randomUUID(),
    });
    expect(await activeRoleCodes(fixture.personAId)).toContain("ADMIN");

    expect(
      await revokeAccessRole(admin, {
        assignmentId: id,
        revocationReasonCode: "ROLE_WITHDRAWN",
        revokedBySubjectId: fixture.subjectBId,
      })
    ).toBe(true);

    expect(await activeRoleCodes(fixture.personAId)).not.toContain("ADMIN");

    const rows = await raw(await ownerClient()).$queryRawUnsafe<{
      status: string;
      revoked_at: Date | null;
      revoked_by_subject_id: string | null;
      revocation_reason_code: string | null;
    }>(
      `SELECT status, revoked_at, revoked_by_subject_id, revocation_reason_code
         FROM security.access_role_assignments WHERE id = $1::uuid`,
      id
    );
    expect(rows[0]!.status).toBe("REVOKED");
    expect(rows[0]!.revoked_at).not.toBeNull();
    expect(rows[0]!.revoked_by_subject_id).toBe(fixture.subjectBId);
    expect(rows[0]!.revocation_reason_code).toBe("ROLE_WITHDRAWN");
  });

  it("the row survives revocation — history is preserved, not deleted", async () => {
    const rows = await raw(await ownerClient()).$queryRawUnsafe<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM security.access_role_assignments
        WHERE access_subject_id = $1::uuid AND status = 'REVOKED'`,
      fixture.subjectAId
    );
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });

  it("a repeated revoke is success-with-no-change and writes no second audit row", async () => {
    const admin = raw(await adminClient());
    const id = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "AUDIT",
      idempotencyKey: randomUUID(),
    });
    expect(await revokeAccessRole(admin, { assignmentId: id, revocationReasonCode: "ACCESS_REVIEW" })).toBe(true);
    expect(await revokeAccessRole(admin, { assignmentId: id, revocationReasonCode: "ACCESS_REVIEW" })).toBe(false);

    const rows = await raw(await ownerClient()).$queryRawUnsafe<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM security.audit_logs WHERE action = 'ACCESS_ROLE_REVOKED' AND target_id = $1::uuid`,
      id
    );
    expect(rows[0]!.n).toBe("1");
  });

  it("a free-text reason is rejected", async () => {
    const admin = raw(await adminClient());
    const id = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "SECURITY",
      idempotencyKey: randomUUID(),
    });
    await expect(
      revokeAccessRole(admin, { assignmentId: id, revocationReasonCode: "because I felt like it" })
    ).rejects.toThrow(/ACCESS_ASSIGNMENT_INVALID_REASON_CODE/);
  });

  it("revoking an unknown assignment raises instead of silently succeeding", async () => {
    await expect(
      revokeAccessRole(raw(await adminClient()), {
        assignmentId: randomUUID(),
        revocationReasonCode: "ACCESS_REVIEW",
      })
    ).rejects.toThrow(/ACCESS_ASSIGNMENT_NOT_FOUND/);
  });

  it("revocation frees the scope so the same role can be granted again as a NEW row", async () => {
    const admin = raw(await adminClient());
    const first = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "RESTRICTED_ANALYST",
      idempotencyKey: randomUUID(),
    });
    await revokeAccessRole(admin, { assignmentId: first, revocationReasonCode: "ACCESS_REVIEW" });
    const second = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "RESTRICTED_ANALYST",
      idempotencyKey: randomUUID(),
    });
    expect(second).not.toBe(first);
    expect(await activeRoleCodes(fixture.personBId)).toContain("RESTRICTED_ANALYST");
  });

  it("no role can un-revoke by direct UPDATE — not the runtime, not the administrator", async () => {
    const admin = raw(await adminClient());
    const id = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "SENSITIVE_HANDLER",
      idempotencyKey: randomUUID(),
    });
    await revokeAccessRole(admin, { assignmentId: id, revocationReasonCode: "ACCESS_REVIEW" });

    await expect(
      admin.$executeRawUnsafe(
        `UPDATE security.access_role_assignments SET status = 'ACTIVE', revoked_at = NULL WHERE id = $1::uuid`,
        id
      )
    ).rejects.toThrow(/permission denied/i);
    await expect(
      raw(await runtimeClient()).$executeRawUnsafe(
        `UPDATE security.access_role_assignments SET status = 'ACTIVE' WHERE id = $1::uuid`,
        id
      )
    ).rejects.toThrow(/permission denied/i);
  });

  it("even the owner cannot leave an inconsistent revoked/active state", async () => {
    const owner = raw(await ownerClient());
    const admin = raw(await adminClient());
    const id = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "AUDIT_READER",
      idempotencyKey: randomUUID(),
    });
    await expect(
      owner.$executeRawUnsafe(
        `UPDATE security.access_role_assignments SET revoked_at = now() WHERE id = $1::uuid`,
        id
      )
    ).rejects.toThrow(/ck_access_role_assignments_revocation_consistency/);
    await expect(
      owner.$executeRawUnsafe(
        `UPDATE security.access_role_assignments SET status = 'REVOKED' WHERE id = $1::uuid`,
        id
      )
    ).rejects.toThrow(/ck_access_role_assignments_revocation_consistency/);
  });
});
