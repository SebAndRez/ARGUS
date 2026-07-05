import type { EruptionHistoryContext, VolcanoBaselineContext } from "@/types/volcano";

export function buildGvpVolcanoScenarioContext(input: { baseline: VolcanoBaselineContext; eruptionHistory?: EruptionHistoryContext[] }) {
  return {
    sourceId: "smithsonian-gvp",
    scenarioContext: "volcano_memory_scenario_context",
    volcanoNumber: input.baseline.volcanoNumber,
    volcanoName: input.baseline.volcanoName,
    location: { latitude: input.baseline.latitude, longitude: input.baseline.longitude, country: input.baseline.country, region: input.baseline.region },
    historicalVeiValues: input.eruptionHistory?.map((eruption) => eruption.vei).filter((value): value is number => typeof value === "number") ?? [],
    scenarioThemes: ["ash", "lahar", "lava", "gas", "explosion"],
    caveats: ["No real ash dispersion model in this phase.", "No hazard zone, evacuation order or eruption prediction is generated from GVP."],
    evidenceRefs: [...input.baseline.evidenceRefs, ...(input.eruptionHistory ?? []).flatMap((eruption) => eruption.evidenceRefs)],
  };
}
