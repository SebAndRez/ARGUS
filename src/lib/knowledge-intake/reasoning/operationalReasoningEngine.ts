import type {
  ArgusIncidentKnowledge,
  ArgusIncidentSeverity,
  ArgusOperationalReasoningResult,
  ArgusOperationalRecommendation,
} from "@/types/knowledgeIntake";

function severityRank(severity: ArgusIncidentSeverity) {
  return { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 }[severity];
}

function makeRecommendation(
  id: string,
  audience: ArgusOperationalRecommendation["audience"],
  priority: ArgusOperationalRecommendation["priority"],
  text: string,
  confidenceScore: number
): ArgusOperationalRecommendation {
  return {
    id,
    audience,
    priority,
    text,
    rationale: "Generado por reglas conservadoras del Knowledge Intake Engine.",
    confidenceScore,
    safetyLimit: "Informativo; requiere validacion humana para decisiones criticas.",
    requiresHumanValidation: true,
  };
}

export function reasonAboutIncident(incident: ArgusIncidentKnowledge): ArgusOperationalReasoningResult {
  const rank = severityRank(incident.severity);
  const secondaryRisks = [
    incident.technicalFactors.smokeRisk ? "Riesgo por humo" : null,
    incident.technicalFactors.chemicalAgent ? "Exposicion quimica" : null,
    incident.technicalFactors.isotope ? "Exposicion radiologica" : null,
    incident.technicalFactors.routeDisruptionRisk ? "Disrupcion de rutas" : null,
    incident.domain === "tsunami" ? "Evacuacion costera" : null,
  ].filter((item): item is string => Boolean(item));
  const priority = rank >= 4 ? "critical" : rank >= 3 ? "high" : "medium";

  return {
    severity: incident.severity,
    secondaryRisks,
    escalationProbability: Math.min(95, rank * 18 + secondaryRisks.length * 8),
    exposedPopulationEstimate: incident.technicalFactors.exposedPopulation,
    nearbyCriticalInfrastructure: incident.impact?.infrastructureAffected ?? [],
    affectedRoutes: incident.technicalFactors.roadClosureRisk || incident.technicalFactors.routeDisruptionRisk ? ["Rutas cercanas requieren revision"] : [],
    citizenRecommendation: makeRecommendation(
      `reason-citizen-${incident.id}`,
      "citizen",
      priority,
      "Mantengase lejos del area, siga fuentes oficiales y no ingrese a zonas de riesgo.",
      incident.confidenceScore
    ),
    institutionalRecommendation: makeRecommendation(
      `reason-inst-${incident.id}`,
      "institutional",
      priority,
      "Validar ubicacion, fuentes, rutas afectadas y poblacion expuesta antes de coordinar respuesta.",
      incident.confidenceScore
    ),
    informationNeeds: [
      incident.latitude === undefined || incident.longitude === undefined ? "Ubicacion precisa" : null,
      incident.occurredAt ? null : "Fecha/hora confirmada",
      incident.evidenceCount < 2 ? "Evidencia corroborada" : null,
    ].filter((item): item is string => Boolean(item)),
    confidenceScore: Math.max(20, Math.min(90, incident.confidenceScore - (incident.evidenceCount < 2 ? 8 : 0))),
    limits: [
      "No sustituye instrucciones oficiales.",
      "No usa IA predictiva real ni datos persistidos en esta version.",
      "Las recomendaciones fuertes requieren revision humana.",
    ],
  };
}
