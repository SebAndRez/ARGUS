import { describe, expect, it } from "vitest";
import { calculateSourceReliabilityScore, classifyScore } from "@/lib/knowledge-intake/scoring/sourceScoring";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/sourceScoring.test.ts` (a
 * `runSourceScoringTest()` export Vitest never ran — this repo's
 * `vitest.config.ts` only includes `tests/**`). Every assertion below is
 * preserved from the original.
 */
describe("calculateSourceReliabilityScore", () => {
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

  it("produces a final score of at least 75 for a high-quality source", () => {
    expect(score.finalScore).toBeGreaterThanOrEqual(75);
  });
});

describe("classifyScore", () => {
  it("classifies a score of 91 as official_priority", () => {
    expect(classifyScore(91)).toBe("official_priority");
  });
});
