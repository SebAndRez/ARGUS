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
 * tests/database-target/incident-command-without-command-zone.test.ts
 *
 * The default is DENY. An incident with no COMMAND operational zone at all —
 * not even a wrong one — authorizes nobody, however complete the rest of the
 * chain is.
 *
 * This is the case the R31 blocker made impossible to express: before it, a
 * `command_roles` row alone was enough, so "who commands this incident" could
 * not be constrained territorially at all.
 */
describe.skipIf(!incidentZoneDockerShouldRun)("no COMMAND zone means no command", () => {
  let fixture: IncidentZoneFixture;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31NoCmdZone");
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("an incident with ZERO zone assignments denies command", async () => {
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentSpatialId)).resolves.toBe(false);
  });

  it("its command jurisdiction projection is empty, and so is its effective one", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT (SELECT count(*) FROM geo.fn_incident_command_jurisdictions($1::uuid))
            + (SELECT count(*) FROM geo.fn_incident_effective_jurisdictions($1::uuid, NULL)) AS n`,
      fixture.incidentSpatialId
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it("the actor holds a valid command role on it — the denial is the missing COMMAND zone alone", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM command.command_roles cr
         JOIN command.incident_command_structures ics ON ics.id = cr.incident_command_structure_id
        WHERE ics.incident_id = $1::uuid AND cr.actor_id = $2::uuid AND cr.revoked_at IS NULL`,
      fixture.incidentSpatialId,
      fixture.personAId
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("adding a COMMAND zone is what — and all that — turns the answer to true", async () => {
    const owner = raw(await ownerClient());
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentSpatialId)).resolves.toBe(false);
    await owner.$executeRawUnsafe(
      `INSERT INTO geo.incident_operational_zone_assignments
         (incident_id, operational_zone_id, assignment_kind, resolution_method, status,
          correlation_id, provenance, assigned_by_subject_id)
       VALUES ($1::uuid, $2::uuid, 'COMMAND', 'MANUAL', 'ACTIVE', gen_random_uuid(), 'MANUAL', $3::uuid)`,
      fixture.incidentSpatialId,
      fixture.zoneAId,
      fixture.subjectAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentSpatialId)).resolves.toBe(true);
  });
});
