import { demoKnowledgeIncidents } from "@/data/knowledgeIntakeDemo";
import { findSimilarIncidents } from "@/lib/knowledge-intake/similarityEngine";

export function runSimilarityEngineTest() {
  const similar = findSimilarIncidents(demoKnowledgeIncidents[0], 3);
  return {
    passed: similar.length > 0 && similar.every((item) => item.similarityScore > 0),
    similar,
  };
}
