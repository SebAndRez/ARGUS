import type { EarthquakeOperationalImpactContext } from "@/types/earthquakeImpact";

export function buildUsgsEarthquakeRouteContext(context: EarthquakeOperationalImpactContext) {
  return {
    sourceId: "usgs-earthquake-impact",
    routeAnalysisContext: "earthquake_shaking_route_review",
    eventId: context.eventId,
    maxMmi: context.maxMmi,
    possibleInspectionPriority: context.maxMmi && context.maxMmi >= 6,
    routeCaveats: ["Do not close routes officially from ShakeMap/PAGER alone.", "Requires transportation authority or verified field report for closures."],
    evidenceRefs: context.evidenceRefs,
  };
}
