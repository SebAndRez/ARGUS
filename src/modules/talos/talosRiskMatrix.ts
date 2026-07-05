import type {
  TalosConfidenceLevel,
  TalosEscalationLikelihood,
  TalosImpactLevel,
  TalosRiskLevel,
} from "@/modules/talos/types";

const impactRank: Record<TalosImpactLevel, number> = {
  minor: 1,
  moderate: 2,
  major: 3,
  severe: 4,
  catastrophic: 5,
};

const escalationRank: Record<TalosEscalationLikelihood, number> = {
  unlikely: 1,
  possible: 2,
  likely: 3,
  imminent: 4,
  active: 5,
};

const confidenceRank: Record<TalosConfidenceLevel, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
  verified: 4,
};

/**
 * Matriz de riesgo: combina impacto potencial + probabilidad de
 * escalamiento + confianza del análisis.
 *
 * Regla clave: la falta de evidencia/confianza NO baja el riesgo cuando el
 * evento puede ser crítico por impacto/escalamiento — baja la confianza del
 * análisis, no oculta el peligro. Por eso el riesgo se calcula primero solo
 * con impacto+escalamiento, y la confianza baja solo agrega una bandera de
 * "requiere revisión", nunca reduce el nivel de riesgo resultante.
 */
export function combineTalosRiskMatrix(
  impact: TalosImpactLevel,
  escalationLikelihood: TalosEscalationLikelihood,
  confidence: TalosConfidenceLevel
): { riskLevel: TalosRiskLevel; requiresReviewDueToLowConfidence: boolean; matrixNote: string } {
  const combinedRank = impactRank[impact] + escalationRank[escalationLikelihood];

  let riskLevel: TalosRiskLevel;
  if (combinedRank >= 9) riskLevel = "critical";
  else if (combinedRank >= 7) riskLevel = "high";
  else if (combinedRank >= 5) riskLevel = "medium";
  else if (combinedRank >= 3) riskLevel = "low";
  else riskLevel = "minimal";

  const requiresReviewDueToLowConfidence = confidenceRank[confidence] <= 1 && riskLevel !== "minimal";

  let matrixNote: string;
  if (riskLevel === "critical" || riskLevel === "high") {
    matrixNote =
      confidenceRank[confidence] >= 3
        ? `Impacto ${impact} y escalamiento ${escalationLikelihood} con confianza ${confidence}: riesgo ${riskLevel}.`
        : `Impacto ${impact} y escalamiento ${escalationLikelihood} con confianza ${confidence}: riesgo ${riskLevel} que requiere revisión por baja confianza en el análisis, no por bajo peligro.`;
  } else {
    matrixNote = `Impacto ${impact} y escalamiento ${escalationLikelihood}: riesgo ${riskLevel}.`;
  }

  return { riskLevel, requiresReviewDueToLowConfidence, matrixNote };
}
