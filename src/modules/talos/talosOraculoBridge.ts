import type { OraculoContradiction, OraculoEvidence } from "@/modules/oraculo/types";
import { getOraculoSourceById } from "@/modules/oraculo/oraculoSourceRegistry";
import type { TalosOraculoSignal } from "@/modules/talos/types";

/**
 * Extrae señales de confianza desde evidencia ORÁCULO, sin recalcular su
 * scoring (reutiliza `reliabilityScore` ya calculado por ORÁCULO). Reglas:
 * - evidencia verificada y fuente oficial aumentan confianza;
 * - contradicciones bajan confianza;
 * - falta de evidencia baja confianza, no el riesgo (eso lo decide
 *   `talosRiskMatrix.ts`, no este puente);
 * - fuentes con revisión comercial/licencia pendiente se marcan, no se
 *   descartan.
 */
export function convertOraculoEvidenceToTalosSignals(
  evidence: OraculoEvidence[],
  contradictions: OraculoContradiction[]
): TalosOraculoSignal {
  const verifiedCount = evidence.filter((item) => item.verificationStatus === "verified").length;
  const officialSourceCount = evidence.filter((item) => item.sourceType === "official" || item.sourceType === "government").length;
  const citizenSourceCount = evidence.filter((item) => item.sourceType === "citizen").length;

  const averageConfidenceScore =
    evidence.length > 0 ? Math.round(evidence.reduce((sum, item) => sum + item.reliabilityScore, 0) / evidence.length) : 0;

  const relevantContradictions = contradictions.filter((contradiction) =>
    contradiction.evidenceIds.some((id) => evidence.some((item) => item.id === id))
  );

  const ages = evidence
    .map((item) => (Date.now() - new Date(item.observedAt ?? item.collectedAt).getTime()) / 3_600_000)
    .filter((hours) => Number.isFinite(hours));
  const oldestEvidenceHours = ages.length > 0 ? Math.max(...ages) : null;

  const hasLicensePendingSource = evidence.some((item) => {
    const source = getOraculoSourceById(item.sourceId);
    return source?.requiresLicenseReview ?? false;
  });

  const primary = evidence[0];

  return {
    verifiedCount,
    averageConfidenceScore,
    officialSourceCount,
    citizenSourceCount,
    contradictionCount: relevantContradictions.length,
    oldestEvidenceHours,
    location: primary?.location
      ? { lat: primary.location.lat, lng: primary.location.lng, label: primary.location.label, isApproximate: primary.location.isApproximate }
      : undefined,
    category: primary?.category,
    hasLicensePendingSource,
  };
}
