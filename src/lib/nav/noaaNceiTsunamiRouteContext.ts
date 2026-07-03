import type { NoaaNceiTsunamiRunup } from "@/lib/knowledge-intake/adapters/noaaNceiTsunamiAdapter";

export function buildNoaaNceiTsunamiRouteContext(runups: NoaaNceiTsunamiRunup[] = []) {
  const highestRunup = Math.max(0, ...runups.map((runup) => runup.maxWaterHeight ?? 0));
  return {
    sourceId: "noaa-ncei-tsunami",
    sourceName: "NOAA NCEI/WDS Global Historical Tsunami Database",
    routeAnalysisContext: "historical_coastal_tsunami_memory",
    historicalRunupPresence: runups.length > 0,
    highestHistoricalRunup: highestRunup,
    coastalPlanningSignals: runups.map((runup) => ({
      locationName: runup.locationName,
      country: runup.country,
      latitude: runup.latitude,
      longitude: runup.longitude,
      maxWaterHeight: runup.maxWaterHeight,
      validity: runup.validity,
    })),
    demoRoutingPreference: runups.length > 0 ? "prefer inland alternatives during validated tsunami scenarios" : "no historical runup context available",
    routeCaveats: [
      "NOAA/NCEI historical tsunami records do not officially close routes.",
      "Do not invent evacuation zones from historical point observations.",
      "Validate current routing, evacuation and coastal access decisions with local authorities.",
    ],
    evidenceRefs: runups.map((runup) => `${runup.tsunamiEventId}:${runup.runupId}`),
  };
}
