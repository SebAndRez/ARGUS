import type { NoaaNceiTsunamiEvent, NoaaNceiTsunamiRunup } from "@/lib/knowledge-intake/adapters/noaaNceiTsunamiAdapter";

export function buildNoaaNceiTsunamiRiskContext(events: NoaaNceiTsunamiEvent[] = [], runups: NoaaNceiTsunamiRunup[] = []) {
  const highestHistoricalRunup = Math.max(0, ...events.map((event) => event.maxWaterHeight ?? 0), ...runups.map((runup) => runup.maxWaterHeight ?? 0));
  const fatalities = events.reduce((sum, event) => sum + (event.deaths ?? 0), 0) + runups.reduce((sum, runup) => sum + (runup.deaths ?? 0), 0);
  const lowQuality = [...events.flatMap((event) => event.dataQualityFlags), ...runups.flatMap((runup) => runup.dataQualityFlags)].filter((flag) => flag !== "historicalDataQualityCaution").length;
  const dataQualityScore = Math.max(30, 90 - lowQuality * 4);
  return {
    historicalTsunamiRiskContext: {
      sourceId: "noaa-ncei-tsunami",
      sourceName: "NOAA NCEI/WDS Global Historical Tsunami Database",
      historicalTsunamiPresence: events.length > 0,
      historicalRunupPresence: runups.length > 0,
      highestHistoricalRunup,
      historicalFatalityContext: fatalities,
      regionalTsunamiMemoryScore: Math.min(100, events.length * 12 + runups.length * 4 + highestHistoricalRunup * 5),
      dataQualityScore,
      uncertaintyScore: 100 - dataQualityScore,
      isLiveSource: false,
    },
    riskFactors: {
      historicalRecordsAvailable: events.length > 0,
      runupObservationsAvailable: runups.length > 0,
      highHistoricalRunup: highestHistoricalRunup >= 5,
      historicalFatalitiesReported: fatalities > 0,
    },
    recommendedReviewActions: [
      "Review NOAA/NCEI event validity, runup quality and coordinates before using this as risk context.",
      "Validate current threat with NOAA Tsunami Warning Centers and local tsunami authorities.",
    ],
    caveats: [
      "Historical NOAA/NCEI records show tsunami runups in this region when records are present.",
      "ARGUS identifies historical tsunami memory near this coast; this is historical context, not a live warning.",
      "Do not state expected wave height, official inundation zones or evacuation orders from historical runups alone.",
    ],
    evidenceRefs: [...events.map((event) => event.tsunamiEventId), ...runups.map((runup) => `${runup.tsunamiEventId}:${runup.runupId}`)],
  };
}
