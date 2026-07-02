import { calculateSourceReliabilityScore, classifyScore } from "@/lib/knowledge-intake/scoring/sourceScoring";

export function runSourceScoringTest() {
  const score = calculateSourceReliabilityScore({
    authorityScore: 95,
    freshnessScore: 90,
    technicalDepthScore: 88,
    historicalAccuracyScore: 90,
    geospatialPrecisionScore: 82,
    licenseClarityScore: 80,
    updateCadenceScore: 86,
    biasRiskScore: 5,
  });

  return {
    passed: score.finalScore >= 75 && classifyScore(91) === "official_priority",
    score,
  };
}
