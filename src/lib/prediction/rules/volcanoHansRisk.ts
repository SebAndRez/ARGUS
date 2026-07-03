import type { ArgusNormalizedEvent } from "@/types/ingestion";
import type { ArgusRiskAssessment } from "@/types/riskAssessment";

function probabilityForSeverity(severity: ArgusNormalizedEvent["severity"]) {
  if (severity === "critical") return { band: "high" as const, score: 78 };
  if (severity === "high") return { band: "medium" as const, score: 64 };
  if (severity === "medium") return { band: "medium" as const, score: 52 };
  return { band: "low" as const, score: 28 };
}

export function evaluateVolcanoHansRisk(events: ArgusNormalizedEvent[]): ArgusRiskAssessment[] {
  return events
    .filter((event) => event.sourceId === "usgs-volcano-hans" && event.category === "volcano")
    .map((event) => {
      const probability = probabilityForSeverity(event.severity);
      const now = new Date().toISOString();
      return {
        id: `risk-volcano-hans-${event.externalId}`,
        riskType: "volcano_activity",
        status: event.severity === "critical" || event.severity === "high" ? "possible" : "watch",
        probabilityBand: probability.band,
        probabilityScore: probability.score,
        confidence: Math.min(event.confidence, 86),
        severity: event.severity,
        title: `USGS Volcano HANS context: ${event.title}`,
        summary:
          "ARGUS preliminary context from USGS Volcano HANS. Treat alert level and aviation color code as separate signals; validate local or regional official authorities before critical action.",
        recommendedAction:
          "Review HANS evidence, observatory updates, ash/aviation context, vulnerable population exposure and official local/regional volcano authority guidance.",
        timeframe: "near_real_time_monitoring",
        evidence: [
          {
            id: `ev-${event.id}`,
            sourceId: event.sourceId,
            sourceName: event.sourceName,
            externalEventId: event.id,
            kind: "usgs_volcano_hans_context",
            weight: 0.78,
            finding: event.description,
            observedAt: event.updatedAt ?? event.occurredAt,
            url: event.url ?? undefined,
          },
        ],
        relatedExternalEventIds: [event.id],
        createdAt: now,
        updatedAt: now,
        nextReviewAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      };
    });
}
