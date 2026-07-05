import type { EarthquakeOperationalImpactContext } from "@/types/earthquakeImpact";

export function buildUsgsEarthquakeImpactRiskContext(context: EarthquakeOperationalImpactContext) {
  const maxMmiScore = context.maxMmi ? Math.min(100, Math.round(context.maxMmi * 10)) : 0;
  const pagerAlertScore = context.pagerAlert === "red" ? 95 : context.pagerAlert === "orange" ? 78 : context.pagerAlert === "yellow" ? 58 : context.pagerAlert === "green" ? 28 : 0;
  return {
    sourceId: "usgs-earthquake-impact",
    impactScore: context.impactScore,
    populationExposureScore: context.populationExposureScore,
    maxMmiScore,
    pagerAlertScore,
    secondaryHazardScore: context.secondaryHazardContext.length ? 45 : 0,
    infrastructureExposureScore: 0,
    uncertaintyScore: context.uncertaintyScore,
    recommendedPriority: context.recommendedPriority,
    requiresReview: context.requiresReview,
    caveats: ["Risk uses MMI/exposure/PAGER, not magnitude alone.", "No confirmed deaths, injuries, damage, evacuation or route closure."],
    evidenceRefs: context.evidenceRefs,
  };
}
