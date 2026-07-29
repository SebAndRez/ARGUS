import { afterAll, describe, expect, it } from "vitest";
import { closeTargetPrismaClient, getTargetPrismaClient, type TargetPrismaClientLike } from "../../src/lib/database-target/client/targetPrismaClient";
import { promoteIncidentCandidateHuman, CandidateAlreadyPromotedError } from "../../src/lib/database-target/services/incidentPromotionService";
import { randomUUID } from "node:crypto";
import { wave4ShouldRun, getUnclassifiedLegacyIncidentTypeId, insertTestCandidate, countRows, baseProposedProfile } from "./wave4TestHelpers";

describe.skipIf(!wave4ShouldRun)("incident promotion — concurrency (real parallel Postgres transactions)", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    await closeTargetPrismaClient();
  });

  it("two concurrent promotion attempts on the SAME candidate with DIFFERENT idempotency keys: exactly one succeeds, the other is rejected, exactly one IncidentPromotion row exists", async () => {
    client = await getTargetPrismaClient();
    const incidentTypeId = await getUnclassifiedLegacyIncidentTypeId(client);
    const candidateId = await insertTestCandidate(client);

    const attempt = (idempotencyKey: string) =>
      promoteIncidentCandidateHuman(client, {
        incidentCandidateId: candidateId,
        idempotencyKey,
        decidedByActorId: randomUUID(),
        explanation: "concurrent attempt",
        ...baseProposedProfile(incidentTypeId),
      });

    const [a, b] = await Promise.allSettled([attempt(randomUUID()), attempt(randomUUID())]);

    const outcomes = [a, b];
    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(CandidateAlreadyPromotedError);

    // Structurally impossible to double-promote: the UNIQUE constraints on
    // incident.incident_promotions (candidate/incident/idempotency_key) plus
    // the SELECT ... FOR UPDATE row lock guarantee exactly one row, never two.
    expect(await countRows(client, "incident.incident_promotions", "incident_candidate_id = $1::uuid", candidateId)).toBe(1);
    expect(await countRows(client, "incident.incidents", "origin_candidate_id = $1::uuid", candidateId)).toBe(1);
  }, 15_000);
});
