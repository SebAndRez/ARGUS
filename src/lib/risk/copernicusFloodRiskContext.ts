export function buildCopernicusFloodRiskContext(context: { glofasForecast?: unknown; gfmObserved?: unknown; evidenceRefs?: string[] }) {
  return {
    floodForecastRisk: Boolean(context.glofasForecast),
    observedFloodRisk: Boolean(context.gfmObserved),
    forecastVsObservedDelta: null,
    stalenessScore: 50,
    satelliteConfidenceScore: context.gfmObserved ? 70 : 0,
    modelUncertaintyScore: context.glofasForecast ? 35 : 0,
    requiresReview: true,
    caveats: ["GloFAS forecast does not confirm an event.", "GFM observation must be reviewed for advisory/exclusion flags."],
    evidenceRefs: context.evidenceRefs ?? [],
  };
}
