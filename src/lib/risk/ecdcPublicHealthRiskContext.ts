export function buildEcdcRiskContext(context: { extractionConfidence?: number; requiresReview?: boolean; evidenceRefs?: string[] }) {
  return {
    ecdcPublicHealthRiskContext: context,
    riskFactors: ["ecdc_public_health_report", "eu_eea_context"],
    uncertaintyScore: Math.max(15, 100 - (context.extractionConfidence ?? 58)),
    requiresReview: context.requiresReview ?? true,
    caveats: ["No diagnosis, automatic travel restriction or citizen alert is generated."],
    evidenceRefs: context.evidenceRefs ?? [],
  };
}
