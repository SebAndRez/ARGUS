import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
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
 * tests/database-target/incident-operational-zone-idempotency.test.ts
 *
 * Two different guarantees that are easy to conflate:
 *
 *   * the SAME idempotency key must resolve to the SAME row — a retried
 *     assignment is not a second, silently overlapping relation;
 *   * a DIFFERENT key for the same live relation must not produce a duplicate
 *     either, because the relation itself is what is unique, not the key.
 *
 * The second is the one a key-only design gets wrong: a client that loses its
 * key and generates a new one would otherwise create a twin row, and revoking
 * one would leave the other authorizing.
 */
describe.skipIf(!incidentZoneDockerShouldRun)("assignment idempotency", () => {
  let fixture: IncidentZoneFixture;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31Idempotency");
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  async function assign(overrides: Record<string, unknown> = {}) {
    const admin = await adminClient();
    return withActor(admin, fixture.personAId, (tx) =>
      assignIncidentOperationalZone(tx, {
        incidentId: fixture.incidentSpatialId,
        operationalZoneId: fixture.zoneAId,
        assignmentKind: "MONITORING",
        resolutionMethod: "MANUAL",
        assignedBySubjectId: fixture.subjectAId,
        reasonCode: "MONITORING_ADDED",
        correlationId: randomUUID(),
        ...overrides,
      } as Parameters<typeof assignIncidentOperationalZone>[1])
    );
  }

  it("the same idempotency key returns the SAME assignment id", async () => {
    const key = randomUUID();
    const first = await assign({ idempotencyKey: key });
    const second = await assign({ idempotencyKey: key });
    expect(second).toBe(first);

    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM geo.incident_operational_zone_assignments WHERE idempotency_key = $1::uuid`,
      key
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("a retry writes no second audit row", async () => {
    const key = randomUUID();
    const correlationId = randomUUID();
    await assign({ idempotencyKey: key, correlationId, operationalZoneId: fixture.zoneBId });
    await assign({ idempotencyKey: key, correlationId, operationalZoneId: fixture.zoneBId });

    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM security.audit_logs
        WHERE action = 'INCIDENT_ZONE_ASSIGNED' AND correlation_id = $1::uuid`,
      correlationId
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("a DIFFERENT key for the same live relation resolves to the existing row instead of duplicating it", async () => {
    const first = await assign({ idempotencyKey: randomUUID(), operationalZoneId: fixture.zoneCrossId });
    const second = await assign({ idempotencyKey: randomUUID(), operationalZoneId: fixture.zoneCrossId });
    expect(second).toBe(first);

    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM geo.incident_operational_zone_assignments
        WHERE incident_id = $1::uuid AND operational_zone_id = $2::uuid
          AND assignment_kind = 'MONITORING' AND status = 'ACTIVE'`,
      fixture.incidentSpatialId,
      fixture.zoneCrossId
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("the idempotency key is globally unique, so it cannot be reused across relations", async () => {
    const key = randomUUID();
    await assign({ idempotencyKey: key, operationalZoneId: fixture.zoneAId, assignmentKind: "AFFECTED" });
    // Same key, different relation: the key check fires FIRST and returns the
    // original row rather than creating the requested one.
    const reused = await assign({ idempotencyKey: key, operationalZoneId: fixture.zoneBId, assignmentKind: "AFFECTED" });

    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ operational_zone_id: string }>(
      `SELECT operational_zone_id FROM geo.incident_operational_zone_assignments WHERE id = $1::uuid`,
      reused
    );
    expect(rows[0]!.operational_zone_id).toBe(fixture.zoneAId);
  });

  it("idempotency is evaluated BEFORE validation, so a retry cannot be rejected for a state it created itself", async () => {
    const key = randomUUID();
    const correlationId = randomUUID();
    const id = await assign({
      idempotencyKey: key,
      correlationId,
      operationalZoneId: fixture.zoneAId,
      assignmentKind: "COMMAND",
      reasonCode: "HUMAN_COMMAND_CONFIRMATION",
    });

    // The relation now exists and is ACTIVE. A naive implementation would
    // re-run the COMMAND validations, hit "already exists", and fail the retry.
    const retry = await assign({
      idempotencyKey: key,
      correlationId,
      operationalZoneId: fixture.zoneAId,
      assignmentKind: "COMMAND",
      reasonCode: "HUMAN_COMMAND_CONFIRMATION",
    });
    expect(retry).toBe(id);
  });
});
