import { afterAll, describe, expect, it } from "vitest";
import { closeTargetPrismaClient, getTargetPrismaClient, type TargetPrismaClientLike } from "../../src/lib/database-target/client/targetPrismaClient";
import {
  discardIncidentCandidate,
  promoteIncidentCandidateHuman,
  CandidateNotFoundError,
  CandidateAlreadyPromotedForDiscardError,
} from "../../src/lib/database-target/services/incidentPromotionService";
import { randomUUID } from "node:crypto";
import { wave4ShouldRun, getUnclassifiedLegacyIncidentTypeId, insertTestCandidate, fetchCandidateStatus, countRows, baseProposedProfile } from "./wave4TestHelpers";

describe.skipIf(!wave4ShouldRun)("discard decision", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    await closeTargetPrismaClient();
  });

  it("discards a candidate — irreversible status change, candidate row is NEVER deleted", async () => {
    client = await getTargetPrismaClient();
    const candidateId = await insertTestCandidate(client);

    const result = await discardIncidentCandidate(client, {
      incidentCandidateId: candidateId,
      decidedByActorType: "PERSON",
      decidedByActorId: randomUUID(),
      reason: "Duplicate of an already-tracked candidate",
    });

    expect(result.created).toBe(true);
    expect(await fetchCandidateStatus(client, candidateId)).toBe("DISCARDED");
    // The candidate row itself still exists — discard never deletes it.
    expect(await countRows(client, "incident.incident_candidates", "id = $1::uuid", candidateId)).toBe(1);
    expect(await countRows(client, "incident.discard_decisions", "incident_candidate_id = $1::uuid", candidateId)).toBe(1);
    expect(await countRows(client, "security.audit_logs", "target_id = $1::uuid AND action = 'INCIDENT_CANDIDATE_DISCARDED'", candidateId)).toBe(1);
  });

  it("a repeated discard of an already-DISCARDED candidate is idempotent — no second DiscardDecision row", async () => {
    client = await getTargetPrismaClient();
    const candidateId = await insertTestCandidate(client);
    const first = await discardIncidentCandidate(client, {
      incidentCandidateId: candidateId,
      decidedByActorType: "PERSON",
      decidedByActorId: randomUUID(),
      reason: "first discard",
    });
    const second = await discardIncidentCandidate(client, {
      incidentCandidateId: candidateId,
      decidedByActorType: "PERSON",
      decidedByActorId: randomUUID(),
      reason: "retry",
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.discardDecisionId).toBe(first.discardDecisionId);
    expect(await countRows(client, "incident.discard_decisions", "incident_candidate_id = $1::uuid", candidateId)).toBe(1);
  });

  it("a PROMOTED candidate can never be discarded", async () => {
    client = await getTargetPrismaClient();
    const incidentTypeId = await getUnclassifiedLegacyIncidentTypeId(client);
    const candidateId = await insertTestCandidate(client);
    await promoteIncidentCandidateHuman(client, {
      incidentCandidateId: candidateId,
      idempotencyKey: randomUUID(),
      decidedByActorId: randomUUID(),
      explanation: "promoted before discard attempt",
      ...baseProposedProfile(incidentTypeId),
    });

    await expect(
      discardIncidentCandidate(client, {
        incidentCandidateId: candidateId,
        decidedByActorType: "PERSON",
        decidedByActorId: randomUUID(),
        reason: "should never be allowed",
      })
    ).rejects.toBeInstanceOf(CandidateAlreadyPromotedForDiscardError);

    expect(await fetchCandidateStatus(client, candidateId)).toBe("PROMOTED");
    expect(await countRows(client, "incident.discard_decisions", "incident_candidate_id = $1::uuid", candidateId)).toBe(0);
  });

  it("refuses to discard a candidate that does not exist", async () => {
    client = await getTargetPrismaClient();
    await expect(
      discardIncidentCandidate(client, {
        incidentCandidateId: randomUUID(),
        decidedByActorType: "PERSON",
        decidedByActorId: randomUUID(),
        reason: "n/a",
      })
    ).rejects.toBeInstanceOf(CandidateNotFoundError);
  });
});
