import { calculateGovernedRiskScore } from "@/lib/risk/sourceWeighting";

export function runSourceWeightingTest() {
  const osintOnly = calculateGovernedRiskScore({ evidence: [{ sourceId: "gdelt", confidence: 1 }] });
  const officialObserved = calculateGovernedRiskScore({
    evidence: [
      { sourceId: "noaa-tsunami", confidence: 1 },
      { sourceId: "noaa-coops", confidence: 0.9 },
    ],
  });

  return {
    passed:
      osintOnly.shouldShowCommandCenterOnly &&
      !osintOnly.shouldNotifyCitizen &&
      officialObserved.confidenceScore > osintOnly.confidenceScore,
  };
}
