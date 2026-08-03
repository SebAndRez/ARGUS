import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  askHasCommandRole,
  createIncidentZoneFixture,
  dropIncidentZoneFixture,
  incidentZoneDockerShouldRun,
  ownerClient,
  raw,
  type IncidentZoneFixture,
} from "./incidentZoneTestHelpers";
import { closeTargetPrincipalClients, closeTargetPrismaClient } from "../../src/lib/database-target/client/targetPrismaClient";

/**
 * tests/database-target/incident-primary-does-not-grant-command.test.ts
 *
 * PRIMARY describes an incident. It does not command it, and there is no
 * fallback that turns it into command when no COMMAND assignment exists.
 *
 * The actor here holds a REAL, current command role on the incident, with a
 * REAL jurisdictional scope over the very zone the PRIMARY assignment names —
 * so the denial is provably about the ASSIGNMENT KIND and nothing else.
 */
describe.skipIf(!incidentZoneDockerShouldRun)("PRIMARY never grants command", () => {
  let fixture: IncidentZoneFixture;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31PrimaryNoCmd");
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("an incident whose only relation is PRIMARY denies command", async () => {
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentPrimaryId)).resolves.toBe(false);
  });

  it("the incident really does have exactly one ACTIVE PRIMARY and zero COMMAND relations", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ assignment_kind: string; n: bigint }>(
      `SELECT assignment_kind, count(*) AS n
         FROM geo.incident_operational_zone_assignments
        WHERE incident_id = $1::uuid AND status = 'ACTIVE'
        GROUP BY assignment_kind`,
      fixture.incidentPrimaryId
    );
    expect(rows.map((r) => r.assignment_kind)).toEqual(["PRIMARY"]);
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("the actor's command role and jurisdictional scope are genuinely in force — the denial is not a missing role", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n
         FROM command.command_roles cr
         JOIN command.incident_command_structures ics ON ics.id = cr.incident_command_structure_id
         JOIN command.command_role_jurisdiction_scopes s ON s.command_role_id = cr.id
        WHERE ics.incident_id = $1::uuid AND cr.actor_id = $2::uuid
          AND cr.revoked_at IS NULL AND s.status = 'ACTIVE'
          AND s.jurisdiction_id = $3::uuid`,
      fixture.incidentPrimaryId,
      fixture.personAId,
      fixture.jurisdictionAId
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("promoting the very same relation to COMMAND flips the answer — proving the kind is what decides", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE geo.incident_operational_zone_assignments
          SET assignment_kind = 'COMMAND', correlation_id = gen_random_uuid(), assigned_by_subject_id = $2::uuid
        WHERE id = $1::uuid`,
      fixture.primaryAssignmentId,
      fixture.subjectAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentPrimaryId)).resolves.toBe(true);

    await owner.$executeRawUnsafe(
      `UPDATE geo.incident_operational_zone_assignments SET assignment_kind = 'PRIMARY' WHERE id = $1::uuid`,
      fixture.primaryAssignmentId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentPrimaryId)).resolves.toBe(false);
  });
});
