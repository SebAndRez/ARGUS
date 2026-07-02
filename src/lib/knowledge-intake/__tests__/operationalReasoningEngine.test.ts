import { demoKnowledgeIncidents } from "@/data/knowledgeIntakeDemo";
import { reasonAboutIncident } from "@/lib/knowledge-intake/reasoning/operationalReasoningEngine";

export function runOperationalReasoningEngineTest() {
  const reasoning = reasonAboutIncident(demoKnowledgeIncidents[4]);
  return {
    passed: reasoning.escalationProbability > 0 && reasoning.citizenRecommendation.requiresHumanValidation,
    reasoning,
  };
}
