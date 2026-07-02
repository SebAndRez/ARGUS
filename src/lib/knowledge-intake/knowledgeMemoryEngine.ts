import { demoKnowledgeEvidence, demoKnowledgeIncidents, demoKnowledgeLessons } from "@/data/knowledgeIntakeDemo";
import { findSimilarIncidents, getHistoricalPatternsForDomain } from "@/lib/knowledge-intake/similarityEngine";
import { scoreSourceForClaim } from "@/lib/knowledge-intake/scoring/sourceScoring";
import { getAllKnowledgeSources } from "@/lib/knowledge-intake/sourceRegistry";
import { buildEmbeddingRecord, searchVectorIndex } from "@/lib/knowledge-intake/vector/vectorIndex";
import type {
  ArgusHazardDomain,
  ArgusIncidentKnowledge,
  ArgusKnowledgeEmbeddingRecord,
} from "@/types/knowledgeIntake";

const embeddingRecords: ArgusKnowledgeEmbeddingRecord[] = [
  ...demoKnowledgeIncidents.map((incident) =>
    buildEmbeddingRecord({
      id: `emb-${incident.id}`,
      ownerType: "incident",
      ownerId: incident.id,
      text: `${incident.title} ${incident.summary} ${incident.tags.join(" ")}`,
    })
  ),
  ...demoKnowledgeLessons.map((lesson) =>
    buildEmbeddingRecord({
      id: `emb-${lesson.id}`,
      ownerType: "lesson",
      ownerId: lesson.id,
      text: `${lesson.title} ${lesson.summary} ${lesson.tags.join(" ")}`,
    })
  ),
];

export function getKnowledgeMemorySnapshot() {
  return {
    incidents: demoKnowledgeIncidents,
    evidence: demoKnowledgeEvidence,
    lessons: demoKnowledgeLessons,
    embeddings: embeddingRecords,
  };
}

export function getSimilarIncidents(input: ArgusIncidentKnowledge | { text: string; domain?: ArgusHazardDomain }) {
  if ("id" in input) return findSimilarIncidents(input);
  const vectorResults = searchVectorIndex(embeddingRecords, { text: input.text, ownerType: "incident", limit: 5 });
  return vectorResults
    .map((result) => demoKnowledgeIncidents.find((incident) => incident.id === result.record.ownerId))
    .filter((incident): incident is ArgusIncidentKnowledge => Boolean(incident))
    .map((incident) => ({
      incident,
      similarityScore: input.domain && incident.domain === input.domain ? 75 : 55,
      matchedFactors: input.domain && incident.domain === input.domain ? [`Dominio ${input.domain}`] : ["Coincidencia textual"],
      warningText: `Coincidencia historica posible con ${incident.title}.`,
    }));
}

export function getLessonsForIncident(incident: Pick<ArgusIncidentKnowledge, "domain" | "tags">) {
  return demoKnowledgeLessons
    .filter((lesson) => lesson.domain === incident.domain || lesson.tags.some((tag) => incident.tags.includes(tag)))
    .slice(0, 6);
}

export function getOperationalRecommendations(incident: ArgusIncidentKnowledge) {
  return incident.recommendedActions;
}

export function getRiskFactorsForLocation(location: { country?: string; region?: string; latitude?: number; longitude?: number }) {
  const incidents = demoKnowledgeIncidents.filter((incident) => {
    if (location.country && incident.country !== location.country) return false;
    if (location.region && incident.region !== location.region) return false;
    return true;
  });
  return {
    incidentCount: incidents.length,
    domains: [...new Set(incidents.map((incident) => incident.domain))],
    note: "Riesgos historicos demo; requiere persistencia y datos oficiales para uso operacional.",
  };
}

export function getSourceConfidenceForClaim(claim: string) {
  return getAllKnowledgeSources()
    .map((source) => ({
      sourceId: source.id,
      sourceName: source.name,
      score: scoreSourceForClaim(source, claim),
      status: source.status,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export { getHistoricalPatternsForDomain };
