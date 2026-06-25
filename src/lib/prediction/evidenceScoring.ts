import type {
  ArgusProbabilityBand,
  ArgusRiskEvidence,
  ArgusRiskStatus,
} from "@/types/riskAssessment";

export function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function probabilityBand(score: number): ArgusProbabilityBand {
  if (score >= 85) return "critical";
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  if (score >= 20) return "low";
  return "very_low";
}

export function statusFromScore(score: number): ArgusRiskStatus {
  if (score >= 85) return "confirmed";
  if (score >= 70) return "probable";
  if (score >= 40) return "possible";
  if (score >= 20) return "watch";
  return "insufficient_data";
}

export function confidenceFromEvidence(evidence: ArgusRiskEvidence[]) {
  if (evidence.length === 0) return 30;
  const totalWeight = evidence.reduce((sum, item) => sum + item.weight, 0);
  const sourceBonus = new Set(evidence.map((item) => item.sourceId)).size * 6;
  return clampScore(45 + totalWeight / Math.max(1, evidence.length) + sourceBonus);
}

export function severityFromScore(score: number) {
  if (score >= 85) return "critical";
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export function evidence(
  input: Omit<ArgusRiskEvidence, "id">
): ArgusRiskEvidence {
  return {
    id: `${input.sourceId}:${input.externalEventId ?? input.kind}:${input.finding.slice(0, 24)}`,
    ...input,
  };
}
