import type {
  ArgusHazardDomain,
  ArgusIncidentKnowledge,
  ArgusIncidentSeverity,
  ArgusKnowledgeEvidenceItem,
} from "@/types/knowledgeIntake";

export type NwsAlertStatus = "actual" | "exercise" | "system" | "test" | "draft";
export type NwsMessageType = "alert" | "update" | "cancel";
export type NwsSeverity = "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";
export type NwsUrgency = "Immediate" | "Expected" | "Future" | "Past" | "Unknown";
export type NwsCertainty = "Observed" | "Likely" | "Possible" | "Unlikely" | "Unknown";

export type NwsFetchParams = {
  area?: string;
  point?: string;
  zone?: string;
  status?: NwsAlertStatus | string;
  messageType?: NwsMessageType | string;
  event?: string;
  urgency?: NwsUrgency | string;
  severity?: NwsSeverity | string;
  certainty?: NwsCertainty | string;
  limit?: number;
  persist?: boolean;
};

type NwsGeocode = {
  SAME?: string[];
  UGC?: string[];
};

export type NwsAlertProperties = {
  id?: string;
  areaDesc?: string;
  geocode?: NwsGeocode;
  affectedZones?: string[];
  references?: Array<Record<string, unknown>>;
  sent?: string | null;
  effective?: string | null;
  onset?: string | null;
  expires?: string | null;
  ends?: string | null;
  status?: string;
  messageType?: string;
  category?: string;
  severity?: string;
  certainty?: string;
  urgency?: string;
  event?: string;
  sender?: string;
  senderName?: string;
  headline?: string;
  description?: string;
  instruction?: string;
  response?: string;
  parameters?: Record<string, string[] | string | undefined>;
  web?: string;
};

export type NwsAlertFeature = {
  id?: string;
  type?: "Feature";
  geometry?: Record<string, unknown> | null;
  properties?: NwsAlertProperties;
};

type NwsAlertCollection = {
  type?: "FeatureCollection";
  features?: NwsAlertFeature[];
};

type NwsFetchStatus = "ready" | "empty" | "partial" | "error" | "outside_coverage";

type NwsFetchResult = {
  adapterId: "nwsAdapter";
  sourceId: "nws";
  sourceName: "NWS / api.weather.gov";
  status: NwsFetchStatus;
  endpoint: string;
  fetchedAt: string;
  fetched: number;
  count: number;
  incidents: ArgusIncidentKnowledge[];
  evidence: ArgusKnowledgeEvidenceItem[];
  warnings: string[];
  errors: string[];
  requiresApiKey: false;
  requiresConfiguration: false;
  userAgentConfigured: boolean;
};

const NWS_BASE_URL = "https://api.weather.gov";
const REQUEST_TIMEOUT_MS = 12_000;
const FALLBACK_USER_AGENT = "ARGUS/preview (contact-not-configured)";

export function getNwsUserAgent() {
  return process.env.NWS_USER_AGENT?.trim() || FALLBACK_USER_AGENT;
}

export function getNwsHeaders() {
  return {
    "User-Agent": getNwsUserAgent(),
    Accept: "application/geo+json, application/json",
  };
}

function isNwsUserAgentConfigured() {
  return Boolean(process.env.NWS_USER_AGENT?.trim());
}

function parseDate(value?: string | null) {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function sanitizeId(value: string) {
  return value.replace(/^https?:\/\/api\.weather\.gov\/alerts\//i, "").replace(/[^a-zA-Z0-9:_-]+/g, "-");
}

function normalizeToken(value?: string) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function appendParam(params: URLSearchParams, key: string, value?: string) {
  if (value?.trim()) params.set(key, value.trim());
}

function buildAlertsUrl(params: NwsFetchParams = {}) {
  const search = new URLSearchParams();
  appendParam(search, "area", params.area);
  appendParam(search, "point", params.point);
  appendParam(search, "zone", params.zone);
  appendParam(search, "status", params.status ?? "actual");
  appendParam(search, "message_type", params.messageType);
  appendParam(search, "event", params.event);
  appendParam(search, "urgency", params.urgency);
  appendParam(search, "severity", params.severity);
  appendParam(search, "certainty", params.certainty);
  const suffix = search.toString();
  return `${NWS_BASE_URL}/alerts/active${suffix ? `?${suffix}` : ""}`;
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: getNwsHeaders(),
      signal: controller.signal,
    });
    if (response.status === 404) throw new Error("outside_coverage");
    if (!response.ok) throw new Error(`NWS responded ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function clampLimit(limit?: number) {
  return Math.min(Math.max(limit ?? 100, 1), 500);
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

function centroidFromGeometry(geometry?: Record<string, unknown> | null) {
  if (!geometry) return null;
  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    const longitude = Number(geometry.coordinates[0]);
    const latitude = Number(geometry.coordinates[1]);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }
  const pairs = collectCoordinatePairs(geometry.coordinates);
  if (pairs.length === 0) return null;
  const total = pairs.reduce(
    (sum, [longitude, latitude]) => ({ longitude: sum.longitude + longitude, latitude: sum.latitude + latitude }),
    { longitude: 0, latitude: 0 }
  );
  return { longitude: total.longitude / pairs.length, latitude: total.latitude / pairs.length };
}

export function buildNwsExternalId(alert: NwsAlertFeature | NwsAlertProperties) {
  const feature = alert as NwsAlertFeature;
  const properties = feature.properties ?? (alert as NwsAlertProperties);
  const rawId = properties?.id || ("id" in alert ? alert.id : undefined);
  if (rawId) return `NWS:${sanitizeId(String(rawId))}`;
  const fallback = [
    properties?.event ?? "unknown-event",
    properties?.onset ?? properties?.effective ?? properties?.sent ?? "unknown-time",
    properties?.expires ?? "unknown-expiry",
    properties?.areaDesc ?? "unknown-area",
  ].map((item) => normalizeToken(item).replace(/\s+/g, "-").slice(0, 80));
  return `NWS:${fallback.join(":")}`;
}

export function mapNwsEventToArgusDomain(event?: string): ArgusHazardDomain {
  const normalized = normalizeToken(event);
  if (normalized.includes("tornado")) return "tornado";
  if (normalized.includes("flash flood") || normalized.includes("flood")) return "flood";
  if (normalized.includes("hurricane")) return "hurricane";
  if (normalized.includes("tropical storm") || normalized.includes("thunderstorm")) return "storm";
  if (normalized.includes("heat")) return "heatwave";
  if (normalized.includes("freeze") || normalized.includes("wind chill") || normalized.includes("cold")) return "coldwave";
  if (normalized.includes("winter storm") || normalized.includes("blizzard") || normalized.includes("ice storm")) return "winter_storm";
  if (normalized.includes("red flag") || normalized.includes("fire weather")) return "wildfire_weather";
  if (normalized.includes("marine") || normalized.includes("small craft") || normalized.includes("gale") || normalized.includes("surf")) return "marine_weather";
  if (normalized.includes("air quality")) return "environmental_hazard";
  if (normalized.includes("fog")) return "extreme_weather";
  if (normalized.includes("wind")) return "storm";
  return "weather_alert";
}

export function mapNwsSeverityToArgusSeverity(severity?: string): ArgusIncidentSeverity {
  if (severity === "Extreme") return "critical";
  if (severity === "Severe") return "high";
  if (severity === "Moderate") return "medium";
  if (severity === "Minor") return "low";
  return "unknown";
}

export function mapNwsSeverityUrgencyCertaintyToPriority(alert: Pick<NwsAlertProperties, "severity" | "urgency" | "certainty" | "messageType">) {
  const severity = alert.severity;
  const urgent = alert.urgency === "Immediate" || alert.urgency === "Expected";
  const certain = alert.certainty === "Observed" || alert.certainty === "Likely";
  if (severity === "Extreme" && urgent && certain) return "P0" as const;
  if (severity === "Extreme") return "P1" as const;
  if (severity === "Severe" && urgent) return "P1" as const;
  if (severity === "Severe") return "P2" as const;
  if (severity === "Moderate") return "P3" as const;
  if (alert.messageType === "Statement") return "P4" as const;
  return "P4" as const;
}

function actionabilityForPriority(priority: "P0" | "P1" | "P2" | "P3" | "P4", hasGeometry: boolean) {
  const base = priority === "P0" ? 82 : priority === "P1" ? 74 : priority === "P2" ? 62 : priority === "P3" ? 48 : 34;
  return hasGeometry ? base : Math.max(24, base - 16);
}

function medicalContextForDomain(domain: ArgusHazardDomain) {
  if (domain === "heatwave") return ["heat illness", "dehydration", "vulnerable population stress"];
  if (domain === "coldwave" || domain === "winter_storm") return ["hypothermia", "frostbite", "isolation risk"];
  if (domain === "tornado" || domain === "storm" || domain === "hurricane") return ["trauma risk", "structural damage", "power disruption"];
  if (domain === "flood") return ["drowning risk", "hypothermia", "contaminated water", "injury risk"];
  if (domain === "wildfire_weather") return ["smoke exposure", "burn risk", "future evacuation support"];
  return ["weather hazard medical context"];
}

function evidenceConfidence() {
  return {
    sourceReliability: 92,
    corroborationCount: 1,
    geolocationPrecision: 82,
    timestampPrecision: 92,
    documentQuality: 86,
    extractionConfidence: 92,
    conflictWithOtherSources: 0,
    finalConfidence: 90,
    label: "high" as const,
  };
}

export function buildNwsEvidence(feature: NwsAlertFeature): ArgusKnowledgeEvidenceItem | null {
  const properties = feature.properties;
  if (!properties) return null;
  const externalId = buildNwsExternalId(feature);
  const title = properties.headline || properties.event || "NWS weather alert";
  return {
    id: `nws-evidence-${sanitizeId(externalId)}`,
    sourceId: "nws",
    sourceName: properties.senderName || "National Weather Service / NOAA",
    title,
    url: properties.web || properties.id,
    summary: [properties.description, properties.instruction].filter(Boolean).join("\n\n") || title,
    quote: properties.description,
    confidenceScore: evidenceConfidence(),
    locationConfidence: feature.geometry ? 0.85 : 0.55,
    timestampConfidence: properties.effective || properties.sent ? 0.92 : 0.65,
    extractedAt: new Date().toISOString(),
    conflicts: [],
  };
}

export function normalizeNwsAlert(feature: NwsAlertFeature): ArgusIncidentKnowledge | null {
  const properties = feature.properties;
  if (!properties) return null;
  const externalId = buildNwsExternalId(feature);
  const domain = mapNwsEventToArgusDomain(properties.event);
  const severity = mapNwsSeverityToArgusSeverity(properties.severity);
  const priorityHint = mapNwsSeverityUrgencyCertaintyToPriority(properties);
  const centroid = centroidFromGeometry(feature.geometry);
  const occurredAt = parseDate(properties.onset) ?? parseDate(properties.effective) ?? parseDate(properties.sent);
  const detectedAt = parseDate(properties.effective) ?? parseDate(properties.sent) ?? new Date().toISOString();
  const updatedAt = parseDate(properties.sent) ?? detectedAt;
  const sourceName = properties.senderName || "National Weather Service / NOAA";
  const evidenceRefs = [properties.web, properties.id, ...(properties.affectedZones ?? [])].filter((item): item is string => Boolean(item));
  const areaParts = (properties.areaDesc ?? "").split(";").map((item) => item.trim()).filter(Boolean);

  return {
    id: `nws-${sanitizeId(externalId)}`,
    title: properties.event || "NWS Weather Alert",
    summary:
      properties.headline ||
      properties.description?.slice(0, 280) ||
      "National Weather Service active alert. Use as official United States weather context and validate local instructions before critical action.",
    domain,
    subtype: properties.event || "nws_weather_alert",
    severity,
    confidenceScore: 90,
    actionabilityScore: actionabilityForPriority(priorityHint, Boolean(centroid)),
    sourceReliabilityScore: 92,
    evidenceCount: Math.max(evidenceRefs.length, 1),
    sourceIds: ["nws"],
    sourceNames: [sourceName],
    occurredAt,
    detectedAt,
    country: "US",
    region: areaParts[0],
    locality: properties.areaDesc,
    latitude: centroid?.latitude,
    longitude: centroid?.longitude,
    geometry: feature.geometry ?? undefined,
    technicalFactors: {
      nwsEvent: properties.event,
      nwsSeverity: properties.severity,
      nwsUrgency: properties.urgency,
      nwsCertainty: properties.certainty,
      nwsMessageType: properties.messageType,
      nwsCategory: properties.category,
      nwsResponse: properties.response,
      nwsAreaDesc: properties.areaDesc,
      nwsZones: properties.geocode?.UGC ?? properties.affectedZones,
      onsetAt: parseDate(properties.onset),
      effectiveAt: parseDate(properties.effective),
      expiresAt: parseDate(properties.expires),
      endsAt: parseDate(properties.ends),
      senderName: properties.senderName,
      headline: properties.headline,
      instruction: properties.instruction,
      weatherOffice: properties.sender,
      coverageNote: "Official source for the United States and NWS territories; not a complete worldwide weather source.",
      priorityHint,
      medicalContext: medicalContextForDomain(domain),
      routingContext: ["NWS can mark weather threat context; do not close routes from NWS alone."],
      fenixScenarioContext: ["Can seed a conservative ARGUS Fenix preview scenario; not an official local simulation model."],
    },
    impact: {
      environmentalImpact: `${properties.event ?? "Weather alert"} affecting ${properties.areaDesc ?? "an NWS alert area"}.`,
    },
    causes: [`NWS ${properties.event ?? "weather"} alert`],
    contributingFactors: [properties.severity, properties.urgency, properties.certainty].filter((item): item is string => Boolean(item)),
    responseActions: [
      "Use NWS as official United States weather awareness context.",
      "Validate local authority instructions before critical decisions.",
      "Do not generate automatic evacuation, sanction or route-closure decisions from NWS alone.",
    ],
    lessonsLearned: [],
    recommendedActions: [
      {
        id: `rec-${sanitizeId(externalId)}`,
        audience: "institutional",
        priority: severity === "critical" ? "critical" : severity === "high" ? "high" : severity === "medium" ? "medium" : "low",
        text: properties.instruction || "Review NWS alert detail, affected area, timing and local authority updates before operational escalation.",
        rationale: "NWS is an official regional weather source for the United States and covered territories.",
        confidenceScore: 84,
        safetyLimit: "Informational ARGUS estimate; not an automatic official order, route closure or evacuation instruction.",
        requiresHumanValidation: true,
      },
    ],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: [
      "nws",
      "api.weather.gov",
      "National Weather Service",
      "NOAA",
      domain,
      properties.severity,
      properties.urgency,
      properties.certainty,
      properties.messageType,
    ].filter((item): item is string => Boolean(item)),
    language: "en",
    rawEvidenceRefs: evidenceRefs.length > 0 ? [...new Set(evidenceRefs)] : [`nws:${externalId}`],
    createdAt: detectedAt,
    updatedAt,
  };
}

export function normalizeNwsAlerts(features: NwsAlertFeature[]) {
  const seen = new Set<string>();
  const incidents: ArgusIncidentKnowledge[] = [];
  const evidence: ArgusKnowledgeEvidenceItem[] = [];
  for (const feature of features) {
    const incident = normalizeNwsAlert(feature);
    if (!incident) continue;
    const key = `${incident.sourceIds[0]}:${incident.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    incidents.push(incident);
    const item = buildNwsEvidence(feature);
    if (item) evidence.push(item);
  }
  return { incidents, evidence };
}

export async function fetchNwsActiveAlerts(params: NwsFetchParams = {}): Promise<NwsFetchResult> {
  const warnings = isNwsUserAgentConfigured() ? [] : ["NWS_USER_AGENT is not configured; using ARGUS preview fallback User-Agent."];
  const errors: string[] = [];
  const limit = clampLimit(params.limit);
  const endpoint = buildAlertsUrl(params);
  try {
    const data = await fetchJsonWithTimeout<NwsAlertCollection>(endpoint);
    const features = (data.features ?? []).slice(0, limit);
    const normalized = normalizeNwsAlerts(features);
    return {
      adapterId: "nwsAdapter",
      sourceId: "nws",
      sourceName: "NWS / api.weather.gov",
      status: features.length === 0 ? "empty" : normalized.incidents.length > 0 ? "ready" : "partial",
      endpoint,
      fetchedAt: new Date().toISOString(),
      fetched: data.features?.length ?? 0,
      count: normalized.incidents.length,
      incidents: normalized.incidents,
      evidence: normalized.evidence,
      warnings,
      errors,
      requiresApiKey: false,
      requiresConfiguration: false,
      userAgentConfigured: isNwsUserAgentConfigured(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "NWS fetch failed";
    return {
      adapterId: "nwsAdapter",
      sourceId: "nws",
      sourceName: "NWS / api.weather.gov",
      status: message === "outside_coverage" ? "outside_coverage" : "error",
      endpoint,
      fetchedAt: new Date().toISOString(),
      fetched: 0,
      count: 0,
      incidents: [],
      evidence: [],
      warnings,
      errors: [message === "outside_coverage" ? "Point or zone is outside NWS coverage." : message],
      requiresApiKey: false,
      requiresConfiguration: false,
      userAgentConfigured: isNwsUserAgentConfigured(),
    };
  }
}

export function fetchNwsAlertsByArea(area: string, params: Omit<NwsFetchParams, "area"> = {}) {
  return fetchNwsActiveAlerts({ ...params, area });
}

export function fetchNwsAlertsByPoint(lat: number, lon: number, params: Omit<NwsFetchParams, "point"> = {}) {
  return fetchNwsActiveAlerts({ ...params, point: `${lat},${lon}` });
}

export async function fetchNwsPointMetadata(lat: number, lon: number) {
  return fetchJsonWithTimeout<Record<string, unknown>>(`${NWS_BASE_URL}/points/${lat},${lon}`);
}

async function fetchForecastByPoint(lat: number, lon: number, key: "forecast" | "forecastHourly") {
  const metadata = await fetchNwsPointMetadata(lat, lon);
  const properties = metadata.properties as Record<string, unknown> | undefined;
  const url = typeof properties?.[key] === "string" ? properties[key] : undefined;
  if (!url) throw new Error("NWS point metadata did not include forecast link.");
  return fetchJsonWithTimeout<Record<string, unknown>>(url);
}

export function fetchNwsForecastByPoint(lat: number, lon: number) {
  return fetchForecastByPoint(lat, lon, "forecast");
}

export function fetchNwsHourlyForecastByPoint(lat: number, lon: number) {
  return fetchForecastByPoint(lat, lon, "forecastHourly");
}

export function getNwsAdapterStatus() {
  const configured = isNwsUserAgentConfigured();
  return {
    adapterId: "nwsAdapter",
    sourceId: "nws",
    status: "ready" as const,
    requiresApiKey: false,
    requiresConfiguration: false,
    userAgentConfigured: configured,
    warning: configured ? undefined : "NWS_USER_AGENT missing; using ARGUS/preview (contact-not-configured).",
    message: "NWS api.weather.gov active alerts are available for no-key controlled Knowledge Intake ingestion.",
    capabilities: ["active_alerts", "area_filter", "point_filter", "zone_filter", "forecast_context", "no_api_key", "map_layer:nws_weather_alerts"],
    coverageNote: "United States and NWS territories; not a complete worldwide weather source.",
    limitations: [
      "Do not present NWS as global weather coverage.",
      "Do not trigger automatic critical actions, official routes or evacuations from NWS alone.",
    ],
    mapLayer: "NWS Weather Alerts",
    envelopes: [],
  };
}
