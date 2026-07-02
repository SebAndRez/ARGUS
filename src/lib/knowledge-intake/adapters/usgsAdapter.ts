import type { ArgusIncidentKnowledge, ArgusIncidentSeverity } from "@/types/knowledgeIntake";

type UsgsFeedKind = "significant" | "day" | "relevant";

type UsgsFeature = {
  id?: string;
  properties?: {
    mag?: number | null;
    place?: string | null;
    time?: number | null;
    updated?: number | null;
    url?: string | null;
    detail?: string | null;
    status?: string | null;
    tsunami?: number | null;
    title?: string | null;
    type?: string | null;
  };
  geometry?: {
    type?: string;
    coordinates?: [number, number, number?];
  };
};

type UsgsGeoJson = {
  type?: string;
  metadata?: {
    generated?: number;
    title?: string;
    count?: number;
  };
  features?: UsgsFeature[];
};

export type UsgsFetchOptions = {
  feed?: UsgsFeedKind;
  limit?: number;
};

const feedUrls: Record<UsgsFeedKind, string> = {
  significant: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson",
  day: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
  relevant: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
};

function severityFromMagnitude(magnitude: number | null | undefined): ArgusIncidentSeverity {
  if (typeof magnitude !== "number") return "unknown";
  if (magnitude >= 7) return "critical";
  if (magnitude >= 6) return "high";
  if (magnitude >= 4.5) return "medium";
  return "low";
}

function subtypeFromMagnitudeDepth(magnitude?: number | null, depthKm?: number) {
  const magnitudeLabel = typeof magnitude === "number" && magnitude >= 6.5 ? "major" : "recent";
  const depthLabel = typeof depthKm === "number" && depthKm <= 70 ? "shallow" : "deep_or_unknown";
  return `${magnitudeLabel}_${depthLabel}_earthquake`;
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 10_000): Promise<UsgsGeoJson> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/geo+json, application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`USGS responded ${response.status}`);
    return (await response.json()) as UsgsGeoJson;
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeUsgsEarthquakeFeature(feature: UsgsFeature): ArgusIncidentKnowledge | null {
  const [longitude, latitude, depthKm] = feature.geometry?.coordinates ?? [];
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;

  const magnitude = feature.properties?.mag ?? undefined;
  const place = feature.properties?.place ?? "USGS earthquake";
  const tsunamiFlag = feature.properties?.tsunami === 1;
  const severity = tsunamiFlag ? "critical" : severityFromMagnitude(magnitude);
  const occurredAt = feature.properties?.time ? new Date(feature.properties.time).toISOString() : undefined;
  const updatedAt = feature.properties?.updated ? new Date(feature.properties.updated).toISOString() : occurredAt;
  const id = `usgs-${feature.id ?? `${latitude}-${longitude}-${feature.properties?.time ?? "unknown"}`}`;

  return {
    id,
    title: feature.properties?.title ?? `M${magnitude ?? "?"} earthquake - ${place}`,
    summary: `USGS reported an earthquake near ${place}${typeof magnitude === "number" ? ` with magnitude ${magnitude}` : ""}.`,
    domain: "earthquake",
    subtype: subtypeFromMagnitudeDepth(magnitude, depthKm),
    severity,
    confidenceScore: 92,
    actionabilityScore: tsunamiFlag || (typeof magnitude === "number" && magnitude >= 6.5) ? 72 : 52,
    sourceReliabilityScore: 94,
    evidenceCount: 1,
    sourceIds: ["usgs_earthquake"],
    sourceNames: ["USGS Earthquake Hazards"],
    occurredAt,
    detectedAt: updatedAt,
    country: place.split(",").at(-1)?.trim(),
    locality: place,
    latitude,
    longitude,
    geometry: feature.geometry,
    technicalFactors: {
      magnitude: magnitude ?? undefined,
      depthKm,
      place,
      tsunamiFlag,
    },
    causes: ["Tectonic earthquake reported by USGS"],
    contributingFactors: tsunamiFlag ? ["USGS tsunami flag present"] : [],
    responseActions: ["Review official seismic and tsunami authorities before operational escalation"],
    lessonsLearned: [],
    recommendedActions: [
      {
        id: `rec-${id}`,
        audience: "institutional",
        priority: severity === "critical" ? "critical" : severity === "high" ? "high" : "medium",
        text: "Validate local shaking impact, coastal exposure and official emergency guidance.",
        rationale: "USGS provides reliable seismic signal; local impact still requires jurisdictional confirmation.",
        confidenceScore: 82,
        safetyLimit: "Informational; not an official evacuation or tsunami instruction.",
        requiresHumanValidation: true,
      },
    ],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["usgs", "earthquake", tsunamiFlag ? "tsunami-flag" : "seismic"],
    language: "en",
    rawEvidenceRefs: [feature.properties?.url ?? feature.properties?.detail ?? id],
    createdAt: updatedAt ?? new Date().toISOString(),
    updatedAt: updatedAt ?? new Date().toISOString(),
  };
}

export async function fetchUsgsEarthquakes(options: UsgsFetchOptions = {}) {
  const feed = options.feed ?? "relevant";
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const data = await fetchJsonWithTimeout(feedUrls[feed]);
  const incidents = (data.features ?? [])
    .map(normalizeUsgsEarthquakeFeature)
    .filter((incident): incident is ArgusIncidentKnowledge => Boolean(incident))
    .slice(0, limit);

  return {
    adapterId: "usgsAdapter",
    sourceId: "usgs_earthquake",
    sourceName: "USGS Earthquake Hazards",
    status: "ready" as const,
    feed,
    fetchedAt: new Date().toISOString(),
    count: incidents.length,
    incidents,
    metadata: data.metadata,
  };
}

export function usgsAdapter() {
  return {
    adapterId: "usgsAdapter",
    sourceId: "usgs_earthquake",
    status: "ready" as const,
    message: "USGS public GeoJSON feeds are available for controlled Knowledge Intake ingestion.",
    envelopes: [],
  };
}
