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
 * tests/database-target/incident-command-role-expiry.test.ts
 *
 * Temporal validity of the command role AND of its jurisdictional scope.
 *
 * These are two separate records with two separate windows, deliberately: a
 * commander can keep the role while its territorial scope is withdrawn, and
 * vice versa. Both are asserted here because collapsing them into one would
 * make "narrow this commander's territory" impossible to express without
 * revoking the whole role.
 */
describe.skipIf(!incidentZoneDockerShouldRun)("command role and scope expiry", () => {
  let fixture: IncidentZoneFixture;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31RoleExpiry");
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("baseline: role and scope both in force -> command", async () => {
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(true);
  });

  it("a REVOKED command role denies, even with the scope still ACTIVE", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE command.command_roles SET revoked_at = now() - interval '1 minute' WHERE id = $1::uuid`,
      fixture.commandRoleAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);

    const scope = await owner.$queryRawUnsafe<{ status: string }>(
      `SELECT status FROM command.command_role_jurisdiction_scopes WHERE id = $1::uuid`,
      fixture.commandScopeAId
    );
    expect(scope[0]!.status).toBe("ACTIVE");

    await owner.$executeRawUnsafe(
      `UPDATE command.command_roles SET revoked_at = NULL WHERE id = $1::uuid`,
      fixture.commandRoleAId
    );
  });

  it("a command role not yet in effect denies", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE command.command_roles SET assigned_at = now() + interval '1 day' WHERE id = $1::uuid`,
      fixture.commandRoleAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);

    await owner.$executeRawUnsafe(
      `UPDATE command.command_roles SET assigned_at = now() - interval '1 day' WHERE id = $1::uuid`,
      fixture.commandRoleAId
    );
  });

  it("an EXPIRED jurisdictional scope denies, with the role itself untouched", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE command.command_role_jurisdiction_scopes SET valid_until = now() - interval '1 hour' WHERE id = $1::uuid`,
      fixture.commandScopeAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);

    const role = await owner.$queryRawUnsafe<{ revoked_at: Date | null }>(
      `SELECT revoked_at FROM command.command_roles WHERE id = $1::uuid`,
      fixture.commandRoleAId
    );
    expect(role[0]!.revoked_at).toBeNull();

    await owner.$executeRawUnsafe(
      `UPDATE command.command_role_jurisdiction_scopes SET valid_until = NULL WHERE id = $1::uuid`,
      fixture.commandScopeAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(true);
  });

  it("a scope not yet in effect denies", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE command.command_role_jurisdiction_scopes SET valid_from = now() + interval '1 day' WHERE id = $1::uuid`,
      fixture.commandScopeAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);

    await owner.$executeRawUnsafe(
      `UPDATE command.command_role_jurisdiction_scopes SET valid_from = now() - interval '1 day' WHERE id = $1::uuid`,
      fixture.commandScopeAId
    );
  });

  it("a REVOKED scope denies and preserves its reason", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE command.command_role_jurisdiction_scopes
          SET status = 'REVOKED', revoked_at = now(), revocation_reason_code = 'SCOPE_WITHDRAWN'
        WHERE id = $1::uuid`,
      fixture.commandScopeAId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);

    const rows = await owner.$queryRawUnsafe<{ revocation_reason_code: string }>(
      `SELECT revocation_reason_code FROM command.command_role_jurisdiction_scopes WHERE id = $1::uuid`,
      fixture.commandScopeAId
    );
    expect(rows[0]!.revocation_reason_code).toBe("SCOPE_WITHDRAWN");
  });

  it("rejects a scope whose validity window is inverted, and one with a free-text provenance", async () => {
    const owner = raw(await ownerClient());
    await expect(
      owner.$executeRawUnsafe(
        `INSERT INTO command.command_role_jurisdiction_scopes
           (command_role_id, jurisdiction_id, valid_from, valid_until, provenance)
         VALUES ($1::uuid, $2::uuid, now(), now() - interval '1 hour', 'MANUAL')`,
        fixture.commandRoleBId,
        fixture.jurisdictionAId
      )
    ).rejects.toThrow(/ck_crjs_validity_window/);

    await expect(
      owner.$executeRawUnsafe(
        `INSERT INTO command.command_role_jurisdiction_scopes
           (command_role_id, jurisdiction_id, provenance)
         VALUES ($1::uuid, $2::uuid, 'free text here')`,
        fixture.commandRoleBId,
        fixture.jurisdictionAId
      )
    ).rejects.toThrow(/ck_crjs_provenance_shape/);
  });
});
