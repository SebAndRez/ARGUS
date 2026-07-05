import type { TalosRiskAssessment } from "@/modules/talos/types";
import type { ArcaGeoPoint, ArcaTalosDemandSignal } from "@/modules/arca/types";

function toArcaGeoPoint(location: TalosRiskAssessment["location"]): ArcaGeoPoint | undefined {
  if (typeof location?.lat !== "number" || typeof location.lng !== "number") return undefined;
  return {
    lat: location.lat,
    lng: location.lng,
    label: location.label,
    isApproximate: location.isApproximate,
  };
}

/**
 * Convierte evaluaciones TALOS en señales de demanda de refugio. Reglas:
 * - TALOS crítico cerca de población aumenta demanda de refugios;
 * - TALOS alto activa monitoreo de capacidad;
 * - baja confianza no oculta la posible necesidad, solo se advierte;
 * - contradicciones no deben ocultar la posible necesidad de refugio.
 */
export function convertTalosAssessmentsToArcaDemandSignals(assessments: TalosRiskAssessment[]): ArcaTalosDemandSignal[] {
  return assessments
    .filter((assessment) => assessment.riskLevel !== "minimal")
    .map((assessment) => {
      const populationFactor = assessment.factors.find((f) => f.id === "population_exposure" && f.contribution > 0);
      const possibleEvacuationNeed =
        assessment.riskLevel === "critical" || (assessment.riskLevel === "high" && Boolean(populationFactor));

      const shelterPriority: ArcaTalosDemandSignal["shelterPriority"] =
        assessment.riskLevel === "critical" ? "critical" : assessment.riskLevel === "high" ? "high" : assessment.riskLevel === "medium" ? "medium" : "low";

      return {
        assessmentId: assessment.id,
        riskLevel: assessment.riskLevel,
        category: assessment.category,
        confidence: assessment.confidence,
        possibleEvacuationNeed,
        shelterPriority,
        approximateZone: toArcaGeoPoint(assessment.location),
      } satisfies ArcaTalosDemandSignal;
    });
}
