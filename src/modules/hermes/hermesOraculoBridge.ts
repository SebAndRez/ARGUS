import type { OraculoContradiction, OraculoEvidence } from "@/modules/oraculo/types";
import type { HermesBlockage, HermesRouteConfidence } from "@/modules/hermes/types";

const blockageCategories = new Set(["flood", "wildfire", "earthquake", "infrastructure"]);

/**
 * Convierte evidencia ORÁCULO relacionada a movilidad (bloqueo, despeje,
 * riesgo) en señales que HERMES puede usar para reforzar/relajar la
 * confianza de un bloqueo. Reglas:
 * - evidencia verificada sube confianza;
 * - contradicciones bajan confianza;
 * - fuente oficial puede confirmar un bloqueo;
 * - fuente ciudadana requiere validación adicional (no confirma sola).
 */
export function convertOraculoEvidenceToHermesSignals(
  evidence: OraculoEvidence[],
  contradictions: OraculoContradiction[]
): HermesBlockage[] {
  return evidence
    .filter((item) => blockageCategories.has(item.category) && item.location?.lat !== undefined)
    .map((item) => {
      const hasContradiction = contradictions.some((c) => c.evidenceIds.includes(item.id));
      const isOfficial = item.sourceType === "official" || item.sourceType === "government";

      let confidence: HermesRouteConfidence = "low";
      if (item.verificationStatus === "verified" && isOfficial) confidence = "verified";
      else if (item.verificationStatus === "verified") confidence = "high";
      else if (isOfficial) confidence = "medium";
      if (hasContradiction) confidence = confidence === "verified" ? "medium" : "low";

      return {
        id: `hermes-blockage-oraculo-${item.id}`,
        type: item.category === "flood" ? "flood" : item.category === "wildfire" ? "fire" : "infrastructure_damage",
        status: isOfficial && item.verificationStatus === "verified" ? "confirmed" : "reported",
        severity: item.confidence === "verified" || item.confidence === "high" ? "high" : "medium",
        location: {
          lat: item.location!.lat!,
          lng: item.location!.lng!,
          label: item.location!.label,
          isApproximate: item.location!.isApproximate,
        },
        sourceModule: "ORACULO",
        sourceId: item.id,
        confidence,
        createdAt: item.observedAt ?? item.collectedAt,
        updatedAt: item.collectedAt,
      };
    });
}
