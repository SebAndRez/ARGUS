import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  WAVE_080,
  adminClient,
  askHasCommandRole,
  createIncidentZoneFixture,
  dropIncidentZoneFixture,
  incidentZoneDockerShouldRun,
  ownerClient,
  raw,
  readRepoFile,
  withActor,
  type IncidentZoneFixture,
} from "./incidentZoneTestHelpers";
import {
  assignIncidentOperationalZone,
  persistIncidentZoneResolution,
} from "../../src/lib/database-target/repositories/incidentOperationalZoneRepository";
import { closeTargetPrincipalClients, closeTargetPrismaClient } from "../../src/lib/database-target/client/targetPrismaClient";

/**
 * tests/database-target/spatial-resolution-never-grants-command.test.ts
 *
 * THE invariant: no geographic intersection, however complete, ever confers
 * command. Geometry answers WHERE something is; command is an act of
 * authority that a human (or an expressly authorized rule) performs.
 *
 * Guarded at four independent layers, each asserted here, because any one of
 * them could be edited away on its own:
 *   1. the resolver never proposes COMMAND;
 *   2. the persist path hard-codes SPATIAL_INTERSECTION;
 *   3. `ck_ioza_spatial_never_command` rejects the row physically;
 *   4. no RLS policy anywhere evaluates a PostGIS predicate, so intersection
 *      cannot leak into an authorization decision by the back door.
 */
describe("geometry never commands — static contract", () => {
  const migration = readRepoFile(...WAVE_080, "migration.sql");

  it("declares the CHECK that forbids SPATIAL_INTERSECTION from producing COMMAND", () => {
    expect(migration).toMatch(
      /CONSTRAINT ck_ioza_spatial_never_command CHECK \([\s\S]{0,200}resolution_method <> 'SPATIAL_INTERSECTION'[\s\S]{0,120}assignment_kind IN \('AFFECTED','MONITORING'\)/
    );
  });

  it("declares the CHECK that forbids INHERITED_FROM_CANDIDATE from producing COMMAND", () => {
    expect(migration).toMatch(
      /CONSTRAINT ck_ioza_inherited_never_command CHECK \([\s\S]{0,200}resolution_method <> 'INHERITED_FROM_CANDIDATE'[\s\S]{0,140}assignment_kind IN \('PRIMARY','AFFECTED','MONITORING'\)/
    );
  });

  it("the persist function hard-codes SPATIAL_INTERSECTION and never names COMMAND", () => {
    const start = migration.indexOf("CREATE OR REPLACE FUNCTION geo.fn_persist_incident_zone_resolution");
    const body = migration.slice(start, migration.indexOf("$fn$;", start));
    expect(body).toContain("'SPATIAL_INTERSECTION'");
    expect(body).not.toContain("'COMMAND'");
  });

  it("no RLS policy in the wave evaluates a PostGIS predicate", () => {
    const policySections = migration.split("CREATE POLICY").slice(1);
    for (const section of policySections) {
      const head = section.slice(0, section.indexOf(";"));
      expect(head).not.toMatch(/ST_Intersects|ST_Covers|ST_Within|ST_Contains|ST_DWithin/i);
    }
  });

  it("fn_has_command_role contains no spatial predicate at all", () => {
    const start = migration.indexOf("CREATE OR REPLACE FUNCTION security.fn_has_command_role");
    const body = migration.slice(start, migration.indexOf("$fn$;", start));
    expect(body).not.toMatch(/ST_Intersects|ST_Covers|ST_Within|ST_Contains|ST_DWithin/i);
  });
});

describe.skipIf(!incidentZoneDockerShouldRun)("geometry never commands — real PostGIS", () => {
  let fixture: IncidentZoneFixture;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31NoCmdFromGeom");
    const owner = raw(await ownerClient());
    // The incident's affected area is EXACTLY the COMMAND-capable zone: total
    // overlap, the strongest possible geometric evidence.
    await owner.$executeRawUnsafe(
      `INSERT INTO incident.affected_area_versions (id, incident_id, version_number, geometry)
       VALUES (gen_random_uuid(), $1::uuid, 1,
               (SELECT ST_Multi(boundary::geometry)::geography FROM geo.operational_zones WHERE id = $2::uuid))`,
      fixture.incidentSpatialId,
      fixture.zoneAId
    );
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("total geometric coverage still proposes only AFFECTED", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ proposed_assignment_kind: string; covered: boolean }>(
      `SELECT proposed_assignment_kind::text, covered
         FROM geo.fn_resolve_incident_operational_zones($1::uuid)
        WHERE operational_zone_id = $2::uuid`,
      fixture.incidentSpatialId,
      fixture.zoneAId
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.covered).toBe(true);
    expect(rows[0]!.proposed_assignment_kind).toBe("AFFECTED");
  });

  it("persisting that resolution grants no command", async () => {
    const admin = await adminClient();
    await withActor(admin, fixture.personAId, (tx) =>
      persistIncidentZoneResolution(tx, fixture.incidentSpatialId, fixture.subjectAId, randomUUID())
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentSpatialId)).resolves.toBe(false);
  });

  it("the database physically refuses a COMMAND row written with SPATIAL_INTERSECTION", async () => {
    const owner = raw(await ownerClient());
    await expect(
      owner.$executeRawUnsafe(
        `INSERT INTO geo.incident_operational_zone_assignments
           (incident_id, operational_zone_id, assignment_kind, resolution_method, status,
            correlation_id, provenance, assigned_by_subject_id)
         VALUES ($1::uuid, $2::uuid, 'COMMAND', 'SPATIAL_INTERSECTION', 'ACTIVE', gen_random_uuid(), 'MANUAL', $3::uuid)`,
        fixture.incidentSpatialId,
        fixture.zoneCrossId,
        fixture.subjectAId
      )
      // TWO constraints independently forbid this row —
      // ck_ioza_spatial_never_command (a spatial method may only be
      // AFFECTED/MONITORING) and ck_ioza_command_requires_authorizable_method
      // (a COMMAND row needs MANUAL/OFFICIAL_SOURCE/AUTOMATION_RULE). Which
      // one PostgreSQL reports is evaluation order, not contract, so either
      // name is a pass; asserting one exactly would be asserting the planner.
    ).rejects.toThrow(/ck_ioza_spatial_never_command|ck_ioza_command_requires_authorizable_method/);
  });

  it("the assignment function refuses it too, with a named error rather than a raw constraint violation", async () => {
    const admin = await adminClient();
    await expect(
      withActor(admin, fixture.personAId, (tx) =>
        assignIncidentOperationalZone(tx, {
          incidentId: fixture.incidentSpatialId,
          operationalZoneId: fixture.zoneCrossId,
          assignmentKind: "COMMAND",
          resolutionMethod: "SPATIAL_INTERSECTION",
          assignedBySubjectId: fixture.subjectAId,
          reasonCode: "SHOULD_FAIL",
          correlationId: randomUUID(),
        })
      )
    ).rejects.toThrow(/INCIDENT_ZONE_COMMAND_METHOD_FORBIDDEN/);
  });

  it("an UPDATE cannot smuggle an existing spatial row into COMMAND either", async () => {
    const owner = raw(await ownerClient());
    await expect(
      owner.$executeRawUnsafe(
        `UPDATE geo.incident_operational_zone_assignments SET assignment_kind = 'COMMAND'
          WHERE incident_id = $1::uuid AND resolution_method = 'SPATIAL_INTERSECTION'`,
        fixture.incidentSpatialId
      )
      // TWO constraints independently forbid this row —
      // ck_ioza_spatial_never_command (a spatial method may only be
      // AFFECTED/MONITORING) and ck_ioza_command_requires_authorizable_method
      // (a COMMAND row needs MANUAL/OFFICIAL_SOURCE/AUTOMATION_RULE). Which
      // one PostgreSQL reports is evaluation order, not contract, so either
      // name is a pass; asserting one exactly would be asserting the planner.
    ).rejects.toThrow(/ck_ioza_spatial_never_command|ck_ioza_command_requires_authorizable_method/);
  });

  it("across the WHOLE database, zero COMMAND rows carry a spatial or inherited method", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM geo.incident_operational_zone_assignments
        WHERE assignment_kind = 'COMMAND'
          AND resolution_method IN ('SPATIAL_INTERSECTION','INHERITED_FROM_CANDIDATE')`
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it("a HUMAN confirmation on the very same zone IS what grants command", async () => {
    const admin = await adminClient();
    await withActor(admin, fixture.personAId, (tx) =>
      assignIncidentOperationalZone(tx, {
        incidentId: fixture.incidentSpatialId,
        operationalZoneId: fixture.zoneAId,
        assignmentKind: "COMMAND",
        resolutionMethod: "MANUAL",
        assignedBySubjectId: fixture.subjectAId,
        reasonCode: "HUMAN_COMMAND_CONFIRMATION",
        correlationId: randomUUID(),
      })
    );
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentSpatialId)).resolves.toBe(true);
  });
});
