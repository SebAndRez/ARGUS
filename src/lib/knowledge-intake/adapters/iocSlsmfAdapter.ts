import type { ArgusKnowledgeEvidenceItem } from "@/types/knowledgeIntake";
import type {
  IocSlsmfApiVersion,
  IocSlsmfPurpose,
  SeaLevelObservation,
  SeaLevelObservationContext,
  SeaLevelObservationStation,
  SeaLevelSensorMetadata,
} from "@/types/seaLevelObservation";

export type IocSlsmfRequestParams = {
  stationCode?: string;
  lat?: number;
  lon?: number;
  bbox?: string | [number, number, number, number];
  radiusKm?: number;
  startTime?: string;
  endTime?: string;
  minutes?: number;
  purpose?: IocSlsmfPurpose | string;
  incidentId?: string;
  routeAnalysisId?: string;
  fenixSimulationId?: string;
  persist?: boolean;
  includeStations?: boolean;
  includeMetadata?: boolean;
  includeSensors?: boolean;
  includeRecentData?: boolean;
  apiVersion?: IocSlsmfApiVersion;
  maxStations?: number;
  ttlMinutes?: number;
};

type IocRecord = Record<string, unknown>;
type ValidationResult =
  | {
      valid: true;
      params: IocSlsmfRequestParams & {
        bbox?: [number, number, number, number];
        radiusKm: number;
        minutes: number;
        purpose: IocSlsmfPurpose;
        persist: boolean;
        includeStations: boolean;
        includeMetadata: boolean;
        includeSensors: boolean;
        includeRecentData: boolean;
        apiVersion: IocSlsmfApiVersion;
        maxStations: number;
        ttlMinutes: number;
      };
    }
  | { valid: false; status: "invalidRequest"; message: string; errors: string[] };

const SOURCE_ID = "ioc-slsmf";
const SOURCE_NAME = "IOC Sea Level Monitoring Facility";
const API_V2_BASE = "https://api.ioc-sealevelmonitoring.org/v2";
const LEGACY_BASE = "https://www.ioc-sealevelmonitoring.org/service.php";
const REQUEST_TIMEOUT_MS = 12_000;
const STATION_CACHE_TTL_MS = 60 * 60_000;
const DATA_CACHE_TTL_MS = 60_000;
const SUPPORTED_PURPOSES: IocSlsmfPurpose[] = [
  "tsunami_context",
  "coastal_context",
  "storm_surge_context",
  "nav",
  "fenix",
  "aura",
  "incident_context",
  "sea_level_monitoring",
  "general",
];

export const IOC_SLSMF_DATUM_CAUTION =
  "IOC SLSMF sea level values are relative observations unless a station-specific datum is explicitly available. Do not interpret them as absolute official flood levels.";

const LIMITATIONS = [
  "IOC SLSMF is global sea level monitoring context, not a warning center.",
  "IOC SLSMF is not an official tsunami alert, evacuation order or local authority.",
  "ARGUS does not confirm tsunami automatically from isolated IOC SLSMF readings.",
  "Sea level values are relative observations; absolute station datum may be unavailable.",
  IOC_SLSMF_DATUM_CAUTION,
  "Real-time observations can have limited QC and stations can be offline or stale.",
  "Web/API access may not be guaranteed during emergencies.",
  "ARGUS does not create KnowledgeIncident records from IOC SLSMF readings.",
  "ARGUS does not run global IOC SLSMF polling in this phase.",
];

let stationListCache: { fetchedAt: number; records: IocRecord[]; endpoint: string } | null = null;
const stationMetadataCache = new Map<string, { fetchedAt: number; record: IocRecord | null; endpoint: string }>();
const sensorsCache = new Map<string, { fetchedAt: number; records: IocRecord[]; endpoint: string }>();
const dataCache = new Map<string, { fetchedAt: number; records: IocRecord[]; endpoint: string }>();
const lastStationRequestAt = new Map<string, number>();

export function getIocSlsmfApiKeyStatus() {
  const configured = Boolean(process.env.IOC_SLSMF_API_KEY?.trim());
  return {
    status: configured ? "configured" as const : "requiresConfiguration" as const,
    sourceId: SOURCE_ID,
    requiresApiKey: true,
    envVar: "IOC_SLSMF_API_KEY",
    apiKeyConfigured: configured,
    message: configured
      ? "IOC SLSMF API key is configured."
      : "IOC SLSMF API key is required to access sea level monitoring data.",
  };
}

export function buildIocSlsmfHeaders() {
  const key = process.env.IOC_SLSMF_API_KEY?.trim();
  return {
    Accept: "application/json",
    "User-Agent": process.env.ARGUS_USER_AGENT ?? "ARGUS/IOC-SLSMF-Context",
    ...(key ? { Authorization: `Bearer ${key}`, "X-API-Key": key } : {}),
  };
}

export function validateIocSlsmfRequest(params: IocSlsmfRequestParams): ValidationResult {
  const bbox = normalizeBbox(params.bbox);
  const hasPoint = typeof params.lat === "number" || typeof params.lon === "number";
  const stationCode = sanitizeStationCode(params.stationCode);
  if (!stationCode && !bbox && !hasPoint) {
    return { valid: false, status: "invalidRequest", message: "stationCode, lat/lon or bbox required for IOC SLSMF sea level context", errors: ["stationCode, lat/lon or bbox required for IOC SLSMF sea level context"] };
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
  if (params.stationCode && !stationCode) {
    return { valid: false, status: "invalidRequest", message: "stationCode contains unsupported characters", errors: ["stationCode contains unsupported characters"] };
  }
  const radiusKm = Math.min(Math.max(Math.trunc(params.radiusKm ?? 100), 1), 250);
  const minutes = Math.min(Math.max(Math.trunc(params.minutes ?? 120), 1), 180);
  return {
    valid: true,
    params: {
      ...params,
      stationCode,
      bbox,
      radiusKm,
      minutes,
      purpose: SUPPORTED_PURPOSES.includes(params.purpose as IocSlsmfPurpose) ? params.purpose as IocSlsmfPurpose : "general",
      persist: params.persist ?? false,
      includeStations: params.includeStations ?? true,
      includeMetadata: params.includeMetadata ?? true,
      includeSensors: params.includeSensors ?? true,
      includeRecentData: params.includeRecentData ?? true,
      apiVersion: params.apiVersion === "legacy" ? "legacy" : "v2",
      maxStations: Math.min(Math.max(Math.trunc(params.maxStations ?? 10), 1), 10),
      ttlMinutes: Math.min(Math.max(Math.trunc(params.ttlMinutes ?? 60), 1), 120),
    },
  };
}

export function buildIocSlsmfStationListUrl(params: IocSlsmfRequestParams = {}) {
  if (params.apiVersion === "legacy") {
    const search = new URLSearchParams({ query: "stationlist", format: "json" });
    return `${LEGACY_BASE}?${search.toString()}`;
  }
  const search = new URLSearchParams();
  const bbox = normalizeBbox(params.bbox);
  if (typeof params.lat === "number") search.set("lat", String(params.lat));
  if (typeof params.lon === "number") search.set("lon", String(params.lon));
  if (typeof params.radiusKm === "number") search.set("radius_km", String(params.radiusKm));
  if (bbox) search.set("bbox", bbox.join(","));
  return `${API_V2_BASE}/stations${search.size ? `?${search.toString()}` : ""}`;
}

export function buildIocSlsmfStationMetadataUrl(params: IocSlsmfRequestParams & { stationCode: string }) {
  if (params.apiVersion === "legacy") {
    const search = new URLSearchParams({ query: "station", code: params.stationCode, format: "json" });
    return `${LEGACY_BASE}?${search.toString()}`;
  }
  return `${API_V2_BASE}/stations/${encodeURIComponent(params.stationCode)}`;
}

export function buildIocSlsmfSensorsUrl(params: IocSlsmfRequestParams & { stationCode: string }) {
  if (params.apiVersion === "legacy") {
    const search = new URLSearchParams({ query: "sensors", code: params.stationCode, format: "json" });
    return `${LEGACY_BASE}?${search.toString()}`;
  }
  return `${API_V2_BASE}/stations/${encodeURIComponent(params.stationCode)}/sensors`;
}

export function buildIocSlsmfRecentDataUrl(params: IocSlsmfRequestParams & { stationCode: string }) {
  const end = params.endTime ?? new Date().toISOString();
  const start = params.startTime ?? new Date(Date.parse(end) - (params.minutes ?? 120) * 60_000).toISOString();
  if (params.apiVersion === "legacy") {
    const search = new URLSearchParams({ query: "data", code: params.stationCode, timestart: start, timestop: end, format: "json" });
    return `${LEGACY_BASE}?${search.toString()}`;
  }
  const search = new URLSearchParams({ start_time: start, end_time: end });
  return `${API_V2_BASE}/stations/${encodeURIComponent(params.stationCode)}/data?${search.toString()}`;
}

export async function fetchIocSlsmfStationList(params: IocSlsmfRequestParams = {}) {
  const keyStatus = getIocSlsmfApiKeyStatus();
  const endpoint = buildIocSlsmfStationListUrl(params);
  if (!keyStatus.apiKeyConfigured) return requiresConfigurationResult(endpoint, [] as IocRecord[]);
  if (stationListCache && Date.now() - stationListCache.fetchedAt < STATION_CACHE_TTL_MS) {
    return { status: "ready" as const, fetched: stationListCache.records.length, endpoint: stationListCache.endpoint, records: stationListCache.records, warnings: ["IOC SLSMF station list served from in-memory cache."], errors: [] };
  }
  const result = await fetchJson<unknown>(endpoint);
  if (!result.ok) return { status: "error" as const, fetched: 0, endpoint, records: [] as IocRecord[], warnings: [], errors: [result.error] };
  const records = parseIocSlsmfStationList(result.data);
  stationListCache = { fetchedAt: Date.now(), records, endpoint };
  return { status: records.length ? "ready" as const : "empty" as const, fetched: records.length, endpoint, records, warnings: records.length ? [] : ["IOC SLSMF station list returned no records."], errors: [] };
}

export async function fetchIocSlsmfStationMetadata(params: IocSlsmfRequestParams & { stationCode: string }) {
  const keyStatus = getIocSlsmfApiKeyStatus();
  const endpoint = buildIocSlsmfStationMetadataUrl(params);
  if (!keyStatus.apiKeyConfigured) return requiresConfigurationResult(endpoint, null as IocRecord | null, "record");
  const cached = stationMetadataCache.get(params.stationCode);
  if (cached && Date.now() - cached.fetchedAt < STATION_CACHE_TTL_MS) return { status: cached.record ? "ready" as const : "empty" as const, fetched: cached.record ? 1 : 0, endpoint: cached.endpoint, record: cached.record, warnings: ["IOC SLSMF station metadata served from in-memory cache."], errors: [] };
  const result = await fetchJson<unknown>(endpoint);
  if (!result.ok) return { status: "error" as const, fetched: 0, endpoint, record: null, warnings: [], errors: [result.error] };
  const record = parseIocSlsmfStationMetadata(result.data);
  stationMetadataCache.set(params.stationCode, { fetchedAt: Date.now(), record, endpoint });
  return { status: record ? "ready" as const : "empty" as const, fetched: record ? 1 : 0, endpoint, record, warnings: record ? [] : [`IOC SLSMF station metadata returned empty for ${params.stationCode}.`], errors: [] };
}

export async function fetchIocSlsmfSensors(params: IocSlsmfRequestParams & { stationCode: string }) {
  const keyStatus = getIocSlsmfApiKeyStatus();
  const endpoint = buildIocSlsmfSensorsUrl(params);
  if (!keyStatus.apiKeyConfigured) return requiresConfigurationResult(endpoint, [] as IocRecord[]);
  const cached = sensorsCache.get(params.stationCode);
  if (cached && Date.now() - cached.fetchedAt < STATION_CACHE_TTL_MS) return { status: "ready" as const, fetched: cached.records.length, endpoint: cached.endpoint, records: cached.records, warnings: ["IOC SLSMF sensors served from in-memory cache."], errors: [] };
  const result = await fetchJson<unknown>(endpoint);
  if (!result.ok) return { status: "error" as const, fetched: 0, endpoint, records: [] as IocRecord[], warnings: [`Sensors metadata unavailable for ${params.stationCode}; continuing without blocking recent data.`], errors: [result.error] };
  const records = parseIocSlsmfSensors(result.data);
  sensorsCache.set(params.stationCode, { fetchedAt: Date.now(), records, endpoint });
  return { status: records.length ? "ready" as const : "empty" as const, fetched: records.length, endpoint, records, warnings: records.length ? [] : [`No IOC SLSMF sensors metadata returned for ${params.stationCode}.`], errors: [] };
}

export async function fetchIocSlsmfRecentSeaLevelData(params: IocSlsmfRequestParams & { stationCode: string }) {
  const keyStatus = getIocSlsmfApiKeyStatus();
  const endpoint = buildIocSlsmfRecentDataUrl(params);
  if (!keyStatus.apiKeyConfigured) return requiresConfigurationResult(endpoint, [] as IocRecord[]);
  const now = Date.now();
  const last = lastStationRequestAt.get(params.stationCode) ?? 0;
  const cached = dataCache.get(endpoint);
  if (now - last < 60_000 && cached) {
    return { status: "ready" as const, fetched: cached.records.length, endpoint: cached.endpoint, records: cached.records, warnings: [`IOC SLSMF recent data for ${params.stationCode} served from cache to respect 1 request/minute station limit.`], errors: [] };
  }
  if (cached && now - cached.fetchedAt < DATA_CACHE_TTL_MS) {
    return { status: "ready" as const, fetched: cached.records.length, endpoint: cached.endpoint, records: cached.records, warnings: ["IOC SLSMF recent data served from in-memory cache."], errors: [] };
  }
  lastStationRequestAt.set(params.stationCode, now);
  const result = await fetchJson<unknown>(endpoint);
  if (!result.ok) return { status: "error" as const, fetched: 0, endpoint, records: [] as IocRecord[], warnings: [], errors: [result.error] };
  const records = parseIocSlsmfSeaLevelData(result.data);
  dataCache.set(endpoint, { fetchedAt: now, records, endpoint });
  return { status: records.length ? "ready" as const : "empty" as const, fetched: records.length, endpoint, records, warnings: records.length ? [] : [`IOC SLSMF recent sea level data returned empty for ${params.stationCode}.`], errors: [] };
}

export async function findIocSlsmfStationsNearPoint(params: IocSlsmfRequestParams) {
  const validation = validateIocSlsmfRequest(params);
  if (!validation.valid) return { ...validation, fetched: 0, stations: [] as SeaLevelObservationStation[], warnings: [], errors: validation.errors };
  const all = await fetchIocSlsmfStationList(validation.params);
  const stations = all.records
    .map((record) => normalizeIocSlsmfStation(record, validation.params))
    .filter((station): station is SeaLevelObservationStation => Boolean(station))
    .filter((station) => {
      if (validation.params.stationCode) return station.stationCode.toLowerCase() === validation.params.stationCode.toLowerCase();
      if (validation.params.bbox) return inBbox(station, validation.params.bbox);
      if (typeof validation.params.lat === "number" && typeof validation.params.lon === "number") return typeof station.distanceKm === "number" && station.distanceKm <= validation.params.radiusKm;
      return false;
    })
    .sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999))
    .slice(0, validation.params.maxStations);
  return { status: stations.length ? "ready" as const : all.status === "requiresConfiguration" ? "requiresConfiguration" as const : "empty" as const, fetched: all.fetched, stations, warnings: all.warnings, errors: all.errors };
}

export function parseIocSlsmfStationList(response: unknown): IocRecord[] {
  return extractArray(response, ["stations", "stationlist", "stationList", "data", "features"]).map(unwrapFeature);
}

export function parseIocSlsmfStationMetadata(response: unknown): IocRecord | null {
  const rows = extractArray(response, ["station", "stations", "data", "features"]).map(unwrapFeature);
  if (rows[0]) return rows[0];
  return isRecord(response) ? unwrapFeature(response) : null;
}

export function parseIocSlsmfSensors(response: unknown): IocRecord[] {
  return extractArray(response, ["sensors", "sensor", "data", "features"]).map(unwrapFeature);
}

export function parseIocSlsmfSeaLevelData(response: unknown): IocRecord[] {
  return extractArray(response, ["data", "observations", "measurements", "values", "features"]).map(unwrapFeature);
}

export function normalizeIocSlsmfStation(record: IocRecord, params: IocSlsmfRequestParams = {}): SeaLevelObservationStation | null {
  const stationCode = stringValue(record.stationCode ?? record.code ?? record.id ?? record.station_id ?? record.station);
  if (!stationCode) return null;
  const latitude = numberValue(record.latitude ?? record.lat ?? record.y);
  const longitude = numberValue(record.longitude ?? record.lon ?? record.lng ?? record.x);
  const lastDataTime = stringValue(record.lastDataTime ?? record.last_data_time ?? record.lastUpdate ?? record.lastupdate ?? record.last);
  const rawStatus = stringValue(record.status ?? record.online ?? record.state);
  const status = deriveStationStatus(rawStatus, lastDataTime);
  return {
    stationCode,
    stationName: stringValue(record.stationName ?? record.name ?? record.title),
    country: stringValue(record.country ?? record.countryName ?? record.country_code),
    latitude,
    longitude,
    provider: stringValue(record.provider ?? record.owner ?? record.operator),
    network: stringValue(record.network ?? record.program),
    status,
    lastDataTime,
    distanceKm: typeof params.lat === "number" && typeof params.lon === "number" && latitude !== null && longitude !== null ? distanceKm(params.lat, params.lon, latitude, longitude) : null,
    sensorsAvailable: Array.isArray(record.sensors) ? record.sensors.length > 0 : Boolean(record.sensor ?? record.sensorId ?? record.sensor_id),
    sensors: arrayStrings(record.sensors),
    raw: record,
  };
}

export function normalizeIocSlsmfSensor(record: IocRecord, stationCode: string): SeaLevelSensorMetadata {
  return {
    stationCode,
    sensorId: stringValue(record.sensorId ?? record.sensor_id ?? record.id ?? record.code),
    sensorType: stringValue(record.sensorType ?? record.type ?? record.parameter),
    samplingRate: stringValue(record.samplingRate ?? record.sampling_rate ?? record.interval),
    dataType: stringValue(record.dataType ?? record.datatype ?? record.product),
    verticalReference: stringValue(record.verticalReference ?? record.vertical_reference ?? record.datum),
    provider: stringValue(record.provider ?? record.owner ?? record.operator),
    status: stringValue(record.status ?? record.state),
    raw: record,
  };
}

export function normalizeIocSlsmfObservation(record: IocRecord, params: IocSlsmfRequestParams & { stationCode: string }): SeaLevelObservation {
  return {
    stationCode: stringValue(record.stationCode ?? record.code ?? record.station_id ?? record.station) ?? params.stationCode,
    sensorId: stringValue(record.sensorId ?? record.sensor_id ?? record.sensor ?? record.parameter),
    observedAt: normalizeDateString(record.observedAt ?? record.time ?? record.timestamp ?? record.t ?? record.datetime ?? record.date),
    seaLevelValue: numberValue(record.seaLevelValue ?? record.sea_level ?? record.value ?? record.v ?? record.slevel ?? record.water_level),
    unit: stringValue(record.unit ?? record.units) ?? "m",
    qualityFlag: stringValue(record.qualityFlag ?? record.quality_flag ?? record.qcFlag ?? record.qc_flag ?? record.flag ?? record.f ?? record.q),
    dataSource: stringValue(record.dataSource ?? record.source),
    provider: stringValue(record.provider ?? record.owner ?? record.operator),
    rawValue: record.value ?? record.v ?? record.sea_level ?? record.water_level,
    relativeSeaLevel: true,
    absoluteDatumAvailable: "unknown",
    datumCaution: true,
    raw: record,
  };
}

export async function buildIocSlsmfSeaLevelObservationContext(params: IocSlsmfRequestParams, observationsInput?: SeaLevelObservation[]) {
  const validation = validateIocSlsmfRequest(params);
  if (!validation.valid) throw new Error(validation.message);
  const stations: SeaLevelObservationStation[] = [];
  const sensors: SeaLevelSensorMetadata[] = [];
  const observations: SeaLevelObservation[] = observationsInput ? [...observationsInput] : [];
  const sourceUrls = new Set<string>();
  const warnings: string[] = [];

  if (validation.params.stationCode) {
    if (validation.params.includeMetadata) {
      const metadata = await fetchIocSlsmfStationMetadata({ ...validation.params, stationCode: validation.params.stationCode });
      sourceUrls.add(metadata.endpoint);
      warnings.push(...metadata.warnings);
      const station = normalizeIocSlsmfStation(metadata.record ?? { code: validation.params.stationCode }, validation.params);
      if (station) stations.push(station);
    } else {
      const station = normalizeIocSlsmfStation({ code: validation.params.stationCode }, validation.params);
      if (station) stations.push(station);
    }
  } else if (validation.params.includeStations) {
    const nearby = await findIocSlsmfStationsNearPoint(validation.params);
    warnings.push(...nearby.warnings);
    stations.push(...nearby.stations);
  }

  for (const station of stations.slice(0, validation.params.maxStations)) {
    if (validation.params.includeSensors) {
      const result = await fetchIocSlsmfSensors({ ...validation.params, stationCode: station.stationCode });
      sourceUrls.add(result.endpoint);
      warnings.push(...result.warnings);
      sensors.push(...result.records.map((record) => normalizeIocSlsmfSensor(record, station.stationCode)));
    }
    if (validation.params.includeRecentData && !observationsInput) {
      const result = await fetchIocSlsmfRecentSeaLevelData({ ...validation.params, stationCode: station.stationCode });
      sourceUrls.add(result.endpoint);
      warnings.push(...result.warnings);
      observations.push(...result.records.map((record) => normalizeIocSlsmfObservation(record, { ...validation.params, stationCode: station.stationCode })));
    }
  }

  const latest = latestObservation(observations);
  const stalenessMinutes = calculateStalenessMinutes(latest?.observedAt);
  const riskFactors = {
    stationNearby: stations.length > 0,
    stationOnline: stations.some((station) => station.status === "online"),
    stationOffline: stations.some((station) => station.status === "offline"),
    staleData: stalenessMinutes === null || stalenessMinutes > 30 || stations.some((station) => station.status === "stale"),
    missingValues: observations.length === 0 || observations.some((item) => item.seaLevelValue === null),
    lowQuality: observations.some((item) => isLowQualityFlag(item.qualityFlag)),
    recentSeaLevelAvailable: Boolean(latest),
    relativeDatumCaution: true as const,
    noNearbyStation: !validation.params.stationCode && stations.length === 0,
  };
  const context: SeaLevelObservationContext = {
    id: `ioc-slsmf-${validation.params.stationCode ?? `${validation.params.lat ?? "bbox"}-${validation.params.lon ?? ""}`}-${Date.now()}`,
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    purpose: validation.params.purpose,
    generatedAt: new Date().toISOString(),
    query: {
      stationCode: validation.params.stationCode,
      lat: validation.params.lat,
      lon: validation.params.lon,
      bbox: validation.params.bbox,
      radiusKm: validation.params.radiusKm,
      startTime: validation.params.startTime,
      endTime: validation.params.endTime,
      minutes: validation.params.minutes,
      apiVersion: validation.params.apiVersion,
    },
    stations,
    sensors,
    observations,
    latest: {
      latestSeaLevel: latest?.seaLevelValue,
      latestObservedAt: latest?.observedAt,
      latestQualityFlag: latest?.qualityFlag,
      relativeSeaLevel: true,
      absoluteDatumAvailable: "unknown",
      datumCaution: true,
    },
    riskFactors,
    confidence: scoreIocSlsmfSeaLevelContext({ stations, observations, riskFactors, stalenessMinutes }),
    stalenessMinutes,
    limitations: [...LIMITATIONS, ...warnings].filter(Boolean),
    evidenceRefs: observations.map((item) => `ioc-slsmf:${item.stationCode}:${item.sensorId ?? "sensor"}:${item.observedAt ?? "unknown"}`),
    sourceUrls: Array.from(sourceUrls),
  };
  return context;
}

export function buildIocSlsmfEvidence(context: SeaLevelObservationContext, params: IocSlsmfRequestParams): ArgusKnowledgeEvidenceItem {
  const excerpt = buildIocSlsmfExcerpt(context);
  return {
    id: `ioc-slsmf-evidence-${params.incidentId ?? params.routeAnalysisId ?? params.fenixSimulationId ?? context.id}`,
    incidentId: params.incidentId,
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    title: "IOC sea level observation context",
    url: context.sourceUrls[0] ?? API_V2_BASE,
    summary: excerpt,
    quote: excerpt,
    confidenceScore: {
      sourceReliability: 90,
      corroborationCount: 1,
      geolocationPrecision: context.stations.length ? 86 : 30,
      timestampPrecision: context.riskFactors.staleData ? 55 : 88,
      documentQuality: context.riskFactors.lowQuality ? 62 : 84,
      extractionConfidence: 86,
      conflictWithOtherSources: 0,
      finalConfidence: context.confidence,
      label: context.confidence >= 80 ? "high" : context.confidence >= 55 ? "medium" : "low",
    },
    locationConfidence: context.stations.length ? 0.86 : 0.3,
    timestampConfidence: context.riskFactors.staleData ? 0.55 : 0.88,
    extractedAt: context.generatedAt,
    conflicts: [],
  };
}

export function scoreIocSlsmfSeaLevelContext(input: Pick<SeaLevelObservationContext, "stations" | "observations" | "riskFactors" | "stalenessMinutes">) {
  let score = 90;
  if (!input.stations.length) score -= 35;
  if (!input.observations.length) score -= 25;
  if (input.riskFactors.noNearbyStation) score -= 20;
  if (input.riskFactors.missingValues) score -= 12;
  if (input.riskFactors.lowQuality) score -= 16;
  if (input.stalenessMinutes === null) score -= 14;
  else if (input.stalenessMinutes > 60) score -= 18;
  else if (input.stalenessMinutes > 30) score -= 9;
  return Math.min(Math.max(score, 25), 93);
}

export function getIocSlsmfAdapterStatus() {
  const keyStatus = getIocSlsmfApiKeyStatus();
  return {
    adapterId: "iocSlsmfAdapter",
    sourceId: SOURCE_ID,
    status: keyStatus.apiKeyConfigured ? "active_contextual" as const : "requiresConfiguration" as const,
    sourceRole: "global_sea_level_observation_source",
    isIncidentSource: false,
    requiresApiKey: true,
    requiresConfiguration: !keyStatus.apiKeyConfigured,
    envVar: "IOC_SLSMF_API_KEY",
    apiKeyConfigured: keyStatus.apiKeyConfigured,
    officialSource: true,
    phase1Capabilities: ["station list", "station metadata", "sensors metadata", "recent sea level data", "station status", "KnowledgeEvidence sea_level_observation_context"],
    phase2Planned: ["QC research data", "multi-station tsunami correlation", "automatic anomaly detection with official warning guardrails", "local authority integration", "SHOA Chile", "JMA Japan", "BMKG Indonesia", "local tide gauges"],
    capabilities: ["station_list", "station_metadata", "sensors_metadata", "recent_sea_level_data", "station_status", "sea_level_observation_context", "map_layer:ioc_sea_level_monitoring_stations"],
    mapLayer: {
      id: "ioc-sea-level-monitoring-stations",
      name: "IOC Sea Level Monitoring Stations",
      sourceId: SOURCE_ID,
      layerType: "sea_level_observation_context",
      isIncidentLayer: false,
      defaultVisible: false,
      requiresConfiguration: true,
      noBulkGlobal: true,
      datumCaution: true,
      sublayers: ["Online Sea Level Stations", "Offline/Stale Stations", "Tsunami-relevant Tide Gauges", "Recent Sea Level Observations"],
    },
    limitations: LIMITATIONS,
    citation: "IOC Sea Level Monitoring Facility / IOC / UNESCO / VLIZ",
    message: keyStatus.message,
  };
}

export async function fetchAndBuildIocSlsmfContext(params: IocSlsmfRequestParams) {
  const keyStatus = getIocSlsmfApiKeyStatus();
  if (!keyStatus.apiKeyConfigured) {
    return {
      status: "requiresConfiguration" as const,
      fetched: 0,
      normalized: 0,
      productsFetched: [] as string[],
      context: null,
      warnings: [keyStatus.message],
      errors: [],
    };
  }
  const validation = validateIocSlsmfRequest(params);
  if (!validation.valid) return { ...validation, fetched: 0, normalized: 0, productsFetched: [] as string[], context: null, warnings: [], errors: validation.errors };
  const context = await buildIocSlsmfSeaLevelObservationContext(validation.params);
  const warnings = [...context.limitations.filter((item) => item !== IOC_SLSMF_DATUM_CAUTION), IOC_SLSMF_DATUM_CAUTION];
  if (context.riskFactors.noNearbyStation) warnings.push("No nearby IOC SLSMF station found within controlled radius.");
  if (context.riskFactors.staleData) warnings.push("IOC SLSMF latest observation is stale or timestamp is unavailable.");
  if (context.riskFactors.lowQuality) warnings.push("IOC SLSMF quality flags indicate caution.");
  return {
    status: context.riskFactors.noNearbyStation || (!context.stations.length && !context.observations.length) ? "empty" as const : "ready" as const,
    fetched: context.stations.length + context.sensors.length + context.observations.length,
    normalized: context.observations.length,
    productsFetched: [
      ...(validation.params.includeStations ? ["station_list"] : []),
      ...(validation.params.includeMetadata ? ["station_metadata"] : []),
      ...(validation.params.includeSensors ? ["sensors_metadata"] : []),
      ...(validation.params.includeRecentData ? ["recent_sea_level_data"] : []),
    ],
    context,
    warnings: [...new Set(warnings)],
    errors: [] as string[],
  };
}

function requiresConfigurationResult<T>(endpoint: string, value: T, key = "records") {
  return {
    status: "requiresConfiguration" as const,
    fetched: 0,
    endpoint,
    [key]: value,
    warnings: ["IOC SLSMF API key is required to access sea level monitoring data."],
    errors: [],
  } as { status: "requiresConfiguration"; fetched: number; endpoint: string; warnings: string[]; errors: string[] } & Record<string, T>;
}

async function fetchJson<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: "no-store", headers: buildIocSlsmfHeaders(), signal: controller.signal });
    if (!response.ok) return { ok: false, error: `IOC SLSMF responded ${response.status}` };
    return { ok: true, data: await response.json() as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "IOC SLSMF fetch failed" };
  } finally {
    clearTimeout(timeout);
  }
}

function extractArray(response: unknown, keys: string[]) {
  if (Array.isArray(response)) return response.filter(isRecord);
  if (!isRecord(response)) return [] as IocRecord[];
  for (const key of keys) {
    const value = response[key];
    if (Array.isArray(value)) return value.filter(isRecord);
    if (isRecord(value)) return [value];
  }
  return [] as IocRecord[];
}

function unwrapFeature(record: IocRecord): IocRecord {
  if (isRecord(record.properties)) {
    const coordinates = Array.isArray(record.geometry) ? record.geometry : isRecord(record.geometry) ? record.geometry.coordinates : undefined;
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
      return { ...record.properties, longitude: coordinates[0], latitude: coordinates[1] };
    }
    return { ...record.properties };
  }
  return record;
}

function isRecord(value: unknown): value is IocRecord {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return undefined;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function arrayStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? item : stringValue((item as IocRecord).id ?? (item as IocRecord).name ?? (item as IocRecord).type)).filter(Boolean) as string[];
}

function sanitizeStationCode(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_.:-]{1,64}$/.test(trimmed) ? trimmed : undefined;
}

function normalizeBbox(value?: string | [number, number, number, number]) {
  if (!value) return undefined;
  const parts = (Array.isArray(value) ? value : value.split(",")).map(Number);
  if (parts.length !== 4 || parts.some((item) => !Number.isFinite(item))) return undefined;
  const [west, south, east, north] = parts;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return undefined;
  return [west, south, east, north] as [number, number, number, number];
}

function normalizeDateString(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : raw;
}

function inBbox(station: SeaLevelObservationStation, bbox: [number, number, number, number]) {
  if (station.latitude === null || station.longitude === null) return false;
  const [west, south, east, north] = bbox;
  return station.longitude >= west && station.longitude <= east && station.latitude >= south && station.latitude <= north;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Number((2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

function deriveStationStatus(rawStatus?: string, lastDataTime?: string) {
  const lower = rawStatus?.toLowerCase() ?? "";
  if (lower.includes("offline") || lower === "false" || lower.includes("inactive")) return "offline" as const;
  const staleness = calculateStalenessMinutes(lastDataTime);
  if (staleness !== null && staleness > 30) return "stale" as const;
  if (lower.includes("online") || lower === "true" || lower.includes("active")) return "online" as const;
  return "unknown" as const;
}

function latestObservation(observations: SeaLevelObservation[]) {
  return observations
    .filter((item) => item.observedAt)
    .sort((a, b) => Date.parse(b.observedAt ?? "") - Date.parse(a.observedAt ?? ""))[0] ?? observations[0];
}

function calculateStalenessMinutes(observedAt?: string) {
  if (!observedAt) return null;
  const time = Date.parse(observedAt);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60_000));
}

function isLowQualityFlag(flag?: string) {
  if (!flag) return false;
  const lower = flag.toLowerCase();
  return ["bad", "fail", "suspect", "invalid", "rejected", "low", "2", "3", "4"].some((term) => lower.includes(term));
}

function buildIocSlsmfExcerpt(context: SeaLevelObservationContext) {
  const station = context.stations[0];
  const stationText = station ? `${station.stationName ?? station.stationCode} (${station.stationCode})` : "no nearby station";
  const latest = context.latest.latestSeaLevel !== undefined
    ? `${context.latest.latestSeaLevel ?? "n/a"} m relative sea level at ${context.latest.latestObservedAt ?? "unknown time"}`
    : "recent sea level unavailable";
  const stale = context.stalenessMinutes === null ? "unknown staleness" : `${context.stalenessMinutes} min staleness`;
  const quality = context.latest.latestQualityFlag ? `quality flag ${context.latest.latestQualityFlag}` : "quality flag unavailable";
  return `IOC SLSMF sea level observation context indicates ${stationText}; ${latest}; ${stale}; ${quality}. ${IOC_SLSMF_DATUM_CAUTION} This is sea level observation context, not an official tsunami warning or evacuation order.`;
}
