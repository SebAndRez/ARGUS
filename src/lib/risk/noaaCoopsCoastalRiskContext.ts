import type { CoastalObservationContext } from "@/types/coastalObservation";

export function buildNoaaCoopsCoastalRiskContext(context: CoastalObservationContext) {
  const freshness = context.stalenessMinutes === null
    ? "unknown"
    : context.stalenessMinutes <= 60
      ? "fresh"
      : context.stalenessMinutes <= 180
        ? "aging"
        : "stale";
  return {
    coastalObservationRiskContext: {
      sourceId: context.sourceId,
      sourceName: context.sourceName,
      purpose: context.purpose,
      observedWaterLevelAvailability: context.riskFactors.observedWaterLevelAvailable,
      tidePredictionAvailability: context.riskFactors.predictedTideAvailable,
      highTideTimingContext: context.tides.nextHighTide?.predictedAt ?? null,
      coastalWindContext: context.latest.wind ?? null,
      pressureContext: context.latest.airPressure ?? null,
      airGapContext: context.latest.airGap ?? null,
      stalenessScore: context.riskFactors.staleData ? 35 : 90,
      stationProximityScore: context.stations[0]?.distanceKm === null || context.stations[0]?.distanceKm === undefined
        ? 70
        : Math.max(20, 100 - Math.round(context.stations[0].distanceKm * 2)),
      uncertaintyScore: Math.max(0, 100 - context.confidence),
      freshness,
    },
    riskFactors: context.riskFactors,
    recommendedReviewActions: [
      "Review NOAA CO-OPS station metadata, datum, observed/predicted separation and staleness before operational use.",
      "Corroborate coastal observation context with official tsunami, NHC/NWS, local emergency management, port and transportation sources.",
      "This is coastal observation context, not an evacuation order.",
    ],
    caveats: [
      "NOAA CO-OPS station context indicates observed coastal conditions only.",
      "Do not confirm tsunami, official flooding, bridge closure or evacuation status from a CO-OPS reading alone.",
      "Do not infer absence of risk when no nearby station or product is available.",
    ],
    evidenceRefs: context.evidenceRefs,
  };
}
