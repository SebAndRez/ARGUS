import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  closeTargetPrincipalClients,
  closeTargetPrismaClient,
} from "../../src/lib/database-target/client/targetPrismaClient";
import { grantAccessRole } from "../../src/lib/database-target/repositories/accessRoleAssignmentRepository";
import {
  accessRoleDockerShouldRun,
  adminClient,
  askClassificationAllowed,
  askHasAccessRole,
  CLASSIFICATIONS,
  createAccessFixture,
  dropAccessFixture,
  ownerClient,
  raw,
  readRepoFile,
  type AccessFixture,
} from "./accessRoleTestHelpers";

/**
 * tests/database-target/classification-rejects-forged-guc.test.ts
 *
 * THE regression this session exists to prevent.
 *
 * `security.fn_classification_allowed` used to read `argus.actor_role` and
 * believe it, so any principal able to run `SET argus.actor_role = 'ADMIN'`
 * granted itself CRITICAL clearance — including the application role itself.
 * The GUC is still allowed to TRANSPORT context; it may never AUTHORIZE.
 *
 * The mandated case is explicit: `argus.actor_role = 'SYSTEM'` with no
 * assignment must be DENIED.
 */

const TARGET_MIGRATIONS = join(__dirname, "..", "..", "prisma", "target-migrations");

describe("forged session role — source level", () => {
  // The files that DEFINE behaviour. validation.sql is excluded on purpose: it
  // is the file that ASSERTS the GUC is gone, so it necessarily mentions the
  // name in its own guard query (see the separate assertion below).
  const BEHAVIOUR_FILES = ["migration.sql", "rls_policies.sql", "rls_roles.sql", "backfill.sql", "rollback.sql"];

  it("no policy or DDL in any wave reads the session role GUC", () => {
    const offenders: string[] = [];
    for (const wave of readdirSync(TARGET_MIGRATIONS)) {
      for (const file of readdirSync(join(TARGET_MIGRATIONS, wave))) {
        if (!BEHAVIOUR_FILES.includes(file)) continue;
        const sql = readRepoFile("prisma", "target-migrations", wave, file);
        for (const [index, line] of sql.split(/\r?\n/).entries()) {
          if (line.trimStart().startsWith("--")) continue;
          if (line.includes("argus.actor_role")) offenders.push(`${wave}/${file}:${index + 1}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("wave 020's validation BLOCKS on any policy or authorization function that reintroduces it", () => {
    const validation = readRepoFile("prisma", "target-migrations", "020_identity", "validation.sql");
    expect(validation).toContain("still read argus.actor_role as an authority");
    expect(validation).toContain("an authorization function still reads argus.actor_role");
    expect(validation).toContain("ACCESS_ROLE_RLS_FAIL");
  });

  it("the session-context API has no parameter for a role claim, so no caller can set one", () => {
    const session = readRepoFile("src", "lib", "database-target", "session", "targetSessionContext.ts");
    const code = session.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/actorRole|argus\.actor_role/);
    // The four context values it DOES carry are lookup keys, not claims.
    expect(code).toContain("set_config('argus.actor_id'");
    expect(code).toContain("set_config('argus.institution_id'");
    expect(code).toContain("set_config('argus.purpose'");
    expect(code).toContain("set_config('argus.emergency_basis_id'");
  });

  it("fn_active_access_roles is session-bound, so a session cannot ask about another actor", () => {
    const policies = readRepoFile("prisma", "target-migrations", "010_foundation", "rls_policies.sql");
    const body = policies.slice(
      policies.indexOf("CREATE OR REPLACE FUNCTION security.fn_active_access_roles("),
      policies.indexOf("-- Does this actor currently hold ANY of the named access roles?")
    );
    expect(body).toContain("SESSION BINDING");
    expect(body).toContain("IF p_actor_id IS DISTINCT FROM current_setting('argus.actor_id', true)::uuid THEN");
  });
});

describe.skipIf(!accessRoleDockerShouldRun)("forged session role — real PostgreSQL", () => {
  let fixture: AccessFixture;

  beforeAll(async () => {
    fixture = await createAccessFixture("ForgedGuc");
    // Person A holds a real RESTRICTED ceiling. Person B holds NOTHING — every
    // forged claim below is made as Person B.
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

  it("argus.actor_role='SYSTEM' with NO assignment is DENIED at every level (the mandated case)", async () => {
    for (const classification of CLASSIFICATIONS) {
      expect(
        await askClassificationAllowed({ actorId: fixture.personBId, forgedActorRole: "SYSTEM" }, classification),
        `forged SYSTEM must not grant ${classification}`
      ).toBe(false);
    }
  });

  it.each(["ADMIN", "AUDIT", "SECURITY", "OPERATIONAL", "SUPERUSER", "ROOT"])(
    "argus.actor_role='%s' grants nothing without an assignment",
    async (role) => {
      expect(await askClassificationAllowed({ actorId: fixture.personBId, forgedActorRole: role }, "CRITICAL")).toBe(false);
      expect(await askHasAccessRole({ actorId: fixture.personBId, forgedActorRole: role }, [role])).toBe(false);
    }
  );

  it("a forged role cannot RAISE a real, lower ceiling", async () => {
    // Person A really holds RESTRICTED. Claiming ADMIN must not reach CRITICAL.
    expect(await askClassificationAllowed({ actorId: fixture.personAId, forgedActorRole: "ADMIN" }, "RESTRICTED")).toBe(true);
    expect(await askClassificationAllowed({ actorId: fixture.personAId, forgedActorRole: "ADMIN" }, "CRITICAL")).toBe(false);
  });

  it("declaring ANOTHER subject's id does not borrow their clearance", async () => {
    expect(
      await askClassificationAllowed(
        { actorId: fixture.personBId, accessSubjectId: fixture.subjectAId },
        "RESTRICTED"
      )
    ).toBe(false);
  });

  it("asking about another actor's id returns nothing — no enumeration of somebody else's clearance", async () => {
    // Session declares Person B, but asks about Person A.
    const runtime = await import("./accessRoleTestHelpers");
    const client = await runtime.runtimeClient();
    const transactional = client as unknown as {
      $transaction: <T>(fn: (tx: { $queryRawUnsafe: <R>(q: string, ...v: unknown[]) => Promise<R[]> }) => Promise<T>) => Promise<T>;
    };
    const allowed = await transactional.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`SELECT set_config('argus.actor_id', $1, true)`, fixture.personBId);
      const rows = await tx.$queryRawUnsafe<{ allowed: boolean }>(
        `SELECT security.fn_classification_allowed($1::uuid, 'RESTRICTED') AS allowed`,
        fixture.personAId
      );
      return Boolean(rows[0]!.allowed);
    });
    expect(allowed).toBe(false);
  });

  it("a malformed actor id is denied, not coerced", async () => {
    const client = await (await import("./accessRoleTestHelpers")).runtimeClient();
    const transactional = client as unknown as {
      $transaction: <T>(fn: (tx: { $queryRawUnsafe: <R>(q: string, ...v: unknown[]) => Promise<R[]> }) => Promise<T>) => Promise<T>;
    };
    const allowed = await transactional.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`SELECT set_config('argus.actor_id', 'not-a-uuid', true)`);
      const rows = await tx.$queryRawUnsafe<{ allowed: boolean }>(
        `SELECT security.fn_classification_allowed($1::uuid, 'PUBLIC') AS allowed`,
        fixture.personAId
      );
      return Boolean(rows[0]!.allowed);
    });
    expect(allowed).toBe(false);
  });

  it("the runtime role cannot create its own assignment to make a forged claim true", async () => {
    const runtime = raw(await (await import("./accessRoleTestHelpers")).runtimeClient());
    await expect(
      runtime.$queryRawUnsafe(
        `SELECT security.fn_grant_access_role($1::uuid, 'ADMIN')`,
        fixture.subjectBId
      )
    ).rejects.toThrow(/permission denied/i);
    await expect(
      runtime.$executeRawUnsafe(
        `INSERT INTO security.access_role_assignments (access_subject_id, access_role_id)
         SELECT $1::uuid, id FROM security.access_roles WHERE code = 'ADMIN' LIMIT 1`,
        fixture.subjectBId
      )
    ).rejects.toThrow(/permission denied/i);
  });

  it("clearance follows the DATA: granting a real role flips the same forged-claim case from deny to allow", async () => {
    expect(await askClassificationAllowed({ actorId: fixture.personBId, forgedActorRole: "ADMIN" }, "CRITICAL")).toBe(false);
    await grantAccessRole(raw(await adminClient()), {
      accessSubjectId: fixture.subjectBId,
      accessRoleCode: "ADMIN",
      idempotencyKey: randomUUID(),
    });
    // Now allowed — and note the forged GUC was irrelevant in both directions.
    expect(await askClassificationAllowed({ actorId: fixture.personBId }, "CRITICAL")).toBe(true);
    await raw(await ownerClient()).$executeRawUnsafe(
      `DELETE FROM security.access_role_assignments WHERE access_subject_id = $1::uuid`,
      fixture.subjectBId
    );
    expect(await askClassificationAllowed({ actorId: fixture.personBId, forgedActorRole: "ADMIN" }, "CRITICAL")).toBe(false);
  });
});
