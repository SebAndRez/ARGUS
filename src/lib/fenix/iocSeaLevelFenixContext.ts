import type { SeaLevelObservationContext } from "@/types/seaLevelObservation";

export function buildIocSeaLevelFenixContext(context: SeaLevelObservationContext) {
  return {
    sourceId: "ioc-slsmf",
    sourceName: "IOC Sea Level Monitoring Facility",
    simulationContext: "global_sea_level_observation_context",
    nearestStations: context.stations,
    latestRelativeSeaLevel: context.latest,
    stalenessMinutes: context.stalenessMinutes,
    datumCaution: true,
    evidenceRefs: context.evidenceRefs,
    caveats: [
      "Simulation uses IOC SLSMF relative sea level observations.",
      "This is not an official inundation model.",
      "This is not a tsunami confirmation.",
      "Requires official and local authority validation.",
    ],
  };
}
