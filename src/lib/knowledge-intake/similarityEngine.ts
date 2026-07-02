import { demoKnowledgeIncidents } from "@/data/knowledgeIntakeDemo";
import type {
  ArgusHazardDomain,
  ArgusIncidentKnowledge,
  ArgusIncidentSimilarityResult,
} from "@/types/knowledgeIntake";

function overlapScore(left: string[], right: string[]) {
  const rightSet = new Set(right.map((item) => item.toLowerCase()));
  return left.reduce((score, item) => score + (rightSet.has(item.toLowerCase()) ? 1 : 0), 0);
}

function technicalFactorKeys(incident: ArgusIncidentKnowledge) {
  return Object.entries(incident.technicalFactors)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key]) => key);
}

export function calculateIncidentSimilarity(
  current: Pick<ArgusIncidentKnowledge, "id" | "domain" | "severity" | "tags" | "technicalFactors">,
  historical: ArgusIncidentKnowledge
) {
  let score = 0;
  const matchedFactors: string[] = [];

  if (current.domain === historical.domain) {
    score += 38;
    matchedFactors.push(`Mismo dominio: ${current.domain}`);
  }

  if (current.severity === historical.severity) {
    score += 14;
    matchedFactors.push(`Severidad comparable: ${current.severity}`);
  }

  const tagMatches = overlapScore(current.tags, historical.tags);
  if (tagMatches > 0) {
    score += Math.min(20, tagMatches * 5);
    matchedFactors.push(`${tagMatches} etiquetas coincidentes`);
  }

  const factorMatches = overlapScore(technicalFactorKeys(current as ArgusIncidentKnowledge), technicalFactorKeys(historical));
  if (factorMatches > 0) {
    score += Math.min(28, factorMatches * 7);
    matchedFactors.push(`${factorMatches} factores tecnicos repetidos`);
  }

  return { score: Math.min(100, score), matchedFactors };
}

export function findSimilarIncidents(
  incident: Pick<ArgusIncidentKnowledge, "id" | "domain" | "severity" | "tags" | "technicalFactors">,
  limit = 5
): ArgusIncidentSimilarityResult[] {
  return demoKnowledgeIncidents
    .filter((candidate) => candidate.id !== incident.id)
    .map((candidate) => {
      const result = calculateIncidentSimilarity(incident, candidate);
      return {
        incident: candidate,
        similarityScore: result.score,
        matchedFactors: result.matchedFactors,
        warningText:
          result.score >= 70
            ? `Esto se parece a ${candidate.title}; revisar patrones historicos antes de recomendar.`
            : `Relacion contextual con ${candidate.title}; usar solo como referencia.`,
      };
    })
    .filter((item) => item.similarityScore > 0)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, limit);
}

export function getHistoricalPatternsForDomain(domain: ArgusHazardDomain) {
  const incidents = demoKnowledgeIncidents.filter((incident) => incident.domain === domain);
  const tags = incidents.flatMap((incident) => incident.tags);
  return {
    domain,
    incidentCount: incidents.length,
    repeatedTags: [...new Set(tags)].slice(0, 10),
    note: "Patrones demo preparados para alimentar el motor predictivo sin afirmar certeza operacional.",
  };
}
