import type { ArgusKnowledgeEvidenceItem } from "@/types/knowledgeIntake";
import type {
  CoastalObservationContext,
  CoastalObservationMeasurement,
  CoastalObservationStation,
  CoopsProduct,
  CoopsPurpose,
} from "@/types/coastalObservation";

export type NoaaCoopsRequestParams = {
  stationId?: string;
  lat?: number;
  lon?: number;
  bbox?: string | [number, number, number, number];
  radiusKm?: number;
  products?: CoopsProduct[] | string[];
  datum?: string;
  units?: "metric" | "english" | string;
  timeZone?: string;
  date?: string;
  range?: string;
  beginDate?: string;
  endDate?: string;
  purpose?: CoopsPurpose | string;
  incidentId?: string;
  routeAnalysisId?: string;
  fenixSimulationId?: string;
  persist?: boolean;
  includeMetadata?: boolean;
  includeWaterLevel?: boolean;
  includePredictions?: boolean;
  includeWind?: boolean;
  includeAirPressure?: boolean;
  includeAirGap?: boolean;
};

type CoopsStationRecord = Record<string, unknown>;
type CoopsProductResponse = {
  data?: Array<Record<string, unknown>>;
  predictions?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
  error?: { message?: string };
};

type ValidationResult =
  | {
      valid: true;
      params: NoaaCoopsRequestParams & {
        bbox?: [number, number, number, number];
        radiusKm: number;
        products: CoopsProduct[];
        datum: string;
        units: "metric" | "english";
        timeZone: string;
        purpose: CoopsPurpose;
        persist: boolean;
        includeMetadata: boolean;
        includeWaterLevel: boolean;
        includePredictions: boolean;
        includeWind: boolean;
        includeAirPressure: boolean;
        includeAirGap: boolean;
      };
    }
  | { valid: false; status: "invalidRequest"; message: string; errors: string[] };

const DATA_GETTER_URL = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const METADATA_BASE_URL = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi";
const REQUEST_TIMEOUT_MS = 12_000;
const STATIONS_CACHE_TTL_MS = 60 * 60_000;
const PRODUCT_CACHE_TTL_MS = 5 * 60_000;
const SUPPORTED_PRODUCTS: CoopsProduct[] = ["water_level", "predictions", "wind", "air_pressure", "air_gap"];
const SUPPORTED_PURPOSES: CoopsPurpose[] = [
  "tsunami_context",
  "hurricane_context",
  "storm_surge_context",
  "nav",
  "fenix",
  "aura",
  "incident_context",
  "coastal_monitoring",
  "general",
];
const LIMITATIONS = [
  "NOAA CO-OPS is official United States and NOAA monitored coastal station context, not complete worldwide coverage.",
  "NOAA CO-OPS is not a tsunami warning center, evacuation order, route closure source or ARGUS inundation model.",
  "Not every coast, harbor, bridge or port has a suitable CO-OPS station or sensor.",
  "Water level and tide predictions require an explicit datum; ARGUS defaults to MLLW when omitted.",
  "Observed water level, wind, pressure and air gap must remain separated from predicted tide values.",
  "Sensor data can be delayed, stale or unavailable by station and product.",
  "ARGUS does not create KnowledgeIncident records from individual CO-OPS readings.",
  "ARGUS does not perform global bulk station ingestion in this phase.",
];

let stationsCache: { fetchedAt: number; records: CoopsStationRecord[] } | null = null;
const stationCache = new Map<string, { fetchedAt: number; record: CoopsStationRecord | null }>();
const productCache = new Map<string, { fetchedAt: number; response: CoopsProductResponse }>();

export function validateNoaaCoopsRequest(params: NoaaCoopsRequestParams): ValidationResult {
  const bbox = normalizeBbox(params.bbox);
  const hasPoint = typeof params.lat === "number" || typeof params.lon === "number";
  if (!params.stationId && !bbox && !hasPoint) {
    return { valid: false, status: "invalidRequest", message: "stationId, lat/lon or bbox required for NOAA CO-OPS coastal context", errors: ["stationId, lat/lon or bbox required for NOAA CO-OPS coastal context"] };
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
  const units = params.units === "english" ? "english" : params.units === "metric" || !params.units ? "metric" : null;
  if (!units) return { valid: false, status: "invalidRequest", message: "units must be metric or english", errors: ["units must be metric or english"] };
  const products = normalizeProducts(params);
  if (products.length === 0) {
    return { valid: false, status: "invalidRequest", message: "NOAA CO-OPS products are limited to water_level, predictions, wind, air_pressure and air_gap in this phase", errors: ["unsupported products"] };
  }
  const radiusKm = Math.min(Math.max(Math.trunc(params.radiusKm ?? 25), 1), 50);
  const datum = (params.datum ?? "MLLW").trim() || "MLLW";
  return {
    valid: true,
    params: {
      ...params,
      bbox,
      radiusKm,
      products,
      datum,
      units,
      timeZone: params.timeZone ?? "gmt",
      purpose: SUPPORTED_PURPOSES.includes(params.purpose as CoopsPurpose) ? params.purpose as CoopsPurpose : "general",
      persist: params.persist ?? false,
      includeMetadata: params.includeMetadata ?? true,
      includeWaterLevel: params.includeWaterLevel ?? true,
      includePredictions: params.includePredictions ?? true,
      includeWind: params.includeWind ?? true,
      includeAirPressure: params.includeAirPressure ?? true,
      includeAirGap: params.includeAirGap ?? false,
    },
  };
}

export function buildCoopsDataGetterUrl(params: NoaaCoopsRequestParams & { stationId: string; product: CoopsProduct }) {
  const date = params.product === "predictions" ? (params.date === "latest" ? "today" : params.date ?? "today") : params.date ?? "latest";
  const search = new URLSearchParams({
    station: params.stationId,
    product: params.product,
    date,
    units: params.units === "english" ? "english" : "metric",
    time_zone: params.timeZone ?? "gmt",
    format: "json",
  });
  if (params.product === "water_level" || params.product === "predictions") search.set("datum", params.datum ?? "MLLW");
  if (params.product === "predictions") search.set("interval", "hilo");
  if (params.range) search.set("range", params.range);
  if (params.beginDate) search.set("begin_date", params.beginDate);
  if (params.endDate) search.set("end_date", params.endDate);
  return `${DATA_GETTER_URL}?${search.toString()}`;
}

export function buildCoopsMetadataUrl(params: { stationId?: string; path?: string }) {
  const path = params.stationId ? `/stations/${encodeURIComponent(params.stationId)}${params.path ?? ""}.json` : "/stations.json";
  return `${METADATA_BASE_URL}${path}`;
}

export async function fetchCoopsStations() {
  if (stationsCache && Date.now() - stationsCache.fetchedAt < STATIONS_CACHE_TTL_MS) {
    return { status: "ready" as const, fetched: stationsCache.records.length, endpoint: buildCoopsMetadataUrl({}), records: stationsCache.records, warnings: ["NOAA CO-OPS station metadata served from in-memory cache."], errors: [] };
  }
  const endpoint = buildCoopsMetadataUrl({});
  const result = await fetchJson<{ stations?: CoopsStationRecord[] }>(endpoint);
  if (!result.ok) return { status: "error" as const, fetched: 0, endpoint, records: [] as CoopsStationRecord[], warnings: [], errors: [result.error] };
  const records = result.data.stations ?? [];
  stationsCache = { fetchedAt: Date.now(), records };
  return { status: records.length ? "ready" as const : "empty" as const, fetched: records.length, endpoint, records, warnings: [], errors: [] };
}

export async function fetchCoopsStationMetadata(params: NoaaCoopsRequestParams & { stationId: string }) {
  const cached = stationCache.get(params.stationId);
  if (cached && Date.now() - cached.fetchedAt < STATIONS_CACHE_TTL_MS) {
    return { status: cached.record ? "ready" as const : "empty" as const, fetched: cached.record ? 1 : 0, endpoint: buildCoopsMetadataUrl({ stationId: params.stationId }), record: cached.record, warnings: ["NOAA CO-OPS station metadata served from in-memory cache."], errors: [] };
  }
  const endpoint = buildCoopsMetadataUrl({ stationId: params.stationId });
  const result = await fetchJson<{ stations?: CoopsStationRecord[]; station?: CoopsStationRecord }>(endpoint);
  if (!result.ok) return { status: "error" as const, fetched: 0, endpoint, record: null, warnings: [], errors: [result.error] };
  const record = result.data.station ?? result.data.stations?.[0] ?? null;
  stationCache.set(params.stationId, { fetchedAt: Date.now(), record });
  return { status: record ? "ready" as const : "empty" as const, fetched: record ? 1 : 0, endpoint, record, warnings: [], errors: [] };
}

export async function findCoopsStationsNearPoint(params: NoaaCoopsRequestParams) {
  const validation = validateNoaaCoopsRequest(params);
  if (!validation.valid) return { ...validation, fetched: 0, stations: [] as CoastalObservationStation[], warnings: [], errors: validation.errors };
  const all = await fetchCoopsStations();
  const stations = all.records
    .map((record) => normalizeCoopsStation(record, validation.params))
    .filter((station): station is CoastalObservationStation => Boolean(station))
    .filter((station) => {
      if (validation.params.stationId) return station.stationId === validation.params.stationId;
      if (validation.params.bbox) return inBbox(station, validation.params.bbox);
      if (typeof validation.params.lat === "number" && typeof validation.params.lon === "number") {
        return typeof station.distanceKm === "number" && station.distanceKm <= validation.params.radiusKm;
      }
      return false;
    })
    .sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999))
    .slice(0, 5);
  return { status: stations.length ? "ready" as const : "empty" as const, fetched: all.fetched, stations, warnings: all.warnings, errors: all.errors };
}

export async function fetchCoopsProduct(params: NoaaCoopsRequestParams & { stationId: string; product: CoopsProduct }) {
  const endpoint = buildCoopsDataGetterUrl(params);
  const cached = productCache.get(endpoint);
  if (cached && Date.now() - cached.fetchedAt < PRODUCT_CACHE_TTL_MS) {
    return { status: "ready" as const, endpoint, product: params.product, response: cached.response, warnings: ["NOAA CO-OPS product served from in-memory cache."], errors: [] };
  }
  const result = await fetchJson<CoopsProductResponse>(endpoint);
  if (!result.ok) return { status: "error" as const, endpoint, product: params.product, response: null, warnings: [], errors: [result.error] };
  if (result.data.error?.message) return { status: "empty" as const, endpoint, product: params.product, response: result.data, warnings: [`${params.product} unavailable for station ${params.stationId}: ${result.data.error.message}`], errors: [] };
  productCache.set(endpoint, { fetchedAt: Date.now(), response: result.data });
  const count = (result.data.data ?? result.data.predictions ?? []).length;
  return { status: count ? "ready" as const : "empty" as const, endpoint, product: params.product, response: result.data, warnings: count ? [] : [`${params.product} returned no records for station ${params.stationId}.`], errors: [] };
}

export function fetchCoopsLatestWaterLevel(params: NoaaCoopsRequestParams & { stationId: string }) {
  return fetchCoopsProduct({ ...params, product: "water_level", date: params.date ?? "latest" });
}

export function fetchCoopsRecentWaterLevel(params: NoaaCoopsRequestParams & { stationId: string }) {
  return fetchCoopsProduct({ ...params, product: "water_level", date: params.date ?? undefined, range: params.range ?? "6" });
}

export function fetchCoopsTidePredictions(params: NoaaCoopsRequestParams & { stationId: string }) {
  return fetchCoopsProduct({ ...params, product: "predictions", date: params.date === "latest" ? "today" : params.date ?? "today" });
}

export function fetchCoopsWind(params: NoaaCoopsRequestParams & { stationId: string }) {
  return fetchCoopsProduct({ ...params, product: "wind", date: params.date ?? "latest" });
}

export function fetchCoopsAirPressure(params: NoaaCoopsRequestParams & { stationId: string }) {
  return fetchCoopsProduct({ ...params, product: "air_pressure", date: params.date ?? "latest" });
}

export function fetchCoopsAirGap(params: NoaaCoopsRequestParams & { stationId: string }) {
  return fetchCoopsProduct({ ...params, product: "air_gap", date: params.date ?? "latest" });
}

export function normalizeCoopsStation(record: CoopsStationRecord, params: NoaaCoopsRequestParams = {}): CoastalObservationStation | null {
  const stationId = stringValue(record.id ?? record.stationId ?? record.station_id);
  if (!stationId) return null;
  const lat = numberValue(record.lat ?? record.latitude);
  const lon = numberValue(record.lng ?? record.lon ?? record.longitude);
  return {
    stationId,
    stationName: stringValue(record.name ?? record.stationName),
    latitude: lat,
    longitude: lon,
    state: stringValue(record.state),
    timezone: stringValue(record.timezone ?? record.timeZone),
    stationType: stringValue(record.type ?? record.stationType),
    active: typeof record.active === "boolean" ? record.active : null,
    distanceKm: typeof params.lat === "number" && typeof params.lon === "number" && lat !== null && lon !== null ? distanceKm(params.lat, params.lon, lat, lon) : null,
    productsAvailable: arrayStrings(record.products),
    sensorsAvailable: arrayStrings(record.sensors),
  };
}

export function normalizeCoopsProduct(product: CoopsProduct, response: CoopsProductResponse | null, params: NoaaCoopsRequestParams & { stationId: string }): CoastalObservationMeasurement[] {
  const rows = response?.predictions ?? response?.data ?? [];
  return rows.map((row) => {
    const time = stringValue(row.t ?? row.time ?? row.date);
    const value = numberValue(row.v ?? row.value ?? row.s ?? row.d);
    const tideType = stringValue(row.type);
    return {
      stationId: params.stationId,
      product,
      measurementType: product === "predictions" ? "predicted" : "observed",
      value,
      unit: unitFor(product, params.units),
      datum: product === "water_level" || product === "predictions" ? params.datum ?? "MLLW" : undefined,
      measuredAt: product === "predictions" ? undefined : time ?? undefined,
      predictedAt: product === "predictions" ? time ?? undefined : undefined,
      qualityFlags: [stringValue(row.f), stringValue(row.q), tideType].filter(Boolean) as string[],
      raw: row,
    };
  });
}

export async function buildCoopsCoastalObservationContext(params: NoaaCoopsRequestParams, products?: Array<{ product: CoopsProduct; response: CoopsProductResponse | null; endpoint: string }>) {
  const validation = validateNoaaCoopsRequest(params);
  if (!validation.valid) throw new Error(validation.message);
  const stations: CoastalObservationStation[] = [];
  if (validation.params.stationId) {
    const stationResult = validation.params.includeMetadata
      ? await fetchCoopsStationMetadata({ ...validation.params, stationId: validation.params.stationId })
      : { record: { id: validation.params.stationId }, endpoint: buildCoopsMetadataUrl({ stationId: validation.params.stationId }), warnings: [], errors: [] };
    const station = normalizeCoopsStation(stationResult.record ?? { id: validation.params.stationId }, validation.params);
    if (station) stations.push(station);
  } else {
    const nearby = await findCoopsStationsNearPoint(validation.params);
    stations.push(...nearby.stations);
  }
  const sourceUrls = new Set<string>();
  const observations: CoastalObservationMeasurement[] = [];
  for (const station of stations.slice(0, 3)) {
    const stationProducts = products?.filter((item) => item.endpoint.includes(`station=${station.stationId}`));
    const fetchedProducts = stationProducts ?? [];
    for (const productResult of fetchedProducts) {
      sourceUrls.add(productResult.endpoint);
      observations.push(...normalizeCoopsProduct(productResult.product, productResult.response, { ...validation.params, stationId: station.stationId }));
    }
  }
  const latest = latestCoastalMeasurements(observations);
  const tides = nextTides(observations.filter((item) => item.product === "predictions"));
  const stalenessMinutes = calculateStalenessMinutes(latest.measuredAt);
  const riskFactors = {
    highTideSoon: Boolean(tides.nextHighTide?.predictedAt && Date.parse(tides.nextHighTide.predictedAt) - Date.now() <= 6 * 60 * 60_000 && Date.parse(tides.nextHighTide.predictedAt) > Date.now()),
    observedWaterLevelAvailable: Boolean(latest.waterLevel),
    predictedTideAvailable: Boolean(tides.nextHighTide || tides.nextLowTide),
    coastalWindAvailable: Boolean(latest.wind),
    pressureAvailable: Boolean(latest.airPressure),
    airGapAvailable: Boolean(latest.airGap),
    staleData: stalenessMinutes === null || stalenessMinutes > 180,
    missingStation: Boolean(validation.params.stationId && stations.length === 0),
    noNearbyStation: !validation.params.stationId && stations.length === 0,
    datumExplicit: Boolean(validation.params.datum),
    observedVsPredictedSeparated: observations.every((item) => item.product === "predictions" ? item.measurementType === "predicted" : item.measurementType === "observed"),
  };
  return {
    id: `noaa-coops-${validation.params.stationId ?? `${validation.params.lat ?? "bbox"}-${validation.params.lon ?? ""}`}-${Date.now()}`,
    sourceId: "noaa-coops",
    sourceName: "NOAA CO-OPS",
    purpose: validation.params.purpose,
    generatedAt: new Date().toISOString(),
    query: {
      stationId: validation.params.stationId,
      lat: validation.params.lat,
      lon: validation.params.lon,
      bbox: validation.params.bbox,
      radiusKm: validation.params.radiusKm,
      products: validation.params.products,
      datum: validation.params.datum,
      units: validation.params.units,
      timeZone: validation.params.timeZone,
    },
    stations,
    observations,
    latest: {
      waterLevel: latest.waterLevel,
      waterLevelDatum: latest.waterLevel?.datum,
      waterLevelTime: latest.waterLevel?.measuredAt,
      wind: latest.wind,
      windTime: latest.wind?.measuredAt,
      airPressure: latest.airPressure,
      airPressureTime: latest.airPressure?.measuredAt,
      airGap: latest.airGap,
      airGapTime: latest.airGap?.measuredAt,
    },
    tides,
    riskFactors,
    confidence: scoreCoopsCoastalContext({ stations, observations, riskFactors, stalenessMinutes }),
    stalenessMinutes,
    limitations: LIMITATIONS,
    evidenceRefs: observations.map((item) => `noaa-coops:${item.stationId}:${item.product}:${item.measuredAt ?? item.predictedAt ?? "unknown"}`),
    sourceUrls: Array.from(sourceUrls),
  } satisfies CoastalObservationContext;
}

export function buildCoopsEvidence(context: CoastalObservationContext, params: NoaaCoopsRequestParams): ArgusKnowledgeEvidenceItem {
  const excerpt = buildCoopsExcerpt(context);
  return {
    id: `noaa-coops-evidence-${params.incidentId ?? params.routeAnalysisId ?? params.fenixSimulationId ?? context.id}`,
    incidentId: params.incidentId,
    sourceId: "noaa-coops",
    sourceName: "NOAA CO-OPS",
    title: "NOAA CO-OPS coastal observation context",
    url: context.sourceUrls[0] ?? METADATA_BASE_URL,
    summary: excerpt,
    quote: excerpt,
    confidenceScore: {
      sourceReliability: 94,
      corroborationCount: 1,
      geolocationPrecision: context.stations.length ? 90 : 30,
      timestampPrecision: context.riskFactors.staleData ? 55 : 90,
      documentQuality: 88,
      extractionConfidence: 90,
      conflictWithOtherSources: 0,
      finalConfidence: context.confidence,
      label: context.confidence >= 80 ? "high" : context.confidence >= 55 ? "medium" : "low",
    },
    locationConfidence: context.stations.length ? 0.9 : 0.3,
    timestampConfidence: context.riskFactors.staleData ? 0.55 : 0.9,
    extractedAt: context.generatedAt,
    conflicts: [],
  };
}

export function scoreCoopsCoastalContext(input: Pick<CoastalObservationContext, "stations" | "observations" | "riskFactors" | "stalenessMinutes">) {
  let score = 93;
  if (!input.stations.length) score -= 35;
  if (!input.observations.length) score -= 25;
  if (!input.riskFactors.observedWaterLevelAvailable) score -= 8;
  if (!input.riskFactors.predictedTideAvailable) score -= 6;
  if (!input.riskFactors.datumExplicit) score -= 15;
  if (input.stalenessMinutes === null) score -= 14;
  else if (input.stalenessMinutes > 180) score -= 16;
  else if (input.stalenessMinutes > 60) score -= 8;
  return Math.min(Math.max(score, 30), 95);
}

export function getCoopsAdapterStatus() {
  return {
    adapterId: "noaaCoopsAdapter",
    sourceId: "noaa-coops",
    status: "ready" as const,
    sourceRole: "coastal_ocean_observation_source",
    isIncidentSource: false,
    requiresApiKey: false,
    requiresConfiguration: false,
    officialSource: true,
    phase1Capabilities: ["station metadata", "latest/recent water level", "tide predictions", "wind", "air pressure", "air gap optional", "KnowledgeEvidence coastal_ocean_context"],
    phase2Planned: ["currents", "currents predictions", "datums/flood levels", "OFS water level model guidance", "derived products", "sea level trends", "extreme water levels"],
    laterOceanSources: ["NDBC", "IOC Sea Level", "SHOA/JMA/BMKG/local tide gauges"],
    mapLayer: "NOAA CO-OPS Coastal Observations",
    layerType: "coastal_ocean_context",
    isIncidentLayer: false,
    defaultVisible: false,
    noBulkGlobal: true,
    capabilities: ["station_metadata", "water_level", "tide_predictions", "wind", "air_pressure", "air_gap_optional", "coastal_ocean_context", "map_layer:noaa_coops_coastal_observations"],
    limitations: LIMITATIONS,
    citation: "NOAA CO-OPS / tidesandcurrents.noaa.gov",
    message: "NOAA CO-OPS is active as official coastal observation context without an API key.",
  };
}

export async function fetchAndBuildCoopsContext(params: NoaaCoopsRequestParams) {
  const validation = validateNoaaCoopsRequest(params);
  if (!validation.valid) return { ...validation, fetched: 0, normalized: 0, context: null, productsFetched: [] as CoopsProduct[], warnings: [], errors: validation.errors };
  const warnings: string[] = [];
  const errors: string[] = [];
  const stationIds: string[] = [];
  if (validation.params.stationId) stationIds.push(validation.params.stationId);
  else {
    const nearby = await findCoopsStationsNearPoint(validation.params);
    warnings.push(...nearby.warnings);
    errors.push(...nearby.errors);
    stationIds.push(...nearby.stations.slice(0, 3).map((station) => station.stationId));
    if (!nearby.stations.length) warnings.push("No nearby NOAA CO-OPS station returned; do not infer absence of coastal risk.");
  }
  const productResults: Array<{ product: CoopsProduct; response: CoopsProductResponse | null; endpoint: string }> = [];
  const requested = validation.params.products.filter((product) => {
    if (product === "water_level") return validation.params.includeWaterLevel;
    if (product === "predictions") return validation.params.includePredictions;
    if (product === "wind") return validation.params.includeWind;
    if (product === "air_pressure") return validation.params.includeAirPressure;
    if (product === "air_gap") return validation.params.includeAirGap;
    return false;
  });
  for (const stationId of stationIds) {
    for (const product of requested) {
      const result = await fetchCoopsProduct({ ...validation.params, stationId, product });
      warnings.push(...result.warnings);
      errors.push(...result.errors);
      productResults.push({ product, response: result.response, endpoint: result.endpoint });
    }
  }
  const context = await buildCoopsCoastalObservationContext(validation.params, productResults);
  if (context.riskFactors.staleData) warnings.push("NOAA CO-OPS latest observed measurement is stale or timestamp is unavailable.");
  if (context.riskFactors.noNearbyStation) warnings.push("No nearby NOAA CO-OPS station found within controlled radius.");
  const status = context.stations.length || context.observations.length ? "ready" as const : "empty" as const;
  return {
    status,
    fetched: productResults.length + context.stations.length,
    normalized: context.observations.length,
    productsFetched: Array.from(new Set(productResults.filter((item) => item.response).map((item) => item.product))),
    context,
    warnings: [...new Set(warnings)],
    errors,
  };
}

function normalizeProducts(params: NoaaCoopsRequestParams) {
  const requested = params.products?.length ? params.products : ["water_level", "predictions", "wind", "air_pressure"];
  return [...new Set(requested.map((item) => String(item).trim()).filter((item): item is CoopsProduct => SUPPORTED_PRODUCTS.includes(item as CoopsProduct)))];
}

function normalizeBbox(value?: string | [number, number, number, number]) {
  if (!value) return undefined;
  const parts = (Array.isArray(value) ? value : value.split(",")).map(Number);
  if (parts.length !== 4 || parts.some((item) => !Number.isFinite(item))) return undefined;
  const [west, south, east, north] = parts;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return undefined;
  return [west, south, east, north] as [number, number, number, number];
}

async function fetchJson<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": process.env.ARGUS_USER_AGENT ?? "ARGUS/NOAA-COOPS-Context" },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, error: `NOAA CO-OPS responded ${response.status}` };
    return { ok: true, data: await response.json() as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "NOAA CO-OPS fetch failed" };
  } finally {
    clearTimeout(timeout);
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function arrayStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? item : stringValue((item as Record<string, unknown>).name ?? (item as Record<string, unknown>).type)).filter(Boolean) as string[];
}

function inBbox(station: CoastalObservationStation, bbox: [number, number, number, number]) {
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

function unitFor(product: CoopsProduct, units?: string) {
  if (product === "water_level" || product === "predictions" || product === "air_gap") return units === "english" ? "ft" : "m";
  if (product === "air_pressure") return units === "english" ? "inHg" : "mb";
  if (product === "wind") return units === "english" ? "mph" : "m/s";
  return undefined;
}

function latestCoastalMeasurements(observations: CoastalObservationMeasurement[]) {
  const sorted = observations.slice().sort((a, b) => Date.parse(b.measuredAt ?? b.predictedAt ?? "") - Date.parse(a.measuredAt ?? a.predictedAt ?? ""));
  const waterLevel = sorted.find((item) => item.product === "water_level");
  const wind = sorted.find((item) => item.product === "wind");
  const airPressure = sorted.find((item) => item.product === "air_pressure");
  const airGap = sorted.find((item) => item.product === "air_gap");
  const measuredAt = [waterLevel?.measuredAt, wind?.measuredAt, airPressure?.measuredAt, airGap?.measuredAt].filter(Boolean).sort().reverse()[0];
  return { waterLevel, wind, airPressure, airGap, measuredAt };
}

function nextTides(predictions: CoastalObservationMeasurement[]) {
  const future = predictions.filter((item) => item.predictedAt && Date.parse(item.predictedAt) >= Date.now()).sort((a, b) => Date.parse(a.predictedAt ?? "") - Date.parse(b.predictedAt ?? ""));
  const nextHighTide = future.find((item) => item.qualityFlags?.some((flag) => flag === "H"));
  const nextLowTide = future.find((item) => item.qualityFlags?.some((flag) => flag === "L"));
  const times = predictions.map((item) => item.predictedAt).filter(Boolean).sort() as string[];
  return { nextHighTide, nextLowTide, predictionsWindow: { start: times[0], end: times[times.length - 1] } };
}

function calculateStalenessMinutes(measuredAt?: string) {
  if (!measuredAt) return null;
  const time = Date.parse(measuredAt);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60_000));
}

function buildCoopsExcerpt(context: CoastalObservationContext) {
  const station = context.stations[0];
  const stationText = station ? `${station.stationName ?? station.stationId} (${station.stationId})` : "no nearby station";
  const water = context.latest.waterLevel ? `${context.latest.waterLevel.value ?? "n/a"} ${context.latest.waterLevel.unit ?? ""} ${context.latest.waterLevel.datum ?? ""}` : "water level unavailable";
  const tide = context.tides.nextHighTide ? `next high tide ${context.tides.nextHighTide.value ?? "n/a"} ${context.tides.nextHighTide.unit ?? ""} at ${context.tides.nextHighTide.predictedAt}` : "tide prediction unavailable";
  const wind = context.latest.wind ? `wind ${context.latest.wind.value ?? "n/a"} ${context.latest.wind.unit ?? ""}` : "wind unavailable";
  const pressure = context.latest.airPressure ? `pressure ${context.latest.airPressure.value ?? "n/a"} ${context.latest.airPressure.unit ?? ""}` : "pressure unavailable";
  const stale = context.stalenessMinutes === null ? "unknown staleness" : `${context.stalenessMinutes} min staleness`;
  return `NOAA CO-OPS coastal observation context indicates ${stationText}; observed water level ${water}; ${tide}; ${wind}; ${pressure}; ${stale}. This is coastal observation context, not an evacuation order or warning center message.`;
}
