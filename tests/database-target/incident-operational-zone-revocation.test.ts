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
import {
  revokeIncidentOperationalZoneAssignment,
  supersedeIncidentOperationalZoneAssignment,
} from "../../src/lib/database-target/repositories/incidentOperationalZoneRepository";
import { closeTargetPrincipalClients, closeTargetPrismaClient } from "../../src/lib/database-target/client/targetPrismaClient";

/**
 * tests/database-target/incident-operational-zone-revocation.test.ts
 *
 * Revocation and supersession: both are STATUS TRANSITIONS, never deletes.
 * The row is the history, so what is asserted here is that authority stops
 * immediately while the record survives — and that neither transition can be
 * used to resurrect the other.
 */
describe.skipIf(!incidentZoneDockerShouldRun)("revocation and supersession", () => {
  let fixture: IncidentZoneFixture;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31Revocation");
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("revoking the COMMAND assignment denies command immediately, with no grace window", async () => {
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(true);

    const admin = await adminClient();
    const revoked = await withActor(admin, fixture.personAId, (tx) =>
      revokeIncidentOperationalZoneAssignment(tx, {
        assignmentId: fixture.commandAssignmentId,
        reasonCode: "COMMAND_WITHDRAWN",
        revokedBySubjectId: fixture.subjectAId,
        correlationId: randomUUID(),
      })
    );
    expect(revoked).toBe(true);

    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);
  });

  it("preserves the revoked row, its reason and its revoker", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{
      status: string;
      revoked_at: Date | null;
      revocation_reason_code: string | null;
      revoked_by_subject_id: string | null;
    }>(
      `SELECT status, revoked_at, revocation_reason_code, revoked_by_subject_id
         FROM geo.incident_operational_zone_assignments WHERE id = $1::uuid`,
      fixture.commandAssignmentId
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("REVOKED");
    expect(rows[0]!.revoked_at).not.toBeNull();
    expect(rows[0]!.revocation_reason_code).toBe("COMMAND_WITHDRAWN");
    expect(rows[0]!.revoked_by_subject_id).toBe(fixture.subjectAId);
  });

  it("re-revoking is a no-op returning false, not a second history entry", async () => {
    const admin = await adminClient();
    const again = await withActor(admin, fixture.personAId, (tx) =>
      revokeIncidentOperationalZoneAssignment(tx, {
        assignmentId: fixture.commandAssignmentId,
        reasonCode: "COMMAND_WITHDRAWN",
        revokedBySubjectId: fixture.subjectAId,
      })
    );
    expect(again).toBe(false);

    const owner = raw(await ownerClient());
    const audits = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM security.audit_logs
        WHERE action = 'INCIDENT_ZONE_REVOKED' AND target_id = $1::uuid`,
      fixture.commandAssignmentId
    );
    expect(Number(audits[0]!.n)).toBe(1);
  });

  it("rejects a free-text revocation reason", async () => {
    const admin = await adminClient();
    await expect(
      withActor(admin, fixture.personAId, (tx) =>
        revokeIncidentOperationalZoneAssignment(tx, {
          assignmentId: fixture.affectedAssignmentId,
          reasonCode: "because we felt like it",
        })
      )
    ).rejects.toThrow(/INCIDENT_ZONE_REVOCATION_REASON_INVALID/);
  });

  it("a REVOKED assignment cannot be superseded back into life", async () => {
    const admin = await adminClient();
    await expect(
      withActor(admin, fixture.personAId, (tx) =>
        supersedeIncidentOperationalZoneAssignment(tx, {
          assignmentId: fixture.commandAssignmentId,
          operationalZoneId: fixture.zoneAId,
          assignmentKind: "COMMAND",
          resolutionMethod: "MANUAL",
          reasonCode: "SHOULD_FAIL",
          assignedBySubjectId: fixture.subjectAId,
          correlationId: randomUUID(),
        })
      )
    ).rejects.toThrow(/INCIDENT_ZONE_NOT_ACTIVE/);
  });

  it("supersession preserves the predecessor, links it to its successor, and keeps exactly one ACTIVE", async () => {
    const admin = await adminClient();
    const newId = await withActor(admin, fixture.personAId, (tx) =>
      supersedeIncidentOperationalZoneAssignment(tx, {
        assignmentId: fixture.primaryAssignmentId,
        operationalZoneId: fixture.zoneBId,
        assignmentKind: "PRIMARY",
        resolutionMethod: "MANUAL",
        reasonCode: "ZONE_CORRECTED",
        assignedBySubjectId: fixture.subjectAId,
        correlationId: randomUUID(),
      })
    );

    const owner = raw(await ownerClient());
    const predecessor = await owner.$queryRawUnsafe<{ status: string; superseded_by_assignment_id: string | null }>(
      `SELECT status, superseded_by_assignment_id FROM geo.incident_operational_zone_assignments WHERE id = $1::uuid`,
      fixture.primaryAssignmentId
    );
    expect(predecessor[0]!.status).toBe("SUPERSEDED");
    expect(predecessor[0]!.superseded_by_assignment_id).toBe(newId);

    const active = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM geo.incident_operational_zone_assignments
        WHERE incident_id = $1::uuid AND assignment_kind = 'PRIMARY' AND status = 'ACTIVE'`,
      fixture.incidentPrimaryId
    );
    expect(Number(active[0]!.n)).toBe(1);
  });

  it("a SUPERSEDED assignment is not rewritten into REVOKED by a later revoke", async () => {
    const admin = await adminClient();
    const result = await withActor(admin, fixture.personAId, (tx) =>
      revokeIncidentOperationalZoneAssignment(tx, {
        assignmentId: fixture.primaryAssignmentId,
        reasonCode: "TOO_LATE",
      })
    );
    expect(result).toBe(false);

    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ status: string }>(
      `SELECT status FROM geo.incident_operational_zone_assignments WHERE id = $1::uuid`,
      fixture.primaryAssignmentId
    );
    expect(rows[0]!.status).toBe("SUPERSEDED");
  });

  it("an expired COMMAND assignment stops authorizing without being revoked at all", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE geo.incident_operational_zone_assignments
          SET status = 'ACTIVE', revoked_at = NULL, revocation_reason_code = NULL, revoked_by_subject_id = NULL
        WHERE id = $1::uuid`,
      fixture.commandAssignmentId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(true);

    await owner.$executeRawUnsafe(
      `UPDATE geo.incident_operational_zone_assignments SET valid_until = now() - interval '1 minute' WHERE id = $1::uuid`,
      fixture.commandAssignmentId
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentCommandId)).resolves.toBe(false);
  });
});
