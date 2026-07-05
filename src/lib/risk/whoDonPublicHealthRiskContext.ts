export function buildWhoDonRiskContext(context: { confidence?: number; severity?: string; evidenceRefs?: string[] }) {
  return {
    publicHealthRiskContext: context,
    riskFactors: ["official_who_report", "public_health_event_context"],
    uncertaintyScore: Math.max(10, 100 - (context.confidence ?? 60)),
    requiresReview: (context.confidence ?? 0) < 80,
    caveats: ["No diagnosis, personalized treatment, automatic travel restriction or citizen alert is generated."],
    evidenceRefs: context.evidenceRefs ?? [],
  };
}
