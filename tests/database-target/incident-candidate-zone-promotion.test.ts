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
import { inheritCandidateZoneAssignments } from "../../src/lib/database-target/repositories/incidentOperationalZoneRepository";
import { closeTargetPrincipalClients, closeTargetPrismaClient } from "../../src/lib/database-target/client/targetPrismaClient";

/**
 * tests/database-target/incident-candidate-zone-promotion.test.ts
 *
 * IncidentCandidate -> Incident: the candidate's geographic relations follow
 * it, and NOTHING ELSE does.
 *
 * The two claims that matter:
 *   * promotion preserves geography, provenance, confidence and review status,
 *     idempotently;
 *   * promotion NEVER manufactures command. A promoted incident is not
 *     commanded by anybody until a human confirms it, and a candidate with no
 *     resolvable zone still becomes an incident — it just stays unresolved for
 *     jurisdiction, with `fn_has_command_role` failing closed.
 */
async function seedCandidateObservation(
  fixture: IncidentZoneFixture,
  candidateId: string,
  zoneId: string
): Promise<void> {
  const owner = raw(await ownerClient());
  const observationId = randomUUID();
  await owner.$executeRawUnsafe(
    `INSERT INTO evidence.observations (id, origin_type, claim_text, provenance, location, confidence_level)
     SELECT $1::uuid, 'PRIMARY', 'R31 candidate observation', '{}'::jsonb,
            ST_Centroid(boundary::geometry)::geography, 'HIGH'
       FROM geo.operational_zones WHERE id = $2::uuid`,
    observationId,
    zoneId
  );
  await owner.$executeRawUnsafe(
    `INSERT INTO incident.incident_candidate_observations
       (incident_candidate_id, observation_id, correlation_confidence)
     VALUES ($1::uuid, $2::uuid, 'HIGH')`,
    candidateId,
    observationId
  );
  void fixture;
}

describe.skipIf(!incidentZoneDockerShouldRun)("candidate promotion carries geography, never command", () => {
  let fixture: IncidentZoneFixture;
  let candidateId: string;
  let emptyCandidateId: string;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31Promotion");
    const owner = raw(await ownerClient());
    candidateId = randomUUID();
    emptyCandidateId = randomUUID();
    await owner.$executeRawUnsafe(
      `INSERT INTO incident.incident_candidates (id, status, classification)
       VALUES ($1::uuid, 'UNDER_ASSESSMENT', 'OPERATIONAL'), ($2::uuid, 'UNDER_ASSESSMENT', 'OPERATIONAL')`,
      candidateId,
      emptyCandidateId
    );
    await seedCandidateObservation(fixture, candidateId, fixture.zoneAId);
  });

  afterAll(async () => {
    const owner = raw(await ownerClient());
    await owner.$executeRawUnsafe(
      `DELETE FROM incident.incident_candidate_observations WHERE incident_candidate_id = ANY($1::uuid[])`,
      [candidateId, emptyCandidateId]
    );
    await owner.$executeRawUnsafe(
      `DELETE FROM evidence.observations WHERE claim_text = 'R31 candidate observation'`
    );
    await owner.$executeRawUnsafe(`DELETE FROM incident.incident_candidates WHERE id = ANY($1::uuid[])`, [
      candidateId,
      emptyCandidateId,
    ]);
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("the candidate's own geography resolves to the expected zone", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ operational_zone_id: string | null; outcome: string }>(
      `SELECT operational_zone_id, outcome::text FROM geo.fn_resolve_candidate_operational_zones($1::uuid)
        WHERE operational_zone_id IS NOT NULL`,
      candidateId
    );
    expect(rows.map((r) => r.operational_zone_id)).toContain(fixture.zoneAId);
  });

  it("inheritance writes the relation onto the incident with INHERITED_FROM_CANDIDATE provenance", async () => {
    const admin = await adminClient();
    const written = await withActor(admin, fixture.personAId, (tx) =>
      inheritCandidateZoneAssignments(tx, candidateId, fixture.incidentSpatialId, fixture.subjectAId, randomUUID())
    );
    expect(written).toBeGreaterThan(0);

    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{
      assignment_kind: string;
      resolution_method: string;
      review_status: string;
      confidence: string;
      provenance: string;
    }>(
      `SELECT assignment_kind::text, resolution_method::text, review_status::text, confidence::text, provenance
         FROM geo.incident_operational_zone_assignments
        WHERE incident_id = $1::uuid AND resolution_method = 'INHERITED_FROM_CANDIDATE'`,
      fixture.incidentSpatialId
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(["PRIMARY", "AFFECTED", "MONITORING"]).toContain(row.assignment_kind);
      expect(row.assignment_kind).not.toBe("COMMAND");
      expect(row.review_status).toBe("REQUIRES_REVIEW");
      expect(row.provenance).toBe("CANDIDATE_INHERITANCE");
      expect(["UNKNOWN", "LOW", "MEDIUM", "HIGH", "CONFIRMED"]).toContain(row.confidence);
    }
  });

  it("promotion never grants command", async () => {
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentSpatialId)).resolves.toBe(false);
  });

  it("re-running inheritance is idempotent — no second set of assignments", async () => {
    const admin = await adminClient();
    await withActor(admin, fixture.personAId, (tx) =>
      inheritCandidateZoneAssignments(tx, candidateId, fixture.incidentSpatialId, fixture.subjectAId, randomUUID())
    );
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM (
         SELECT operational_zone_id, assignment_kind
           FROM geo.incident_operational_zone_assignments
          WHERE incident_id = $1::uuid AND resolution_method = 'INHERITED_FROM_CANDIDATE'
          GROUP BY 1, 2 HAVING count(*) > 1
       ) dupes`,
      fixture.incidentSpatialId
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it("at most one PRIMARY is ever inherited", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ n: bigint }>(
      `SELECT count(*) AS n FROM geo.incident_operational_zone_assignments
        WHERE incident_id = $1::uuid AND assignment_kind = 'PRIMARY' AND status = 'ACTIVE'`,
      fixture.incidentSpatialId
    );
    expect(Number(rows[0]!.n)).toBeLessThanOrEqual(1);
  });

  it("a candidate with NO resolvable zone writes nothing and does not fail", async () => {
    const admin = await adminClient();
    const written = await withActor(admin, fixture.personAId, (tx) =>
      inheritCandidateZoneAssignments(tx, emptyCandidateId, fixture.incidentAffectedId, fixture.subjectAId, randomUUID())
    );
    expect(written).toBe(0);
  });

  it("...and the incident it was promoted into stays REQUIRES_REVIEW for jurisdiction, failing closed", async () => {
    const owner = raw(await ownerClient());
    // Strip every relation from that incident so "no resolvable jurisdiction"
    // is the actual state, then confirm both halves of the contract.
    await owner.$executeRawUnsafe(
      `DELETE FROM geo.incident_operational_zone_assignments WHERE incident_id = $1::uuid`,
      fixture.incidentAffectedId
    );
    const rows = await owner.$queryRawUnsafe<{ resolved: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM geo.fn_incident_effective_jurisdictions($1::uuid, NULL)) AS resolved`,
      fixture.incidentAffectedId
    );
    expect(rows[0]!.resolved).toBe(false);
    await expect(askHasCommandRole(fixture.personAId, fixture.incidentAffectedId)).resolves.toBe(false);
  });

  it("inheritance cannot be coerced into COMMAND even at the database level", async () => {
    const owner = raw(await ownerClient());
    await expect(
      owner.$executeRawUnsafe(
        `INSERT INTO geo.incident_operational_zone_assignments
           (incident_id, operational_zone_id, assignment_kind, resolution_method, status,
            correlation_id, provenance, assigned_by_subject_id)
         VALUES ($1::uuid, $2::uuid, 'COMMAND', 'INHERITED_FROM_CANDIDATE', 'ACTIVE',
                 gen_random_uuid(), 'MANUAL', $3::uuid)`,
        fixture.incidentAffectedId,
        fixture.zoneBId,
        fixture.subjectAId
      )
    ).rejects.toThrow(/ck_ioza_inherited_never_command|ck_ioza_command_requires_authorizable_method/);
  });
});
