import type { ArgusNormalizedEvent } from "@/types/ingestion";
import type { ArgusRiskAssessment } from "@/types/riskAssessment";
import {
  clampScore,
  confidenceFromEvidence,
  evidence,
  probabilityBand,
  severityFromScore,
  statusFromScore,
} from "@/lib/prediction/evidenceScoring";

export function evaluateEarthquakeImpactRisk(
  events: ArgusNormalizedEvent[]
): ArgusRiskAssessment[] {
  const earthquakes = events.filter(
    (event) =>
      event.category === "earthquake" &&
      typeof event.rawMagnitude === "number" &&
      event.rawMagnitude >= 6
  );
  const gdacsSevere = events.filter(
    (event) =>
      event.sourceId === "gdacs" &&
      event.category === "earthquake" &&
      (event.severity === "high" || event.severity === "critical")
  );

  return earthquakes.map((event) => {
    let score = event.rawMagnitude! >= 7 ? 68 : 44;
    const items = [
      evidence({
        sourceId: event.sourceId,
        sourceName: event.sourceName,
        externalEventId: event.id,
        kind: "earthquake_magnitude",
        weight: event.rawMagnitude! >= 7 ? 35 : 24,
        finding: `Sismo M${event.rawMagnitude?.toFixed(1)} reportado en ${event.locationName ?? event.title}.`,
        observedAt: event.occurredAt,
        url: event.url ?? undefined,
      }),
    ];

    if ((event.rawDepthKm ?? 99) <= 50) {
      score += 12;
      items.push(
        evidence({
          sourceId: event.sourceId,
          sourceName: event.sourceName,
          externalEventId: event.id,
          kind: "shallow_depth",
          weight: 12,
          finding: "Profundidad baja o media puede aumentar impacto local.",
          observedAt: event.occurredAt,
          url: event.url ?? undefined,
        })
      );
    } else if ((event.rawDepthKm ?? 0) >= 120) {
      score -= 10;
    }

    gdacsSevere.slice(0, 1).forEach((gdacs) => {
      score += gdacs.severity === "critical" ? 18 : 10;
      items.push(
        evidence({
          sourceId: gdacs.sourceId,
          sourceName: gdacs.sourceName,
          externalEventId: gdacs.id,
          kind: "gdacs_impact_signal",
          weight: 16,
          finding: `GDACS entrega nivel ${gdacs.rawAlertLevel ?? gdacs.severity} para evento sismico.`,
          observedAt: gdacs.occurredAt,
          url: gdacs.url ?? undefined,
        })
      );
    });

    const finalScore = clampScore(score);
    const now = new Date().toISOString();

    return {
      id: `risk-earthquake-impact-${event.sourceId}-${event.externalId}`,
      riskType: "earthquake_impact",
      status: statusFromScore(finalScore),
      probabilityBand: probabilityBand(finalScore),
      probabilityScore: finalScore,
      confidence: confidenceFromEvidence(items),
      severity: severityFromScore(finalScore),
      title: "Posible impacto sismico e infraestructura bajo revision",
      summary:
        "La magnitud, profundidad y senales oficiales sugieren revisar danos, replicas e infraestructura critica. No implica confirmacion automatica de danos.",
      recommendedAction:
        "Revisar reportes oficiales, estado de hospitales, puentes, puertos, rutas y prepararse para replicas.",
      timeframe: "0-72 horas",
      evidence: items,
      relatedExternalEventIds: [event.id, ...gdacsSevere.map((item) => item.id)],
      createdAt: now,
      updatedAt: now,
      nextReviewAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
  });
}
