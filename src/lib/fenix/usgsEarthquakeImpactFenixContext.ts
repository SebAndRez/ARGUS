import type { EarthquakeOperationalImpactContext } from "@/types/earthquakeImpact";

export function buildUsgsEarthquakeImpactFenixContext(context: EarthquakeOperationalImpactContext) {
  return {
    sourceId: "usgs-earthquake-impact",
    simulationContext: "earthquake_estimated_shaking_impact",
    eventId: context.eventId,
    maxMmi: context.maxMmi,
    pagerAlert: context.pagerAlert,
    recommendedPriority: context.recommendedPriority,
    reviewActions: ["Prioritize rapid assessment in higher estimated shaking/exposure zones.", "Review bridges, hospitals and routes inside stronger shaking footprint."],
    caveats: ["Does not claim collapsed buildings, confirmed casualties or automatic evacuation."],
    evidenceRefs: context.evidenceRefs,
  };
}
