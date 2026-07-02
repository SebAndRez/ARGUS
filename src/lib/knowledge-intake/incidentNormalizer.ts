import { demoKnowledgeIncidents } from "@/data/knowledgeIntakeDemo";
import { getSourceById } from "@/lib/knowledge-intake/sourceRegistry";
import { extractKnowledgeEntities } from "@/lib/knowledge-intake/entityExtractor";
import { extractLessonsFromIncident } from "@/lib/knowledge-intake/lessonExtractor";
import { calculateEvidenceConfidenceScore } from "@/lib/knowledge-intake/scoring/evidenceScoring";
import type {
  ArgusHazardDomain,
  ArgusIncidentKnowledge,
  ArgusIncidentSeverity,
  ArgusKnowledgeInputEnvelope,
  ArgusOperationalRecommendation,
} from "@/types/knowledgeIntake";

const createdAt = "2026-07-02T00:00:00.000Z";

function domainFromText(text: string): ArgusHazardDomain {
  const entities = extractKnowledgeEntities(text);
  return entities.domains[0] ?? "unknown";
}

function isHazardDomain(value: unknown): value is ArgusHazardDomain {
  return (
    typeof value === "string" &&
    [
      "natural_disaster",
      "earthquake",
      "tsunami",
      "volcano",
      "flood",
      "storm",
      "hurricane",
      "tornado",
      "landslide",
      "avalanche",
      "drought",
      "heatwave",
      "coldwave",
      "wildfire",
      "urban_fire",
      "industrial_fire",
      "transport_accident",
      "road_accident",
      "rail_accident",
      "aviation_accident",
      "maritime_accident",
      "pipeline_accident",
      "chemical_accident",
      "industrial_accident",
      "explosion",
      "mining_accident",
      "dam_failure",
      "bridge_collapse",
      "building_collapse",
      "power_grid_failure",
      "telecom_failure",
      "water_system_failure",
      "nuclear_radiological",
      "biological_hazard",
      "public_health",
      "mass_gathering_incident",
      "civil_unrest",
      "conflict_zone",
      "humanitarian_crisis",
      "unknown",
    ].includes(value)
  );
}

function severityFromText(text: string): ArgusIncidentSeverity {
  if (/critical|critico|evacuacion|tsunami|radiolog|fatal|explosion/i.test(text)) return "critical";
  if (/grave|alto|incendio|quimic|colapso|heridos|60\s?km/i.test(text)) return "high";
  if (/medio|inundacion|riesgo|afectad/i.test(text)) return "medium";
  if (text.trim().length > 0) return "low";
  return "unknown";
}

function firstNumber(values: number[]) {
  return values.find((value) => Number.isFinite(value));
}

function recommendationFor(domain: ArgusHazardDomain, severity: ArgusIncidentSeverity): ArgusOperationalRecommendation {
  const priority = severity === "critical" ? "critical" : severity === "high" ? "high" : "medium";
  return {
    id: `rec-normalized-${domain}`,
    audience: "institutional",
    priority,
    text: "Cruzar evidencia con fuentes oficiales, mapa operacional y revision humana antes de escalar.",
    rationale: "ARGUS Knowledge Intake separa evidencia, confianza y recomendacion para evitar decisiones automaticas fuertes.",
    confidenceScore: severity === "unknown" ? 35 : 62,
    safetyLimit: "Informativo. No reemplaza instrucciones de autoridad competente.",
    requiresHumanValidation: true,
  };
}

export function normalizeKnowledgeInput(envelope: ArgusKnowledgeInputEnvelope): ArgusIncidentKnowledge {
  const text = envelope.rawText?.trim() ?? "";
  const entities = extractKnowledgeEntities(text);
  const domain = isHazardDomain(envelope.rawMetadata?.suggestedDomain)
    ? envelope.rawMetadata.suggestedDomain
    : domainFromText(text);
  const severity = severityFromText(text);
  const source = envelope.sourceId ? getSourceById(envelope.sourceId) : undefined;
  const sourceReliabilityScore = source?.reliabilityScore.finalScore ?? 45;
  const confidence = calculateEvidenceConfidenceScore({
    sourceReliability: sourceReliabilityScore,
    corroborationCount: source ? 1 : 0,
    geolocationPrecision: entities.places.length > 0 || envelope.country ? 45 : 15,
    timestampPrecision: entities.dates.length > 0 ? 65 : 25,
    documentQuality: text.length > 500 ? 70 : text.length > 80 ? 52 : 30,
    extractionConfidence: entities.domains.length > 0 ? 65 : 38,
    conflictWithOtherSources: 0,
  });

  const incident: ArgusIncidentKnowledge = {
    id: `ki-normalized-${envelope.id}`,
    title: envelope.rawMetadata?.title?.toString() || text.split("\n")[0]?.slice(0, 90) || "Incidente normalizado pendiente de revision",
    summary: text.slice(0, 500) || "Sin texto suficiente para resumen operacional.",
    domain,
    subtype: entities.domains[0] ?? "manual_intake",
    severity,
    confidenceScore: confidence.finalConfidence,
    actionabilityScore: severity === "critical" || severity === "high" ? 58 : 42,
    sourceReliabilityScore,
    evidenceCount: text ? 1 : 0,
    sourceIds: envelope.sourceId ? [envelope.sourceId] : ["manual_input"],
    sourceNames: [envelope.sourceName ?? source?.name ?? "Manual knowledge input"],
    occurredAt: entities.dates[0],
    detectedAt: envelope.receivedAt,
    country: envelope.country,
    region: envelope.rawMetadata?.region?.toString(),
    locality: entities.places[0],
    casualties: entities.casualties.length ? { unknownText: entities.casualties.join(", ") } : undefined,
    impact: {
      infrastructureAffected: entities.infrastructure.length ? entities.infrastructure : undefined,
    },
    technicalFactors: {
      speedKmh: firstNumber(entities.speedsKmh),
      vehicleType: entities.vehicleTypes[0],
      infrastructureAffected: entities.infrastructure[0],
      chemicalAgent: entities.chemicals[0],
      isotope: entities.isotopes[0],
      magnitude: firstNumber(entities.magnitudes),
      depthKm: firstNumber(entities.depthsKm),
      waveHeightM: firstNumber(entities.waveHeightsM),
      burnedAreaHa: firstNumber(entities.hectares),
      windSpeed: entities.wind[0],
    },
    causes: [],
    contributingFactors: entities.domains.map((item) => `Dominio detectado: ${item}`),
    responseActions: ["Pendiente de revision humana"],
    lessonsLearned: [],
    recommendedActions: [recommendationFor(domain, severity)],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: [...new Set([domain, ...envelope.tags, ...entities.organizations])],
    language: envelope.language ?? "es",
    rawEvidenceRefs: [envelope.id],
    createdAt,
    updatedAt: createdAt,
  };

  return {
    ...incident,
    lessonsLearned: extractLessonsFromIncident(incident),
  };
}

export function getDemoKnowledgeIncidents(): ArgusIncidentKnowledge[] {
  return demoKnowledgeIncidents;
}
