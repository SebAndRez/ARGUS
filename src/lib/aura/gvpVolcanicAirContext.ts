import type { VolcanicActivityReportContext } from "@/types/volcano";

export function buildGvpVolcanicAirContext(context: VolcanicActivityReportContext) {
  return {
    sourceId: "smithsonian-gvp",
    openAqUse: "If GVP reports ash/gas, OpenAQ PM2.5/PM10/SO2 stations can provide nearby observation context when available.",
    volcanoNumber: context.volcanoNumber,
    volcanoName: context.volcanoName,
    caveats: ["GVP report alone does not determine air safety.", "OpenAQ station availability and provider quality vary."],
    evidenceRefs: context.evidenceRefs,
  };
}
