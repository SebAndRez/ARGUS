import type { SeaLevelObservationContext } from "@/types/seaLevelObservation";

export function buildIocSeaLevelRiskContext(context: SeaLevelObservationContext) {
  const nearestDistance = context.stations[0]?.distanceKm;
  return {
    seaLevelObservationRiskContext: {
      sourceId: context.sourceId,
      sourceName: context.sourceName,
      purpose: context.purpose,
      seaLevelObservationAvailability: context.riskFactors.recentSeaLevelAvailable,
      stationProximityScore: nearestDistance === null || nearestDistance === undefined ? 65 : Math.max(20, 100 - Math.round(nearestDistance)),
      stationStatusScore: context.riskFactors.stationOnline ? 90 : context.riskFactors.stationOffline ? 25 : 55,
      stalenessScore: context.riskFactors.staleData ? 35 : 90,
      qualityScore: context.riskFactors.lowQuality ? 40 : 86,
      relativeDatumCaution: true,
      missingValuesScore: context.riskFactors.missingValues ? 35 : 90,
      tsunamiContextSupport: context.purpose === "tsunami_context" && context.riskFactors.recentSeaLevelAvailable,
      uncertaintyScore: Math.max(0, 100 - context.confidence),
    },
    riskFactors: context.riskFactors,
    recommendedReviewActions: [
      "Review IOC SLSMF station metadata, staleness, quality flags and datum caveat before operational use.",
      "Corroborate sea level observation context with official tsunami warning centers and local authorities.",
      "This is sea level observation context, not an official tsunami warning.",
    ],
    caveats: [
      "IOC SLSMF station context provides recent relative sea level observations.",
      "Values are relative unless station-specific datum is available.",
      "Do not confirm tsunami, flooding or evacuation status from an IOC SLSMF reading alone.",
    ],
    evidenceRefs: context.evidenceRefs,
  };
}
