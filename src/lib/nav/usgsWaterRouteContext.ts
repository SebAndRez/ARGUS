import type { HydrologicalContext } from "@/types/hydrology";

export function buildUsgsWaterRouteContext(context: HydrologicalContext) {
  return {
    sourceId: "usgs-water",
    sourceName: "USGS Water Data",
    routeAnalysisContext: "water_crossing_context",
    nearbyStations: context.locations,
    measurements: context.measurements,
    measuredAt: context.latest.measuredAt,
    stalenessMinutes: context.stalenessMinutes,
    waterCrossingCaution: context.riskFactors.floodContextAvailable && !context.riskFactors.staleData,
    routeCaveats: [
      "USGS Water does not officially close roads or bridges.",
      "Validate bridge, road closure and evacuation status with transportation and emergency authorities.",
    ],
    evidenceRefs: context.evidenceRefs,
  };
}
