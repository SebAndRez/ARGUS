import type { HydrologicalContext } from "@/types/hydrology";

export function buildUsgsWaterRiskContext(context: HydrologicalContext) {
  const hydrologicalDataFreshness = context.stalenessMinutes === null
    ? "unknown"
    : context.stalenessMinutes <= 60
      ? "fresh"
      : context.stalenessMinutes <= 180
        ? "aging"
        : "stale";
  const nearbyStationAvailability = context.locations.length > 0 ? "available" : "not_available";
  const streamflowContext = context.latest.streamflow
    ? `USGS Water context indicates streamflow ${context.latest.streamflow.value ?? "n/a"} ${context.latest.streamflow.unit ?? ""}.`
    : "USGS Water streamflow parameter 00060 is unavailable for this query.";
  const gageHeightContext = context.latest.gageHeight
    ? `USGS Water context indicates gage height ${context.latest.gageHeight.value ?? "n/a"} ${context.latest.gageHeight.unit ?? ""}.`
    : "USGS Water gage height parameter 00065 is unavailable for this query.";
  const uncertaintyScore = Math.max(0, 100 - context.confidence);
  return {
    hydrologicalRiskContext: {
      sourceId: context.sourceId,
      sourceName: context.sourceName,
      purpose: context.purpose,
      hydrologicalDataFreshness,
      nearbyStationAvailability,
      streamflowContext,
      gageHeightContext,
      floodContextScore: context.riskFactors.floodContextAvailable ? Math.round(context.confidence * 0.7) : 20,
      droughtContextPotential: context.riskFactors.droughtContextPotential,
      uncertaintyScore,
    },
    riskFactors: context.riskFactors,
    recommendedReviewActions: [
      "Review USGS site metadata, measuredAt timestamp and staleness before operational use.",
      "Corroborate hydrological context with official flood alerts, local emergency management and transportation sources.",
    ],
    caveats: [
      "This does not establish an official flood order.",
      "USGS Water context is measured hydrological context, not a forecast or evacuation instruction.",
      "Do not infer absence of risk when no nearby station or parameter is available.",
    ],
    evidenceRefs: context.evidenceRefs,
  };
}
