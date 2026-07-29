import { afterAll, describe, expect, it } from "vitest";
import { closeTargetPrismaClient, getTargetPrismaClient, type TargetPrismaClientLike } from "../../src/lib/database-target/client/targetPrismaClient";
import { promoteIncidentCandidateHuman, IdempotencyConflictError } from "../../src/lib/database-target/services/incidentPromotionService";
import { randomUUID } from "node:crypto";
import { wave4ShouldRun, getUnclassifiedLegacyIncidentTypeId, insertTestCandidate, countRows, baseProposedProfile } from "./wave4TestHelpers";

describe.skipIf(!wave4ShouldRun)("incident promotion — idempotency", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    await closeTargetPrismaClient();
  });

  it("retrying the exact same idempotencyKey never creates a second Incident or IncidentPromotion row", async () => {
    client = await getTargetPrismaClient();
    const incidentTypeId = await getUnclassifiedLegacyIncidentTypeId(client);
    const candidateId = await insertTestCandidate(client);
    const idempotencyKey = randomUUID();
    const actorId = randomUUID();
    const input = {
      incidentCandidateId: candidateId,
      idempotencyKey,
      decidedByActorId: actorId,
      explanation: "Idempotency test",
      ...baseProposedProfile(incidentTypeId),
    };

    const first = await promoteIncidentCandidateHuman(client, input);
    const second = await promoteIncidentCandidateHuman(client, input);
    const third = await promoteIncidentCandidateHuman(client, input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(third.created).toBe(false);
    expect(second.incidentId).toBe(first.incidentId);
    expect(third.incidentId).toBe(first.incidentId);

    expect(await countRows(client, "incident.incidents", "origin_candidate_id = $1::uuid", candidateId)).toBe(1);
    expect(await countRows(client, "incident.incident_promotions", "incident_candidate_id = $1::uuid", candidateId)).toBe(1);
    expect(await countRows(client, "incident.incident_transitions", "incident_id = $1::uuid", first.incidentId)).toBe(1);
    expect(await countRows(client, "security.audit_logs", "target_id = $1::uuid AND action = 'INCIDENT_CANDIDATE_PROMOTED'", first.incidentId)).toBe(1);
  });

  it("reusing the same idempotencyKey for a DIFFERENT candidate fails safely instead of silently reusing the first result", async () => {
    client = await getTargetPrismaClient();
    const incidentTypeId = await getUnclassifiedLegacyIncidentTypeId(client);
    const candidateA = await insertTestCandidate(client);
    const candidateB = await insertTestCandidate(client);
    const idempotencyKey = randomUUID();

    await promoteIncidentCandidateHuman(client, {
      incidentCandidateId: candidateA,
      idempotencyKey,
      decidedByActorId: randomUUID(),
      explanation: "first candidate",
      ...baseProposedProfile(incidentTypeId),
    });

    await expect(
      promoteIncidentCandidateHuman(client, {
        incidentCandidateId: candidateB,
        idempotencyKey,
        decidedByActorId: randomUUID(),
        explanation: "second, different candidate — must not silently succeed",
        ...baseProposedProfile(incidentTypeId),
      })
    ).rejects.toBeInstanceOf(IdempotencyConflictError);

    expect(await countRows(client, "incident.incident_promotions", "incident_candidate_id = $1::uuid", candidateB)).toBe(0);
  });
});
