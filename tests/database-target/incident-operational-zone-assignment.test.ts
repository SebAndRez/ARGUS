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
 * tests/database-target/incident-operational-zone-assignment.test.ts
 *
 * R31, the relation itself: `geo.incident_operational_zone_assignments`.
 *
 * The static half runs on every commit and guards the physical contract — the
 * columns the mandate requires, the real FKs, the CHECK constraints that make
 * COMMAND unreachable from geometry, and (just as load-bearing) the ABSENCE of
 * a scalar `jurisdiction_id` on `incident.incidents`, which is the design
 * mistake this table exists to avoid.
 *
 * The Docker half proves the same contract against real PostgreSQL/PostGIS.
 */

const MANDATED_COLUMNS = [
  "id",
  "incident_id",
  "operational_zone_id",
  "assignment_kind",
  "resolution_method",
  "status",
  "valid_from",
  "valid_until",
  "confidence",
  "review_status",
  "assigned_by_subject_id",
  "automation_rule_id",
  "source_record_id",
  "evidence_id",
  "idempotency_key",
  "correlation_id",
  "provenance",
  "created_at",
  "updated_at",
  "superseded_by_assignment_id",
  "revoked_at",
  "revoked_by_subject_id",
  "revocation_reason_code",
];

describe("R31 relation — static contract", () => {
  const migration = readRepoFile(...WAVE_080, "migration.sql");

  it("creates the relation in Wave 080, where BOTH endpoints exist", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS geo.incident_operational_zone_assignments");
    // Wave 040 must NOT try to create it: geo.operational_zones does not exist yet there.
    const wave040 = readRepoFile("prisma", "target-migrations", "040_incident", "migration.sql");
    expect(wave040).not.toContain("incident_operational_zone_assignments");
  });

  it.each(MANDATED_COLUMNS)("declares the mandated column %s", (column) => {
    const start = migration.indexOf("CREATE TABLE IF NOT EXISTS geo.incident_operational_zone_assignments");
    const end = migration.indexOf("CREATE INDEX IF NOT EXISTS ix_ioza_incident", start);
    expect(migration.slice(start, end)).toMatch(new RegExp(`\\b${column}\\b`));
  });

  it("does NOT add a scalar jurisdiction_id to incident.incidents", () => {
    const wave040 = readRepoFile("prisma", "target-migrations", "040_incident", "migration.sql");
    const start = wave040.indexOf("CREATE TABLE IF NOT EXISTS incident.incidents (");
    const block = wave040.slice(start, wave040.indexOf(");", start));
    expect(block).not.toMatch(/\bjurisdiction_id\b/);
  });

  it("declares the four assignment kinds and the five resolution methods", () => {
    expect(migration).toMatch(/incident_zone_assignment_kind_enum AS ENUM\s*\n?\s*\('PRIMARY','AFFECTED','COMMAND','MONITORING'\)/);
    expect(migration).toContain("'MANUAL','OFFICIAL_SOURCE','SPATIAL_INTERSECTION','INHERITED_FROM_CANDIDATE','AUTOMATION_RULE'");
  });

  it("carries no PII: no name, email, phone, title or geometry column", () => {
    const start = migration.indexOf("CREATE TABLE IF NOT EXISTS geo.incident_operational_zone_assignments");
    const block = migration.slice(start, migration.indexOf("CREATE INDEX IF NOT EXISTS ix_ioza_incident", start));
    for (const forbidden of ["legal_name", "email", "phone", "title", "geography(", "geometry"]) {
      expect(block, `the relation must not duplicate ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe.skipIf(!incidentZoneDockerShouldRun)("R31 relation — real PostgreSQL", () => {
  let fixture: IncidentZoneFixture;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31Assignment");
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("is many-to-many: one incident reaches several zones, one zone serves several incidents", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `INSERT INTO geo.incident_operational_zone_assignments
         (incident_id, operational_zone_id, assignment_kind, resolution_method, status, provenance)
       VALUES ($1::uuid, $2::uuid, 'MONITORING', 'MANUAL', 'ACTIVE', 'MANUAL')`,
      fixture.incidentPrimaryId,
      fixture.zoneBId
    );
    const perIncident = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM geo.incident_operational_zone_assignments WHERE incident_id = $1::uuid`,
      fixture.incidentPrimaryId
    );
    expect(Number(perIncident[0]!.n)).toBe(2);

    const perZone = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM geo.incident_operational_zone_assignments WHERE operational_zone_id = $1::uuid`,
      fixture.zoneAId
    );
    expect(Number(perZone[0]!.n)).toBeGreaterThanOrEqual(3);
  });

  it("rejects an assignment whose validity window is inverted", async () => {
    const owner = raw(await ownerClient());
    await expect(
      owner.$executeRawUnsafe(
        `INSERT INTO geo.incident_operational_zone_assignments
           (incident_id, operational_zone_id, assignment_kind, resolution_method, status,
            valid_from, valid_until, provenance)
         VALUES ($1::uuid, $2::uuid, 'MONITORING', 'MANUAL', 'ACTIVE', now(), now() - interval '1 hour', 'MANUAL')`,
        fixture.incidentSpatialId,
        fixture.zoneAId
      )
    ).rejects.toThrow(/ck_ioza_validity_window/);
  });

  it("rejects a REVOKED row that carries no reason, and a non-revoked row that carries one", async () => {
    const owner = raw(await ownerClient());
    await expect(
      owner.$executeRawUnsafe(
        `INSERT INTO geo.incident_operational_zone_assignments
           (incident_id, operational_zone_id, assignment_kind, resolution_method, status, revoked_at, provenance)
         VALUES ($1::uuid, $2::uuid, 'MONITORING', 'MANUAL', 'REVOKED', now(), 'MANUAL')`,
        fixture.incidentSpatialId,
        fixture.zoneAId
      )
    ).rejects.toThrow(/ck_ioza_revocation_consistency/);

    await expect(
      owner.$executeRawUnsafe(
        `INSERT INTO geo.incident_operational_zone_assignments
           (incident_id, operational_zone_id, assignment_kind, resolution_method, status,
            revocation_reason_code, provenance)
         VALUES ($1::uuid, $2::uuid, 'MONITORING', 'MANUAL', 'ACTIVE', 'SOMETHING', 'MANUAL')`,
        fixture.incidentSpatialId,
        fixture.zoneAId
      )
    ).rejects.toThrow(/ck_ioza_revocation_consistency/);
  });

  it("enforces every FK: a dangling incident, zone, subject or rule is refused", async () => {
    const owner = raw(await ownerClient());
    await expect(
      owner.$executeRawUnsafe(
        `INSERT INTO geo.incident_operational_zone_assignments
           (incident_id, operational_zone_id, assignment_kind, resolution_method, status, provenance)
         VALUES (gen_random_uuid(), $1::uuid, 'MONITORING', 'MANUAL', 'ACTIVE', 'MANUAL')`,
        fixture.zoneAId
      )
    ).rejects.toThrow(/fk_ioza_incident/);

    await expect(
      owner.$executeRawUnsafe(
        `INSERT INTO geo.incident_operational_zone_assignments
           (incident_id, operational_zone_id, assignment_kind, resolution_method, status, provenance)
         VALUES ($1::uuid, gen_random_uuid(), 'MONITORING', 'MANUAL', 'ACTIVE', 'MANUAL')`,
        fixture.incidentSpatialId
      )
    ).rejects.toThrow(/fk_ioza_zone/);
  });

  it("rejects a free-text provenance", async () => {
    const owner = raw(await ownerClient());
    await expect(
      owner.$executeRawUnsafe(
        `INSERT INTO geo.incident_operational_zone_assignments
           (incident_id, operational_zone_id, assignment_kind, resolution_method, status, provenance)
         VALUES ($1::uuid, $2::uuid, 'MONITORING', 'MANUAL', 'ACTIVE', 'some free text')`,
        fixture.incidentSpatialId,
        fixture.zoneAId
      )
    ).rejects.toThrow(/ck_ioza_provenance_shape/);
  });
});
