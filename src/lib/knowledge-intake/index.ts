export { normalizeKnowledgeInput, getDemoKnowledgeIncidents } from "@/lib/knowledge-intake/incidentNormalizer";
export { extractKnowledgeEntities } from "@/lib/knowledge-intake/entityExtractor";
export { extractLessonsFromIncident, extractLessonsFromText } from "@/lib/knowledge-intake/lessonExtractor";
export { findSimilarIncidents, getHistoricalPatternsForDomain } from "@/lib/knowledge-intake/similarityEngine";
export { reasonAboutIncident } from "@/lib/knowledge-intake/reasoning/operationalReasoningEngine";
export {
  getKnowledgeMemorySnapshot,
  getSimilarIncidents,
  getLessonsForIncident,
  getOperationalRecommendations,
  getRiskFactorsForLocation,
  getSourceConfidenceForClaim,
} from "@/lib/knowledge-intake/knowledgeMemoryEngine";
