import type { NoaaNceiTsunamiEvent, NoaaNceiTsunamiRunup } from "@/lib/knowledge-intake/adapters/noaaNceiTsunamiAdapter";

export function buildNoaaNceiTsunamiFenixContext(event: NoaaNceiTsunamiEvent, runups: NoaaNceiTsunamiRunup[] = []) {
  const highestRunup = Math.max(event.maxWaterHeight ?? 0, ...runups.map((runup) => runup.maxWaterHeight ?? 0));
  return {
    sourceId: "noaa-ncei-tsunami",
    sourceName: "NOAA NCEI/WDS Global Historical Tsunami Database",
    simulationContext: "historical_tsunami_scenario",
    scenarioBasis: "simulation based on NOAA/NCEI historical tsunami record",
    tsunamiEventId: event.tsunamiEventId,
    sourceLocation: event.sourceLocationText,
    eventYear: event.year,
    cause: event.cause,
    validity: event.validity,
    referenceRunups: runups,
    demoParameters: {
      maxWaterHeight: event.maxWaterHeight ?? null,
      highestRunup,
      deaths: event.deaths ?? null,
      injuries: event.injuries ?? null,
      confidenceCaution: event.dataQualityFlags,
    },
    evidenceRefs: [event.tsunamiEventId, ...runups.map((runup) => `${runup.tsunamiEventId}:${runup.runupId}`)],
    caveats: [
      "Simulation based on NOAA/NCEI historical tsunami record.",
      "Not an official inundation model.",
      "Requires local authority validation.",
    ],
  };
}
