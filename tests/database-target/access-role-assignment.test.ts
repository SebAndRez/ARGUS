import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  closeTargetPrincipalClients,
  closeTargetPrismaClient,
} from "../../src/lib/database-target/client/targetPrismaClient";
import {
  grantAccessRole,
  readAssignmentsForSubject,
} from "../../src/lib/database-target/repositories/accessRoleAssignmentRepository";
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
 * tests/database-target/access-role-assignment.test.ts
 *
 * The core contract of a GRANT: it references a real role definition (never a
 * free-text name), records who granted it and when, carries a coherent validity
 * window, and cannot silently overlap another active grant of the same role in
 * the same scope for the same purpose.
 */

describe("security.access_role_assignments — declared contract", () => {
  const migration = readRepoFile("prisma", "target-migrations", "020_identity", "migration.sql");

  it("references security.access_roles by FK, and has no free-text role column", () => {
    expect(migration).toContain("FOREIGN KEY (access_role_id) REFERENCES security.access_roles(id)");
    const block = migration.slice(
      migration.indexOf("CREATE TABLE IF NOT EXISTS security.access_role_assignments ("),
      migration.indexOf("-- Two ACTIVE grants of the SAME role")
    );
    expect(block).not.toMatch(/^\s*role(_name|_code)?\s+(varchar|text)/im);
  });

  it("declares every column the design requires", () => {
    const block = migration.slice(
      migration.indexOf("CREATE TABLE IF NOT EXISTS security.access_role_assignments ("),
      migration.indexOf("-- Two ACTIVE grants of the SAME role")
    );
    for (const column of [
      "access_subject_id",
      "access_role_id",
      "institution_id",
      "purpose",
      "status",
      "valid_from",
      "valid_until",
      "granted_by_subject_id",
      "granted_at",
      "revoked_by_subject_id",
      "revoked_at",
      "revocation_reason_code",
      "source",
      "legacy_source",
      "legacy_record_id",
      "idempotency_key",
      "created_at",
      "updated_at",
    ]) {
      expect(block, `missing column ${column}`).toMatch(new RegExp(`^\\s*${column}\\s`, "m"));
    }
  });

  it("does NOT introduce a jurisdiction column while R31 stays unmodelled", () => {
    const block = migration.slice(
      migration.indexOf("CREATE TABLE IF NOT EXISTS security.access_role_assignments ("),
      migration.indexOf("-- Two ACTIVE grants of the SAME role")
    );
    expect(block.replace(/--.*$/gm, "")).not.toMatch(/jurisdiction/i);
  });

  it("prevents silent overlap with two partial unique indexes (one for scoped, one for global grants)", () => {
    expect(migration).toContain("uq_access_role_assignments_active_scoped");
    expect(migration).toContain("uq_access_role_assignments_active_global");
    expect(migration).toMatch(/WHERE status = 'ACTIVE' AND institution_id IS NOT NULL/);
    expect(migration).toMatch(/WHERE status = 'ACTIVE' AND institution_id IS NULL/);
  });
});

describe.skipIf(!accessRoleDockerShouldRun)("security.access_role_assignments — real PostgreSQL", () => {
  let fixture: AccessFixture;

  beforeAll(async () => {
    fixture = await createAccessFixture("Assignment");
  }, 60_000);

  afterAll(async () => {
    if (fixture) await dropAccessFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("grants a role and records subject, role code, scope, purpose and grantor", async () => {
    const admin = raw(await adminClient());
    const id = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "RESTRICTED_ANALYST",
      institutionId: fixture.orgAId,
      purpose: "OPERATIONAL_RESPONSE",
      grantedBySubjectId: fixture.subjectBId,
      source: "TEST_FIXTURE",
      idempotencyKey: randomUUID(),
    });

    const rows = await readAssignmentsForSubject(raw(await ownerClient()), fixture.subjectAId);
    const created = rows.find((row) => row.id === id)!;
    expect(created.accessRoleCode).toBe("RESTRICTED_ANALYST");
    expect(created.institutionId).toBe(fixture.orgAId);
    expect(created.purpose).toBe("OPERATIONAL_RESPONSE");
    expect(created.status).toBe("ACTIVE");
    expect(created.revokedAt).toBeNull();
  });

  it("rejects an unknown role code instead of creating a dangling grant", async () => {
    await expect(
      grantAccessRole(raw(await adminClient()), {
        accessSubjectId: fixture.subjectAId,
        accessRoleCode: "NO_SUCH_ROLE",
        idempotencyKey: randomUUID(),
      })
    ).rejects.toThrow(/ACCESS_ROLE_NOT_ACTIVE/);
  });

  it("rejects a grant to a disabled subject", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE security.access_subjects SET status = 'DISABLED', disabled_at = now(), disabled_reason_code = 'TEST' WHERE id = $1::uuid`,
      fixture.subjectBId
    );
    try {
      await expect(
        grantAccessRole(raw(await adminClient()), {
          accessSubjectId: fixture.subjectBId,
          accessRoleCode: "PUBLIC_VIEWER",
          idempotencyKey: randomUUID(),
        })
      ).rejects.toThrow(/ACCESS_SUBJECT_NOT_ACTIVE/);
    } finally {
      await owner.$executeRawUnsafe(
        `UPDATE security.access_subjects SET status = 'ACTIVE', disabled_at = NULL, disabled_reason_code = NULL WHERE id = $1::uuid`,
        fixture.subjectBId
      );
    }
  });

  it("rejects an inverted validity window", async () => {
    await expect(
      grantAccessRole(raw(await adminClient()), {
        accessSubjectId: fixture.subjectAId,
        accessRoleCode: "PUBLIC_VIEWER",
        validFrom: new Date("2030-01-02T00:00:00Z"),
        validUntil: new Date("2030-01-01T00:00:00Z"),
        idempotencyKey: randomUUID(),
      })
    ).rejects.toThrow(/ACCESS_ASSIGNMENT_INVALID_WINDOW/);
  });

  it("rejects a second ACTIVE grant of the same role in the same scope for the same purpose", async () => {
    const admin = raw(await adminClient());
    await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "PUBLIC_VIEWER",
      idempotencyKey: randomUUID(),
    });
    await expect(
      grantAccessRole(admin, {
        accessSubjectId: fixture.subjectBId,
        accessRoleCode: "PUBLIC_VIEWER",
        idempotencyKey: randomUUID(),
      })
      // Prisma reports the violated KEY, not the index name — so the assertion
      // pins the unique-violation SQLSTATE and the exact key tuple the GLOBAL
      // partial index covers (subject, role, purpose — no institution).
    ).rejects.toThrow(/23505[\s\S]*access_subject_id, access_role_id, purpose/);
  });

  it("allows the same role in DIFFERENT scopes or for DIFFERENT purposes", async () => {
    const admin = raw(await adminClient());
    const scoped = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "PUBLIC_VIEWER",
      institutionId: fixture.orgBId,
      idempotencyKey: randomUUID(),
    });
    const purposed = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "PUBLIC_VIEWER",
      purpose: "AUDIT_REVIEW",
      idempotencyKey: randomUUID(),
    });
    expect(scoped).not.toBe(purposed);
  });

  it("rejects a self-grant", async () => {
    await expect(
      raw(await ownerClient()).$executeRawUnsafe(
        `INSERT INTO security.access_role_assignments (access_subject_id, access_role_id, granted_by_subject_id)
         SELECT $1::uuid, r.id, $1::uuid FROM security.access_roles r WHERE r.code = 'ADMIN' AND r.status = 'ACTIVE' LIMIT 1`,
        fixture.subjectAId
      )
    ).rejects.toThrow(/ck_access_role_assignments_no_self_grant/);
  });

  it("rejects a free-text source", async () => {
    await expect(
      grantAccessRole(raw(await adminClient()), {
        accessSubjectId: fixture.subjectAId,
        accessRoleCode: "PUBLIC_VIEWER",
        source: "typed by hand",
        idempotencyKey: randomUUID(),
      })
    ).rejects.toThrow(/ck_access_role_assignments_source_shape/);
  });

  it("writes an audit row for every grant, with no PII", async () => {
    const admin = raw(await adminClient());
    const id = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "AUDIT_READER",
      idempotencyKey: randomUUID(),
    });
    const rows = await raw(await ownerClient()).$queryRawUnsafe<{ action: string; context: string }>(
      `SELECT action, context::text AS context FROM security.audit_logs
        WHERE target_table = 'security.access_role_assignments' AND target_id = $1::uuid`,
      id
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe("ACCESS_ROLE_GRANTED");
    expect(rows[0]!.context).toContain("access_role_code");
    expect(rows[0]!.context).not.toMatch(/@|legal_name|email|phone/i);
  });
});
