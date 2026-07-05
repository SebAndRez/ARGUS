import type { VolcanicActivityReportContext, VolcanoBaselineContext } from "@/types/volcano";

export function buildGvpMediaSignalContext(context: VolcanoBaselineContext | VolcanicActivityReportContext) {
  return {
    sourceId: "smithsonian-gvp",
    purpose: "volcano_gdelt_media_signal_context",
    volcanoNumber: context.volcanoNumber,
    volcanoName: context.volcanoName,
    gdeltUse: "Search media coverage as review signal only.",
    caveats: ["GDELT does not confirm eruption, casualties, evacuation or official alert status.", "Use local observatory/authority for operations."],
    evidenceRefs: context.evidenceRefs,
  };
}
