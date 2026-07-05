import type { VolcanoBaselineContext } from "@/types/volcano";

export function buildGvpOsmExposureContext(context: VolcanoBaselineContext) {
  return {
    sourceId: "smithsonian-gvp",
    purpose: "volcano_nearby_osm_exposure_context",
    volcanoNumber: context.volcanoNumber,
    volcanoName: context.volcanoName,
    queryTargets: ["settlements", "roads", "bridges", "hospitals", "shelters", "aerodromes"],
    caveats: ["No hazard zone is inferred from GVP catalog location.", "OSM quality varies and does not confirm facility availability."],
    evidenceRefs: context.evidenceRefs,
  };
}
