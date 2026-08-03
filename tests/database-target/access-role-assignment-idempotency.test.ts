import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  closeTargetPrincipalClients,
  closeTargetPrismaClient,
} from "../../src/lib/database-target/client/targetPrismaClient";
import { grantAccessRole, revokeAccessRole } from "../../src/lib/database-target/repositories/accessRoleAssignmentRepository";
import {
  accessRoleDockerShouldRun,
  adminClient,
  createAccessFixture,
  dropAccessFixture,
  ownerClient,
  raw,
  readRepoFile,
  type AccessFixture,
} from "./accessRoleTestHelpers";

/**
 * tests/database-target/access-role-assignment-idempotency.test.ts
 *
 * A retried grant must resolve to the SAME row. Anything else creates a second,
 * overlapping authorization that a later revocation would appear to remove while
 * access silently continued — the worst possible failure mode for this table.
 *
 * The check is done FIRST inside `fn_grant_access_role`, before any validation,
 * so a retry cannot be rejected for a state that the first call itself created.
 */

describe("access role grant idempotency — declared contract", () => {
  const migration = readRepoFile("prisma", "target-migrations", "020_identity", "migration.sql");

  it("idempotency_key is UNIQUE at the physical level", () => {
    expect(migration).toContain("CONSTRAINT uq_access_role_assignments_idempotency UNIQUE (idempotency_key)");
  });

  it("the grant function resolves an existing key BEFORE validating anything else", () => {
    const body = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION security.fn_grant_access_role("),
      migration.indexOf("CREATE OR REPLACE FUNCTION security.fn_revoke_access_role(")
    );
    const idempotencyIndex = body.indexOf("WHERE idempotency_key = v_key");
    const subjectValidation = body.indexOf("ACCESS_SUBJECT_NOT_ACTIVE");
    expect(idempotencyIndex).toBeGreaterThan(-1);
    expect(subjectValidation).toBeGreaterThan(idempotencyIndex);
  });
});

describe.skipIf(!accessRoleDockerShouldRun)("access role grant idempotency — real PostgreSQL", () => {
  let fixture: AccessFixture;

  beforeAll(async () => {
    fixture = await createAccessFixture("Idempotency");
  }, 60_000);

  afterAll(async () => {
    if (fixture) await dropAccessFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("the same idempotency key returns the same assignment id and creates exactly one row", async () => {
    const admin = raw(await adminClient());
    const key = randomUUID();
    const first = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "RESTRICTED_ANALYST",
      idempotencyKey: key,
    });
    const second = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "RESTRICTED_ANALYST",
      idempotencyKey: key,
    });
    const third = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "RESTRICTED_ANALYST",
      idempotencyKey: key,
    });
    expect(second).toBe(first);
    expect(third).toBe(first);

    const rows = await raw(await ownerClient()).$queryRawUnsafe<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM security.access_role_assignments WHERE idempotency_key = $1::uuid`,
      key
    );
    expect(rows[0]!.n).toBe("1");
  });

  it("a retry writes NO second audit row — one authorization change, one audit entry", async () => {
    const admin = raw(await adminClient());
    const key = randomUUID();
    const id = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "PUBLIC_VIEWER",
      idempotencyKey: key,
    });
    await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "PUBLIC_VIEWER",
      idempotencyKey: key,
    });
    const rows = await raw(await ownerClient()).$queryRawUnsafe<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM security.audit_logs
        WHERE action = 'ACCESS_ROLE_GRANTED' AND target_id = $1::uuid`,
      id
    );
    expect(rows[0]!.n).toBe("1");
  });

  it("a retry after revocation still returns the same (revoked) row instead of re-granting", async () => {
    const admin = raw(await adminClient());
    const key = randomUUID();
    const id = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "SENSITIVE_HANDLER",
      idempotencyKey: key,
    });
    expect(await revokeAccessRole(admin, { assignmentId: id, revocationReasonCode: "ACCESS_REVIEW" })).toBe(true);

    const retried = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "SENSITIVE_HANDLER",
      idempotencyKey: key,
    });
    expect(retried).toBe(id);

    const rows = await raw(await ownerClient()).$queryRawUnsafe<{ status: string }>(
      `SELECT status FROM security.access_role_assignments WHERE id = $1::uuid`,
      id
    );
    // A retry is not a resurrection: the row stays REVOKED.
    expect(rows[0]!.status).toBe("REVOKED");
  });

  it("concurrent grants with the same key produce exactly one row", async () => {
    const admin = raw(await adminClient());
    const key = randomUUID();
    const settled = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        grantAccessRole(admin, {
          accessSubjectId: fixture.subjectBId,
          accessRoleCode: "AUDIT_READER",
          idempotencyKey: key,
        })
      )
    );
    const fulfilled = settled.filter((s) => s.status === "fulfilled") as PromiseFulfilledResult<string>[];
    expect(fulfilled.length).toBeGreaterThan(0);
    // Whatever the interleaving, the catalog must hold exactly one row for the key.
    const rows = await raw(await ownerClient()).$queryRawUnsafe<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM security.access_role_assignments WHERE idempotency_key = $1::uuid`,
      key
    );
    expect(rows[0]!.n).toBe("1");
    expect(new Set(fulfilled.map((f) => f.value)).size).toBe(1);
  }, 30_000);

  it("omitting the key generates a fresh one — two unkeyed grants of different roles are distinct rows", async () => {
    const admin = raw(await adminClient());
    const a = await grantAccessRole(admin, { accessSubjectId: fixture.subjectAId, accessRoleCode: "AUDIT" });
    const b = await grantAccessRole(admin, { accessSubjectId: fixture.subjectAId, accessRoleCode: "SECURITY" });
    expect(a).not.toBe(b);
  });
});
