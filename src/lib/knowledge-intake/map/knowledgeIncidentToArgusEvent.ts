import type { getKnowledgeIncidents } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import type {
  ArgusEvent,
  ArgusEventStatus,
  ArgusEventType,
  ArgusGeometry,
  ArgusGeometryPrecision,
  ArgusSeverity,
} from "@/types/argusEvent";

type PersistedKnowledgeIncident = Awaited<ReturnType<typeof getKnowledgeIncidents>>[number];

/**
 * Converts a persisted `KnowledgeIncident` row (Chile severe-weather alerts
 * promoted by `alertPromotionEngine`) into an `ArgusEvent`, so the map can
 * reuse the *existing* `ArgusEventLayer` render path (real polygon geometry,
 * severity coloring, detail panel) instead of a separate incident layer.
 * Geometry is read back verbatim from `geometryJson` (resolved once, at
 * promotion time) — this function never re-resolves or fabricates a shape.
 */

const DOMAIN_TO_EVENT_TYPE: Record<string, ArgusEventType> = {
  tornado: "TORNADO",
  waterspout: "WATERSPOUT",
  severe_wind: "SEVERE_WIND",
  thunderstorm: "SEVERE_WEATHER",
  storm: "HEAVY_RAIN",
  landslide: "LANDSLIDE",
  flood: "FLOOD",
  weather_alert: "OFFICIAL_ALERT",
};

const PRECISION_LEVEL_TO_GEOMETRY_PRECISION: Record<string, ArgusGeometryPrecision> = {
  commune: "administrative_commune",
  province: "administrative_province",
  region: "administrative_region",
};

function mapSeverity(severity: string): ArgusSeverity {
  if (severity === "critical" || severity === "high" || severity === "medium" || severity === "low") return severity;
  return "medium";
}

function mapStatus(severity: ArgusSeverity): ArgusEventStatus {
  if (severity === "critical") return "active";
  if (severity === "high") return "risk";
  return "monitoring";
}

export function knowledgeIncidentToArgusEvent(incident: PersistedKnowledgeIncident): ArgusEvent | null {
  const severity = mapSeverity(incident.severity);
  const technicalFactors = (incident.technicalFactorsJson as {
    region?: string;
    province?: string;
    commune?: string;
  } | null) ?? {};
  const geometryData = incident.geometryJson as
    | (Extract<ArgusGeometry, { type: "administrative_area" }> & { precisionLevel?: string })
    | null;

  let geometry: ArgusGeometry;
  let geometryPrecision: ArgusGeometryPrecision;
  if (geometryData?.type === "administrative_area") {
    geometry = { type: "administrative_area", geojson: geometryData.geojson, regionNames: geometryData.regionNames, anchor: geometryData.anchor };
    geometryPrecision = PRECISION_LEVEL_TO_GEOMETRY_PRECISION[geometryData.precisionLevel ?? "region"] ?? "administrative_region";
  } else if (typeof incident.latitude === "number" && typeof incident.longitude === "number") {
    geometry = { type: "point", coordinates: [incident.latitude, incident.longitude] };
    geometryPrecision = "approximate_point";
  } else {
    return null;
  }

  const recommendedActionsJson = (incident.recommendedActionsJson as Array<{ text?: string }> | null) ?? [];
  const rawEvidenceRefs = (incident.rawEvidenceRefsJson as string[] | null) ?? [];
  const occurredAtIso = incident.occurredAt?.toISOString();
  const detectedAtIso = incident.detectedAt?.toISOString() ?? occurredAtIso ?? incident.createdAt.toISOString();

  return {
    id: `chile-alert-${incident.id}`,
    title: incident.title,
    country: incident.country ?? "CL",
    region: technicalFactors.region,
    province: technicalFactors.province,
    commune: technicalFactors.commune,
    eventType: DOMAIN_TO_EVENT_TYPE[incident.domain] ?? "OFFICIAL_ALERT",
    severity,
    status: mapStatus(severity),
    confidence: "high",
    sourceType: "official",
    sources: [
      {
        sourceId: incident.sourceId,
        sourceName: incident.sourceName,
        sourceType: "official",
        url: rawEvidenceRefs[0],
        publishedAt: occurredAtIso,
      },
    ],
    geometry,
    geometryPrecision,
    validFrom: occurredAtIso,
    detectedAt: detectedAtIso,
    lastUpdated: incident.updatedAt.toISOString(),
    attribution: incident.sourceName,
    needsOfficialConfirmation: false,
    operationalSummary: incident.summary,
    recommendedActions: recommendedActionsJson.map((action) => action.text).filter((text): text is string => Boolean(text)),
    tags: (incident.tagsJson as string[] | null) ?? [],
    isDemo: false,
  };
}
