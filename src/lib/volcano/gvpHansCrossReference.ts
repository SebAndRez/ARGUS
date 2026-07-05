import type { VolcanoBaselineContext, VolcanicActivityReportContext } from "@/types/volcano";

export function buildGvpHansCrossReference(input: {
  gvpVolcano?: VolcanoBaselineContext;
  gvpReport?: VolcanicActivityReportContext;
  hansAlertLevel?: string;
  hansAviationColorCode?: string;
}) {
  return {
    sourceId: "smithsonian-gvp",
    crossSource: "usgs-volcano-hans",
    volcanoNumber: input.gvpVolcano?.volcanoNumber ?? input.gvpReport?.volcanoNumber,
    volcanoName: input.gvpVolcano?.volcanoName ?? input.gvpReport?.volcanoName,
    officialAlertSource: input.hansAlertLevel || input.hansAviationColorCode ? "USGS Volcano HANS" : "local_observatory_required",
    alertLevel: input.hansAlertLevel,
    aviationColorCode: input.hansAviationColorCode,
    gvpRole: "baseline_history_and_preliminary_report_context",
    doesGvpOverwriteHans: false,
    caveats: [
      "USGS HANS or the relevant local observatory has higher weight for official alert level.",
      "Smithsonian GVP adds catalog, history and curated narrative context only.",
    ],
  };
}
