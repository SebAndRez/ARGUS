import { afterAll, describe, expect, it } from "vitest";
import { closeTargetPrismaClient, getTargetPrismaClient, type TargetPrismaClientLike } from "../../src/lib/database-target/client/targetPrismaClient";
import {
  promoteIncidentCandidateHuman,
  CandidateNotFoundError,
  CandidateAlreadyDiscardedError,
  MissingActorOrAutomationRuleError,
} from "../../src/lib/database-target/services/incidentPromotionService";
import { randomUUID } from "node:crypto";
import {
  wave4ShouldRun,
  getUnclassifiedLegacyIncidentTypeId,
  insertTestCandidate,
  fetchCandidateStatus,
  baseProposedProfile,
} from "./wave4TestHelpers";

describe.skipIf(!wave4ShouldRun)("incident promotion — human decider", () => {
  let client: TargetPrismaClientLike;
  let incidentTypeId: string;

  afterAll(async () => {
    await closeTargetPrismaClient();
  });

  it("promotes a real candidate, creating exactly one Incident and marking the candidate PROMOTED", async () => {
    client = await getTargetPrismaClient();
    incidentTypeId = await getUnclassifiedLegacyIncidentTypeId(client);
    const candidateId = await insertTestCandidate(client);
    const actorId = randomUUID();

    const result = await promoteIncidentCandidateHuman(client, {
      incidentCandidateId: candidateId,
      idempotencyKey: randomUUID(),
      decidedByActorId: actorId,
      explanation: "Confirmed via two independent official sources",
      ...baseProposedProfile(incidentTypeId),
    });

    expect(result.created).toBe(true);
    expect(result.incidentId).toBeTruthy();
    expect(await fetchCandidateStatus(client, candidateId)).toBe("PROMOTED");
  });

  it("refuses to promote a candidate that does not exist", async () => {
    client = await getTargetPrismaClient();
    incidentTypeId = await getUnclassifiedLegacyIncidentTypeId(client);
    await expect(
      promoteIncidentCandidateHuman(client, {
        incidentCandidateId: randomUUID(),
        idempotencyKey: randomUUID(),
        decidedByActorId: randomUUID(),
        explanation: "n/a",
        ...baseProposedProfile(incidentTypeId),
      })
    ).rejects.toBeInstanceOf(CandidateNotFoundError);
  });

  it("refuses to promote an already-DISCARDED candidate", async () => {
    client = await getTargetPrismaClient();
    incidentTypeId = await getUnclassifiedLegacyIncidentTypeId(client);
    const candidateId = await insertTestCandidate(client, { status: "DISCARDED" });

    await expect(
      promoteIncidentCandidateHuman(client, {
        incidentCandidateId: candidateId,
        idempotencyKey: randomUUID(),
        decidedByActorId: randomUUID(),
        explanation: "n/a",
        ...baseProposedProfile(incidentTypeId),
      })
    ).rejects.toBeInstanceOf(CandidateAlreadyDiscardedError);

    expect(await fetchCandidateStatus(client, candidateId)).toBe("DISCARDED");
  });

  it("refuses to promote without a decidedByActorId", async () => {
    client = await getTargetPrismaClient();
    incidentTypeId = await getUnclassifiedLegacyIncidentTypeId(client);
    const candidateId = await insertTestCandidate(client);

    await expect(
      promoteIncidentCandidateHuman(client, {
        incidentCandidateId: candidateId,
        idempotencyKey: randomUUID(),
        decidedByActorId: "" as unknown as string,
        explanation: "n/a",
        ...baseProposedProfile(incidentTypeId),
      })
    ).rejects.toBeInstanceOf(MissingActorOrAutomationRuleError);
  });
});
