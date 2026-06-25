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
import {
  getSeismicVulnerabilityProfile,
  vulnerabilityScore,
} from "@/data/knowledge/seismicVulnerabilityProfiles";

const URBAN_HINTS = [
  "city",
  "capital",
  "near",
  "km",
  "caracas",
  "valencia",
  "maracay",
  "mexico city",
  "santiago",
  "lima",
  "quito",
  "bogota",
  "istanbul",
  "port-au-prince",
];

const COLLAPSE_TERMS = [
  "derrumbe",
  "colapso",
  "collapse",
  "collapsed",
  "debris",
  "escombros",
  "atrapado",
  "atrapada",
  "trapped",
  "building damage",
  "damaged building",
  "grieta",
  "crack",
  "dust",
  "polvo",
];

function hasUrbanHint(event: ArgusNormalizedEvent) {
  const text = `${event.title} ${event.locationName ?? ""} ${event.description}`.toLowerCase();
  return URBAN_HINTS.some((hint) => text.includes(hint));
}

function collapseSignalCount(events: ArgusNormalizedEvent[]) {
  const text = events
    .map((event) => `${event.title} ${event.description} ${event.whyItMatters ?? ""}`)
    .join(" ")
    .toLowerCase();
  return COLLAPSE_TERMS.filter((term) => text.includes(term)).length;
}

export function evaluateEarthquakeEntrapmentRisk(
  events: ArgusNormalizedEvent[]
): ArgusRiskAssessment[] {
  const earthquakes = events.filter(
    (event) =>
      event.category === "earthquake" &&
      typeof event.rawMagnitude === "number" &&
      event.rawMagnitude >= 5.5
  );

  return earthquakes
    .map((event): ArgusRiskAssessment | null => {
      const profile = getSeismicVulnerabilityProfile({
        country: event.country,
        locationName: event.locationName ?? event.title,
      });
      const shallow = (event.rawDepthKm ?? 99) <= 70;
      const urban = hasUrbanHint(event);
      const collapseSignals = collapseSignalCount(events);
      const magnitudeScore =
        event.rawMagnitude! >= 7 ? 28 : event.rawMagnitude! >= 6.2 ? 20 : 12;

      let score =
        24 +
        magnitudeScore +
        vulnerabilityScore(profile.structuralVulnerability) +
        vulnerabilityScore(profile.responseDifficulty) +
        Math.round(vulnerabilityScore(profile.populationExposure) * 0.7);

      if (shallow) score += 12;
      if (urban) score += 10;
      if (collapseSignals > 0) score += Math.min(20, collapseSignals * 7);
      if (profile.relativePreparedness === "high") score -= 8;

      const finalScore = clampScore(score);
      if (finalScore < 45) return null;

      const items = [
        evidence({
          sourceId: event.sourceId,
          sourceName: event.sourceName,
          externalEventId: event.id,
          kind: "possible_structural_collapse",
          weight: magnitudeScore,
          finding: `Sismo M${event.rawMagnitude?.toFixed(1)} con posible impacto estructural en ${event.locationName ?? event.title}.`,
          observedAt: event.occurredAt,
          url: event.url ?? undefined,
        }),
        evidence({
          sourceId: "argus_context",
          sourceName: "Perfil contextual ARGUS",
          externalEventId: event.id,
          kind: "pancake_or_progressive_collapse_risk",
          weight: vulnerabilityScore(profile.structuralVulnerability),
          finding: `${profile.uncertaintyNote} Riesgo estructural estimado: ${profile.structuralVulnerability}.`,
          observedAt: event.occurredAt,
        }),
        evidence({
          sourceId: "argus_context",
          sourceName: "Perfil contextual ARGUS",
          externalEventId: event.id,
          kind: "utility_disruption_risk",
          weight: vulnerabilityScore(profile.responseDifficulty),
          finding:
            "Posible presion sobre servicios basicos y respuesta local segun vulnerabilidad contextual.",
          observedAt: event.occurredAt,
        }),
      ];

      if (shallow) {
        items.push(
          evidence({
            sourceId: event.sourceId,
            sourceName: event.sourceName,
            externalEventId: event.id,
            kind: "shallow_depth",
            weight: 12,
            finding: "Profundidad superficial o intermedia aumenta posibilidad de dano local.",
            observedAt: event.occurredAt,
            url: event.url ?? undefined,
          })
        );
      }

      if (urban || collapseSignals > 0) {
        items.push(
          evidence({
            sourceId: "argus_context",
            sourceName: "ARGUS SAR",
            externalEventId: event.id,
            kind: "possible_people_trapped",
            weight: urban ? 14 : 10,
            finding:
              "Posible presencia de personas atrapadas bajo escombros. Requiere verificacion SAR local.",
            observedAt: event.occurredAt,
          })
        );
      }

      const now = new Date().toISOString();

      return {
        id: `risk-earthquake-entrapment-${event.sourceId}-${event.externalId}`,
        riskType: "earthquake_impact",
        status: statusFromScore(finalScore),
        probabilityBand: probabilityBand(finalScore),
        probabilityScore: finalScore,
        confidence: confidenceFromEvidence(items),
        severity: severityFromScore(finalScore),
        title: "Posible colapso estructural y personas atrapadas",
        summary:
          "Hipotesis operacional basada en magnitud, profundidad, cercania urbana y vulnerabilidad estructural estimada. No confirma personas atrapadas.",
        recommendedAction:
          "Priorizar verificacion SAR en edificios danados, revisar hospitales, cortes de servicios basicos y puntos de atrapamiento potencial.",
        timeframe: "0-24 horas",
        evidence: items,
        relatedExternalEventIds: [event.id],
        createdAt: now,
        updatedAt: now,
        nextReviewAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      };
    })
    .filter((assessment): assessment is ArgusRiskAssessment => Boolean(assessment));
}
