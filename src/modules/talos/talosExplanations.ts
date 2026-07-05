import type { TalosRiskAssessment } from "@/modules/talos/types";

const riskLevelLabel: Record<TalosRiskAssessment["riskLevel"], string> = {
  minimal: "mínimo",
  low: "bajo",
  medium: "medio",
  high: "alto",
  critical: "crítico",
};

const confidenceLabel: Record<TalosRiskAssessment["confidence"], string> = {
  unknown: "desconocida",
  low: "baja",
  medium: "media",
  high: "alta",
  verified: "verificada",
};

/**
 * Genera una explicación breve y trazable. Nunca dice "el sistema cree que
 * esto es grave" — siempre nombra los factores concretos que la sustentan.
 */
export function generateTalosExplanation(assessment: TalosRiskAssessment): string {
  const increasing = assessment.factors.filter((factor) => factor.direction === "increases_risk" && factor.contribution > 0);
  const topFactors = [...increasing].sort((a, b) => b.contribution - a.contribution).slice(0, 3);

  const parts: string[] = [];
  parts.push(
    `Riesgo ${riskLevelLabel[assessment.riskLevel]} con confianza ${confidenceLabel[assessment.confidence]}.`
  );

  if (topFactors.length > 0) {
    const factorList = topFactors.map((factor) => factor.label.toLowerCase()).join(", ");
    parts.push(
      topFactors.length === 1
        ? `El riesgo aumenta principalmente por: ${factorList}.`
        : `El riesgo aumenta por ${topFactors.length} factores: ${factorList}.`
    );
  }

  const contradictionFactor = assessment.factors.find((factor) => factor.id === "contradiction");
  if (assessment.sourceSummary.contradictionCount > 0 && contradictionFactor) {
    parts.push(
      `Existen ${assessment.sourceSummary.contradictionCount} contradicción(es) entre reportes ciudadanos y evidencia externa, lo que reduce la confianza del análisis sin bajar el riesgo por sí solo.`
    );
  }

  if (assessment.confidence === "unknown" || assessment.confidence === "low") {
    parts.push("Se recomienda revisión por ORÁCULO antes de escalar decisiones operativas.");
  }

  const routeRecommendation = assessment.recommendations?.find((rec) => rec.moduleId === "argus-hermes");
  if (routeRecommendation) {
    parts.push("Existen rutas potencialmente afectadas, por lo que se recomienda activar HERMES.");
  }

  return parts.join(" ");
}
