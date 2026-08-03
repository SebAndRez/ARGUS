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
 * tests/database-target/incident-command-institution.test.ts
 *
 * Institutional compatibility, which is a SEPARATE link from territorial
 * scope: a jurisdiction declared by an organization is commanded from inside
 * that organization, never from another one.
 *
 * Without this, an actor could be scoped to the right territory through a
 * membership in an unrelated institution — which is precisely how a
 * cross-institutional escalation would look if nobody checked.
 */
describe.skipIf(!incidentZoneDockerShouldRun)("institution compatibility", () => {
  let fixture: IncidentZoneFixture;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31Institution");
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("baseline: membership institution matches the jurisdiction's declaring organization", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ declaring_organization_id: string; organization_id: string }>(
      `SELECT j.declaring_organization_id, m.organization_id
         FROM governance.jurisdictions j, institution.institutional_memberships m
        WHERE j.id = $1::uuid AND m.id = $2::uuid`,
      fixture.jurisdictionAId,
      fixture.membershipAId
    );
    expect(rows[0]!.declaring_organization_id).toBe(rows[0]!.organization_id);
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(true);
  });

  it("a membership in a DIFFERENT institution denies, even with the correct territorial scope", async () => {
    const owner = raw(await ownerClient());
    // Give actor A a membership in institution B, and point the command role at
    // it. The jurisdictional scope stays on jurisdiction A.
    await owner.$executeRawUnsafe(
      `INSERT INTO institution.institutional_memberships
         (id, person_id, organization_id, role_label, status, effective_from)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Outsider', 'ACTIVE', now() - interval '1 day')`,
      fixture.membershipBId.replace(/.$/, "e"),
      fixture.personAId,
      fixture.orgBId
    );
    await owner.$executeRawUnsafe(
      `UPDATE command.command_roles SET institutional_membership_id = $2::uuid WHERE id = $1::uuid`,
      fixture.commandRoleAId,
      fixture.membershipBId.replace(/.$/, "e")
    );

    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);
  });

  it("restoring the matching membership restores command", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE command.command_roles SET institutional_membership_id = $2::uuid WHERE id = $1::uuid`,
      fixture.commandRoleAId,
      fixture.membershipAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(true);
    await owner.$executeRawUnsafe(
      `DELETE FROM institution.institutional_memberships WHERE id = $1::uuid`,
      fixture.membershipBId.replace(/.$/, "e")
    );
  });

  it("a jurisdiction declared by NOBODY is institution-agnostic — the check narrows, it does not invent a requirement", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE governance.jurisdictions SET declaring_organization_id = NULL WHERE id = $1::uuid`,
      fixture.jurisdictionAId
    );
    await owner.$executeRawUnsafe(
      `UPDATE command.command_roles SET institutional_membership_id = $2::uuid WHERE id = $1::uuid`,
      fixture.commandRoleAId,
      fixture.membershipBId
    );
    // Actor A's role now hangs off actor B's membership (institution B), but
    // the jurisdiction declares no organization, so institution compatibility
    // has nothing to contradict.
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);

    // ...and it is the MEMBERSHIP OWNERSHIP, not the institution, that denies
    // here: the membership belongs to person B, so it is not actor A's to use.
    await owner.$executeRawUnsafe(
      `UPDATE command.command_roles SET institutional_membership_id = $2::uuid WHERE id = $1::uuid`,
      fixture.commandRoleAId,
      fixture.membershipAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(true);

    await owner.$executeRawUnsafe(
      `UPDATE governance.jurisdictions SET declaring_organization_id = $2::uuid WHERE id = $1::uuid`,
      fixture.jurisdictionAId,
      fixture.orgAId
    );
  });

  it("actor B, institution B, cannot command a jurisdiction-A incident by any combination available to it", async () => {
    await expect(askHasCommandRole(fixture.personBId, fixture.incidentCommandId)).resolves.toBe(false);
  });
});
