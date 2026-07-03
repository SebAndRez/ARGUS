import type { ArgusKnowledgeEvidenceItem } from "@/types/knowledgeIntake";
import type {
  HydrologicalContext,
  HydrologicalLocation,
  HydrologicalMeasurement,
  UsgsWaterApiFamily,
  UsgsWaterPurpose,
} from "@/types/hydrology";

export type UsgsWaterRequestParams = {
  site?: string;
  lat?: number;
  lon?: number;
  bbox?: string | [number, number, number, number];
  radiusKm?: number;
  parameters?: string[];
  purpose?: UsgsWaterPurpose | string;
  incidentId?: string;
  routeAnalysisId?: string;
  fenixSimulationId?: string;
  persist?: boolean;
  includeLocations?: boolean;
  includeLatestConditions?: boolean;
  preferModernApi?: boolean;
  allowLegacyFallback?: boolean;
};

type ValidationResult =
  | { valid: true; params: Required<Pick<UsgsWaterRequestParams, "radiusKm" | "parameters" | "purpose" | "persist" | "includeLocations" | "includeLatestConditions" | "preferModernApi" | "allowLegacyFallback">> & UsgsWaterRequestParams & { purpose: UsgsWaterPurpose; bbox?: [number, number, number, number] } }
  | { valid: false; status: "invalidRequest"; message: string; errors: string[] };

type UsgsFeature = {
  id?: string;
  properties?: Record<string, unknown>;
  geometry?: { coordinates?: unknown };
};

type UsgsLegacyTimeSeries = {
  sourceInfo?: {
    siteName?: string;
    siteCode?: Array<{ value?: string; agencyCode?: string }>;
    geoLocation?: { geogLocation?: { latitude?: number; longitude?: number } };
  };
  variable?: {
    variableCode?: Array<{ value?: string }>;
    variableName?: string;
    unit?: { unitCode?: string };
  };
  values?: Array<{ value?: Array<{ value?: string; dateTime?: string; qualifiers?: string[] }> }>;
};

const MODERN_BASE_URL = "https://api.waterdata.usgs.gov/ogcapi/v0";
const LEGACY_IV_URL = "https://waterservices.usgs.gov/nwis/iv/";
const REQUEST_TIMEOUT_MS = 12_000;
const SUPPORTED_PARAMETERS = ["00060", "00065"] as const;
const SUPPORTED_PURPOSES: UsgsWaterPurpose[] = ["flood", "nav", "fenix", "aura", "incident_context", "drought", "general"];
const LIMITATIONS = [
  "Coverage is limited to USGS monitoring locations and available stations.",
  "USGS Water Data is not complete worldwide coverage and does not cover every river.",
  "Not every streamgage has flood stage or all hydrological parameters.",
  "Sensor data can be delayed or stale.",
  "A sensor reading is not an evacuation order, route closure or official flood forecast.",
  "No KnowledgeIncident is created from individual readings.",
  "Legacy Water Services is used only as controlled fallback.",
  "Flood Impact API, daily values, percentiles and trends are reserved for later phases.",
];

export function getUsgsWaterApiKeyStatus() {
  const configured = Boolean(process.env.USGS_WATER_API_KEY?.trim());
  return {
    apiKeyConfigured: configured,
    apiKeyRequired: false,
    higherRateLimitAvailable: true,
  };
}

export function getUsgsWaterHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": process.env.ARGUS_USER_AGENT ?? "ARGUS/USGS-Water-Context",
  };
  const apiKey = process.env.USGS_WATER_API_KEY?.trim();
  if (apiKey) headers["X-Api-Key"] = apiKey;
  return headers;
}

export function validateUsgsWaterRequest(params: UsgsWaterRequestParams): ValidationResult {
  const bbox = normalizeBbox(params.bbox);
  const hasPoint = typeof params.lat === "number" || typeof params.lon === "number";
  if (!params.site && !bbox && !hasPoint) {
    return { valid: false, status: "invalidRequest", message: "site, lat/lon or bbox required for USGS Water Data context", errors: ["site, lat/lon or bbox required for USGS Water Data context"] };
  }
  if (hasPoint && (typeof params.lat !== "number" || typeof params.lon !== "number")) {
    return { valid: false, status: "invalidRequest", message: "lat and lon must be provided together", errors: ["lat and lon must be provided together"] };
  }
  if (typeof params.lat === "number" && (params.lat < -90 || params.lat > 90)) {
    return { valid: false, status: "invalidRequest", message: "lat must be between -90 and 90", errors: ["lat must be between -90 and 90"] };
  }
  if (typeof params.lon === "number" && (params.lon < -180 || params.lon > 180)) {
    return { valid: false, status: "invalidRequest", message: "lon must be between -180 and 180", errors: ["lon must be between -180 and 180"] };
  }
  if (params.bbox && !bbox) {
    return { valid: false, status: "invalidRequest", message: "bbox must be west,south,east,north within valid coordinate ranges", errors: ["bbox must be west,south,east,north within valid coordinate ranges"] };
  }
  const radiusKm = Math.min(Math.max(Math.trunc(params.radiusKm ?? 25), 1), 50);
  const parameters = normalizeParameters(params.parameters);
  if (parameters.length === 0) {
    return { valid: false, status: "invalidRequest", message: "parameters are limited to 00060 and 00065 in this phase", errors: ["parameters are limited to 00060 and 00065 in this phase"] };
  }
  return {
    valid: true,
    params: {
      ...params,
      bbox,
      radiusKm,
      parameters,
      purpose: normalizePurpose(params.purpose),
      persist: params.persist ?? false,
      includeLocations: params.includeLocations ?? true,
      includeLatestConditions: params.includeLatestConditions ?? true,
      preferModernApi: params.preferModernApi ?? true,
      allowLegacyFallback: params.allowLegacyFallback ?? true,
    },
  };
}

export async function fetchUsgsWaterMonitoringLocations(params: UsgsWaterRequestParams) {
  const validation = validateUsgsWaterRequest(params);
  if (!validation.valid) return { ...validation, fetched: 0, endpoint: null, records: [] as UsgsFeature[], warnings: [], errors: validation.errors };
  const endpoint = buildModernMonitoringLocationsUrl(validation.params);
  const result = await fetchJson<{ features?: UsgsFeature[] }>(endpoint);
  if (!result.ok) return { status: "error" as const, fetched: 0, endpoint, records: [] as UsgsFeature[], warnings: [], errors: [result.error] };
  const records = result.data.features ?? [];
  return { status: records.length ? "ready" as const : "empty" as const, fetched: records.length, endpoint, records, warnings: [], errors: [] };
}

export async function fetchUsgsWaterLatestConditions(params: UsgsWaterRequestParams) {
  return fetchUsgsWaterCurrentValues(params);
}

export async function fetchUsgsWaterCurrentValues(params: UsgsWaterRequestParams) {
  const validation = validateUsgsWaterRequest(params);
  if (!validation.valid) return { ...validation, fetched: 0, endpoint: null, records: [] as UsgsLegacyTimeSeries[], apiFamily: "legacy" as UsgsWaterApiFamily, legacyFallbackUsed: false, warnings: [], errors: validation.errors };
  return fetchUsgsWaterLegacyInstantaneousValues(validation.params);
}

export async function fetchUsgsWaterLegacyInstantaneousValues(params: UsgsWaterRequestParams) {
  const validation = validateUsgsWaterRequest(params);
  if (!validation.valid) return { ...validation, fetched: 0, endpoint: null, records: [] as UsgsLegacyTimeSeries[], warnings: [], errors: validation.errors };
  const endpoint = buildLegacyIvUrl(validation.params);
  const result = await fetchJson<{ value?: { timeSeries?: UsgsLegacyTimeSeries[] } }>(endpoint);
  if (!result.ok) return { status: "error" as const, fetched: 0, endpoint, records: [] as UsgsLegacyTimeSeries[], warnings: ["Legacy USGS Water Services fallback failed."], errors: [result.error] };
  const records = result.data.value?.timeSeries ?? [];
  return { status: records.length ? "ready" as const : "empty" as const, fetched: records.length, endpoint, records, warnings: ["Legacy USGS Water Services used as controlled fallback for instantaneous values."], errors: [] };
}

export function normalizeUsgsWaterLocation(record: UsgsFeature | UsgsLegacyTimeSeries, params: UsgsWaterRequestParams = {}): HydrologicalLocation | null {
  if (!isLegacyTimeSeries(record)) {
    const props = record.properties ?? {};
    const coordinates = Array.isArray(record.geometry?.coordinates) ? record.geometry?.coordinates : [];
    const lon = Number(coordinates?.[0] ?? props.longitude ?? props.dec_long_va);
    const lat = Number(coordinates?.[1] ?? props.latitude ?? props.dec_lat_va);
    const siteId = String(props.monitoringLocationIdentifier ?? props.site_no ?? record.id ?? "").replace(/^USGS-/, "");
    if (!siteId) return null;
    return {
      siteId,
      siteName: String(props.monitoringLocationName ?? props.station_nm ?? props.name ?? ""),
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lon) ? lon : null,
      distanceKm: Number.isFinite(lat) && Number.isFinite(lon) && typeof params.lat === "number" && typeof params.lon === "number" ? distanceKm(params.lat, params.lon, lat, lon) : null,
      agency: String(props.agencyCode ?? props.agency_cd ?? "USGS"),
      siteType: String(props.monitoringLocationType ?? props.site_tp_cd ?? "streamgage"),
    };
  }
  const source = record.sourceInfo;
  const lat = Number(source?.geoLocation?.geogLocation?.latitude);
  const lon = Number(source?.geoLocation?.geogLocation?.longitude);
  const siteId = source?.siteCode?.[0]?.value;
  if (!siteId) return null;
  return {
    siteId,
    siteName: source?.siteName,
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lon) ? lon : null,
    distanceKm: Number.isFinite(lat) && Number.isFinite(lon) && typeof params.lat === "number" && typeof params.lon === "number" ? distanceKm(params.lat, params.lon, lat, lon) : null,
    agency: source?.siteCode?.[0]?.agencyCode ?? "USGS",
    siteType: "streamgage",
  };
}

function isLegacyTimeSeries(record: UsgsFeature | UsgsLegacyTimeSeries): record is UsgsLegacyTimeSeries {
  return "sourceInfo" in record || "variable" in record || "values" in record;
}

export function normalizeUsgsWaterCondition(record: UsgsLegacyTimeSeries): HydrologicalMeasurement | null {
  const siteId = record.sourceInfo?.siteCode?.[0]?.value;
  const parameterCode = record.variable?.variableCode?.[0]?.value;
  if (!siteId || (parameterCode !== "00060" && parameterCode !== "00065")) return null;
  const latest = record.values?.[0]?.value?.slice().reverse().find((item) => item.value !== undefined);
  const value = Number(latest?.value);
  return {
    siteId,
    parameterCode,
    parameterName: parameterCode === "00060" ? "Discharge / streamflow" : "Gage height",
    value: Number.isFinite(value) ? value : null,
    unit: record.variable?.unit?.unitCode,
    measuredAt: latest?.dateTime,
    qualifier: latest?.qualifiers?.join(","),
    method: "USGS instantaneous values",
  };
}

export async function buildUsgsWaterHydrologicalContext(records: { locations?: Array<UsgsFeature | UsgsLegacyTimeSeries>; conditions?: UsgsLegacyTimeSeries[] }, params: UsgsWaterRequestParams): Promise<HydrologicalContext> {
  const validation = validateUsgsWaterRequest(params);
  if (!validation.valid) throw new Error(validation.message);
  const locations = dedupeLocations([...(records.locations ?? []), ...(records.conditions ?? [])].map((record) => normalizeUsgsWaterLocation(record, validation.params)).filter(Boolean) as HydrologicalLocation[]);
  const measurements = (records.conditions ?? []).map(normalizeUsgsWaterCondition).filter(Boolean) as HydrologicalMeasurement[];
  const latest = latestMeasurements(measurements);
  const stalenessMinutes = calculateStalenessMinutes(latest.measuredAt);
  const riskFactors = {
    highWaterContext: Boolean(latest.gageHeight?.value !== null && latest.gageHeight?.value !== undefined && latest.gageHeight.value >= 10),
    risingWaterUnknown: true,
    staleData: stalenessMinutes === null || stalenessMinutes > 180,
    missingGageHeight: !measurements.some((item) => item.parameterCode === "00065"),
    missingStreamflow: !measurements.some((item) => item.parameterCode === "00060"),
    noNearbyStation: locations.length === 0,
    floodContextAvailable: measurements.length > 0,
    droughtContextPotential: validation.params.purpose === "drought" && measurements.some((item) => item.parameterCode === "00060"),
  };
  const confidence = scoreUsgsWaterContext({ measurements, locations, riskFactors, stalenessMinutes });
  const query = {
    site: validation.params.site,
    lat: validation.params.lat,
    lon: validation.params.lon,
    bbox: validation.params.bbox,
    radiusKm: validation.params.radiusKm,
    parameters: validation.params.parameters,
  };
  return {
    id: `usgs-water-${validation.params.site ?? `${validation.params.lat ?? "bbox"}-${validation.params.lon ?? ""}`}-${Date.now()}`,
    sourceId: "usgs-water",
    sourceName: "USGS Water Data",
    purpose: validation.params.purpose,
    generatedAt: new Date().toISOString(),
    apiFamily: validation.params.preferModernApi && records.locations?.length ? "mixed" : "legacy",
    legacyFallbackUsed: true,
    query,
    locations,
    measurements,
    latest,
    riskFactors,
    confidence,
    stalenessMinutes,
    limitations: LIMITATIONS,
    evidenceRefs: measurements.map((item) => `usgs-water:${item.siteId}:${item.parameterCode}:${item.measuredAt ?? "unknown"}`),
    sourceUrls: [buildLegacyIvUrl(validation.params), buildModernMonitoringLocationsUrl(validation.params)],
  };
}

export function buildUsgsWaterEvidence(context: HydrologicalContext, params: UsgsWaterRequestParams): ArgusKnowledgeEvidenceItem {
  return {
    id: `usgs-water-evidence-${params.incidentId ?? params.routeAnalysisId ?? params.fenixSimulationId ?? context.id}`,
    incidentId: params.incidentId,
    sourceId: "usgs-water",
    sourceName: "USGS Water Data",
    title: "USGS Water hydrological context",
    url: context.sourceUrls[0],
    summary: buildUsgsWaterExcerpt(context),
    quote: buildUsgsWaterExcerpt(context),
    confidenceScore: {
      sourceReliability: 94,
      corroborationCount: 1,
      geolocationPrecision: context.locations.length ? 90 : 30,
      timestampPrecision: context.riskFactors.staleData ? 55 : 90,
      documentQuality: 88,
      extractionConfidence: 90,
      conflictWithOtherSources: 0,
      finalConfidence: context.confidence,
      label: context.confidence >= 80 ? "high" : context.confidence >= 55 ? "medium" : "low",
    },
    locationConfidence: context.locations.length ? 0.9 : 0.3,
    timestampConfidence: context.riskFactors.staleData ? 0.55 : 0.9,
    extractedAt: context.generatedAt,
    conflicts: [],
  };
}

export function scoreUsgsWaterContext(input: Pick<HydrologicalContext, "measurements" | "locations" | "riskFactors" | "stalenessMinutes"> | { measurements: HydrologicalMeasurement[]; locations: HydrologicalLocation[]; riskFactors: HydrologicalContext["riskFactors"]; stalenessMinutes: number | null }) {
  let score = 92;
  if (!input.locations.length) score -= 35;
  if (!input.measurements.length) score -= 30;
  if (input.riskFactors.missingGageHeight) score -= 8;
  if (input.riskFactors.missingStreamflow) score -= 8;
  if (input.stalenessMinutes === null) score -= 15;
  else if (input.stalenessMinutes > 180) score -= 18;
  else if (input.stalenessMinutes > 60) score -= 8;
  return Math.min(Math.max(score, 30), 94);
}

export function getUsgsWaterAdapterStatus() {
  const key = getUsgsWaterApiKeyStatus();
  return {
    adapterId: "usgsWaterAdapter",
    sourceId: "usgs-water",
    status: "ready" as const,
    sourceRole: "hydrological_monitoring_source",
    isIncidentSource: false,
    requiresApiKey: false,
    optionalApiKey: "USGS_WATER_API_KEY",
    apiKeyConfigured: key.apiKeyConfigured,
    apiKeyRequired: false,
    higherRateLimitAvailable: true,
    modernApiPreferred: true,
    legacyFallbackAvailable: true,
    phase1Capabilities: ["monitoring locations", "latest/current conditions", "streamflow parameter 00060", "gage height parameter 00065"],
    phase2Planned: ["daily values", "trends/percentiles", "drought/low flow analysis", "flood impact API"],
    mapLayer: "USGS Water Conditions",
    layerType: "hydrological_context",
    isIncidentLayer: false,
    defaultVisible: false,
    capabilities: ["monitoring_locations", "current_conditions", "streamflow_00060", "gage_height_00065", "hydrological_context", "map_layer:usgs_water_conditions"],
    limitations: LIMITATIONS,
    message: "USGS Water Data is active as official US hydrological monitoring context with optional API key.",
  };
}

export async function fetchAndBuildUsgsWaterContext(params: UsgsWaterRequestParams) {
  const validation = validateUsgsWaterRequest(params);
  if (!validation.valid) return { ...validation, fetched: 0, normalized: 0, context: null, apiFamily: "legacy" as UsgsWaterApiFamily, legacyFallbackUsed: false, warnings: [], errors: validation.errors };
  const warnings: string[] = [];
  const errors: string[] = [];
  const locationsResult = validation.params.includeLocations && validation.params.preferModernApi
    ? await fetchUsgsWaterMonitoringLocations(validation.params)
    : { status: "skipped" as const, records: [] as UsgsFeature[], fetched: 0, warnings: [], errors: [] };
  warnings.push(...(locationsResult.warnings ?? []));
  errors.push(...(locationsResult.errors ?? []));
  const conditionsResult = validation.params.includeLatestConditions
    ? await fetchUsgsWaterCurrentValues(validation.params)
    : { status: "skipped" as const, records: [] as UsgsLegacyTimeSeries[], fetched: 0, warnings: [], errors: [] };
  warnings.push(...(conditionsResult.warnings ?? []));
  errors.push(...(conditionsResult.errors ?? []));
  const context = await buildUsgsWaterHydrologicalContext({
    locations: locationsResult.records,
    conditions: conditionsResult.records,
  }, validation.params);
  const status = context.locations.length || context.measurements.length ? "ready" as const : "empty" as const;
  if (context.riskFactors.noNearbyStation) warnings.push("No nearby USGS station or matching site data returned; do not infer absence of risk.");
  if (context.riskFactors.staleData) warnings.push("USGS Water measurement is stale or timestamp is unavailable.");
  return {
    status,
    fetched: (locationsResult.fetched ?? 0) + (conditionsResult.fetched ?? 0),
    normalized: context.measurements.length,
    context,
    apiFamily: context.apiFamily,
    legacyFallbackUsed: context.legacyFallbackUsed,
    warnings: [...new Set(warnings)],
    errors,
  };
}

function normalizePurpose(purpose?: UsgsWaterPurpose | string): UsgsWaterPurpose {
  return SUPPORTED_PURPOSES.includes(purpose as UsgsWaterPurpose) ? purpose as UsgsWaterPurpose : "general";
}

function normalizeParameters(parameters?: string[]) {
  const input = parameters?.length ? parameters : [...SUPPORTED_PARAMETERS];
  return [...new Set(input.map((item) => item.trim()).filter((item): item is "00060" | "00065" => SUPPORTED_PARAMETERS.includes(item as "00060" | "00065")))];
}

function normalizeBbox(value?: string | [number, number, number, number]) {
  if (!value) return undefined;
  const parts = (Array.isArray(value) ? value : value.split(",")).map(Number);
  if (parts.length !== 4 || parts.some((item) => !Number.isFinite(item))) return undefined;
  const [west, south, east, north] = parts;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return undefined;
  return [west, south, east, north] as [number, number, number, number];
}

function buildModernMonitoringLocationsUrl(params: UsgsWaterRequestParams & { radiusKm: number; parameters: string[]; bbox?: [number, number, number, number] }) {
  const search = new URLSearchParams({ f: "json", limit: "50" });
  if (params.site) search.set("monitoringLocationIdentifier", `USGS-${params.site}`);
  if (params.bbox) search.set("bbox", params.bbox.join(","));
  else if (typeof params.lat === "number" && typeof params.lon === "number") search.set("bbox", pointToBbox(params.lat, params.lon, params.radiusKm).join(","));
  return `${MODERN_BASE_URL}/collections/monitoring-locations/items?${search.toString()}`;
}

function buildLegacyIvUrl(params: UsgsWaterRequestParams & { radiusKm: number; parameters: string[]; bbox?: [number, number, number, number] }) {
  const search = new URLSearchParams({
    format: "json",
    parameterCd: params.parameters.join(","),
    siteStatus: "all",
  });
  if (params.site) search.set("sites", params.site);
  if (params.bbox) search.set("bBox", params.bbox.join(","));
  else if (typeof params.lat === "number" && typeof params.lon === "number") search.set("bBox", pointToBbox(params.lat, params.lon, params.radiusKm).join(","));
  return `${LEGACY_IV_URL}?${search.toString()}`;
}

async function fetchJson<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: "no-store", headers: getUsgsWaterHeaders(), signal: controller.signal });
    if (!response.ok) return { ok: false, error: `USGS Water responded ${response.status}` };
    return { ok: true, data: await response.json() as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "USGS Water fetch failed" };
  } finally {
    clearTimeout(timeout);
  }
}

function pointToBbox(lat: number, lon: number, radiusKm: number): [number, number, number, number] {
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.max(Math.cos(lat * Math.PI / 180), 0.2));
  return [
    Number((lon - lonDelta).toFixed(6)),
    Number((lat - latDelta).toFixed(6)),
    Number((lon + lonDelta).toFixed(6)),
    Number((lat + latDelta).toFixed(6)),
  ];
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Number((2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

function dedupeLocations(locations: HydrologicalLocation[]) {
  return Array.from(new Map(locations.map((location) => [location.siteId, location])).values());
}

function latestMeasurements(measurements: HydrologicalMeasurement[]) {
  const sorted = measurements.slice().sort((a, b) => Date.parse(b.measuredAt ?? "") - Date.parse(a.measuredAt ?? ""));
  const streamflow = sorted.find((item) => item.parameterCode === "00060");
  const gageHeight = sorted.find((item) => item.parameterCode === "00065");
  const measuredAt = [streamflow?.measuredAt, gageHeight?.measuredAt].filter(Boolean).sort().reverse()[0];
  return { streamflow, gageHeight, measuredAt };
}

function calculateStalenessMinutes(measuredAt?: string) {
  if (!measuredAt) return null;
  const time = Date.parse(measuredAt);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60_000));
}

function buildUsgsWaterExcerpt(context: HydrologicalContext) {
  const stationText = context.locations.length ? `${context.locations.length} station(s)` : "no nearby station";
  const flow = context.latest.streamflow ? `${context.latest.streamflow.value ?? "n/a"} ${context.latest.streamflow.unit ?? ""} streamflow` : "streamflow unavailable";
  const gage = context.latest.gageHeight ? `${context.latest.gageHeight.value ?? "n/a"} ${context.latest.gageHeight.unit ?? ""} gage height` : "gage height unavailable";
  const stale = context.stalenessMinutes === null ? "unknown staleness" : `${context.stalenessMinutes} min staleness`;
  return `USGS Water context indicates ${stationText}; ${flow}; ${gage}; ${stale}. This does not establish an official flood order.`;
}
