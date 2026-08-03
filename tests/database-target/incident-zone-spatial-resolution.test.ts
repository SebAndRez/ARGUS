import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createIncidentZoneFixture,
  dropIncidentZoneFixture,
  incidentZoneDockerShouldRun,
  ownerClient,
  raw,
  runtimeClient,
  withActor,
  type IncidentZoneFixture,
} from "./incidentZoneTestHelpers";
import {
  persistIncidentZoneResolution,
  resolveIncidentOperationalZones,
  type ZoneResolutionProposal,
} from "../../src/lib/database-target/repositories/incidentOperationalZoneRepository";
import { closeTargetPrincipalClients, closeTargetPrismaClient } from "../../src/lib/database-target/client/targetPrismaClient";

/**
 * tests/database-target/incident-zone-spatial-resolution.test.ts
 *
 * The spatial resolver, against real PostGIS: Point, Polygon, MultiPolygon,
 * absent geometry, invalid geometry, several zones at once, overlapping zones,
 * and zones with no jurisdiction.
 *
 * It PROPOSES. Every proposal it can make is AFFECTED or MONITORING; the
 * companion suite `spatial-resolution-never-grants-command.test.ts` proves it
 * cannot reach COMMAND even when asked to.
 */
async function resolveGeography(geom: string | null): Promise<ZoneResolutionProposal[]> {
  const owner = raw(await ownerClient());
  const rows = await owner.$queryRawUnsafe<{
    operational_zone_id: string | null;
    outcome: ZoneResolutionProposal["outcome"];
    proposed_assignment_kind: ZoneResolutionProposal["proposedAssignmentKind"];
    confidence: ZoneResolutionProposal["confidence"];
    overlap_ratio: string | null;
    covered: boolean | null;
    jurisdiction_resolvable: boolean;
  }>(
    `SELECT * FROM geo.fn_resolve_zones_for_geography(
       CASE WHEN $1::text IS NULL THEN NULL ELSE ST_GeogFromText($1::text) END, 0::numeric)`,
    geom
  );
  return rows.map((r) => ({
    operationalZoneId: r.operational_zone_id,
    outcome: r.outcome,
    proposedAssignmentKind: r.proposed_assignment_kind,
    confidence: r.confidence,
    overlapRatio: r.overlap_ratio === null ? null : Number(r.overlap_ratio),
    covered: r.covered,
    jurisdictionResolvable: r.jurisdiction_resolvable,
  }));
}

describe.skipIf(!incidentZoneDockerShouldRun)("spatial resolution", () => {
  let fixture: IncidentZoneFixture;
  let box: { x1: number; y1: number; x2: number; y2: number };

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31Spatial");
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ x1: number; y1: number; x2: number; y2: number }>(
      `SELECT ST_XMin(b) AS x1, ST_YMin(b) AS y1, ST_XMax(b) AS x2, ST_YMax(b) AS y2
         FROM (SELECT boundary::geometry AS b FROM geo.operational_zones WHERE id = $1::uuid) t`,
      fixture.zoneAId
    );
    box = rows[0]!;
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  const mid = () => ({ x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 });

  it("resolves a Point inside a zone, with a NULL ratio rather than a division by zero", async () => {
    const p = mid();
    const rows = (await resolveGeography(`POINT(${p.x} ${p.y})`)).filter((r) => r.operationalZoneId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.operationalZoneId).toBe(fixture.zoneAId);
    expect(rows[0]!.overlapRatio).toBeNull();
    expect(rows[0]!.covered).toBe(true);
  });

  it("resolves a Polygon fully inside a zone as covered / RESOLVED / CONFIRMED", async () => {
    const p = mid();
    const d = (box.x2 - box.x1) / 8;
    const rows = (
      await resolveGeography(
        `POLYGON((${p.x - d} ${p.y - d}, ${p.x - d} ${p.y + d}, ${p.x + d} ${p.y + d}, ${p.x + d} ${p.y - d}, ${p.x - d} ${p.y - d}))`
      )
    ).filter((r) => r.operationalZoneId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.covered).toBe(true);
    expect(rows[0]!.outcome).toBe("RESOLVED");
    expect(rows[0]!.confidence).toBe("CONFIRMED");
    expect(rows[0]!.overlapRatio).toBeCloseTo(1, 3);
  });

  it("resolves a MultiPolygon spanning two zones as MULTIPLE_MATCHES", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ outcome: string; operational_zone_id: string | null }>(
      `SELECT outcome::text, operational_zone_id FROM geo.fn_resolve_zones_for_geography(
         ST_Multi(ST_Union(
           (SELECT ST_Buffer(ST_Centroid(boundary::geometry), 0.05) FROM geo.operational_zones WHERE id = $1::uuid),
           (SELECT ST_Buffer(ST_Centroid(boundary::geometry), 0.05) FROM geo.operational_zones WHERE id = $2::uuid)
         ))::geography, 0::numeric)
        WHERE operational_zone_id IS NOT NULL`,
      fixture.zoneAId,
      fixture.zoneBId
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.outcome === "MULTIPLE_MATCHES")).toBe(true);
  });

  it("reports absent geometry as NO_MATCH and proposes nothing", async () => {
    const rows = await resolveGeography(null);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.outcome).toBe("NO_MATCH");
    expect(rows[0]!.operationalZoneId).toBeNull();
    expect(rows[0]!.proposedAssignmentKind).toBeNull();
  });

  it("reports geometry outside every zone as NO_MATCH", async () => {
    const rows = await resolveGeography("POINT(-179 -89)");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.outcome).toBe("NO_MATCH");
  });

  it("reports invalid geometry as INVALID_GEOMETRY, and never repairs it", async () => {
    const p = mid();
    const d = (box.x2 - box.x1) / 8;
    // A self-intersecting bowtie.
    const rows = await resolveGeography(
      `POLYGON((${p.x - d} ${p.y - d}, ${p.x + d} ${p.y + d}, ${p.x - d} ${p.y + d}, ${p.x + d} ${p.y - d}, ${p.x - d} ${p.y - d}))`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.outcome).toBe("INVALID_GEOMETRY");
    expect(rows[0]!.proposedAssignmentKind).toBeNull();
  });

  it("flags a zone with no jurisdiction in force as REQUIRES_REVIEW, not as a silent success", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ outcome: string; jurisdiction_resolvable: boolean }>(
      `SELECT outcome::text, jurisdiction_resolvable FROM geo.fn_resolve_zones_for_geography(
         (SELECT ST_Centroid(boundary::geometry)::geography FROM geo.operational_zones WHERE id = $1::uuid), 0::numeric)
        WHERE operational_zone_id IS NOT NULL`,
      fixture.zoneOrphanId
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.outcome).toBe("REQUIRES_REVIEW");
    expect(rows[0]!.jurisdiction_resolvable).toBe(false);
  });

  it("handles overlapping zones: a point in the overlap returns BOTH", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ operational_zone_id: string }>(
      `SELECT operational_zone_id FROM geo.fn_resolve_zones_for_geography(
         (SELECT ST_PointOnSurface(ST_Intersection(a.boundary::geometry, b.boundary::geometry))::geography
            FROM geo.operational_zones a, geo.operational_zones b
           WHERE a.id = $1::uuid AND b.id = $2::uuid), 0::numeric)
        WHERE operational_zone_id IS NOT NULL`,
      fixture.zoneAId,
      fixture.zoneCrossId
    );
    const ids = rows.map((r) => r.operational_zone_id).sort();
    expect(ids).toEqual([fixture.zoneAId, fixture.zoneCrossId].sort());
  });

  it("resolves an incident through its current affected-area version", async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `INSERT INTO incident.affected_area_versions (id, incident_id, version_number, geometry)
       VALUES (gen_random_uuid(), $1::uuid, 1,
               (SELECT ST_Multi(ST_Buffer(ST_Centroid(boundary::geometry), 0.05))::geography
                  FROM geo.operational_zones WHERE id = $2::uuid))`,
      fixture.incidentSpatialId,
      fixture.zoneAId
    );

    const runtime = await runtimeClient();
    const proposals = await withActor(runtime, fixture.personAId, (tx) =>
      resolveIncidentOperationalZones(tx, fixture.incidentSpatialId)
    );
    const matched = proposals.filter((p) => p.operationalZoneId);
    expect(matched.length).toBeGreaterThanOrEqual(1);
    expect(matched.every((p) => p.proposedAssignmentKind === "AFFECTED" || p.proposedAssignmentKind === "MONITORING")).toBe(true);
  });

  it("persisting the resolution writes AFFECTED/MONITORING in REQUIRES_REVIEW, and is idempotent on re-run", async () => {
    const admin = await adminClient();
    const first = await withActor(admin, fixture.personAId, (tx) =>
      persistIncidentZoneResolution(tx, fixture.incidentSpatialId, fixture.subjectAId, randomUUID())
    );
    expect(first).toBeGreaterThan(0);

    await withActor(admin, fixture.personAId, (tx) =>
      persistIncidentZoneResolution(tx, fixture.incidentSpatialId, fixture.subjectAId, randomUUID())
    );

    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ assignment_kind: string; review_status: string; n: bigint }>(
      `SELECT assignment_kind, review_status, count(*) AS n
         FROM geo.incident_operational_zone_assignments
        WHERE incident_id = $1::uuid AND resolution_method = 'SPATIAL_INTERSECTION' AND status = 'ACTIVE'
        GROUP BY 1, 2`,
      fixture.incidentSpatialId
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(["AFFECTED", "MONITORING"]).toContain(row.assignment_kind);
      expect(row.review_status).toBe("REQUIRES_REVIEW");
      expect(Number(row.n)).toBe(1);
    }
  });

  it("never persists a proposal against a zone whose jurisdiction cannot be resolved", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM geo.incident_operational_zone_assignments
        WHERE operational_zone_id = $1::uuid AND resolution_method = 'SPATIAL_INTERSECTION'`,
      fixture.zoneOrphanId
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });
});
