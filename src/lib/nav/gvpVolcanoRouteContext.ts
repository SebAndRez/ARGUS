import type { VolcanicActivityReportContext, VolcanoBaselineContext } from "@/types/volcano";

export function buildGvpVolcanoRouteContext(context: VolcanoBaselineContext | VolcanicActivityReportContext) {
  return {
    sourceId: "smithsonian-gvp",
    routeAnalysisContext: "volcano_route_review_context",
    volcanoNumber: context.volcanoNumber,
    volcanoName: context.volcanoName,
    reviewTargets: ["roads near volcano", "bridges", "lahar-prone corridors when official maps exist", "airports/helipads for ash context"],
    routeCaveats: ["Do not close routes from GVP alone.", "Requires transport authority, local observatory, VAAC or official hazard map confirmation."],
    requiresReview: true,
    evidenceRefs: context.evidenceRefs,
  };
}
