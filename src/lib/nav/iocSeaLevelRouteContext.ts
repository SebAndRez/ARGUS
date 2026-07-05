import type { SeaLevelObservationContext } from "@/types/seaLevelObservation";

export function buildIocSeaLevelRouteContext(context: SeaLevelObservationContext) {
  return {
    sourceId: "ioc-slsmf",
    sourceName: "IOC Sea Level Monitoring Facility",
    routeAnalysisContext: "global_sea_level_nav_context",
    nearbyStations: context.stations,
    latestRelativeSeaLevel: context.latest,
    stalenessMinutes: context.stalenessMinutes,
    coastalNavigationCaution: context.riskFactors.recentSeaLevelAvailable || context.riskFactors.staleData,
    routeCaveats: [
      "IOC SLSMF does not officially close roads, waterways, ports or bridges.",
      "Do not declare coastal flooding or evacuation zones from relative sea level context alone.",
      "Validate route status with transportation, port and emergency authorities.",
    ],
    phase2Prepared: ["local_tide_gauges", "SHOA", "JMA", "BMKG", "official_route_closure_sources"],
    evidenceRefs: context.evidenceRefs,
  };
}
