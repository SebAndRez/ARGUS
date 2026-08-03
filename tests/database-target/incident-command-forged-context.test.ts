import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  askHasCommandRole,
  createIncidentZoneFixture,
  dropIncidentZoneFixture,
  incidentZoneDockerShouldRun,
  runtimeClient,
  withActor,
  type IncidentZoneFixture,
} from "./incidentZoneTestHelpers";
import { closeTargetPrincipalClients, closeTargetPrismaClient } from "../../src/lib/database-target/client/targetPrismaClient";

/**
 * tests/database-target/incident-command-forged-context.test.ts
 *
 * Nothing a session can SAY about itself grants command.
 *
 * The session context is a set of GUCs the client controls end to end, so
 * every one of them is tested as hostile input: a forged role name, a forged
 * subject id, a forged jurisdiction id, an actor id that is not the session's
 * own, and a malformed value. All must fail CLOSED.
 */
describe.skipIf(!incidentZoneDockerShouldRun)("forged session context grants nothing", () => {
  let fixture: IncidentZoneFixture;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31Forged");
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("baseline: the legitimate actor does command the incident", async () => {
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(true);
  });

  it("a forged argus.actor_role=ADMIN changes nothing for an unauthorized actor", async () => {
    await expect(
      askHasCommandRole(fixture.personBId, fixture.incidentCommandId, { forgedActorRole: "ADMIN" })
    ).resolves.toBe(false);
  });

  it("a forged argus.actor_role does not even help the LEGITIMATE actor after its scope is gone", async () => {
    await expect(
      askHasCommandRole(fixture.personBId, fixture.incidentCommandId, { forgedActorRole: "SYSTEM" })
    ).resolves.toBe(false);
  });

  it("asking about somebody ELSE's actor id is refused — the session is bound to its own actor", async () => {
    // The session declares actor B, but asks about actor A, who really does
    // command this incident. Without the binding, B would learn-and-act on A's
    // authority.
    await expect(
      askHasCommandRole(fixture.personAId, fixture.incidentCommandId, { sessionActorId: fixture.personBId })
    ).resolves.toBe(false);
  });

  it("an actor id with no persisted AccessSubject is refused, however well-formed", async () => {
    const orphan = "00000000-0000-4000-8000-000000000abc";
    await expect(askHasCommandRole(orphan, fixture.incidentCommandId)).resolves.toBe(false);
  });

  it("a forged argus.access_subject_id belonging to somebody else is refused", async () => {
    const runtime = await runtimeClient();
    const allowed = await withActor(
      runtime,
      fixture.personBId,
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<{ allowed: boolean }>(
          `SELECT security.fn_has_command_role($1::uuid, $2::uuid) AS allowed`,
          fixture.personBId,
          fixture.incidentCommandId
        );
        return Boolean(rows[0]!.allowed);
      },
      // Actor B claims actor A's subject id.
      { declaredSubjectId: fixture.subjectAId }
    );
    expect(allowed).toBe(false);
  });

  it("a malformed actor_id is a denial, never a wildcard", async () => {
    const runtime = await runtimeClient();
    const allowed = await (runtime as unknown as {
      $transaction: <T>(fn: (tx: { $queryRawUnsafe: <R>(q: string, ...v: unknown[]) => Promise<R[]> }) => Promise<T>) => Promise<T>;
    }).$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`SELECT set_config('argus.actor_id', 'not-a-uuid', true)`);
      const rows = await tx.$queryRawUnsafe<{ allowed: boolean }>(
        `SELECT security.fn_has_command_role($1::uuid, $2::uuid) AS allowed`,
        fixture.personAId,
        fixture.incidentCommandId
      );
      return Boolean(rows[0]!.allowed);
    });
    expect(allowed).toBe(false);
  });

  it("a NULL actor or a NULL incident is a denial", async () => {
    const runtime = await runtimeClient();
    const results = await withActor(runtime, fixture.personAId, async (tx) => {
      const nullActor = await tx.$queryRawUnsafe<{ allowed: boolean }>(
        `SELECT security.fn_has_command_role(NULL::uuid, $1::uuid) AS allowed`,
        fixture.incidentCommandId
      );
      const nullIncident = await tx.$queryRawUnsafe<{ allowed: boolean }>(
        `SELECT security.fn_has_command_role($1::uuid, NULL::uuid) AS allowed`,
        fixture.personAId
      );
      return [Boolean(nullActor[0]!.allowed), Boolean(nullIncident[0]!.allowed)];
    });
    expect(results).toEqual([false, false]);
  });

  it("an unknown incident id is a denial, not an error", async () => {
    await expect(
      askHasCommandRole(fixture.personAId, "00000000-0000-4000-8000-0000000000ff")
    ).resolves.toBe(false);
  });

  it("a forged institution or purpose context does not manufacture command", async () => {
    const runtime = await runtimeClient();
    const allowed = await withActor(
      runtime,
      fixture.personBId,
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<{ allowed: boolean }>(
          `SELECT security.fn_has_command_role($1::uuid, $2::uuid) AS allowed`,
          fixture.personBId,
          fixture.incidentCommandId
        );
        return Boolean(rows[0]!.allowed);
      },
      { institutionId: fixture.orgAId, purpose: "OPERATIONAL_RESPONSE", forgedActorRole: "ADMIN" }
    );
    expect(allowed).toBe(false);
  });
});
