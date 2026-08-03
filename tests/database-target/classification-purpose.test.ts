import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  closeTargetPrincipalClients,
  closeTargetPrismaClient,
} from "../../src/lib/database-target/client/targetPrismaClient";
import { grantAccessRole } from "../../src/lib/database-target/repositories/accessRoleAssignmentRepository";
import {
  applyTargetSessionContext,
  TargetSessionContextError,
} from "../../src/lib/database-target/session/targetSessionContext";
import {
  accessRoleDockerShouldRun,
  adminClient,
  askClassificationAllowed,
  createAccessFixture,
  dropAccessFixture,
  raw,
  readRepoFile,
  runtimeClient,
  type AccessFixture,
} from "./accessRoleTestHelpers";
import type { RawSqlClient } from "../../src/lib/database-target/repositories/incidentPromotionRepository";

/**
 * tests/database-target/classification-purpose.test.ts
 *
 * Purpose binding: GENERAL grants carry no purpose restriction; every other
 * value authorizes only when the session declares that exact purpose. An
 * UNRECOGNIZED purpose is a denial, never a wildcard — that asymmetry is the
 * whole point, because "I couldn't parse your purpose so I'll allow everything"
 * is how purpose limitation usually dies.
 */

describe("purpose binding — declared contract", () => {
  const migration = readRepoFile("prisma", "target-migrations", "010_foundation", "migration.sql");
  const policies = readRepoFile("prisma", "target-migrations", "010_foundation", "rls_policies.sql");

  it("purpose is a closed enum, not free text", () => {
    expect(migration).toContain("CREATE TYPE security.access_purpose_enum AS ENUM");
    expect(migration).toContain(
      "('GENERAL','OPERATIONAL_RESPONSE','AUDIT_REVIEW','SECURITY_REVIEW','ADMINISTRATION','EMERGENCY_ASSISTANCE')"
    );
  });

  it("only GENERAL is purpose-unrestricted; anything else must match exactly", () => {
    expect(policies).toContain("AND (a.purpose = 'GENERAL' OR a.purpose = v_purpose)");
  });

  it("an unparseable purpose returns no roles at all", () => {
    const body = policies.slice(
      policies.indexOf("CREATE OR REPLACE FUNCTION security.fn_active_access_roles("),
      policies.indexOf("-- Does this actor currently hold ANY of the named access roles?")
    );
    expect(body).toMatch(/security\.access_purpose_enum;\s*\n\s*EXCEPTION WHEN invalid_text_representation THEN\s*\n\s*RETURN;/);
  });
});

describe("purpose binding — session context validation", () => {
  it("rejects a purpose outside the enum before it ever reaches the database", async () => {
    const calls: string[] = [];
    const fake: RawSqlClient = {
      $queryRawUnsafe: async (q: string) => {
        calls.push(q);
        return [];
      },
      $executeRawUnsafe: async () => 0,
    };
    await expect(
      applyTargetSessionContext(fake, {
        actorId: "11111111-1111-1111-1111-111111111111",
        purpose: "TOTAL_ACCESS" as never,
      })
    ).rejects.toThrow(TargetSessionContextError);
    expect(calls).toEqual([]);
  });

  it("accepts every real purpose", async () => {
    const applied: unknown[][] = [];
    const fake: RawSqlClient = {
      $queryRawUnsafe: async (_q: string, ...v: unknown[]) => {
        applied.push(v);
        return [];
      },
      $executeRawUnsafe: async () => 0,
    };
    for (const purpose of [
      "GENERAL",
      "OPERATIONAL_RESPONSE",
      "AUDIT_REVIEW",
      "SECURITY_REVIEW",
      "ADMINISTRATION",
      "EMERGENCY_ASSISTANCE",
    ] as const) {
      await applyTargetSessionContext(fake, { actorId: "11111111-1111-1111-1111-111111111111", purpose });
    }
    expect(applied).toHaveLength(6);
  });
});

describe.skipIf(!accessRoleDockerShouldRun)("purpose binding — real PostgreSQL", () => {
  let fixture: AccessFixture;

  beforeAll(async () => {
    fixture = await createAccessFixture("Purpose");
    const admin = raw(await adminClient());
    // A: purpose-restricted to AUDIT_REVIEW.
    await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "RESTRICTED_ANALYST",
      purpose: "AUDIT_REVIEW",
      idempotencyKey: randomUUID(),
    });
    // B: GENERAL.
    await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "RESTRICTED_ANALYST",
      purpose: "GENERAL",
      idempotencyKey: randomUUID(),
    });
  }, 60_000);

  afterAll(async () => {
    if (fixture) await dropAccessFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("a purpose-restricted grant authorizes under its own purpose", async () => {
    expect(
      await askClassificationAllowed({ actorId: fixture.personAId, purpose: "AUDIT_REVIEW" }, "RESTRICTED")
    ).toBe(true);
  });

  it.each(["OPERATIONAL_RESPONSE", "SECURITY_REVIEW", "ADMINISTRATION", "EMERGENCY_ASSISTANCE", "GENERAL"] as const)(
    "a purpose-restricted grant does NOT authorize under purpose %s",
    async (purpose) => {
      expect(await askClassificationAllowed({ actorId: fixture.personAId, purpose }, "RESTRICTED")).toBe(false);
    }
  );

  it("a purpose-restricted grant does NOT authorize when no purpose is declared", async () => {
    expect(await askClassificationAllowed({ actorId: fixture.personAId }, "RESTRICTED")).toBe(false);
  });

  it("an UNRECOGNIZED declared purpose denies everything, including levels a GENERAL grant would cover", async () => {
    const client = await runtimeClient();
    const transactional = client as unknown as {
      $transaction: <T>(fn: (tx: RawSqlClient) => Promise<T>) => Promise<T>;
    };
    const allowed = await transactional.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT set_config('argus.actor_id', $1, true), set_config('argus.purpose', 'NOT_A_PURPOSE', true)`,
        fixture.personBId
      );
      const rows = await tx.$queryRawUnsafe<{ allowed: boolean }>(
        `SELECT security.fn_classification_allowed($1::uuid, 'PUBLIC') AS allowed`,
        fixture.personBId
      );
      return Boolean(rows[0]!.allowed);
    });
    expect(allowed).toBe(false);
  });

  it("a GENERAL grant authorizes with no purpose AND under every real purpose", async () => {
    expect(await askClassificationAllowed({ actorId: fixture.personBId }, "RESTRICTED")).toBe(true);
    for (const purpose of ["OPERATIONAL_RESPONSE", "AUDIT_REVIEW", "SECURITY_REVIEW", "ADMINISTRATION"] as const) {
      expect(await askClassificationAllowed({ actorId: fixture.personBId, purpose }, "RESTRICTED")).toBe(true);
    }
  });

  it("two grants with different purposes each authorize only under their own", async () => {
    await grantAccessRole(raw(await adminClient()), {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "PUBLIC_VIEWER",
      purpose: "OPERATIONAL_RESPONSE",
      idempotencyKey: randomUUID(),
    });
    // OPERATIONAL_RESPONSE reaches only the PUBLIC ceiling.
    expect(
      await askClassificationAllowed({ actorId: fixture.personAId, purpose: "OPERATIONAL_RESPONSE" }, "PUBLIC")
    ).toBe(true);
    expect(
      await askClassificationAllowed({ actorId: fixture.personAId, purpose: "OPERATIONAL_RESPONSE" }, "RESTRICTED")
    ).toBe(false);
    // AUDIT_REVIEW still reaches RESTRICTED.
    expect(
      await askClassificationAllowed({ actorId: fixture.personAId, purpose: "AUDIT_REVIEW" }, "RESTRICTED")
    ).toBe(true);
  });
});
