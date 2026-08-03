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
 * tests/database-target/incident-command-membership-expiry.test.ts
 *
 * The institutional membership behind a command role is part of the chain, not
 * decoration: when it lapses, command lapses with it — immediately, and
 * without anyone having to remember to revoke the command role too.
 *
 * That "without anyone remembering" is the point. A person who leaves an
 * institution stops commanding on the strength of the membership record alone.
 */
describe.skipIf(!incidentZoneDockerShouldRun)("institutional membership expiry ends command", () => {
  let fixture: IncidentZoneFixture;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31MembershipExpiry");
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("baseline: a current membership commands", async () => {
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(true);
  });

  it("an EXPIRED membership denies, while the command role itself is untouched", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE institution.institutional_memberships SET effective_to = now() - interval '1 hour' WHERE id = $1::uuid`,
      fixture.membershipAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);

    const role = await owner.$queryRawUnsafe<{ revoked_at: Date | null }>(
      `SELECT revoked_at FROM command.command_roles WHERE id = $1::uuid`,
      fixture.commandRoleAId
    );
    expect(role[0]!.revoked_at).toBeNull();
  });

  it("restoring the membership restores command", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE institution.institutional_memberships SET effective_to = NULL WHERE id = $1::uuid`,
      fixture.membershipAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(true);
  });

  it("a membership that has not STARTED yet denies too", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE institution.institutional_memberships SET effective_from = now() + interval '1 day' WHERE id = $1::uuid`,
      fixture.membershipAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);

    await owner.$executeRawUnsafe(
      `UPDATE institution.institutional_memberships SET effective_from = now() - interval '2 days' WHERE id = $1::uuid`,
      fixture.membershipAId
    );
  });

  it("a SUSPENDED/ENDED membership status denies even inside its date window", async () => {
    const owner = raw(await ownerClient());
    const statuses = await owner.$queryRawUnsafe<{ label: string }>(
      `SELECT unnest(enum_range(NULL::institution.institutional_membership_status_enum))::text AS label`
    );
    const nonActive = statuses.map((s) => s.label).find((label) => label !== "ACTIVE");
    expect(nonActive, "the membership status enum has no non-ACTIVE label to test with").toBeDefined();

    await owner.$executeRawUnsafe(
      `UPDATE institution.institutional_memberships SET status = $2::institution.institutional_membership_status_enum WHERE id = $1::uuid`,
      fixture.membershipAId,
      nonActive
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);

    await owner.$executeRawUnsafe(
      `UPDATE institution.institutional_memberships SET status = 'ACTIVE' WHERE id = $1::uuid`,
      fixture.membershipAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(true);
  });

  it("a command role with NO membership at all is not blocked by the membership check", async () => {
    // Some command roles are held by actors with no modeled institutional
    // membership. The membership clause must not deny those by default — it
    // applies only when the role IS tied to one.
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE command.command_roles SET institutional_membership_id = NULL WHERE id = $1::uuid`,
      fixture.commandRoleAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(true);

    await owner.$executeRawUnsafe(
      `UPDATE command.command_roles SET institutional_membership_id = $2::uuid WHERE id = $1::uuid`,
      fixture.commandRoleAId,
      fixture.membershipAId
    );
  });
});
