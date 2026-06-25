import type { ArgusNormalizedEvent } from "@/types/ingestion";
import type {
  HazardKnowledgeDocumentSummary,
  HazardKnowledgeFact,
} from "@/types/hazardKnowledge";
import type { ArgusRiskHistoricalContext } from "@/types/riskAssessment";

function eventHazardTerms(event: ArgusNormalizedEvent) {
  const terms = new Set<string>([event.category]);
  if (event.sourceId === "usgs_earthquake") terms.add("earthquake");
  if (event.sourceId === "noaa_tsunami") terms.add("tsunami");
  if (event.sourceId === "nasa_firms") terms.add("fire");
  if (event.sourceId === "reliefweb") terms.add("humanitarian");
  return terms;
}

function scoreFact(event: ArgusNormalizedEvent, fact: HazardKnowledgeFact) {
  const terms = eventHazardTerms(event);
  let score = fact.relevanceScore ?? fact.confidence;
  if (terms.has(fact.hazardType)) score += 30;
  if (event.country && fact.country === event.country) score += 20;
  if (event.locationName && fact.region && event.locationName.includes(fact.region)) {
    score += 10;
  }
  if (
    typeof event.rawMagnitude === "number" &&
    typeof fact.magnitude === "number"
  ) {
    const delta = Math.abs(event.rawMagnitude - fact.magnitude);
    if (delta <= 0.5) score += 18;
    else if (delta <= 1) score += 10;
  }
  return score;
}

function scoreDocument(
  events: ArgusNormalizedEvent[],
  document: HazardKnowledgeDocumentSummary
) {
  const terms = new Set(events.flatMap((event) => Array.from(eventHazardTerms(event))));
  let score = 100 - (document.priority ?? 3) * 12 + (document.reliabilityScore ?? 70) / 4;
  const hazardTypes = document.hazardTypes ?? [document.hazardType];
  if (hazardTypes.some((hazardType) => terms.has(hazardType))) score += 24;
  if (document.ingestionStatus === "queued") score -= 12;
  if (document.ingestionStatus === "partially_extracted") score += 6;
  return score;
}

export function findHistoricalHazardContext(
  events: ArgusNormalizedEvent[],
  facts: HazardKnowledgeFact[],
  documents: HazardKnowledgeDocumentSummary[]
): ArgusRiskHistoricalContext | undefined {
  if (events.length === 0 || (facts.length === 0 && documents.length === 0)) {
    return undefined;
  }

  const rankedFacts = facts
    .map((fact) => ({
      fact,
      score: Math.max(...events.map((event) => scoreFact(event, fact))),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((item) => item.fact);

  const rankedDocuments = documents
    .map((document) => ({
      document,
      score: scoreDocument(events, document),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((item) => item.document);

  if (rankedFacts.length === 0 && rankedDocuments.length === 0) return undefined;

  const explanation =
    rankedFacts.length > 0
      ? `Contexto historico relacionado: ${rankedFacts
          .map((fact) => fact.title)
          .join("; ")}. Esto no confirma un evento actual, pero ayuda a priorizar vigilancia preventiva.`
      : "Existen fuentes doctrinales relacionadas, pero aun requieren extraccion manual para usarse como evidencia fuerte.";

  return {
    explanation,
    facts: rankedFacts,
    documents: rankedDocuments,
  };
}
