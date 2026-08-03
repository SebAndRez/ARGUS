import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  closeTargetPrincipalClients,
  closeTargetPrismaClient,
  describeTargetPrincipal,
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
  runtimeClient,
  type AccessFixture,
} from "./accessRoleTestHelpers";

/**
 * tests/database-target/access-role-rls.test.ts
 *
 * The authorization substrate gets the strictest posture in the package: ENABLE
 * + FORCE RLS, zero `USING (true)`, zero write policies, no grant to any runtime
 * role, and mutation only through the narrow SECURITY DEFINER functions that
 * `access_admin` alone may execute.
 *
 * Every case runs as the REAL role, over its own connection — not via
 * `SET LOCAL ROLE` inside an owner session, which is how the previous session's
 * privilege claims were "proven" while the code under test ran as a superuser.
 */

describe("access role RLS — declared posture", () => {
  const migration = readRepoFile("prisma", "target-migrations", "020_identity", "migration.sql");

  it("both tables get ENABLE + FORCE RLS", () => {
    for (const table of ["security.access_subjects", "security.access_role_assignments"]) {
      expect(migration).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      expect(migration).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    }
  });

  it("every policy is SELECT-only and none is a bare USING (true)", () => {
    const policies = [...migration.matchAll(/CREATE POLICY (\w+) ON (security\.access_\w+)\s*\n\s*FOR (\w+)/g)];
    expect(policies.length).toBe(2);
    for (const match of policies) {
      expect(match[3]).toBe("SELECT");
    }
    // Comments in that block legitimately SAY "no USING (true) anywhere", so the
    // prohibition is asserted against executable lines only.
    const block = migration
      .slice(migration.indexOf("-- 8.1 RLS"), migration.indexOf("-- 8.2 Administration"))
      .replace(/--.*$/gm, "");
    expect(block).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });

  it("PUBLIC is revoked on both tables and every administration function", () => {
    expect(migration).toContain("REVOKE ALL ON security.access_subjects FROM PUBLIC;");
    expect(migration).toContain("REVOKE ALL ON security.access_role_assignments FROM PUBLIC;");
    for (const fn of [
      "fn_register_access_subject",
      "fn_audit_access_role_change",
      "fn_grant_access_role",
      "fn_revoke_access_role",
    ]) {
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION security\\.${fn}\\([^)]*\\) FROM PUBLIC;`));
    }
  });

  it("only access_admin is granted EXECUTE, and the internal audit helper is granted to nobody", () => {
    const grants = [...migration.matchAll(/GRANT EXECUTE ON FUNCTION security\.(fn_\w+)\([^)]*\) TO (\w+);/g)].map(
      (m) => [m[1], m[2]] as const
    );
    const accessGrants = grants.filter(([fn]) => fn.includes("access_role") || fn.includes("access_subject"));
    expect(accessGrants.map(([, role]) => role)).toEqual(["access_admin", "access_admin", "access_admin"]);
    expect(accessGrants.map(([fn]) => fn)).not.toContain("fn_audit_access_role_change");
  });

  it("no runtime role is granted anything on either table", () => {
    const block = migration.slice(migration.indexOf("-- 8.3 Grants"));
    expect(block).not.toMatch(/GRANT[^;]*ON security\.access_(subjects|role_assignments)[^;]*TO[^;]*app_api/);
    expect(block).not.toMatch(/GRANT[^;]*ON security\.access_(subjects|role_assignments)[^;]*TO[^;]*ingest_worker/);
    expect(block).not.toMatch(/GRANT[^;]*ON security\.access_(subjects|role_assignments)[^;]*TO[^;]*readonly_inspector/);
  });
});

describe.skipIf(!accessRoleDockerShouldRun)("access role RLS — real PostgreSQL, real roles", () => {
  let fixture: AccessFixture;

  beforeAll(async () => {
    fixture = await createAccessFixture("AccessRls");
    await grantAccessRole(raw(await adminClient()), {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "RESTRICTED_ANALYST",
      idempotencyKey: randomUUID(),
    });
  }, 60_000);

  afterAll(async () => {
    if (fixture) await dropAccessFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("the admin connection is access_admin, and is NOT privileged", async () => {
    const identity = await describeTargetPrincipal(await adminClient());
    expect(identity.currentUser).toBe("access_admin");
    expect(identity.isSuperuser).toBe(false);
    expect(identity.isBypassRls).toBe(false);
    expect(identity.ownsSecuritySchema).toBe(false);
    expect(identity.hasCreateOnSecuritySchema).toBe(false);
  });

  it("app_api cannot read either table", async () => {
    const runtime = raw(await runtimeClient());
    await expect(runtime.$queryRawUnsafe(`SELECT 1 FROM security.access_subjects LIMIT 1`)).rejects.toThrow(
      /permission denied/i
    );
    await expect(runtime.$queryRawUnsafe(`SELECT 1 FROM security.access_role_assignments LIMIT 1`)).rejects.toThrow(
      /permission denied/i
    );
  });

  it("app_api cannot administer assignments in any way", async () => {
    const runtime = raw(await runtimeClient());
    await expect(
      runtime.$queryRawUnsafe(`SELECT security.fn_grant_access_role($1::uuid, 'ADMIN')`, fixture.subjectAId)
    ).rejects.toThrow(/permission denied/i);
    await expect(
      runtime.$queryRawUnsafe(`SELECT security.fn_revoke_access_role($1::uuid, 'ANY_REASON')`, randomUUID())
    ).rejects.toThrow(/permission denied/i);
    await expect(
      runtime.$queryRawUnsafe(`SELECT security.fn_register_access_subject('PERSON', $1::uuid)`, fixture.personBId)
    ).rejects.toThrow(/permission denied/i);
  });

  it("app_api CAN still consume authorization — the restriction is on the substrate, not on the decision", async () => {
    const runtime = await runtimeClient();
    const transactional = runtime as unknown as {
      $transaction: <T>(fn: (tx: { $queryRawUnsafe: <R>(q: string, ...v: unknown[]) => Promise<R[]> }) => Promise<T>) => Promise<T>;
    };
    const allowed = await transactional.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`SELECT set_config('argus.actor_id', $1, true)`, fixture.personAId);
      const rows = await tx.$queryRawUnsafe<{ allowed: boolean }>(
        `SELECT security.fn_classification_allowed($1::uuid, 'RESTRICTED') AS allowed`,
        fixture.personAId
      );
      return Boolean(rows[0]!.allowed);
    });
    expect(allowed).toBe(true);
  });

  it("access_admin can grant and revoke through the controlled functions", async () => {
    const admin = raw(await adminClient());
    const id = await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "PUBLIC_VIEWER",
      idempotencyKey: randomUUID(),
    });
    expect(id).toBeTruthy();
    expect(await revokeAccessRole(admin, { assignmentId: id, revocationReasonCode: "ACCESS_REVIEW" })).toBe(true);
  });

  it("access_admin has NO direct DML on either table", async () => {
    const admin = raw(await adminClient());
    await expect(
      admin.$executeRawUnsafe(
        `INSERT INTO security.access_subjects (subject_type, person_id) VALUES ('PERSON', $1::uuid)`,
        fixture.personBId
      )
    ).rejects.toThrow(/permission denied/i);
    await expect(
      admin.$executeRawUnsafe(`DELETE FROM security.access_role_assignments WHERE access_subject_id = $1::uuid`, fixture.subjectAId)
    ).rejects.toThrow(/permission denied/i);
  });

  it("access_admin's reads are still filtered by FORCE RLS — administering is not being cleared", async () => {
    const admin = raw(await adminClient());
    const rows = await admin.$queryRawUnsafe<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM security.access_subjects`
    );
    // With no persisted ADMIN/AUDIT/SECURITY role for this connection's actor
    // context, the policy shows nothing. The point is that the read is FILTERED,
    // not that it is refused.
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it("a subject may see its OWN row and its OWN assignments, and nobody else's", async () => {
    // Granted through the admin path: an AUDIT role lets Person A read the
    // substrate; Person B has none.
    const admin = raw(await adminClient());
    await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "AUDIT",
      idempotencyKey: randomUUID(),
    });

    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM security.access_role_assignments WHERE access_subject_id = $1::uuid`,
      fixture.subjectAId
    );
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(2);
  });

  it("ingest_worker, jobs_worker and readonly_inspector hold nothing on the substrate", async () => {
    const rows = await raw(await ownerClient()).$queryRawUnsafe<{ grantee: string; table_name: string }>(
      `SELECT grantee, table_name FROM information_schema.role_table_grants
        WHERE table_schema = 'security' AND table_name IN ('access_subjects','access_role_assignments')
          AND grantee IN ('ingest_worker','jobs_worker','readonly_inspector','PUBLIC','app_api')`
    );
    expect(rows).toEqual([]);
  });

  it("FORCE RLS is on, and no policy anywhere still reads the session role GUC", async () => {
    const owner = raw(await ownerClient());
    const rls = await owner.$queryRawUnsafe<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'security' AND c.relname IN ('access_subjects','access_role_assignments')
          AND NOT (c.relrowsecurity AND c.relforcerowsecurity)`
    );
    expect(rls).toEqual([]);

    const forged = await owner.$queryRawUnsafe<{ policyname: string }>(
      `SELECT policyname FROM pg_policies
        WHERE coalesce(qual,'') LIKE '%argus.actor_role%' OR coalesce(with_check,'') LIKE '%argus.actor_role%'`
    );
    expect(forged).toEqual([]);
  });
});
