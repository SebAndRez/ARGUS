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

export function evaluateFireSmokeRisk(
  events: ArgusNormalizedEvent[]
): ArgusRiskAssessment[] {
  const firmsEvents = events.filter((event) => event.sourceId === "nasa_firms");

  return firmsEvents.slice(0, 5).map((event) => {
    let score = 35;
    const items = [
      evidence({
        sourceId: event.sourceId,
        sourceName: event.sourceName,
        externalEventId: event.id,
        kind: "thermal_anomaly",
        weight: 20,
        finding: `NASA FIRMS detecta foco termico en ${event.locationName ?? "zona georreferenciada"}.`,
        observedAt: event.occurredAt,
        url: event.url ?? undefined,
      }),
    ];

    if (typeof event.rawFrp === "number" && event.rawFrp >= 20) {
      score += 18;
      items.push(
        evidence({
          sourceId: event.sourceId,
          sourceName: event.sourceName,
          externalEventId: event.id,
          kind: "frp",
          weight: 16,
          finding: `FRP ${event.rawFrp.toFixed(1)} MW sugiere anomalia relevante.`,
          observedAt: event.occurredAt,
          url: event.url ?? undefined,
        })
      );
    }

    if (String(event.rawConfidence ?? "").toLowerCase().includes("h") || event.confidence >= 75) {
      score += 12;
    }

    const finalScore = clampScore(score);
    const now = new Date().toISOString();

    return {
      id: `risk-fire-smoke-${event.sourceId}-${event.externalId}`,
      riskType: "fire_smoke",
      status: statusFromScore(finalScore),
      probabilityBand: probabilityBand(finalScore),
      probabilityScore: finalScore,
      confidence: confidenceFromEvidence(items),
      severity: severityFromScore(finalScore),
      title: "Posible humo o incendio asociado a foco termico",
      summary:
        "Un foco termico no equivale necesariamente a incendio confirmado. La hipotesis indica vigilancia de humo, viento y reportes locales.",
      recommendedAction:
        "Evitar acercarse a la zona, revisar informacion oficial y observar direccion de humo si es visible.",
      timeframe: "0-12 horas",
      evidence: items,
      relatedExternalEventIds: [event.id],
      createdAt: now,
      updatedAt: now,
      nextReviewAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    };
  });
}
