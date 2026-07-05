export function buildHdxHapiRiskContext(snapshot: { dataAvailability?: { availableIndicators?: unknown[] }; evidenceRefs?: string[] }) {
  const available = snapshot.dataAvailability?.availableIndicators?.length ?? 0;
  return {
    humanitarianRiskContext: snapshot,
    riskFactors: ["population_exposure_context", "humanitarian_needs_context", "displacement_context"],
    recommendedReviewActions: ["Review reference periods, provider metadata and local humanitarian coordination before operational use."],
    uncertaintyScore: Math.max(20, 70 - available * 5),
    caveats: ["Operational presence indicates mapped activity, not guaranteed availability.", "Reference period and dataset methodology should be reviewed."],
    evidenceRefs: snapshot.evidenceRefs ?? [],
  };
}
