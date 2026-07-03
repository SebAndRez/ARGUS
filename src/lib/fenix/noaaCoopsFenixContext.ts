import type { CoastalObservationContext } from "@/types/coastalObservation";

export function buildNoaaCoopsFenixContext(context: CoastalObservationContext) {
  return {
    sourceId: "noaa-coops",
    sourceName: "NOAA CO-OPS",
    simulationContext: "coastal_observation_context",
    nearestStations: context.stations,
    datum: context.query.datum,
    stalenessMinutes: context.stalenessMinutes,
    observedWaterLevel: context.latest.waterLevel ?? null,
    tidePredictions: context.tides,
    coastalMeteorology: {
      wind: context.latest.wind ?? null,
      airPressure: context.latest.airPressure ?? null,
      airGap: context.latest.airGap ?? null,
    },
    evidenceRefs: context.evidenceRefs,
    caveats: [
      "Simulation uses NOAA CO-OPS coastal observations.",
      "This is not an official inundation model.",
      "Requires local authority validation before operational use.",
    ],
  };
}
