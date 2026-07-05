import type { EruptionHistoryContext } from "@/types/volcano";

export function buildGvpTsunamiContext(context: EruptionHistoryContext) {
  return {
    sourceId: "smithsonian-gvp",
    purpose: "volcanic_tsunami_history_context",
    volcanoNumber: context.volcanoNumber,
    volcanoName: context.volcanoName,
    tsunamiGenerated: context.tsunamiGenerated,
    noaaNceiUse: "Cross-reference tsunami-associated eruptions with NOAA NCEI Historical Tsunami where data exists.",
    caveats: ["Historical tsunami association is not a live tsunami warning.", "NOAA/local tsunami warning centers have priority for current warnings."],
    evidenceRefs: context.evidenceRefs,
  };
}
