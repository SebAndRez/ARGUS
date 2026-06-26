import type { IncidentEvidence } from "@/types/incident";

export function scoreEvidence(evidence: IncidentEvidence[]) {
  const sourceTypes = new Set(evidence.map((item) => item.sourceType));
  const hasOfficial = evidence.some(
    (item) => item.sourceType === "OFFICIAL" || item.sourceType === "TECHNICAL"
  );
  const confidence = Math.min(
    100,
    Math.round(
      evidence.reduce((sum, item) => sum + item.confidenceImpact, 20) +
        sourceTypes.size * 9 +
        (hasOfficial ? 18 : 0)
    )
  );

  return {
    confidence,
    independentSourceCount: sourceTypes.size,
    hasOfficial,
    explanation:
      sourceTypes.size >= 2
        ? "Evidencia de fuentes independientes aumenta confianza operacional."
        : "Evidencia limitada; requiere verificacion adicional.",
  };
}

export function detectContradictoryEvidence(evidence: IncidentEvidence[]) {
  return evidence.some((item) => item.evidenceKind === "STATUS_UPDATE" && item.reliability < 30);
}
