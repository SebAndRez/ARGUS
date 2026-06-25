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

const HUMANITARIAN_TERMS = [
  "emergency",
  "displacement",
  "flood",
  "conflict",
  "cholera",
  "famine",
  "shelter",
  "health",
];

export function evaluateHumanitarianImpactRisk(
  events: ArgusNormalizedEvent[]
): ArgusRiskAssessment[] {
  const reliefWebEvents = events.filter((event) => event.sourceId === "reliefweb");
  const gdacsSevere = events.filter(
    (event) =>
      event.sourceId === "gdacs" &&
      (event.severity === "high" || event.severity === "critical")
  );
  if (reliefWebEvents.length === 0 && gdacsSevere.length === 0) return [];

  const primary = reliefWebEvents[0] ?? gdacsSevere[0];
  if (!primary) return [];

  let score = reliefWebEvents.length > 0 ? 45 : 38;
  const text = reliefWebEvents
    .map((event) => `${event.title} ${event.description}`)
    .join(" ")
    .toLowerCase();
  const matchedTerms = HUMANITARIAN_TERMS.filter((term) => text.includes(term));
  score += matchedTerms.length * 5;
  if (gdacsSevere.length > 0) score += 20;

  const items = [
    ...reliefWebEvents.slice(0, 3).map((event) =>
      evidence({
        sourceId: event.sourceId,
        sourceName: event.sourceName,
        externalEventId: event.id,
        kind: "reliefweb_context",
        weight: 16,
        finding: `ReliefWeb reporta contexto: ${event.title}.`,
        observedAt: event.occurredAt,
        url: event.url ?? undefined,
      })
    ),
    ...gdacsSevere.slice(0, 2).map((event) =>
      evidence({
        sourceId: event.sourceId,
        sourceName: event.sourceName,
        externalEventId: event.id,
        kind: "gdacs_severe_alert",
        weight: 20,
        finding: `GDACS reporta alerta ${event.rawAlertLevel ?? event.severity}.`,
        observedAt: event.occurredAt,
        url: event.url ?? undefined,
      })
    ),
  ];

  const finalScore = clampScore(score);
  const now = new Date().toISOString();

  return [
    {
      id: `risk-humanitarian-${primary.sourceId}-${primary.externalId}`,
      riskType: "humanitarian_impact",
      status: statusFromScore(finalScore),
      probabilityBand: probabilityBand(finalScore),
      probabilityScore: finalScore,
      confidence: confidenceFromEvidence(items),
      severity: severityFromScore(finalScore),
      title: "Posible impacto humanitario relacionado",
      summary:
        "Senales de ReliefWeb/GDACS sugieren revisar necesidades humanitarias, poblacion expuesta y respuesta institucional.",
      recommendedAction:
        "Revisar reportes ONU/ONG, necesidades basicas, salud, refugio y poblacion afectada antes de emitir conclusiones.",
      timeframe: "24-168 horas",
      evidence: items,
      relatedExternalEventIds: items
        .map((item) => item.externalEventId)
        .filter((id): id is string => Boolean(id)),
      createdAt: now,
      updatedAt: now,
      nextReviewAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    },
  ];
}
