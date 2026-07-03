import type { ArgusHazardDomain, ArgusIncidentKnowledge, ArgusIncidentSeverity } from "@/types/knowledgeIntake";

export type EonetStatus = "open" | "closed" | "all";

export type EonetFetchParams = {
  status?: EonetStatus;
  days?: number;
  start?: string;
  end?: string;
  limit?: number;
  category?: string | string[];
  bbox?: string;
  source?: string | string[];
  persist?: boolean;
};

type EonetCategory = {
  id?: string;
  title?: string;
};

type EonetSource = {
  id?: string;
  title?: string;
  url?: string;
};

type EonetGeometry = {
  date?: string;
  type?: string;
  coordinates?: unknown;
  magnitudeValue?: number | null;
  magnitudeUnit?: string | null;
  magnitudeDescription?: string | null;
};

type EonetEvent = {
  id?: string;
  title?: string;
  description?: string | null;
  link?: string;
  closed?: string | null;
  categories?: EonetCategory[];
  sources?: EonetSource[];
  geometry?: EonetGeometry[];
};

type EonetFeature = {
  id?: string;
  type?: "Feature";
  properties?: EonetEvent;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  } | null;
};

type EonetGeoJson = {
  type?: "FeatureCollection";
  features?: EonetFeature[];
};

type EonetJsonResponse = {
  events?: EonetEvent[];
};

type EonetFetchResult = {
  adapterId: "eonetAdapter";
  sourceId: "nasa-eonet";
  sourceName: "NASA EONET";
  status: "ready" | "empty" | "partial" | "error";
  fetchedAt: string;
  fetched: number;
  count: number;
  incidents: ArgusIncidentKnowledge[];
  warnings: string[];
  errors: string[];
  requiresApiKey: false;
  requiresConfiguration: false;
};

const EONET_GEOJSON_URL = "https://eonet.gsfc.nasa.gov/api/v3/events/geojson";
const EONET_JSON_URL = "https://eonet.gsfc.nasa.gov/api/v3/events";
const EONET_CATEGORIES_URL = "https://eonet.gsfc.nasa.gov/api/v3/categories";
const EONET_SOURCES_URL = "https://eonet.gsfc.nasa.gov/api/v3/sources";
const REQUEST_TIMEOUT_MS = 12_000;

function asList(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value : value.split(/[;,]/);
}

function appendList(params: URLSearchParams, key: string, value?: string | string[]) {
  const items = asList(value).map((item) => item.trim()).filter(Boolean);
  if (items.length > 0) params.set(key, items.join(","));
}

function buildEonetUrl(baseUrl: string, input: EonetFetchParams = {}) {
  const params = new URLSearchParams();
  params.set("status", input.status ?? "open");
  params.set("days", String(Math.min(Math.max(input.days ?? 30, 1), 3650)));
  params.set("limit", String(Math.min(Math.max(input.limit ?? 100, 1), 500)));
  if (input.start) params.set("start", input.start);
  if (input.end) params.set("end", input.end);
  if (input.bbox) params.set("bbox", input.bbox);
  appendList(params, "category", input.category);
  appendList(params, "source", input.source);
  return `${baseUrl}?${params.toString()}`;
}

async function fetchJsonWithTimeout<T>(url: string, accept = "application/geo+json, application/json"): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: accept,
        "User-Agent": "ARGUS-GRID/0.1 knowledge-intake-eonet",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`NASA EONET responded ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function parseDate(value?: string | null) {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function isEonetFeature(input: EonetFeature | EonetEvent): input is EonetFeature {
  return "properties" in input || (input as { type?: string }).type === "Feature";
}

function firstGeometry(input: EonetFeature | EonetEvent): EonetGeometry | undefined {
  if (isEonetFeature(input)) {
    const featureGeometry = input.geometry?.type
      ? { type: input.geometry.type, coordinates: input.geometry.coordinates }
      : undefined;
    return featureGeometry ?? input.properties?.geometry?.[0];
  }
  return input.geometry?.[0];
}

function newestGeometry(input: EonetFeature | EonetEvent): EonetGeometry | undefined {
  const geometries: EonetGeometry[] = isEonetFeature(input) ? input.properties?.geometry ?? [] : input.geometry ?? [];
  return geometries
    .filter((geometry) => geometry?.coordinates !== undefined)
    .sort((a, b) => Date.parse(b.date ?? "") - Date.parse(a.date ?? ""))[0] ?? firstGeometry(input);
}

function pointFromCoordinates(coordinates: unknown): { longitude: number; latitude: number } | null {
  if (!Array.isArray(coordinates)) return null;
  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { longitude: lon, latitude: lat };
}

function collectCoordinatePairs(coordinates: unknown, pairs: Array<[number, number]> = []) {
  if (!Array.isArray(coordinates)) return pairs;
  if (coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    pairs.push([coordinates[0], coordinates[1]]);
    return pairs;
  }
  coordinates.forEach((item) => collectCoordinatePairs(item, pairs));
  return pairs;
}

function centroidFromGeometry(geometry?: EonetGeometry) {
  if (!geometry) return null;
  if (geometry.type === "Point") return pointFromCoordinates(geometry.coordinates);
  const pairs = collectCoordinatePairs(geometry.coordinates);
  if (pairs.length === 0) return null;
  const total = pairs.reduce(
    (sum, [lon, lat]) => ({ longitude: sum.longitude + lon, latitude: sum.latitude + lat }),
    { longitude: 0, latitude: 0 }
  );
  return {
    longitude: total.longitude / pairs.length,
    latitude: total.latitude / pairs.length,
  };
}

export function mapEonetCategoryToArgusDomain(categoryId?: string): ArgusHazardDomain {
  const normalized = categoryId?.trim();
  if (normalized === "wildfires") return "wildfire";
  if (normalized === "severeStorms") return "storm";
  if (normalized === "volcanoes") return "volcano";
  if (normalized === "floods") return "flood";
  if (normalized === "landslides") return "landslide";
  if (normalized === "drought") return "drought";
  if (normalized === "dustHaze") return "environmental_hazard";
  if (normalized === "seaLakeIce" || normalized === "snow" || normalized === "tempExtremes") return "extreme_weather";
  if (normalized === "earthquakes") return "earthquake";
  return "natural_disaster";
}

export function mapEonetStatusToIncidentStatus(event: EonetEvent) {
  if (event.closed) return "closed" as const;
  return "open" as const;
}

function severityForEonet(domain: ArgusHazardDomain, eventStatus: "open" | "closed", geometry?: EonetGeometry): ArgusIncidentSeverity {
  if (eventStatus === "closed") return "low";
  const magnitude = typeof geometry?.magnitudeValue === "number" ? geometry.magnitudeValue : undefined;
  if ((domain === "volcano" || domain === "wildfire" || domain === "flood") && typeof magnitude === "number" && magnitude >= 5) return "high";
  if (domain === "volcano" || domain === "wildfire" || domain === "flood" || domain === "storm") return "medium";
  if (domain === "earthquake" && typeof magnitude === "number" && magnitude >= 6) return "high";
  if (domain === "drought" || domain === "landslide") return "medium";
  return "low";
}

function medicalContextForDomain(domain: ArgusHazardDomain) {
  if (domain === "wildfire") return ["smoke exposure", "burn risk", "respiratory irritation", "evacuation support"];
  if (domain === "storm") return ["trauma risk", "power disruption", "structural damage"];
  if (domain === "volcano") return ["ash exposure", "respiratory risk", "evacuation support"];
  if (domain === "flood") return ["hypothermia risk", "water contamination", "isolation", "injury risk"];
  if (domain === "landslide") return ["trauma risk", "entrapment risk", "route disruption"];
  if (domain === "drought") return ["public health stress", "water supply pressure", "vulnerable population risk"];
  return ["natural hazard medical context"];
}

export function buildEonetExternalId(event: EonetFeature | EonetEvent) {
  const id = "properties" in event ? event.properties?.id ?? event.id : event.id;
  return id ? `EONET_${String(id).replace(/^EONET_/i, "")}` : "EONET_UNKNOWN";
}

function eventFromFeatureOrEvent(input: EonetFeature | EonetEvent): EonetEvent {
  if (isEonetFeature(input)) {
    return {
      ...input.properties,
      id: input.properties?.id ?? input.id,
      geometry: input.properties?.geometry?.length
        ? input.properties.geometry
        : input.geometry?.type
          ? [{ type: input.geometry.type, coordinates: input.geometry.coordinates }]
          : [],
    };
  }
  return input;
}

export function normalizeEonetEvent(featureOrEvent: EonetFeature | EonetEvent): ArgusIncidentKnowledge | null {
  const event = eventFromFeatureOrEvent(featureOrEvent);
  const externalId = buildEonetExternalId(event);
  if (externalId === "EONET_UNKNOWN") return null;
  const geometry = newestGeometry(event);
  const centroid = centroidFromGeometry(geometry);
  const primaryCategory = event.categories?.[0];
  const domain = mapEonetCategoryToArgusDomain(primaryCategory?.id);
  const eventStatus = mapEonetStatusToIncidentStatus(event);
  const severity = severityForEonet(domain, eventStatus, geometry);
  const occurredAt = parseDate(geometry?.date);
  const closedAt = parseDate(event.closed);
  const updatedAt = closedAt ?? occurredAt ?? new Date().toISOString();
  const evidenceRefs = [
    event.link,
    ...(event.sources ?? []).map((source) => source.url).filter(Boolean),
  ].filter((item): item is string => Boolean(item));
  const sourceNames = ["NASA EONET", ...(event.sources ?? []).map((source) => source.title ?? source.id).filter(Boolean) as string[]];
  const categories = (event.categories ?? []).map((category) => category.id ?? category.title).filter((item): item is string => Boolean(item));
  const sourceIds = (event.sources ?? []).map((source) => source.id ?? source.title).filter((item): item is string => Boolean(item));

  return {
    id: `eonet-${externalId}`,
    title: event.title ?? `NASA EONET ${primaryCategory?.title ?? "natural event"}`,
    summary:
      event.description ??
      `NASA EONET reports a ${primaryCategory?.title ?? domain} event. Use as global awareness context and validate local official sources before critical action.`,
    domain,
    subtype: primaryCategory?.title ?? primaryCategory?.id ?? "eonet_natural_event",
    severity,
    confidenceScore: 88,
    actionabilityScore: centroid ? (eventStatus === "open" ? 56 : 34) : 28,
    sourceReliabilityScore: 90,
    evidenceCount: Math.max(evidenceRefs.length, 1),
    sourceIds: ["nasa-eonet"],
    sourceNames: [...new Set(sourceNames)],
    occurredAt,
    detectedAt: updatedAt,
    latitude: centroid?.latitude,
    longitude: centroid?.longitude,
    geometry: geometry?.type ? { type: geometry.type, coordinates: geometry.coordinates } : undefined,
    technicalFactors: {
      eonetStatus: eventStatus,
      eonetCategories: categories,
      eonetSources: sourceIds,
      eonetClosedAt: closedAt,
      magnitudeValue: geometry?.magnitudeValue ?? undefined,
      magnitudeUnit: geometry?.magnitudeUnit ?? undefined,
      magnitudeDescription: geometry?.magnitudeDescription ?? undefined,
      priorityHint: eventStatus === "closed" ? "P4" : severity === "high" ? "P2" : "P3",
      medicalContext: medicalContextForDomain(domain),
      routingContext: ["NASA EONET can mark natural hazard context; do not close routes from EONET alone."],
      fenixScenarioContext: ["Can seed an ARGUS Fenix preview scenario; not an official local model."],
    },
    impact: {
      environmentalImpact: `${primaryCategory?.title ?? "Natural event"} tracked by NASA EONET.`,
    },
    causes: [`NASA EONET ${primaryCategory?.title ?? "natural event"} record`],
    contributingFactors: [
      eventStatus === "open" ? "Open NASA EONET event" : "Closed NASA EONET event",
      geometry?.magnitudeDescription,
    ].filter((item): item is string => Boolean(item)),
    responseActions: [
      "Use NASA EONET as global natural-event awareness context.",
      "Validate official local authority information before critical decisions.",
      "Do not generate sanctions, official evacuations or route closures from EONET alone.",
    ],
    lessonsLearned: [],
    recommendedActions: [
      {
        id: `rec-eonet-${externalId}`,
        audience: "institutional",
        priority: severity === "high" ? "high" : "medium",
        text: "Review NASA EONET geometry, category, source links and local authority updates before operational escalation.",
        rationale: "EONET is a curated global natural-events source, but local official validation is required for critical action.",
        confidenceScore: 78,
        safetyLimit: "Informational ARGUS estimate; not an official local order, route closure or evacuation instruction.",
        requiresHumanValidation: true,
      },
    ],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["nasa-eonet", "NASA EONET Natural Events", domain, eventStatus, ...categories].filter(Boolean),
    language: "en",
    rawEvidenceRefs: evidenceRefs.length > 0 ? [...new Set(evidenceRefs)] : [`nasa-eonet:${externalId}`],
    createdAt: updatedAt,
    updatedAt,
  };
}

export function normalizeEonetEvents(events: Array<EonetFeature | EonetEvent>) {
  return events.map(normalizeEonetEvent).filter((incident): incident is ArgusIncidentKnowledge => Boolean(incident));
}

export async function fetchEonetEvents(params: EonetFetchParams = {}): Promise<EonetFetchResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
  let items: Array<EonetFeature | EonetEvent> = [];
  let fetched = 0;

  try {
    const data = await fetchJsonWithTimeout<EonetGeoJson>(buildEonetUrl(EONET_GEOJSON_URL, { ...params, limit }));
    items = data.features ?? [];
    fetched = items.length;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "NASA EONET GeoJSON fetch failed");
  }

  if (items.length === 0) {
    try {
      const data = await fetchJsonWithTimeout<EonetJsonResponse>(buildEonetUrl(EONET_JSON_URL, { ...params, limit }), "application/json");
      items = data.events ?? [];
      fetched = items.length;
      if (items.length > 0) warnings.push("NASA EONET GeoJSON was unavailable or empty; JSON endpoint fallback was used.");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "NASA EONET JSON fallback failed");
    }
  }

  const incidents = normalizeEonetEvents(items).slice(0, limit);
  return {
    adapterId: "eonetAdapter",
    sourceId: "nasa-eonet",
    sourceName: "NASA EONET",
    status: incidents.length > 0 ? (errors.length > 0 ? "partial" : "ready") : errors.length > 0 ? "error" : "empty",
    fetchedAt: new Date().toISOString(),
    fetched,
    count: incidents.length,
    incidents,
    warnings,
    errors,
    requiresApiKey: false,
    requiresConfiguration: false,
  };
}

export async function fetchEonetCategories() {
  return fetchJsonWithTimeout(EONET_CATEGORIES_URL, "application/json");
}

export async function fetchEonetSources() {
  return fetchJsonWithTimeout(EONET_SOURCES_URL, "application/json");
}

export function getEonetAdapterStatus() {
  return {
    adapterId: "eonetAdapter",
    sourceId: "nasa-eonet",
    status: "ready" as const,
    requiresApiKey: false,
    requiresConfiguration: false,
    message: "NASA EONET v3 public API is available for no-key controlled Knowledge Intake ingestion.",
    capabilities: ["natural_events", "geojson", "json_fallback", "no_api_key", "global_awareness", "dedup_source_external_id"],
    mapLayer: "NASA EONET Natural Events",
    envelopes: [],
  };
}
