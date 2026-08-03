import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  askHasCommandRole,
  createIncidentZoneFixture,
  dropIncidentZoneFixture,
  incidentZoneDockerShouldRun,
  ownerClient,
  raw,
  runtimeClient,
  withActor,
  type IncidentZoneFixture,
} from "./incidentZoneTestHelpers";
import {
  readIncidentCommandJurisdictions,
  readIncidentEffectiveJurisdictions,
} from "../../src/lib/database-target/repositories/incidentOperationalZoneRepository";
import { closeTargetPrincipalClients, closeTargetPrismaClient } from "../../src/lib/database-target/client/targetPrismaClient";

/**
 * tests/database-target/incident-command-jurisdiction.test.ts
 *
 * The positive half of R31: the chain resolves, end to end, and the actor
 * whose command role is scoped to the resolved jurisdiction commands the
 * incident.
 *
 * A suite where everything denies proves nothing, so this is the file that
 * proves the mechanism actually GRANTS — and that each link in the chain is
 * load-bearing, by breaking one at a time and watching the answer flip.
 */
describe.skipIf(!incidentZoneDockerShouldRun)("effective command jurisdiction", () => {
  let fixture: IncidentZoneFixture;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31CmdJurisdiction");
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("the full chain grants command to the correctly-scoped actor", async () => {
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(true);
  });

  it("resolves exactly the jurisdiction the COMMAND zone belongs to", async () => {
    const runtime = await runtimeClient();
    const rows = await withActor(runtime, fixture.personAId, (tx) =>
      readIncidentCommandJurisdictions(tx, fixture.incidentCommandId)
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.jurisdictionId).toBe(fixture.jurisdictionAId);
    expect(rows[0]!.operationalZoneId).toBe(fixture.zoneAId);
    expect(rows[0]!.declaringOrganizationId).toBe(fixture.orgAId);
  });

  it("a zone straddling two jurisdictions yields BOTH as command jurisdictions", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `INSERT INTO geo.incident_operational_zone_assignments
         (incident_id, operational_zone_id, assignment_kind, resolution_method, status,
          correlation_id, provenance, assigned_by_subject_id)
       VALUES ($1::uuid, $2::uuid, 'COMMAND', 'OFFICIAL_SOURCE', 'ACTIVE', gen_random_uuid(), 'OFFICIAL_SOURCE', $3::uuid)`,
      fixture.incidentSpatialId,
      fixture.zoneCrossId,
      fixture.subjectAId
    );
    const runtime = await runtimeClient();
    const rows = await withActor(runtime, fixture.personAId, (tx) =>
      readIncidentCommandJurisdictions(tx, fixture.incidentSpatialId)
    );
    expect(rows.map((r) => r.jurisdictionId).sort()).toEqual(
      [fixture.jurisdictionAId, fixture.jurisdictionBId].sort()
    );
  });

  it("the effective-jurisdiction view is WIDER than the command one, and the command one never borrows from it", async () => {
    const runtime = await runtimeClient();
    const all = await withActor(runtime, fixture.personAId, (tx) =>
      readIncidentEffectiveJurisdictions(tx, fixture.incidentPrimaryId)
    );
    const command = await withActor(runtime, fixture.personAId, (tx) =>
      readIncidentCommandJurisdictions(tx, fixture.incidentPrimaryId)
    );
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((r) => r.assignmentKind === "PRIMARY")).toBe(true);
    expect(command).toHaveLength(0);
  });

  it("breaking the zone->jurisdiction link alone removes the command jurisdiction", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE geo.operational_zone_jurisdiction_assignments
          SET status = 'REVOKED', revoked_at = now(), revocation_reason_code = 'BOUNDARY_REDRAWN'
        WHERE operational_zone_id = $1::uuid AND jurisdiction_id = $2::uuid`,
      fixture.zoneAId,
      fixture.jurisdictionAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);

    await owner.$executeRawUnsafe(
      `UPDATE geo.operational_zone_jurisdiction_assignments
          SET status = 'ACTIVE', revoked_at = NULL, revocation_reason_code = NULL
        WHERE operational_zone_id = $1::uuid AND jurisdiction_id = $2::uuid`,
      fixture.zoneAId,
      fixture.jurisdictionAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(true);
  });

  it("an expired jurisdiction stops the chain even with every other link intact", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE governance.jurisdictions SET effective_to = now() - interval '1 hour' WHERE id = $1::uuid`,
      fixture.jurisdictionAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);

    await owner.$executeRawUnsafe(
      `UPDATE governance.jurisdictions SET effective_to = NULL WHERE id = $1::uuid`,
      fixture.jurisdictionAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(true);
  });

  it("a CLOSED operational zone stops the chain", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE geo.operational_zones SET status = 'CLOSED', closed_at = now() WHERE id = $1::uuid`,
      fixture.zoneAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);

    await owner.$executeRawUnsafe(
      `UPDATE geo.operational_zones SET status = 'ACTIVE', closed_at = NULL WHERE id = $1::uuid`,
      fixture.zoneAId
    );
  });

  it("a CLOSED incident stops the chain", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE incident.incidents SET closed_at = now() WHERE id = $1::uuid`,
      fixture.incidentCommandId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);

    await owner.$executeRawUnsafe(
      `UPDATE incident.incidents SET closed_at = NULL WHERE id = $1::uuid`,
      fixture.incidentCommandId
    );
  });

  it("a DISSOLVED command structure stops the chain", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE command.incident_command_structures SET status = 'DISSOLVED', dissolved_at = now() WHERE incident_id = $1::uuid`,
      fixture.incidentCommandId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);

    await owner.$executeRawUnsafe(
      `UPDATE command.incident_command_structures SET status = 'ACTIVE', dissolved_at = NULL WHERE incident_id = $1::uuid`,
      fixture.incidentCommandId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(true);
  });
});
