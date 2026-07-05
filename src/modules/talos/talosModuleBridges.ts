import type {
  TalosArcaSignal,
  TalosAuraSignal,
  TalosFenixSignal,
  TalosHermesSignal,
  TalosNexusSignal,
  TalosRiskAssessment,
} from "@/modules/talos/types";

const priorityFromRisk: Record<TalosRiskAssessment["riskLevel"], "low" | "medium" | "high" | "critical"> = {
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  critical: "critical",
};

/** TALOS no calcula rutas: solo prepara señales de movilidad para HERMES. */
export function prepareTalosSignalsForHermes(assessment: TalosRiskAssessment): TalosHermesSignal {
  const mobilityFactor = assessment.factors.find((factor) => factor.id === "mobility" && factor.contribution > 0);
  return {
    assessmentId: assessment.id,
    routesPossiblyAffected: Boolean(mobilityFactor),
    mobilitySeverity: assessment.riskLevel,
    evacuationNeeded: assessment.riskLevel === "high" || assessment.riskLevel === "critical",
    priority: priorityFromRisk[assessment.riskLevel],
    approximateZone: assessment.location,
  };
}

/** TALOS no gestiona refugios reales: solo prepara señales para ARCA. */
export function prepareTalosSignalsForArca(assessment: TalosRiskAssessment): TalosArcaSignal {
  const evacuationLevel: TalosArcaSignal["evacuationLevel"] =
    assessment.riskLevel === "critical" ? "full" : assessment.riskLevel === "high" ? "partial" : "none";

  return {
    assessmentId: assessment.id,
    possibleShelterNeed: evacuationLevel !== "none",
    evacuationLevel,
    priority: priorityFromRisk[assessment.riskLevel],
    approximateZone: assessment.location,
  };
}

/** No expone datos médicos personales: solo impacto estimado y prioridad sanitaria. */
export function prepareTalosSignalsForAura(assessment: TalosRiskAssessment): TalosAuraSignal {
  const medicalFactor = assessment.factors.find((factor) => factor.id === "medical");
  const estimatedMedicalImpact: TalosAuraSignal["estimatedMedicalImpact"] =
    !medicalFactor || medicalFactor.contribution <= 0
      ? "none"
      : medicalFactor.contribution >= 18
        ? "critical"
        : medicalFactor.contribution >= 12
          ? "high"
          : medicalFactor.contribution >= 6
            ? "medium"
            : "low";

  return {
    assessmentId: assessment.id,
    estimatedMedicalImpact,
    sanitaryPriority: priorityFromRisk[assessment.riskLevel],
    eventType: assessment.category,
    recommendsMedicalReview: estimatedMedicalImpact === "high" || estimatedMedicalImpact === "critical",
  };
}

/** TALOS no implementa inventario real: solo prepara señales logísticas. */
export function prepareTalosSignalsForNexus(assessment: TalosRiskAssessment): TalosNexusSignal {
  const logisticsFactor = assessment.factors.find((factor) => factor.id === "logistics" && factor.contribution > 0);
  const mobilityFactor = assessment.factors.find((factor) => factor.id === "mobility" && factor.contribution > 0);

  const probableResources: string[] = [];
  if (assessment.category === "fire") probableResources.push("agua", "transporte", "personal de apoyo");
  if (assessment.category === "flood") probableResources.push("bombas de achique", "transporte", "suministros básicos");
  if (assessment.category === "earthquake") probableResources.push("maquinaria pesada", "personal médico", "refugio temporal");
  if (probableResources.length === 0 && logisticsFactor) probableResources.push("recursos generales de apoyo");

  return {
    assessmentId: assessment.id,
    logisticsNeed: Boolean(logisticsFactor) || probableResources.length > 0,
    probableResources,
    supplyPriority: priorityFromRisk[assessment.riskLevel],
    approximateZone: assessment.location,
    routesImpact: Boolean(mobilityFactor),
  };
}

/**
 * Prepara señales limpias y trazables para futuros escenarios de FÉNIX.
 * No simula nada — solo entrega los datos y advierte qué falta.
 */
export function prepareTalosSignalsForFenix(assessment: TalosRiskAssessment): TalosFenixSignal {
  const missingData: string[] = [];
  if (!assessment.location?.lat) missingData.push("Sin ubicación precisa.");
  if (assessment.confidence === "unknown" || assessment.confidence === "low") missingData.push("Confianza del análisis baja.");
  if (assessment.sourceSummary.oraculoEvidence === 0) missingData.push("Sin evidencia externa de ORÁCULO.");

  return {
    assessmentId: assessment.id,
    eventId: assessment.eventId,
    category: assessment.category,
    riskLevel: assessment.riskLevel,
    impact: assessment.impact,
    escalationLikelihood: assessment.escalationLikelihood,
    approximateZone: assessment.location,
    factors: assessment.factors,
    confidence: assessment.confidence,
    missingData,
  };
}
