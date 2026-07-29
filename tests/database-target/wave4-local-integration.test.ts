import { afterAll, describe, expect, it } from "vitest";
import { closeTargetPrismaClient, getTargetPrismaClient, type TargetPrismaClientLike } from "../../src/lib/database-target/client/targetPrismaClient";
import {
  promoteIncidentCandidateHuman,
  promoteIncidentCandidateAutomated,
  discardIncidentCandidate,
  createIncidentHypothesis,
  supersedeIncidentHypothesis,
} from "../../src/lib/database-target/services/incidentPromotionService";
import { randomUUID } from "node:crypto";
import {
  wave4ShouldRun,
  getUnclassifiedLegacyIncidentTypeId,
  insertTestCandidate,
  insertTestAutomationRule,
  fetchCandidateStatus,
  countRows,
  baseProposedProfile,
} from "./wave4TestHelpers";

/**
 * tests/database-target/wave4-local-integration.test.ts
 *
 * Real Docker/Postgres+PostGIS end-to-end smoke test for the whole wave-4
 * surface in one flow, run twice to prove idempotency end-to-end (same
 * pattern as `wave3-local-integration.test.ts`). Skipped by default —
 * requires `ARGUS_WAVE3_INTEGRATION_TEST=true` and `TARGET_DATABASE_URL`
 * pointed at a local rehearsal database with waves 000-040 already
 * applied.
 */
describe.skipIf(!wave4ShouldRun)("wave4 local Docker integration — human + automated + discard + hypothesis", () => {
  let client: TargetPrismaClientLike;
  let incidentTypeId: string;

  afterAll(async () => {
    await closeTargetPrismaClient();
  });

  it("runs the full wave-4 flow: human promotion, automated promotion, discard, hypothesis lifecycle — twice, zero duplicates", async () => {
    client = await getTargetPrismaClient();
    incidentTypeId = await getUnclassifiedLegacyIncidentTypeId(client);

    // --- Human promotion path ---
    const humanCandidateId = await insertTestCandidate(client);
    const humanIdempotencyKey = randomUUID();
    async function runHumanPromotion() {
      return promoteIncidentCandidateHuman(client, {
        incidentCandidateId: humanCandidateId,
        idempotencyKey: humanIdempotencyKey,
        decidedByActorId: "11111111-1111-1111-1111-111111111111",
        explanation: "Confirmed by two independent official sources",
        ...baseProposedProfile(incidentTypeId),
      });
    }
    const human1 = await runHumanPromotion();
    const human2 = await runHumanPromotion();
    expect(human1.created).toBe(true);
    expect(human2.created).toBe(false);
    expect(human2.incidentId).toBe(human1.incidentId);
    expect(await fetchCandidateStatus(client, humanCandidateId)).toBe("PROMOTED");

    // --- Automated promotion path ---
    const automatedCandidateId = await insertTestCandidate(client);
    const automationRuleId = await insertTestAutomationRule(client, { status: "ACTIVE", linkToIncidentTypeId: incidentTypeId });
    const automatedIdempotencyKey = randomUUID();
    async function runAutomatedPromotion() {
      return promoteIncidentCandidateAutomated(client, {
        incidentCandidateId: automatedCandidateId,
        idempotencyKey: automatedIdempotencyKey,
        automationRuleId,
        automationRuleVersion: 1,
        explanation: "Rule-based: confidence HIGH, 3 corroborating sources",
        ...baseProposedProfile(incidentTypeId),
      });
    }
    const automated1 = await runAutomatedPromotion();
    const automated2 = await runAutomatedPromotion();
    expect(automated1.created).toBe(true);
    expect(automated2.created).toBe(false);
    expect(await fetchCandidateStatus(client, automatedCandidateId)).toBe("PROMOTED");

    // --- Discard path ---
    const discardCandidateId = await insertTestCandidate(client);
    async function runDiscard() {
      return discardIncidentCandidate(client, {
        incidentCandidateId: discardCandidateId,
        decidedByActorType: "PERSON",
        decidedByActorId: "22222222-2222-2222-2222-222222222222",
        reason: "Duplicate of an already-tracked candidate",
      });
    }
    const discard1 = await runDiscard();
    const discard2 = await runDiscard();
    expect(discard1.created).toBe(true);
    expect(discard2.created).toBe(false);
    expect(await fetchCandidateStatus(client, discardCandidateId)).toBe("DISCARDED");
    // Never deleted.
    expect(await countRows(client, "incident.incident_candidates", "id = $1::uuid", discardCandidateId)).toBe(1);

    // --- Hypothesis lifecycle ---
    const hypothesisCandidateId = await insertTestCandidate(client);
    const { hypothesisId } = await createIncidentHypothesis(client, {
      incidentCandidateId: hypothesisCandidateId,
      description: "Possibly a duplicate of a prior event in the same area",
    });
    const superseded = await supersedeIncidentHypothesis(client, { hypothesisId });
    expect(superseded.created).toBe(true);
    expect(await countRows(client, "incident.hypotheses", "id = $1::uuid AND status = 'DISCARDED'", hypothesisId)).toBe(1);

    // Zero cross-contamination: each candidate's promotion/discard is exactly one row.
    expect(await countRows(client, "incident.incident_promotions", "incident_candidate_id = $1::uuid", humanCandidateId)).toBe(1);
    expect(await countRows(client, "incident.incident_promotions", "incident_candidate_id = $1::uuid", automatedCandidateId)).toBe(1);
    expect(await countRows(client, "incident.discard_decisions", "incident_candidate_id = $1::uuid", discardCandidateId)).toBe(1);
  }, 30_000);
});
