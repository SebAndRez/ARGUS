export function buildGdeltMediaRiskContext(context: { confidence?: number; coverageSpike?: boolean; multiSourceSignal?: boolean; evidenceRefs?: string[] }) {
  return {
    mediaRiskContext: context,
    coverageSpikeScore: context.coverageSpike ? 70 : 0,
    multiSourceScore: context.multiSourceSignal ? 70 : 20,
    officialMatchScore: 0,
    rumorRisk: !context.multiSourceSignal,
    uncertaintyScore: Math.max(25, 100 - (context.confidence ?? 50)),
    requiresReview: true,
    caveats: ["GDELT alone is signal/review only and must not escalate to P0 or confirm an incident."],
    evidenceRefs: context.evidenceRefs ?? [],
  };
}
