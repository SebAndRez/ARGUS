import { randomUUID } from "node:crypto";
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
 * tests/database-target/incident-command-jurisdiction-mismatch.test.ts
 *
 * The jurisdictional matrix: an actor whose command role is scoped to
 * jurisdiction B does not command an incident whose COMMAND zone resolves to
 * jurisdiction A — even though the actor holds a real, current, unrevoked
 * command role on that exact incident.
 *
 * This is the whole point of R31. Before it, "a command_roles row exists" was
 * the entire test, so territory could not enter the decision at all.
 */
describe.skipIf(!incidentZoneDockerShouldRun)("jurisdictional mismatch is denied", () => {
  let fixture: IncidentZoneFixture;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31Mismatch");
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("actor A (scoped to jurisdiction A) commands the incident", async () => {
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(true);
  });

  it("actor B (scoped to jurisdiction B) does NOT, on the same incident", async () => {
    await expect(askHasCommandRole(fixture.personBId, fixture.incidentCommandId)).resolves.toBe(false);
  });

  it("actor B genuinely holds a current, unrevoked command role on that incident", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM command.command_roles cr
         JOIN command.incident_command_structures ics ON ics.id = cr.incident_command_structure_id
        WHERE ics.incident_id = $1::uuid AND cr.actor_id = $2::uuid
          AND cr.revoked_at IS NULL AND ics.status = 'ACTIVE'`,
      fixture.incidentCommandId,
      fixture.personBId
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("actor B also holds a real, ACTIVE jurisdictional scope — it is simply the WRONG jurisdiction", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ jurisdiction_id: string; status: string }>(
      `SELECT jurisdiction_id, status FROM command.command_role_jurisdiction_scopes WHERE id = $1::uuid`,
      fixture.commandScopeBId
    );
    expect(rows[0]!.status).toBe("ACTIVE");
    expect(rows[0]!.jurisdiction_id).toBe(fixture.jurisdictionBId);
    expect(rows[0]!.jurisdiction_id).not.toBe(fixture.jurisdictionAId);
  });

  it("territorial scope and institutional compatibility are SEPARATE links — both must line up", async () => {
    const owner = raw(await ownerClient());

    // Step 1 — give actor B the right TERRITORY only.
    await owner.$executeRawUnsafe(
      `UPDATE command.command_role_jurisdiction_scopes SET jurisdiction_id = $2::uuid WHERE id = $1::uuid`,
      fixture.commandScopeBId,
      fixture.jurisdictionAId
    );
    // Still denied: actor B's membership is in institution B, and jurisdiction
    // A is declared by institution A.
    await expect(askHasCommandRole(fixture.personBId, fixture.incidentCommandId)).resolves.toBe(false);

    // Step 2 — borrow actor A's membership. STILL denied, and for a third
    // reason worth isolating: a membership belongs to a person, and this one
    // is not actor B's. Pointing a command role at somebody else's membership
    // would otherwise inherit their institution — a cross-institutional
    // escalation that looks valid row by row.
    await owner.$executeRawUnsafe(
      `UPDATE command.command_roles SET institutional_membership_id = $2::uuid WHERE id = $1::uuid`,
      fixture.commandRoleBId,
      fixture.membershipAId
    );
    await expect(askHasCommandRole(fixture.personBId, fixture.incidentCommandId)).resolves.toBe(false);

    // Step 3 — actor B's OWN membership, in institution A. Now every link
    // lines up and command is granted.
    const ownMembershipInA = randomUUID();
    await owner.$executeRawUnsafe(
      `INSERT INTO institution.institutional_memberships
         (id, person_id, organization_id, role_label, status, effective_from)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Coordinator', 'ACTIVE', now() - interval '1 day')`,
      ownMembershipInA,
      fixture.personBId,
      fixture.orgAId
    );
    await owner.$executeRawUnsafe(
      `UPDATE command.command_roles SET institutional_membership_id = $2::uuid WHERE id = $1::uuid`,
      fixture.commandRoleBId,
      ownMembershipInA
    );
    await expect(askHasCommandRole(fixture.personBId, fixture.incidentCommandId)).resolves.toBe(true);

    // Restore the fixture exactly as found.
    await owner.$executeRawUnsafe(
      `UPDATE command.command_role_jurisdiction_scopes SET jurisdiction_id = $2::uuid WHERE id = $1::uuid`,
      fixture.commandScopeBId,
      fixture.jurisdictionBId
    );
    await owner.$executeRawUnsafe(
      `UPDATE command.command_roles SET institutional_membership_id = $2::uuid WHERE id = $1::uuid`,
      fixture.commandRoleBId,
      fixture.membershipBId
    );
    await owner.$executeRawUnsafe(
      `DELETE FROM institution.institutional_memberships WHERE id = $1::uuid`,
      ownMembershipInA
    );
    await expect(askHasCommandRole(fixture.personBId, fixture.incidentCommandId)).resolves.toBe(false);
  });

  it("moving the incident's COMMAND zone to jurisdiction B flips the matrix the other way", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE geo.incident_operational_zone_assignments SET operational_zone_id = $2::uuid WHERE id = $1::uuid`,
      fixture.commandAssignmentId,
      fixture.zoneBId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);
    // Actor B is scoped to B, but its membership is in institution B and
    // jurisdiction B is declared by institution B — so both links line up.
    await expect(askHasCommandRole(fixture.personBId, fixture.incidentCommandId)).resolves.toBe(true);

    await owner.$executeRawUnsafe(
      `UPDATE geo.incident_operational_zone_assignments SET operational_zone_id = $2::uuid WHERE id = $1::uuid`,
      fixture.commandAssignmentId,
      fixture.zoneAId
    );
  });

  it("a COMMAND zone whose jurisdiction nobody is scoped to authorizes nobody at all", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE command.command_role_jurisdiction_scopes
          SET status = 'REVOKED', revoked_at = now(), revocation_reason_code = 'SCOPE_WITHDRAWN'
        WHERE jurisdiction_id = $1::uuid`,
      fixture.jurisdictionAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);
    await expect(askHasCommandRole(fixture.personBId, fixture.incidentCommandId)).resolves.toBe(false);
  });
});
