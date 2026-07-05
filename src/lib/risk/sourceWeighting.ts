import { getSourceGovernancePolicy, getSourceRiskWeight } from "@/lib/source-governance/sourceGovernanceRegistry";
import type { SourceRole } from "@/lib/source-governance/sourceRoles";

export interface SourceRiskWeight {
  sourceId: string;
  sourceRole: SourceRole;
  baseWeight: number;
  officialBoost: number;
  observedBoost: number;
  forecastPenalty: number;
  osintPenalty: number;
  historicalContextWeight: number;
  requiresReviewPenalty: number;
}

export interface GovernedRiskInput {
  incident?: { severity?: string; priority?: string; manualPriorityOverride?: string | null };
  evidence?: Array<{ sourceId: string; confidence?: number; requiresReview?: boolean; validatedByAdmin?: boolean }>;
  contexts?: Array<{ sourceId: string; confidence?: number }>;
}

export function getSourceRiskWeightProfile(sourceId: string): SourceRiskWeight {
  const policy = getSourceGovernancePolicy(sourceId);
  const sourceRole = policy?.sourceRole ?? "baseline_context";
  return {
    sourceId,
    sourceRole,
    baseWeight: getSourceRiskWeight(sourceId),
    officialBoost: sourceRole === "incident_trigger" ? 0.12 : 0,
    observedBoost: sourceRole === "observed_context" ? 0.08 : 0,
    forecastPenalty: sourceRole === "forecast_signal" ? 0.18 : 0,
    osintPenalty: sourceRole === "osint_signal" ? 0.3 : 0,
    historicalContextWeight: sourceRole === "historical_memory" ? 0.35 : 1,
    requiresReviewPenalty: policy?.requiresReviewByDefault ? 0.08 : 0,
  };
}

export function calculateGovernedRiskScore(input: GovernedRiskInput) {
  const allEvidence = [...(input.evidence ?? []), ...(input.contexts ?? [])];
  const breakdown = allEvidence.map((item) => {
    const profile = getSourceRiskWeightProfile(item.sourceId);
    const contribution = Math.max(
      0,
      (profile.baseWeight + profile.officialBoost + profile.observedBoost - profile.forecastPenalty - profile.osintPenalty - profile.requiresReviewPenalty) *
        (item.confidence ?? 1) *
        profile.historicalContextWeight
    );
    return {
      sourceId: item.sourceId,
      sourceRole: profile.sourceRole,
      contribution: Math.round(contribution * 100) / 100,
      requiresReview: "requiresReview" in item ? item.requiresReview === true : false,
    };
  });

  const roles = new Set(breakdown.map((item) => item.sourceRole));
  const total = breakdown.reduce((sum, item) => sum + item.contribution, 0);
  const independentBonus = Math.min(0.25, new Set(breakdown.map((item) => item.sourceId)).size * 0.04);
  const riskScore = Math.min(100, Math.round((total / Math.max(1, breakdown.length)) * 100 + independentBonus * 100));
  const confidenceScore = Math.min(100, Math.round((total / Math.max(1, breakdown.length)) * 92 + independentBonus * 100));
  const osintOnly = roles.size === 1 && roles.has("osint_signal");
  const forecastOnly = roles.size === 1 && roles.has("forecast_signal");
  const historicalOnly = roles.size === 1 && roles.has("historical_memory");
  const requiresReview = breakdown.some((item) => item.requiresReview) || osintOnly || forecastOnly;
  const recommendedPriority = input.incident?.manualPriorityOverride ?? pickPriority(riskScore, osintOnly || forecastOnly || historicalOnly);

  return {
    riskScore: osintOnly ? Math.min(riskScore, 45) : forecastOnly ? Math.min(riskScore, 60) : historicalOnly ? Math.min(riskScore, 40) : riskScore,
    confidenceScore,
    sourceContributionBreakdown: breakdown,
    requiresReview,
    caveats: buildRiskCaveats(roles),
    recommendedPriority,
    shouldNotifyCitizen: !requiresReview && !osintOnly && !forecastOnly && riskScore >= 70,
    shouldShowCommandCenterOnly: requiresReview || osintOnly || forecastOnly || historicalOnly,
  };
}

function pickPriority(score: number, contextOnly: boolean) {
  if (contextOnly) return score >= 75 ? "P2" : "P3";
  if (score >= 88) return "P0";
  if (score >= 72) return "P1";
  if (score >= 55) return "P2";
  if (score >= 35) return "P3";
  return "P4";
}

function buildRiskCaveats(roles: Set<SourceRole>) {
  const caveats: string[] = [];
  if (roles.has("osint_signal")) caveats.push("OSINT/media cannot confirm incidents, casualties or damage.");
  if (roles.has("forecast_signal")) caveats.push("Forecast/model output is not observed reality.");
  if (roles.has("historical_memory")) caveats.push("Historical memory informs baseline risk only.");
  if (roles.has("impact_enrichment")) caveats.push("Impact enrichment can raise priority but does not confirm losses by itself.");
  return caveats;
}
