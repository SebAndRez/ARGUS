import type { VolcanicActivityReportContext, VolcanoBaselineContext } from "@/types/volcano";

export function buildGvpVolcanoHealthContext(context: VolcanoBaselineContext | VolcanicActivityReportContext) {
  return {
    sourceId: "smithsonian-gvp",
    healthContext: "volcanic_ash_respiratory_context",
    volcanoNumber: context.volcanoNumber,
    volcanoName: context.volcanoName,
    generalConcerns: ["ash irritation", "respiratory sensitivity", "eye irritation", "low visibility"],
    caveats: ["No diagnosis or treatment advice.", "GVP alone cannot say air is safe/unsafe.", "Use health authority and measured air quality observations for decisions."],
    evidenceRefs: context.evidenceRefs,
  };
}
