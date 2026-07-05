import type { VolcanoBaselineContext } from "@/types/volcano";

export function buildGvpHumanitarianExposureContext(context: VolcanoBaselineContext) {
  return {
    sourceId: "smithsonian-gvp",
    purpose: "volcano_humanitarian_exposure_context",
    volcanoNumber: context.volcanoNumber,
    volcanoName: context.volcanoName,
    hdxHapiUse: "Population/vulnerability indicators can be reviewed around a bounded admin/area context.",
    caveats: ["Do not estimate affected population without an official hazard zone or bounded scenario.", "Needs/displacement indicators do not confirm volcano impacts."],
    evidenceRefs: context.evidenceRefs,
  };
}
