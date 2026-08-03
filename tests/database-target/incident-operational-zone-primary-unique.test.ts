import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  WAVE_080,
  createIncidentZoneFixture,
  dropIncidentZoneFixture,
  incidentZoneDockerShouldRun,
  ownerClient,
  raw,
  readRepoFile,
  type IncidentZoneFixture,
} from "./incidentZoneTestHelpers";
import { closeTargetPrincipalClients, closeTargetPrismaClient } from "../../src/lib/database-target/client/targetPrismaClient";

/**
 * tests/database-target/incident-operational-zone-primary-unique.test.ts
 *
 * At most ONE active PRIMARY zone per incident, and no duplicate ACTIVE
 * (incident, zone, kind) triple.
 *
 * Both are partial unique INDEXES rather than application checks, because the
 * failure they prevent is silent: two ACTIVE COMMAND rows would mean revoking
 * one leaves the other authorizing, so the revocation would appear to succeed
 * while access continued.
 */
describe("PRIMARY uniqueness — static contract", () => {
  const migration = readRepoFile(...WAVE_080, "migration.sql");

  it("declares the one-ACTIVE-PRIMARY-per-incident partial unique index", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_ioza_active_primary_per_incident[\s\S]{0,200}WHERE assignment_kind = 'PRIMARY' AND status = 'ACTIVE'/
    );
  });

  it("declares the no-duplicate-ACTIVE-equivalent partial unique index", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_ioza_active_equivalent[\s\S]{0,220}\(incident_id, operational_zone_id, assignment_kind\)[\s\S]{0,60}WHERE status = 'ACTIVE'/
    );
  });
});

describe.skipIf(!incidentZoneDockerShouldRun)("PRIMARY uniqueness — real PostgreSQL", () => {
  let fixture: IncidentZoneFixture;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31PrimaryUnique");
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("rejects a second ACTIVE PRIMARY for the same incident, even on a different zone", async () => {
    const owner = raw(await ownerClient());
    await expect(
      owner.$executeRawUnsafe(
        `INSERT INTO geo.incident_operational_zone_assignments
           (incident_id, operational_zone_id, assignment_kind, resolution_method, status, provenance)
         VALUES ($1::uuid, $2::uuid, 'PRIMARY', 'MANUAL', 'ACTIVE', 'MANUAL')`,
        fixture.incidentPrimaryId,
        fixture.zoneBId
      )
      // The driver reports a unique violation by KEY COLUMNS rather than by
      // index name, so the key shape is what identifies which index fired:
      // `(incident_id)` is the one-ACTIVE-PRIMARY-per-incident index.
    ).rejects.toThrow(/Code: `23505`[\s\S]*Key \(incident_id\)=/);
  });

  it("rejects a duplicate ACTIVE (incident, zone, kind) triple", async () => {
    const owner = raw(await ownerClient());
    await expect(
      owner.$executeRawUnsafe(
        `INSERT INTO geo.incident_operational_zone_assignments
           (incident_id, operational_zone_id, assignment_kind, resolution_method, status, provenance)
         VALUES ($1::uuid, $2::uuid, 'MONITORING', 'MANUAL', 'ACTIVE', 'MANUAL')`,
        fixture.incidentAffectedId,
        fixture.zoneAId
      )
    ).resolves.toBeDefined();
    await expect(
      owner.$executeRawUnsafe(
        `INSERT INTO geo.incident_operational_zone_assignments
           (incident_id, operational_zone_id, assignment_kind, resolution_method, status, provenance)
         VALUES ($1::uuid, $2::uuid, 'MONITORING', 'MANUAL', 'ACTIVE', 'MANUAL')`,
        fixture.incidentAffectedId,
        fixture.zoneAId
      )
    ).rejects.toThrow(/Code: `23505`[\s\S]*Key \(incident_id, operational_zone_id, assignment_kind\)=/);
  });

  it("ALLOWS a second PRIMARY once the first is no longer ACTIVE — history does not block correction", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `UPDATE geo.incident_operational_zone_assignments
          SET status = 'REVOKED', revoked_at = now(), revocation_reason_code = 'ZONE_CORRECTED'
        WHERE id = $1::uuid`,
      fixture.primaryAssignmentId
    );
    await owner.$executeRawUnsafe(
      `INSERT INTO geo.incident_operational_zone_assignments
         (incident_id, operational_zone_id, assignment_kind, resolution_method, status, provenance)
       VALUES ($1::uuid, $2::uuid, 'PRIMARY', 'MANUAL', 'ACTIVE', 'MANUAL')`,
      fixture.incidentPrimaryId,
      fixture.zoneBId
    );

    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM geo.incident_operational_zone_assignments
        WHERE incident_id = $1::uuid AND assignment_kind = 'PRIMARY' AND status = 'ACTIVE'`,
      fixture.incidentPrimaryId
    );
    expect(Number(rows[0]!.n)).toBe(1);

    // ...and the revoked one is still there. The row IS the history.
    const history = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM geo.incident_operational_zone_assignments
        WHERE incident_id = $1::uuid AND assignment_kind = 'PRIMARY'`,
      fixture.incidentPrimaryId
    );
    expect(Number(history[0]!.n)).toBe(2);
  });

  it("allows DIFFERENT kinds on the same (incident, zone) pair — the uniqueness is per kind", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `INSERT INTO geo.incident_operational_zone_assignments
         (incident_id, operational_zone_id, assignment_kind, resolution_method, status, provenance)
       VALUES ($1::uuid, $2::uuid, 'MONITORING', 'MANUAL', 'ACTIVE', 'MANUAL')`,
      fixture.incidentPrimaryId,
      fixture.zoneBId
    );
    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM geo.incident_operational_zone_assignments
        WHERE incident_id = $1::uuid AND operational_zone_id = $2::uuid AND status = 'ACTIVE'`,
      fixture.incidentPrimaryId,
      fixture.zoneBId
    );
    expect(Number(rows[0]!.n)).toBe(2);
  });

  it("also caps ACTIVE PRIMARY jurisdictions per zone", async () => {
    const owner = raw(await ownerClient());
    await expect(
      owner.$executeRawUnsafe(
        `INSERT INTO geo.operational_zone_jurisdiction_assignments
           (operational_zone_id, jurisdiction_id, relation_kind, status, provenance)
         VALUES ($1::uuid, $2::uuid, 'PRIMARY', 'ACTIVE', 'MANUAL')`,
        fixture.zoneAId,
        fixture.jurisdictionBId
      )
    ).rejects.toThrow(/Code: `23505`[\s\S]*Key \(operational_zone_id\)=/);
  });
});
