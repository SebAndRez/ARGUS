import type { ArgusEvidenceConfidenceScore } from "@/types/knowledgeIntake";

export function calculateEvidenceConfidenceScore(input: Omit<ArgusEvidenceConfidenceScore, "finalConfidence" | "label">): ArgusEvidenceConfidenceScore {
  const corroborationScore = Math.min(100, input.corroborationCount * 18);
  const conflictPenalty = Math.min(40, input.conflictWithOtherSources);
  const finalConfidence = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        input.sourceReliability * 0.25 +
          corroborationScore * 0.16 +
          input.geolocationPrecision * 0.14 +
          input.timestampPrecision * 0.12 +
          input.documentQuality * 0.13 +
          input.extractionConfidence * 0.2 -
          conflictPenalty
      )
    )
  );
  return {
    ...input,
    finalConfidence,
    label: finalConfidence >= 75 ? "high" : finalConfidence >= 55 ? "medium" : finalConfidence >= 35 ? "low" : "not_operational",
  };
}
