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
 * tests/database-target/incident-affected-does-not-grant-command.test.ts
 *
 * AFFECTED means the incident reached that zone. Reach is not authority.
 *
 * MONITORING is asserted in the same file because it is the same claim: a zone
 * that must WATCH an incident has, by definition, no command over it.
 */
describe.skipIf(!incidentZoneDockerShouldRun)("AFFECTED and MONITORING never grant command", () => {
  let fixture: IncidentZoneFixture;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31AffectedNoCmd");
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("an incident whose only relation is AFFECTED denies command", async () => {
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentAffectedId)).resolves.toBe(false);
  });

  it("the same incident switched to MONITORING still denies command", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE geo.incident_operational_zone_assignments
          SET assignment_kind = 'MONITORING', resolution_method = 'MANUAL'
        WHERE id = $1::uuid`,
      fixture.affectedAssignmentId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentAffectedId)).resolves.toBe(false);
  });

  it("adding a SECOND non-command relation does not accumulate into command", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `INSERT INTO geo.incident_operational_zone_assignments
         (incident_id, operational_zone_id, assignment_kind, resolution_method, status, provenance)
       VALUES ($1::uuid, $2::uuid, 'PRIMARY', 'MANUAL', 'ACTIVE', 'MANUAL')`,
      fixture.incidentAffectedId,
      fixture.zoneCrossId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentAffectedId)).resolves.toBe(false);
  });

  it("its effective jurisdictions DO resolve — so the denial is about kind, not an unreachable jurisdiction", async () => {
    const owner = raw(await ownerClient());
    const all = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM geo.fn_incident_effective_jurisdictions($1::uuid, NULL)`,
      fixture.incidentAffectedId
    );
    expect(Number(all[0]!.n)).toBeGreaterThan(0);

    const command = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM geo.fn_incident_command_jurisdictions($1::uuid)`,
      fixture.incidentAffectedId
    );
    expect(Number(command[0]!.n)).toBe(0);
  });
});
