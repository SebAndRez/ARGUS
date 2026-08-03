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
  createAccessFixture,
  dropAccessFixture,
  raw,
  readRepoFile,
  type AccessFixture,
} from "./accessRoleTestHelpers";

/**
 * tests/database-target/classification-institution-scope.test.ts
 *
 * An institution-scoped grant authorizes ONLY while the session declares it is
 * acting inside that institution. A NULL institution_id is a global grant.
 *
 * The failure mode being prevented is a scoped grant that quietly behaves as
 * global whenever the session forgets to declare a scope — which is what a
 * `institution_id = coalesce(guc, institution_id)`-style comparison would do.
 */

describe("institution scope — declared contract", () => {
  const policies = readRepoFile("prisma", "target-migrations", "010_foundation", "rls_policies.sql");

  it("only a NULL institution_id is global; a scoped grant must match the declared institution exactly", () => {
    expect(policies).toContain("AND (a.institution_id IS NULL OR a.institution_id = v_institution)");
  });

  it("a malformed institution context denies instead of being ignored", () => {
    const body = policies.slice(
      policies.indexOf("CREATE OR REPLACE FUNCTION security.fn_active_access_roles("),
      policies.indexOf("-- Does this actor currently hold ANY of the named access roles?")
    );
    expect(body).toMatch(/institution_id[\s\S]{0,400}EXCEPTION WHEN invalid_text_representation THEN\s*\n\s*RETURN;/);
  });
});

describe.skipIf(!accessRoleDockerShouldRun)("institution scope — real PostgreSQL", () => {
  let fixture: AccessFixture;

  beforeAll(async () => {
    fixture = await createAccessFixture("InstScope");
    const admin = raw(await adminClient());
    // A: scoped to Institution A only.
    await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "RESTRICTED_ANALYST",
      institutionId: fixture.orgAId,
      idempotencyKey: randomUUID(),
    });
    // B: global.
    await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "RESTRICTED_ANALYST",
      idempotencyKey: randomUUID(),
    });
  }, 60_000);

  afterAll(async () => {
    if (fixture) await dropAccessFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("a scoped grant authorizes inside its own institution", async () => {
    expect(
      await askClassificationAllowed({ actorId: fixture.personAId, institutionId: fixture.orgAId }, "RESTRICTED")
    ).toBe(true);
  });

  it("a scoped grant does NOT authorize inside a different institution", async () => {
    expect(
      await askClassificationAllowed({ actorId: fixture.personAId, institutionId: fixture.orgBId }, "RESTRICTED")
    ).toBe(false);
  });

  it("a scoped grant does NOT authorize when no institution is declared — absence is not a wildcard", async () => {
    expect(await askClassificationAllowed({ actorId: fixture.personAId }, "RESTRICTED")).toBe(false);
  });

  it("a scoped grant does NOT authorize when the declared institution is a real but unrelated one", async () => {
    expect(
      await askClassificationAllowed({ actorId: fixture.personAId, institutionId: randomUUID() }, "RESTRICTED")
    ).toBe(false);
  });

  it("a malformed institution context denies rather than being silently dropped", async () => {
    const { runtimeClient } = await import("./accessRoleTestHelpers");
    const client = await runtimeClient();
    const transactional = client as unknown as {
      $transaction: <T>(fn: (tx: { $queryRawUnsafe: <R>(q: string, ...v: unknown[]) => Promise<R[]> }) => Promise<T>) => Promise<T>;
    };
    const allowed = await transactional.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT set_config('argus.actor_id', $1, true), set_config('argus.institution_id', 'not-a-uuid', true)`,
        fixture.personAId
      );
      const rows = await tx.$queryRawUnsafe<{ allowed: boolean }>(
        `SELECT security.fn_classification_allowed($1::uuid, 'RESTRICTED') AS allowed`,
        fixture.personAId
      );
      return Boolean(rows[0]!.allowed);
    });
    expect(allowed).toBe(false);
  });

  it("a GLOBAL grant authorizes with no institution declared, and inside any institution", async () => {
    expect(await askClassificationAllowed({ actorId: fixture.personBId }, "RESTRICTED")).toBe(true);
    expect(
      await askClassificationAllowed({ actorId: fixture.personBId, institutionId: fixture.orgAId }, "RESTRICTED")
    ).toBe(true);
    expect(
      await askClassificationAllowed({ actorId: fixture.personBId, institutionId: fixture.orgBId }, "RESTRICTED")
    ).toBe(true);
  });

  it("two scoped grants of the same role in DIFFERENT institutions each authorize only their own", async () => {
    await grantAccessRole(raw(await adminClient()), {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "PUBLIC_VIEWER",
      institutionId: fixture.orgBId,
      idempotencyKey: randomUUID(),
    });
    // Institution B: only the PUBLIC ceiling applies there.
    expect(
      await askClassificationAllowed({ actorId: fixture.personAId, institutionId: fixture.orgBId }, "PUBLIC")
    ).toBe(true);
    expect(
      await askClassificationAllowed({ actorId: fixture.personAId, institutionId: fixture.orgBId }, "RESTRICTED")
    ).toBe(false);
    // Institution A still reaches RESTRICTED.
    expect(
      await askClassificationAllowed({ actorId: fixture.personAId, institutionId: fixture.orgAId }, "RESTRICTED")
    ).toBe(true);
  });

  it("the institution must be a real organization — a scoped grant cannot name a nonexistent one", async () => {
    await expect(
      grantAccessRole(raw(await adminClient()), {
        accessSubjectId: fixture.subjectBId,
        accessRoleCode: "PUBLIC_VIEWER",
        institutionId: randomUUID(),
        idempotencyKey: randomUUID(),
      })
    ).rejects.toThrow(/violates foreign key constraint/i);
  });
});
