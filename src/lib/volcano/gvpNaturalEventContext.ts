import type { VolcanoBaselineContext } from "@/types/volcano";

export function buildGvpNaturalEventContext(context: VolcanoBaselineContext) {
  return {
    sourceId: "smithsonian-gvp",
    volcanoNumber: context.volcanoNumber,
    volcanoName: context.volcanoName,
    eonetUse: "Match NASA EONET volcanic events to GVP identity/history when available.",
    firmsUse: "Use FIRMS thermal anomalies near a volcano as review context only.",
    caveats: [
      "Do not confirm eruption or lava flow from FIRMS alone.",
      "Do not use GVP as a live thermal anomaly or satellite SO2 source.",
    ],
    evidenceRefs: context.evidenceRefs,
  };
}
