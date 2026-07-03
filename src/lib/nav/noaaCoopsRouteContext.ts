import type { CoastalObservationContext } from "@/types/coastalObservation";

export function buildNoaaCoopsRouteContext(context: CoastalObservationContext) {
  return {
    sourceId: "noaa-coops",
    sourceName: "NOAA CO-OPS",
    routeAnalysisContext: "coastal_nav_context",
    nearbyStations: context.stations,
    observedWaterLevel: context.latest.waterLevel ?? null,
    tideTiming: context.tides,
    bridgeAirGapContext: context.latest.airGap ?? null,
    stalenessMinutes: context.stalenessMinutes,
    coastalNavigationCaution: context.riskFactors.observedWaterLevelAvailable || context.riskFactors.predictedTideAvailable,
    routeCaveats: [
      "NOAA CO-OPS does not officially close roads, waterways, ports or bridges.",
      "Do not declare bridge impassability from air gap context alone.",
      "Validate route status with transportation, port, bridge and emergency authorities.",
    ],
    phase2Prepared: ["currents", "currents_predictions", "NHC storm surge products"],
    evidenceRefs: context.evidenceRefs,
  };
}
