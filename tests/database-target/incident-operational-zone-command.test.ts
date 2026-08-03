import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  askHasCommandRole,
  createIncidentZoneFixture,
  dropIncidentZoneFixture,
  incidentZoneDockerShouldRun,
  ownerClient,
  raw,
  withActor,
  type IncidentZoneFixture,
} from "./incidentZoneTestHelpers";
import { assignIncidentOperationalZone } from "../../src/lib/database-target/repositories/incidentOperationalZoneRepository";
import { closeTargetPrincipalClients, closeTargetPrismaClient } from "../../src/lib/database-target/client/targetPrismaClient";

/**
 * tests/database-target/incident-operational-zone-command.test.ts
 *
 * The COMMAND gate: what an assignment must satisfy before it is allowed to
 * confer command scope, and who may create one at all.
 *
 * Everything here runs through the canonical SECURITY DEFINER function on the
 * ADMIN principal (`access_admin`) — the only principal that may execute it.
 */
describe.skipIf(!incidentZoneDockerShouldRun)("COMMAND assignment gate", () => {
  let fixture: IncidentZoneFixture;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31CommandGate");
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  async function assignAsAdmin(overrides: Record<string, unknown>) {
    const admin = await adminClient();
    return withActor(admin, fixture.personAId, (tx) =>
      assignIncidentOperationalZone(tx, {
        incidentId: fixture.incidentSpatialId,
        operationalZoneId: fixture.zoneAId,
        assignmentKind: "COMMAND",
        resolutionMethod: "MANUAL",
        assignedBySubjectId: fixture.subjectAId,
        reasonCode: "HUMAN_COMMAND_CONFIRMATION",
        correlationId: randomUUID(),
        ...overrides,
      } as Parameters<typeof assignIncidentOperationalZone>[1])
    );
  }

  it("a fully-specified COMMAND assignment succeeds and immediately grants command", async () => {
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentSpatialId)).resolves.toBe(false);
    const id = await assignAsAdmin({});
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentSpatialId)).resolves.toBe(true);
  });

  it("refuses a COMMAND assignment with no correlation id", async () => {
    await expect(
      assignAsAdmin({ operationalZoneId: fixture.zoneCrossId, correlationId: undefined })
    ).rejects.toThrow(/INCIDENT_ZONE_COMMAND_CORRELATION_REQUIRED/);
  });

  it("refuses a COMMAND assignment with no controlled reason code", async () => {
    await expect(
      assignAsAdmin({ operationalZoneId: fixture.zoneCrossId, reasonCode: "not a code" })
    ).rejects.toThrow(/INCIDENT_ZONE_COMMAND_REASON_REQUIRED/);
  });

  it("refuses a COMMAND assignment naming neither a subject nor an automation rule", async () => {
    await expect(
      assignAsAdmin({ operationalZoneId: fixture.zoneCrossId, assignedBySubjectId: undefined })
    ).rejects.toThrow(/INCIDENT_ZONE_COMMAND_AUTHORITY_REQUIRED/);
  });

  it("refuses a COMMAND assignment naming BOTH a subject and an automation rule", async () => {
    await expect(
      assignAsAdmin({
        operationalZoneId: fixture.zoneCrossId,
        automationRuleId: fixture.automationRuleAuthorizedId,
      })
    ).rejects.toThrow(/INCIDENT_ZONE_COMMAND_AUTHORITY_REQUIRED/);
  });

  it("refuses COMMAND onto a zone whose jurisdiction cannot be resolved", async () => {
    await expect(assignAsAdmin({ operationalZoneId: fixture.zoneOrphanId })).rejects.toThrow(
      /INCIDENT_ZONE_JURISDICTION_UNRESOLVABLE/
    );
  });

  it("refuses COMMAND from a subject that is not ACTIVE", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE security.access_subjects SET status = 'DISABLED', disabled_at = now() WHERE id = $1::uuid`,
      fixture.subjectAId
    );
    await expect(assignAsAdmin({ operationalZoneId: fixture.zoneCrossId })).rejects.toThrow(
      /INCIDENT_ZONE_SUBJECT_NOT_ACTIVE/
    );
    await owner.$executeRawUnsafe(
      `UPDATE security.access_subjects SET status = 'ACTIVE', disabled_at = NULL WHERE id = $1::uuid`,
      fixture.subjectAId
    );
  });

  it("refuses COMMAND from a subject holding no authorizing access role", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE security.access_role_assignments
          SET status = 'REVOKED', revoked_at = now(), revocation_reason_code = 'TEST_WITHDRAWN'
        WHERE access_subject_id = $1::uuid`,
      fixture.subjectAId
    );
    await expect(assignAsAdmin({ operationalZoneId: fixture.zoneCrossId })).rejects.toThrow(
      /INCIDENT_ZONE_SUBJECT_NOT_AUTHORIZED/
    );
    await owner.$executeRawUnsafe(
      `UPDATE security.access_role_assignments
          SET status = 'ACTIVE', revoked_at = NULL, revocation_reason_code = NULL
        WHERE access_subject_id = $1::uuid`,
      fixture.subjectAId
    );
  });

  it("refuses COMMAND from an automation rule that is not expressly command-authorized", async () => {
    await expect(
      assignAsAdmin({
        operationalZoneId: fixture.zoneCrossId,
        resolutionMethod: "AUTOMATION_RULE",
        assignedBySubjectId: undefined,
        automationRuleId: fixture.automationRuleUnauthorizedId,
      })
    ).rejects.toThrow(/INCIDENT_ZONE_RULE_NOT_COMMAND_AUTHORIZED/);
  });

  it("ACCEPTS COMMAND from an automation rule that IS expressly authorized and approved", async () => {
    const id = await assignAsAdmin({
      operationalZoneId: fixture.zoneCrossId,
      resolutionMethod: "AUTOMATION_RULE",
      assignedBySubjectId: undefined,
      automationRuleId: fixture.automationRuleAuthorizedId,
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuses COMMAND from an authorized rule once that rule is deprecated", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE governance.automation_rules SET status = 'DEPRECATED' WHERE id = $1::uuid`,
      fixture.automationRuleAuthorizedId
    );
    await expect(
      assignAsAdmin({
        operationalZoneId: fixture.zoneBId,
        resolutionMethod: "AUTOMATION_RULE",
        assignedBySubjectId: undefined,
        automationRuleId: fixture.automationRuleAuthorizedId,
      })
    ).rejects.toThrow(/INCIDENT_ZONE_RULE_NOT_COMMAND_AUTHORIZED/);
    await owner.$executeRawUnsafe(
      `UPDATE governance.automation_rules SET status = 'ACTIVE' WHERE id = $1::uuid`,
      fixture.automationRuleAuthorizedId
    );
  });

  it("refuses COMMAND onto a closed incident", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(`UPDATE incident.incidents SET closed_at = now() WHERE id = $1::uuid`, fixture.incidentAffectedId);
    await expect(
      assignAsAdmin({ incidentId: fixture.incidentAffectedId, operationalZoneId: fixture.zoneBId })
    ).rejects.toThrow(/INCIDENT_ZONE_INCIDENT_NOT_OPEN/);
    await owner.$executeRawUnsafe(`UPDATE incident.incidents SET closed_at = NULL WHERE id = $1::uuid`, fixture.incidentAffectedId);
  });

  it("refuses COMMAND onto a closed operational zone", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE geo.operational_zones SET status = 'CLOSED', closed_at = now() WHERE id = $1::uuid`,
      fixture.zoneBId
    );
    await expect(
      assignAsAdmin({ incidentId: fixture.incidentAffectedId, operationalZoneId: fixture.zoneBId })
    ).rejects.toThrow(/INCIDENT_ZONE_ZONE_NOT_ACTIVE/);
    await owner.$executeRawUnsafe(
      `UPDATE geo.operational_zones SET status = 'ACTIVE', closed_at = NULL WHERE id = $1::uuid`,
      fixture.zoneBId
    );
  });

  it("writes exactly one audit row per confirmation, carrying ids and codes only", async () => {
    const correlationId = randomUUID();
    await assignAsAdmin({
      incidentId: fixture.incidentAffectedId,
      operationalZoneId: fixture.zoneBId,
      correlationId,
    });
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ action: string; context: Record<string, unknown>; result: string }>(
      `SELECT action, context, result FROM security.audit_logs WHERE correlation_id = $1::uuid`,
      correlationId
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe("INCIDENT_ZONE_ASSIGNED");
    expect(rows[0]!.result).toBe("SUCCESS");
    expect(Object.keys(rows[0]!.context).sort()).toEqual(
      ["assignment_kind", "incident_id", "operational_zone_id", "reason_code", "resolution_method"].sort()
    );
    expect(JSON.stringify(rows[0]!.context)).not.toMatch(/POLYGON|POINT\(|@|legal_name/i);
  });
});
