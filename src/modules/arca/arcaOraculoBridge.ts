import type { OraculoContradiction, OraculoEvidence } from "@/modules/oraculo/types";
import type { ArcaConfidence } from "@/modules/arca/types";

export interface ArcaOraculoShelterEvidence {
  id: string;
  sourceName: string;
  isOfficial: boolean;
  confidence: ArcaConfidence;
  summary: string;
  hasContradiction: boolean;
  collectedAt: string;
}

/**
 * Convierte evidencia ORÁCULO relacionada a refugios (estado de servicios,
 * capacidad publicada, reportes externos) en señales que ARCA puede
 * mostrar. Reglas:
 * - fuente oficial sube confianza;
 * - contradicciones bajan confianza;
 * - evidencia antigua baja confianza;
 * - datos sin atribución quedan "en revisión" (confianza baja).
 */
export function convertOraculoEvidenceToArcaShelterEvidence(
  evidence: OraculoEvidence[],
  contradictions: OraculoContradiction[] = []
): ArcaOraculoShelterEvidence[] {
  const relevant = evidence.filter(
    (item) => item.category === "institutional" || item.category === "humanitarian" || item.tags.includes("shelter")
  );

  return relevant.map((item) => {
    const hasContradiction = contradictions.some((c) => c.evidenceIds.includes(item.id));
    const isOfficial = item.sourceType === "official" || item.sourceType === "government";
    const ageHours = (Date.now() - new Date(item.observedAt ?? item.collectedAt).getTime()) / 3_600_000;

    let confidence: ArcaConfidence = item.attribution ? "medium" : "low";
    if (isOfficial && item.verificationStatus === "verified") confidence = "verified";
    else if (isOfficial) confidence = "high";
    if (hasContradiction) confidence = confidence === "verified" ? "medium" : "low";
    if (ageHours > 24) confidence = confidence === "verified" ? "high" : confidence === "high" ? "medium" : "low";

    return {
      id: `arca-oraculo-${item.id}`,
      sourceName: item.sourceName,
      isOfficial,
      confidence,
      summary: item.summary,
      hasContradiction,
      collectedAt: item.collectedAt,
    } satisfies ArcaOraculoShelterEvidence;
  });
}
