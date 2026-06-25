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

export function evaluateTsunamiRisk(
  events: ArgusNormalizedEvent[]
): ArgusRiskAssessment[] {
  const usgsEvents = events.filter(
    (event) =>
      event.sourceId === "usgs_earthquake" &&
      typeof event.rawMagnitude === "number" &&
      event.rawMagnitude >= 6.5
  );
  const noaaEvents = events.filter((event) => event.sourceId === "noaa_tsunami");
  const gdacsEvents = events.filter(
    (event) =>
      event.sourceId === "gdacs" &&
      (event.category === "earthquake" || event.category === "tsunami")
  );

  return usgsEvents.map((earthquake) => {
    let score = 35;
    const items = [
      evidence({
        sourceId: earthquake.sourceId,
        sourceName: earthquake.sourceName,
        externalEventId: earthquake.id,
        kind: "earthquake_magnitude",
        weight: 25,
        finding: `USGS reporta M${earthquake.rawMagnitude?.toFixed(1)} en ${earthquake.locationName ?? earthquake.title}.`,
        observedAt: earthquake.occurredAt,
        url: earthquake.url ?? undefined,
      }),
    ];

    if ((earthquake.rawDepthKm ?? 99) <= 70) {
      score += 15;
      items.push(
        evidence({
          sourceId: earthquake.sourceId,
          sourceName: earthquake.sourceName,
          externalEventId: earthquake.id,
          kind: "shallow_depth",
          weight: 12,
          finding: `Profundidad ${earthquake.rawDepthKm?.toFixed(1) ?? "no confirmada"} km, compatible con vigilancia costera preventiva.`,
          observedAt: earthquake.occurredAt,
          url: earthquake.url ?? undefined,
        })
      );
    }

    const tsunamiFlag = Number((earthquake as { raw?: { properties?: { tsunami?: number } } }).raw?.properties?.tsunami);
    if (tsunamiFlag === 1) score += 15;

    const noaaText = noaaEvents
      .map((event) => `${event.title} ${event.description} ${event.rawMessageType ?? ""}`)
      .join(" ")
      .toLowerCase();
    if (noaaText.includes("warning")) score += 35;
    else if (noaaText.includes("advisory") || noaaText.includes("threat")) score += 25;
    else if (noaaText.includes("watch")) score += 18;
    else if (noaaText.includes("no threat") || noaaText.includes("information")) score -= 20;

    noaaEvents.slice(0, 2).forEach((event) =>
      items.push(
        evidence({
          sourceId: event.sourceId,
          sourceName: event.sourceName,
          externalEventId: event.id,
          kind: "noaa_bulletin",
          weight: event.rawMessageType?.toLowerCase().includes("warning") ? 35 : 18,
          finding: `NOAA publica ${event.rawMessageType ?? "boletin"}: ${event.title}.`,
          observedAt: event.occurredAt,
          url: event.url ?? undefined,
        })
      )
    );

    const severeGdacs = gdacsEvents.find(
      (event) => event.severity === "high" || event.severity === "critical"
    );
    if (severeGdacs) {
      score += severeGdacs.severity === "critical" ? 20 : 12;
      items.push(
        evidence({
          sourceId: severeGdacs.sourceId,
          sourceName: severeGdacs.sourceName,
          externalEventId: severeGdacs.id,
          kind: "gdacs_alert",
          weight: 16,
          finding: `GDACS marca nivel ${severeGdacs.rawAlertLevel ?? severeGdacs.severity}.`,
          observedAt: severeGdacs.occurredAt,
          url: severeGdacs.url ?? undefined,
        })
      );
    }

    const finalScore = clampScore(score);
    const hasNoaa = noaaEvents.length > 0;
    const reduced = noaaText.includes("no threat") || noaaText.includes("information");
    const status = reduced ? "reduced" : hasNoaa ? statusFromScore(finalScore) : "watch";
    const now = new Date().toISOString();

    return {
      id: `risk-tsunami-${earthquake.sourceId}-${earthquake.externalId}`,
      riskType: "tsunami",
      status,
      probabilityBand: probabilityBand(finalScore),
      probabilityScore: finalScore,
      confidence: confidenceFromEvidence(items),
      severity: severityFromScore(finalScore),
      title: reduced
        ? "NOAA reduce amenaza tsunami"
        : hasNoaa
          ? "Posible riesgo tsunami con boletin oficial"
          : "Vigilancia tsunami pendiente de confirmacion oficial",
      summary: reduced
        ? "Boletines NOAA disponibles reducen la hipotesis de amenaza. Mantener seguimiento oficial."
        : "Terremoto M6.5+ compatible con vigilancia costera preventiva. La hipotesis no confirma tsunami sin autoridad oficial.",
      recommendedAction:
        "Monitorear NOAA/SHOA/autoridad local. En costa, evacuar a zona alta si el sismo fue fuerte, prolongado o impidio mantenerse de pie.",
      timeframe: "0-24 horas",
      evidence: items,
      relatedExternalEventIds: [earthquake.id, ...noaaEvents.map((event) => event.id)],
      createdAt: now,
      updatedAt: now,
      nextReviewAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
  });
}
