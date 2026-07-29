import { afterAll, describe, expect, it } from "vitest";
import { closeTargetPrismaClient, getTargetPrismaClient, type TargetPrismaClientLike } from "../../src/lib/database-target/client/targetPrismaClient";
import {
  createIncidentHypothesis,
  supersedeIncidentHypothesis,
  discardIncidentCandidate,
  HypothesisOnClosedCandidateError,
  HypothesisNotFoundError,
} from "../../src/lib/database-target/services/incidentPromotionService";
import { randomUUID } from "node:crypto";
import { wave4ShouldRun, insertTestCandidate, countRows } from "./wave4TestHelpers";

describe.skipIf(!wave4ShouldRun)("incident hypothesis", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    await closeTargetPrismaClient();
  });

  it("creates a hypothesis on a candidate under assessment", async () => {
    client = await getTargetPrismaClient();
    const candidateId = await insertTestCandidate(client);

    const { hypothesisId } = await createIncidentHypothesis(client, {
      incidentCandidateId: candidateId,
      description: "May be a duplicate report of an earlier wildfire event",
    });

    expect(hypothesisId).toBeTruthy();
    expect(await countRows(client, "incident.hypotheses", "id = $1::uuid AND status = 'ACTIVE'", hypothesisId)).toBe(1);
  });

  it("supersedes (discards) a hypothesis — status flips to DISCARDED, row is never deleted", async () => {
    client = await getTargetPrismaClient();
    const candidateId = await insertTestCandidate(client);
    const { hypothesisId } = await createIncidentHypothesis(client, { incidentCandidateId: candidateId, description: "Initial hypothesis" });

    const result = await supersedeIncidentHypothesis(client, { hypothesisId });
    expect(result.created).toBe(true);
    expect(await countRows(client, "incident.hypotheses", "id = $1::uuid AND status = 'DISCARDED'", hypothesisId)).toBe(1);

    // Idempotent: superseding an already-DISCARDED hypothesis is a no-op, not an error.
    const retry = await supersedeIncidentHypothesis(client, { hypothesisId });
    expect(retry.created).toBe(false);
  });

  it("refuses to create a hypothesis on a DISCARDED candidate", async () => {
    client = await getTargetPrismaClient();
    const candidateId = await insertTestCandidate(client);
    await discardIncidentCandidate(client, {
      incidentCandidateId: candidateId,
      decidedByActorType: "PERSON",
      decidedByActorId: randomUUID(),
      reason: "closed before hypothesis attempt",
    });

    await expect(
      createIncidentHypothesis(client, { incidentCandidateId: candidateId, description: "too late" })
    ).rejects.toBeInstanceOf(HypothesisOnClosedCandidateError);
  });

  it("refuses to supersede a hypothesis that does not exist", async () => {
    client = await getTargetPrismaClient();
    await expect(supersedeIncidentHypothesis(client, { hypothesisId: randomUUID() })).rejects.toBeInstanceOf(HypothesisNotFoundError);
  });
});
