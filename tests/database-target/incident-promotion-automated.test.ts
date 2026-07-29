import { afterAll, describe, expect, it } from "vitest";
import { closeTargetPrismaClient, getTargetPrismaClient, type TargetPrismaClientLike } from "../../src/lib/database-target/client/targetPrismaClient";
import {
  promoteIncidentCandidateAutomated,
  AutomationRuleNotFoundError,
  AutomationRuleNotApprovedError,
  AutomationRuleNotApplicableError,
} from "../../src/lib/database-target/services/incidentPromotionService";
import { randomUUID } from "node:crypto";
import {
  wave4ShouldRun,
  getUnclassifiedLegacyIncidentTypeId,
  insertTestCandidate,
  insertTestAutomationRule,
  fetchCandidateStatus,
  baseProposedProfile,
} from "./wave4TestHelpers";

describe.skipIf(!wave4ShouldRun)("incident promotion — automated (AutomationRule)", () => {
  let client: TargetPrismaClientLike;
  let incidentTypeId: string;

  afterAll(async () => {
    await closeTargetPrismaClient();
  });

  it("promotes a candidate when the AutomationRule is APPROVED, effective, and linked to the incident type", async () => {
    client = await getTargetPrismaClient();
    incidentTypeId = await getUnclassifiedLegacyIncidentTypeId(client);
    const candidateId = await insertTestCandidate(client);
    const ruleId = await insertTestAutomationRule(client, { status: "APPROVED", linkToIncidentTypeId: incidentTypeId });

    const result = await promoteIncidentCandidateAutomated(client, {
      incidentCandidateId: candidateId,
      idempotencyKey: randomUUID(),
      automationRuleId: ruleId,
      automationRuleVersion: 1,
      explanation: "Automated: 3 corroborating official sources, confidence HIGH",
      ...baseProposedProfile(incidentTypeId),
    });

    expect(result.created).toBe(true);
    expect(await fetchCandidateStatus(client, candidateId)).toBe("PROMOTED");
  });

  it("blocks promotion when the AutomationRule id does not exist", async () => {
    client = await getTargetPrismaClient();
    incidentTypeId = await getUnclassifiedLegacyIncidentTypeId(client);
    const candidateId = await insertTestCandidate(client);

    await expect(
      promoteIncidentCandidateAutomated(client, {
        incidentCandidateId: candidateId,
        idempotencyKey: randomUUID(),
        automationRuleId: randomUUID(),
        automationRuleVersion: 1,
        explanation: "n/a",
        ...baseProposedProfile(incidentTypeId),
      })
    ).rejects.toBeInstanceOf(AutomationRuleNotFoundError);
    expect(await fetchCandidateStatus(client, candidateId)).toBe("UNDER_ASSESSMENT");
  });

  it("blocks promotion when the AutomationRule is still PROPOSED (not APPROVED/ACTIVE)", async () => {
    client = await getTargetPrismaClient();
    incidentTypeId = await getUnclassifiedLegacyIncidentTypeId(client);
    const candidateId = await insertTestCandidate(client);
    const ruleId = await insertTestAutomationRule(client, { status: "PROPOSED", linkToIncidentTypeId: incidentTypeId });

    await expect(
      promoteIncidentCandidateAutomated(client, {
        incidentCandidateId: candidateId,
        idempotencyKey: randomUUID(),
        automationRuleId: ruleId,
        automationRuleVersion: 1,
        explanation: "n/a",
        ...baseProposedProfile(incidentTypeId),
      })
    ).rejects.toBeInstanceOf(AutomationRuleNotApprovedError);
  });

  it("blocks promotion when the AutomationRule is not linked to the target incident type", async () => {
    client = await getTargetPrismaClient();
    incidentTypeId = await getUnclassifiedLegacyIncidentTypeId(client);
    const candidateId = await insertTestCandidate(client);
    const ruleId = await insertTestAutomationRule(client, { status: "APPROVED", linkToIncidentTypeId: null });

    await expect(
      promoteIncidentCandidateAutomated(client, {
        incidentCandidateId: candidateId,
        idempotencyKey: randomUUID(),
        automationRuleId: ruleId,
        automationRuleVersion: 1,
        explanation: "n/a",
        ...baseProposedProfile(incidentTypeId),
      })
    ).rejects.toBeInstanceOf(AutomationRuleNotApplicableError);
  });

  it("blocks promotion when confidence is below the rule's confidenceThreshold", async () => {
    client = await getTargetPrismaClient();
    incidentTypeId = await getUnclassifiedLegacyIncidentTypeId(client);
    const candidateId = await insertTestCandidate(client);
    const ruleId = await insertTestAutomationRule(client, { status: "APPROVED", linkToIncidentTypeId: incidentTypeId, confidenceThreshold: 90 });

    await expect(
      promoteIncidentCandidateAutomated(client, {
        incidentCandidateId: candidateId,
        idempotencyKey: randomUUID(),
        automationRuleId: ruleId,
        automationRuleVersion: 1,
        explanation: "n/a",
        ...baseProposedProfile(incidentTypeId), // confidence: HIGH -> score 75, below threshold 90
      })
    ).rejects.toBeInstanceOf(AutomationRuleNotApplicableError);
  });

  it("blocks promotion when corroborationCount is below the rule's requiredCorroborationCount", async () => {
    client = await getTargetPrismaClient();
    incidentTypeId = await getUnclassifiedLegacyIncidentTypeId(client);
    const candidateId = await insertTestCandidate(client);
    const ruleId = await insertTestAutomationRule(client, { status: "APPROVED", linkToIncidentTypeId: incidentTypeId, requiredCorroborationCount: 3 });

    await expect(
      promoteIncidentCandidateAutomated(client, {
        incidentCandidateId: candidateId,
        idempotencyKey: randomUUID(),
        automationRuleId: ruleId,
        automationRuleVersion: 1,
        explanation: "n/a",
        corroborationCount: 1,
        ...baseProposedProfile(incidentTypeId),
      })
    ).rejects.toBeInstanceOf(AutomationRuleNotApplicableError);
  });

  it("blocks promotion when the rule's effective window has not started yet", async () => {
    client = await getTargetPrismaClient();
    incidentTypeId = await getUnclassifiedLegacyIncidentTypeId(client);
    const candidateId = await insertTestCandidate(client);
    const futureStart = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);
    const ruleId = await insertTestAutomationRule(client, { status: "APPROVED", linkToIncidentTypeId: incidentTypeId, effectiveFrom: futureStart });

    await expect(
      promoteIncidentCandidateAutomated(client, {
        incidentCandidateId: candidateId,
        idempotencyKey: randomUUID(),
        automationRuleId: ruleId,
        automationRuleVersion: 1,
        explanation: "n/a",
        ...baseProposedProfile(incidentTypeId),
      })
    ).rejects.toBeInstanceOf(AutomationRuleNotApplicableError);
  });
});
