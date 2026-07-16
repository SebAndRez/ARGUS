import { describe, expect, it } from "vitest";
import { demoKnowledgeIncidents } from "@/data/knowledgeIntakeDemo";
import { reasonAboutIncident } from "@/lib/knowledge-intake/reasoning/operationalReasoningEngine";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/operationalReasoningEngine.test.ts` (a
 * `runOperationalReasoningEngineTest()` export Vitest never ran). Every
 * assertion below is preserved from the original `passed:` chain, split
 * into its own `it`.
 */
describe("reasonAboutIncident", () => {
  const reasoning = reasonAboutIncident(demoKnowledgeIncidents[4]);

  it("computes a positive escalation probability", () => {
    expect(reasoning.escalationProbability > 0).toBe(true);
  });

  it("flags the citizen recommendation as requiring human validation", () => {
    expect(reasoning.citizenRecommendation.requiresHumanValidation).toBe(true);
  });
});
