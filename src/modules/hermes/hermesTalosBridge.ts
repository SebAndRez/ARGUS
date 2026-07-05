import type { TalosRiskAssessment } from "@/modules/talos/types";
import type { HermesRiskZone, HermesRouteConfidence } from "@/modules/hermes/types";

const DEFAULT_RADIUS_METERS: Record<TalosRiskAssessment["riskLevel"], number> = {
  minimal: 150,
  low: 250,
  medium: 400,
  high: 600,
  critical: 900,
};

function toHermesConfidence(confidence: TalosRiskAssessment["confidence"]): HermesRouteConfidence {
  return confidence;
}

/**
 * Convierte evaluaciones TALOS en zonas de riesgo para el router de HERMES.
 * Reglas:
 * - crítico -> zona a evitar;
 * - alto -> zona de precaución;
 * - medio -> advertencia;
 * - baja confianza no bloquea automáticamente, pero siempre advierte.
 */
export function convertTalosAssessmentsToHermesRiskZones(assessments: TalosRiskAssessment[]): HermesRiskZone[] {
  return assessments
    .filter((assessment) => assessment.location?.lat !== undefined && assessment.location?.lng !== undefined)
    .map((assessment) => ({
      id: `hermes-zone-talos-${assessment.id}`,
      center: {
        lat: assessment.location!.lat!,
        lng: assessment.location!.lng!,
        label: assessment.location!.label,
        isApproximate: assessment.location!.isApproximate,
      },
      radiusMeters: DEFAULT_RADIUS_METERS[assessment.riskLevel],
      riskLevel: assessment.riskLevel,
      category: assessment.category,
      confidence: toHermesConfidence(assessment.confidence),
      recommendedModules: assessment.recommendations.map((rec) => rec.moduleId),
    }));
}
