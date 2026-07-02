import type {
  ArgusKnowledgeSource,
  ArgusSourceReliabilityScore,
} from "@/types/knowledgeIntake";

export function classifyScore(finalScore: number): ArgusSourceReliabilityScore["label"] {
  if (finalScore >= 90) return "official_priority";
  if (finalScore >= 75) return "trusted_secondary";
  if (finalScore >= 60) return "needs_validation";
  if (finalScore >= 40) return "context_only";
  return "not_operational";
}

export function calculateSourceReliabilityScore(input: {
  authorityScore: number;
  freshnessScore: number;
  technicalDepthScore: number;
  historicalAccuracyScore: number;
  geospatialPrecisionScore: number;
  licenseClarityScore: number;
  updateCadenceScore: number;
  biasRiskScore: number;
}): ArgusSourceReliabilityScore {
  const positive =
    input.authorityScore * 0.22 +
    input.freshnessScore * 0.12 +
    input.technicalDepthScore * 0.16 +
    input.historicalAccuracyScore * 0.14 +
    input.geospatialPrecisionScore * 0.12 +
    input.licenseClarityScore * 0.1 +
    input.updateCadenceScore * 0.08;
  const finalScore = Math.max(0, Math.min(100, Math.round(positive - input.biasRiskScore * 0.06)));
  return { ...input, finalScore, label: classifyScore(finalScore) };
}

export function scoreSourceForClaim(source: ArgusKnowledgeSource, claim: string) {
  const domainHint = source.domains.some((domain) => claim.toLowerCase().includes(domain.replace(/_/g, " ")));
  return Math.min(100, source.reliabilityScore.finalScore + (domainHint ? 4 : 0));
}
