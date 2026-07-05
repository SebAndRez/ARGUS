import type { EruptionHistoryContext, VolcanicActivityReportContext, VolcanoBaselineContext } from "@/types/volcano";

export function buildGvpVolcanoRiskContext(input: {
  baseline?: VolcanoBaselineContext;
  eruptionHistory?: EruptionHistoryContext[];
  recentReport?: VolcanicActivityReportContext;
  crossSourceMatches?: string[];
}) {
  const historicalVeiSignal = Math.max(0, ...(input.eruptionHistory ?? []).map((eruption) => eruption.vei ?? 0));
  const unrestSignal = input.recentReport ? 60 : 0;
  return {
    sourceId: "smithsonian-gvp",
    volcanoBaselineRiskContext: input.baseline,
    eruptionHistoryContext: input.eruptionHistory ?? [],
    recentActivityReportContext: input.recentReport,
    historicalVeiSignal,
    unrestSignal,
    ashLaharLavaGasContext: ["ash", "lahar", "lava", "gas"].filter((item) => input.recentReport?.observedPhenomena.join(" ").toLowerCase().includes(item) || input.baseline),
    localAuthorityMissingWarning: "Local observatory/authority required for operational status.",
    crossSourceMatches: input.crossSourceMatches ?? [],
    uncertaintyScore: input.recentReport ? 35 : 55,
    requiresReview: Boolean(input.recentReport),
    caveats: ["Catalog/history do not escalate to incidents.", "Recent reports are preliminary and do not replace local authorities."],
  };
}
