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
  ownerClient,
  raw,
  readRepoFile,
  type AccessFixture,
} from "./accessRoleTestHelpers";

/**
 * tests/database-target/classification-emergency-basis.test.ts
 *
 * An EMERGENCY_ASSISTANCE grant authorizes only when the session names a real,
 * ACTIVE `governance.emergency_bases` row.
 *
 * Crucially, an emergency basis NEVER raises a ceiling: it justifies USING a
 * grant that already exists, it does not manufacture clearance. That is why the
 * worst an attacker gains by forging a basis id is nothing — and why this file
 * asserts the ceiling is still the role's own, even with a valid basis.
 */

describe("emergency basis — declared contract", () => {
  const policies = readRepoFile("prisma", "target-migrations", "010_foundation", "rls_policies.sql");

  it("gates only EMERGENCY_ASSISTANCE grants on an ACTIVE basis", () => {
    expect(policies).toContain("AND (a.purpose <> 'EMERGENCY_ASSISTANCE' OR v_basis_active)");
    expect(policies).toContain("WHERE eb.id = v_basis_id AND eb.status = 'ACTIVE'");
  });

  it("never uses the basis to widen a ceiling", () => {
    const body = policies.slice(
      policies.indexOf("CREATE OR REPLACE FUNCTION security.fn_active_access_roles("),
      policies.indexOf("-- Does this actor currently hold ANY of the named access roles?")
    );
    // The only classification value returned is the role's own ceiling.
    expect(body).toContain("SELECT r.id, r.code::text, r.classification_ceiling");
    expect(body).not.toMatch(/classification_ceiling\s*(\+|=\s*'CRITICAL')/);
  });
});

describe.skipIf(!accessRoleDockerShouldRun)("emergency basis — real PostgreSQL", () => {
  let fixture: AccessFixture;

  beforeAll(async () => {
    fixture = await createAccessFixture("Emergency");
    const admin = raw(await adminClient());
    // A: an EMERGENCY_ASSISTANCE grant reaching CRITICAL, plus an ordinary
    // PUBLIC grant so "denied" can be distinguished from "unknown actor".
    await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "ADMIN",
      purpose: "EMERGENCY_ASSISTANCE",
      idempotencyKey: randomUUID(),
    });
    await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectAId,
      accessRoleCode: "PUBLIC_VIEWER",
      idempotencyKey: randomUUID(),
    });
    // B: an EMERGENCY_ASSISTANCE grant with only a SENSITIVE ceiling, to prove
    // the basis does not lift the ceiling.
    await grantAccessRole(admin, {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "SENSITIVE_HANDLER",
      purpose: "EMERGENCY_ASSISTANCE",
      idempotencyKey: randomUUID(),
    });
  }, 60_000);

  afterAll(async () => {
    if (fixture) await dropAccessFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("a valid ACTIVE basis enables the emergency grant", async () => {
    expect(
      await askClassificationAllowed(
        {
          actorId: fixture.personAId,
          purpose: "EMERGENCY_ASSISTANCE",
          emergencyBasisId: fixture.emergencyBasisActiveId,
        },
        "CRITICAL"
      )
    ).toBe(true);
  });

  it("NO basis declared: the emergency grant does not authorize", async () => {
    expect(
      await askClassificationAllowed(
        { actorId: fixture.personAId, purpose: "EMERGENCY_ASSISTANCE" },
        "CRITICAL"
      )
    ).toBe(false);
  });

  it("a FORGED (nonexistent) basis id does not authorize", async () => {
    expect(
      await askClassificationAllowed(
        { actorId: fixture.personAId, purpose: "EMERGENCY_ASSISTANCE", emergencyBasisId: randomUUID() },
        "CRITICAL"
      )
    ).toBe(false);
  });

  it("a real but DEPRECATED basis does not authorize", async () => {
    expect(
      await askClassificationAllowed(
        {
          actorId: fixture.personAId,
          purpose: "EMERGENCY_ASSISTANCE",
          emergencyBasisId: fixture.emergencyBasisDeprecatedId,
        },
        "CRITICAL"
      )
    ).toBe(false);
  });

  it("a basis that becomes DEPRECATED stops authorizing immediately", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE governance.emergency_bases SET status = 'DEPRECATED' WHERE id = $1::uuid`,
      fixture.emergencyBasisActiveId
    );
    expect(
      await askClassificationAllowed(
        {
          actorId: fixture.personAId,
          purpose: "EMERGENCY_ASSISTANCE",
          emergencyBasisId: fixture.emergencyBasisActiveId,
        },
        "CRITICAL"
      )
    ).toBe(false);
    await owner.$executeRawUnsafe(
      `UPDATE governance.emergency_bases SET status = 'ACTIVE' WHERE id = $1::uuid`,
      fixture.emergencyBasisActiveId
    );
    expect(
      await askClassificationAllowed(
        {
          actorId: fixture.personAId,
          purpose: "EMERGENCY_ASSISTANCE",
          emergencyBasisId: fixture.emergencyBasisActiveId,
        },
        "CRITICAL"
      )
    ).toBe(true);
  });

  it("a valid basis does NOT raise the ceiling of the grant it enables", async () => {
    // B's emergency grant is SENSITIVE. A valid basis enables it up to SENSITIVE
    // and no further — CRITICAL stays denied.
    expect(
      await askClassificationAllowed(
        {
          actorId: fixture.personBId,
          purpose: "EMERGENCY_ASSISTANCE",
          emergencyBasisId: fixture.emergencyBasisActiveId,
        },
        "SENSITIVE"
      )
    ).toBe(true);
    expect(
      await askClassificationAllowed(
        {
          actorId: fixture.personBId,
          purpose: "EMERGENCY_ASSISTANCE",
          emergencyBasisId: fixture.emergencyBasisActiveId,
        },
        "CRITICAL"
      )
    ).toBe(false);
  });

  it("a valid basis does not enable a grant whose purpose is something else", async () => {
    // A's PUBLIC_VIEWER grant is GENERAL; declaring EMERGENCY_ASSISTANCE means
    // it no longer matches, basis or no basis.
    expect(
      await askClassificationAllowed(
        {
          actorId: fixture.personAId,
          purpose: "OPERATIONAL_RESPONSE",
          emergencyBasisId: fixture.emergencyBasisActiveId,
        },
        "CRITICAL"
      )
    ).toBe(false);
  });

  it("a basis declared without an emergency purpose changes nothing", async () => {
    // GENERAL grants are unaffected by the presence of a basis.
    expect(
      await askClassificationAllowed(
        { actorId: fixture.personAId, emergencyBasisId: fixture.emergencyBasisActiveId },
        "PUBLIC"
      )
    ).toBe(true);
    expect(
      await askClassificationAllowed(
        { actorId: fixture.personAId, emergencyBasisId: fixture.emergencyBasisActiveId },
        "CRITICAL"
      )
    ).toBe(false);
  });

  it("a malformed basis id is treated as no basis, never as a valid one", async () => {
    const { runtimeClient } = await import("./accessRoleTestHelpers");
    const client = await runtimeClient();
    const transactional = client as unknown as {
      $transaction: <T>(fn: (tx: { $queryRawUnsafe: <R>(q: string, ...v: unknown[]) => Promise<R[]> }) => Promise<T>) => Promise<T>;
    };
    const allowed = await transactional.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT set_config('argus.actor_id', $1, true),
                set_config('argus.purpose', 'EMERGENCY_ASSISTANCE', true),
                set_config('argus.emergency_basis_id', 'not-a-uuid', true)`,
        fixture.personAId
      );
      const rows = await tx.$queryRawUnsafe<{ allowed: boolean }>(
        `SELECT security.fn_classification_allowed($1::uuid, 'CRITICAL') AS allowed`,
        fixture.personAId
      );
      return Boolean(rows[0]!.allowed);
    });
    expect(allowed).toBe(false);
  });
});
