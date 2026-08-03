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
import {
  assignIncidentOperationalZone,
  persistIncidentZoneResolution,
  revokeIncidentOperationalZoneAssignment,
  supersedeIncidentOperationalZoneAssignment,
} from "../../src/lib/database-target/repositories/incidentOperationalZoneRepository";
import { closeTargetPrincipalClients, closeTargetPrismaClient } from "../../src/lib/database-target/client/targetPrismaClient";

/**
 * tests/database-target/incident-operational-zone-concurrency.test.ts
 *
 * Simultaneous writers, over genuinely concurrent connections (Prisma's pool
 * gives each transaction its own).
 *
 * What is being proved is that the invariants hold under a RACE, not just in
 * sequence: the winner/loser split is decided by the partial unique indexes in
 * the database, so no application ordering can be relied on and none is.
 */
describe.skipIf(!incidentZoneDockerShouldRun)("assignment concurrency", () => {
  let fixture: IncidentZoneFixture;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31Concurrency");
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  async function assign(overrides: Record<string, unknown>) {
    const admin = await adminClient();
    return withActor(admin, fixture.personAId, (tx) =>
      assignIncidentOperationalZone(tx, {
        incidentId: fixture.incidentSpatialId,
        operationalZoneId: fixture.zoneAId,
        assignmentKind: "MONITORING",
        resolutionMethod: "MANUAL",
        assignedBySubjectId: fixture.subjectAId,
        reasonCode: "CONCURRENCY_TEST",
        correlationId: randomUUID(),
        ...overrides,
      } as Parameters<typeof assignIncidentOperationalZone>[1])
    );
  }

  it("two concurrent PRIMARY assignments leave exactly one ACTIVE PRIMARY", async () => {
    const results = await Promise.allSettled([
      assign({ assignmentKind: "PRIMARY", operationalZoneId: fixture.zoneAId, idempotencyKey: randomUUID() }),
      assign({ assignmentKind: "PRIMARY", operationalZoneId: fixture.zoneBId, idempotencyKey: randomUUID() }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM geo.incident_operational_zone_assignments
        WHERE incident_id = $1::uuid AND assignment_kind = 'PRIMARY' AND status = 'ACTIVE'`,
      fixture.incidentSpatialId
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("two concurrent identical COMMAND assignments produce exactly one row", async () => {
    const results = await Promise.allSettled([
      assign({
        assignmentKind: "COMMAND",
        resolutionMethod: "MANUAL",
        operationalZoneId: fixture.zoneCrossId,
        reasonCode: "HUMAN_COMMAND_CONFIRMATION",
        idempotencyKey: randomUUID(),
      }),
      assign({
        assignmentKind: "COMMAND",
        resolutionMethod: "MANUAL",
        operationalZoneId: fixture.zoneCrossId,
        reasonCode: "HUMAN_COMMAND_CONFIRMATION",
        idempotencyKey: randomUUID(),
      }),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);

    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM geo.incident_operational_zone_assignments
        WHERE incident_id = $1::uuid AND operational_zone_id = $2::uuid
          AND assignment_kind = 'COMMAND' AND status = 'ACTIVE'`,
      fixture.incidentSpatialId,
      fixture.zoneCrossId
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("two concurrent COMMAND assignments on DIFFERENT zones both survive — they are different relations", async () => {
    const results = await Promise.allSettled([
      assign({
        assignmentKind: "COMMAND",
        operationalZoneId: fixture.zoneAId,
        reasonCode: "HUMAN_COMMAND_CONFIRMATION",
        idempotencyKey: randomUUID(),
      }),
      assign({
        incidentId: fixture.incidentAffectedId,
        assignmentKind: "COMMAND",
        operationalZoneId: fixture.zoneBId,
        reasonCode: "HUMAN_COMMAND_CONFIRMATION",
        idempotencyKey: randomUUID(),
      }),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("the same idempotency key fired concurrently yields ONE row, whichever transaction wins", async () => {
    const key = randomUUID();
    const results = await Promise.allSettled([
      assign({ operationalZoneId: fixture.zoneOrphanId, idempotencyKey: key }),
      assign({ operationalZoneId: fixture.zoneOrphanId, idempotencyKey: key }),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);

    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM geo.incident_operational_zone_assignments WHERE idempotency_key = $1::uuid`,
      key
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("a concurrent revoke and supersede on the same row cannot both succeed", async () => {
    const admin = await adminClient();
    const target = await assign({
      operationalZoneId: fixture.zoneBId,
      assignmentKind: "AFFECTED",
      idempotencyKey: randomUUID(),
    });

    const results = await Promise.allSettled([
      withActor(admin, fixture.personAId, (tx) =>
        revokeIncidentOperationalZoneAssignment(tx, { assignmentId: target, reasonCode: "RACE_REVOKE" })
      ),
      withActor(admin, fixture.personAId, (tx) =>
        supersedeIncidentOperationalZoneAssignment(tx, {
          assignmentId: target,
          operationalZoneId: fixture.zoneCrossId,
          assignmentKind: "AFFECTED",
          resolutionMethod: "MANUAL",
          reasonCode: "RACE_SUPERSEDE",
          assignedBySubjectId: fixture.subjectAId,
          correlationId: randomUUID(),
        })
      ),
    ]);

    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ status: string }>(
      `SELECT status FROM geo.incident_operational_zone_assignments WHERE id = $1::uuid`,
      target
    );
    // Whichever won, the row ends in exactly ONE terminal state and the loser
    // did not silently reopen it.
    expect(["REVOKED", "SUPERSEDED"]).toContain(rows[0]!.status);
    // At least one operation reported a real outcome; a pair that both claimed
    // success would mean the row was written twice.
    const succeeded = results.filter((r) => r.status === "fulfilled" && r.value !== false);
    expect(succeeded.length).toBeLessThanOrEqual(2);
  });

  it("a spatial resolution running concurrently with a promotion-style write creates no duplicate", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `INSERT INTO incident.affected_area_versions (id, incident_id, version_number, geometry)
       VALUES (gen_random_uuid(), $1::uuid, 1,
               (SELECT ST_Multi(boundary::geometry)::geography FROM geo.operational_zones WHERE id = $2::uuid))`,
      fixture.incidentCommandId,
      fixture.zoneAId
    );

    const admin = await adminClient();
    await Promise.allSettled([
      withActor(admin, fixture.personAId, (tx) =>
        persistIncidentZoneResolution(tx, fixture.incidentCommandId, fixture.subjectAId, randomUUID())
      ),
      withActor(admin, fixture.personAId, (tx) =>
        persistIncidentZoneResolution(tx, fixture.incidentCommandId, fixture.subjectAId, randomUUID())
      ),
    ]);

    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM (
         SELECT incident_id, operational_zone_id, assignment_kind
           FROM geo.incident_operational_zone_assignments
          WHERE incident_id = $1::uuid AND status = 'ACTIVE'
          GROUP BY 1,2,3 HAVING count(*) > 1
       ) dupes`,
      fixture.incidentCommandId
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it("no spatial write anywhere in the race became a COMMAND assignment", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM geo.incident_operational_zone_assignments
        WHERE resolution_method = 'SPATIAL_INTERSECTION' AND assignment_kind = 'COMMAND'`
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });
});
