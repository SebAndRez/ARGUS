import { describe, expect, it } from "vitest";
import { calculateGovernedRiskScore } from "@/lib/risk/sourceWeighting";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/risk/__tests__/sourceWeighting.test.ts` (a
 * `runSourceWeightingTest()` export Vitest never ran). Every assertion
 * below is preserved from the original.
 */
describe("calculateGovernedRiskScore", () => {
  const osintOnly = calculateGovernedRiskScore({ evidence: [{ sourceId: "gdelt", confidence: 1 }] });
  const officialObserved = calculateGovernedRiskScore({
    evidence: [
      { sourceId: "noaa-tsunami", confidence: 1 },
      { sourceId: "noaa-coops", confidence: 0.9 },
    ],
  });

  it("osint-only evidence should show command-center only", () => {
    expect(osintOnly.shouldShowCommandCenterOnly).toBeTruthy();
  });

  it("osint-only evidence should not notify citizens", () => {
    expect(osintOnly.shouldNotifyCitizen).toBeFalsy();
  });

  it("official + observed evidence scores higher confidence than osint-only", () => {
    expect(officialObserved.confidenceScore).toBeGreaterThan(osintOnly.confidenceScore);
  });
});
