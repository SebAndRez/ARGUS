import type { ArgusKnowledgeEvidenceItem } from "@/types/knowledgeIntake";
import type {
  AirQualityLocation,
  AirQualityMeasurement,
  AirQualityObservationContext,
  AirQualityProviderLicense,
  AirQualityQuery,
  AirQualitySensor,
  OpenAqPurpose,
} from "@/types/airQuality";

export type OpenAqRequestParams = {
  locationId?: string;
  sensorId?: string;
  lat?: number;
  lon?: number;
  radiusKm?: number;
  bbox?: string;
  parameters?: string[] | string;
  country?: string;
  providers?: string[] | string;
  owners?: string[] | string;
  licenses?: string[] | string;
  limit?: number;
  page?: number;
  purpose?: OpenAqPurpose | string;
  incidentId?: string;
  routeAnalysisId?: string;
  fenixSimulationId?: string;
  persist?: boolean;
  includeLocations?: boolean;
  includeSensors?: boolean;
  includeLatest?: boolean;
  includeParameters?: boolean;
  includeProviders?: boolean;
  includeOwners?: boolean;
  includeLicenses?: boolean;
  ttlMinutes?: number;
};

type ValidationResult =
  | { valid: true; params: Required<Pick<OpenAqRequestParams, "radiusKm" | "limit" | "includeLocations" | "includeSensors" | "includeLatest" | "includeParameters" | "includeProviders" | "includeOwners" | "includeLicenses" | "persist" | "ttlMinutes">> & OpenAqRequestParams & { parameters: string[]; providers?: string[]; owners?: string[]; licenses?: string[]; purpose: OpenAqPurpose } }
  | { valid: false; status: "invalidRequest"; message: string; errors: string[] };

const OPENAQ_BASE_URL = "https://api.openaq.org/v3";
const REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_PARAMETERS = ["pm25", "pm10", "o3", "no2", "so2", "co"];
const PARAMETER_WHITELIST = ["pm25", "pm10", "o3", "no2", "so2", "co", "bc", "temperature", "relativehumidity"];
const SUPPORTED_PURPOSES: OpenAqPurpose[] = [
  "wildfire_smoke_context",
  "volcanic_ash_context",
  "dust_haze_context",
  "urban_pollution_context",
  "aura",
  "nav",
  "fenix",
  "incident_context",
  "air_quality_monitoring",
  "general",
];
const LIMITATIONS = [
  "OpenAQ is aggregated public air quality observation context, not an official health alert.",
  "Coverage is provider-dependent and not globally complete.",
  "Latest measurements can be incomplete or stale.",
  "Provider and license metadata must be preserved and reviewed before commercial use.",
  "ARGUS does not create a KnowledgeIncident, medical diagnosis, evacuation order or causal smoke attribution from isolated OpenAQ measurements.",
  "Use local health or environmental authorities for official advisories.",
];

export function getOpenAqApiKeyStatus() {
  const configured = Boolean(process.env.OPENAQ_API_KEY?.trim());
  return {
    status: configured ? "configured" as const : "requiresConfiguration" as const,
    apiKeyConfigured: configured,
    requiresApiKey: true,
    requiresConfiguration: !configured,
    envVar: "OPENAQ_API_KEY",
    message: configured ? "OpenAQ API key configured." : "OpenAQ API key is required to access air quality data.",
  };
}

export function buildOpenAqHeaders(): Record<string, string> {
  const key = process.env.OPENAQ_API_KEY?.trim();
  return key ? { "X-API-Key": key } : {};
}

export function validateOpenAqRequest(params: OpenAqRequestParams): ValidationResult {
  const hasLocation = Boolean(params.locationId);
  const hasSensor = Boolean(params.sensorId);
  const hasPoint = typeof params.lat === "number" || typeof params.lon === "number";
  const hasCompletePoint = typeof params.lat === "number" && typeof params.lon === "number";
  const hasBbox = Boolean(params.bbox?.trim());
  if (!hasLocation && !hasSensor && !hasCompletePoint && !hasBbox) {
    return invalid("locationId, sensorId, lat/lon or bbox required for OpenAQ air quality context");
  }
  if (hasPoint && !hasCompletePoint) return invalid("lat and lon must be provided together");
  if (hasCompletePoint && hasBbox) return invalid("Do not combine lat/lon/radius and bbox in the same OpenAQ request");
  if (typeof params.lat === "number" && (params.lat < -90 || params.lat > 90)) return invalid("lat must be between -90 and 90");
  if (typeof params.lon === "number" && (params.lon < -180 || params.lon > 180)) return invalid("lon must be between -180 and 180");
  const radiusKm = Math.trunc(params.radiusKm ?? 25);
  if (radiusKm < 1 || radiusKm > 50) return invalid("radiusKm must be between 1 and 50 for OpenAQ phase 1");
  const bbox = params.bbox?.trim();
  if (bbox && !isValidBbox(bbox)) return invalid("bbox must be minLon,minLat,maxLon,maxLat within valid coordinate ranges");
  const limit = Math.trunc(params.limit ?? 20);
  if (limit < 1 || limit > 100) return invalid("limit must be between 1 and 100 for OpenAQ phase 1");
  const parameters = list(params.parameters ?? DEFAULT_PARAMETERS).map((item) => item.toLowerCase());
  const invalidParameters = parameters.filter((item) => !PARAMETER_WHITELIST.includes(item));
  if (invalidParameters.length) return invalid(`Unsupported OpenAQ parameter(s): ${invalidParameters.join(", ")}`);
  return {
    valid: true,
    params: {
      ...params,
      radiusKm,
      limit,
      parameters,
      providers: list(params.providers),
      owners: list(params.owners),
      licenses: list(params.licenses),
      purpose: normalizePurpose(params.purpose),
      persist: params.persist ?? false,
      includeLocations: params.includeLocations ?? true,
      includeSensors: params.includeSensors ?? true,
      includeLatest: params.includeLatest ?? true,
      includeParameters: params.includeParameters ?? true,
      includeProviders: params.includeProviders ?? true,
      includeOwners: params.includeOwners ?? true,
      includeLicenses: params.includeLicenses ?? true,
      ttlMinutes: params.ttlMinutes ?? 60,
    },
  };
}

export function buildOpenAqLocationsUrl(params: OpenAqRequestParams) {
  const validation = validateOpenAqRequest({ ...params, locationId: params.locationId ?? "url-build" });
  const input = validation.valid ? validation.params : { ...params, limit: params.limit ?? 20, radiusKm: params.radiusKm ?? 25, parameters: list(params.parameters ?? DEFAULT_PARAMETERS) };
  const search = commonSearch(input);
  if (typeof params.lat === "number" && typeof params.lon === "number") {
    search.set("coordinates", `${params.lat},${params.lon}`);
    search.set("radius", String((params.radiusKm ?? 25) * 1000));
  }
  if (params.bbox) search.set("bbox", params.bbox);
  if (params.country) search.set("countries", params.country);
  return `${OPENAQ_BASE_URL}/locations?${search.toString()}`;
}

export function buildOpenAqLocationUrl(locationId: string) {
  return `${OPENAQ_BASE_URL}/locations/${encodeURIComponent(locationId)}`;
}

export function buildOpenAqLocationLatestUrl(locationId: string, params: OpenAqRequestParams = {}) {
  const search = commonSearch({ ...params, limit: params.limit ?? 100, parameters: list(params.parameters ?? DEFAULT_PARAMETERS) });
  return `${OPENAQ_BASE_URL}/locations/${encodeURIComponent(locationId)}/latest?${search.toString()}`;
}

export function buildOpenAqLocationSensorsUrl(locationId: string, params: OpenAqRequestParams = {}) {
  const search = commonSearch({ ...params, limit: params.limit ?? 100, parameters: list(params.parameters ?? DEFAULT_PARAMETERS) });
  return `${OPENAQ_BASE_URL}/locations/${encodeURIComponent(locationId)}/sensors?${search.toString()}`;
}

export function buildOpenAqSensorUrl(sensorId: string) {
  return `${OPENAQ_BASE_URL}/sensors/${encodeURIComponent(sensorId)}`;
}

export function buildOpenAqSensorMeasurementsUrl(sensorId: string, params: OpenAqRequestParams = {}) {
  const search = commonSearch({ ...params, limit: params.limit ?? 20, parameters: list(params.parameters ?? DEFAULT_PARAMETERS) });
  return `${OPENAQ_BASE_URL}/sensors/${encodeURIComponent(sensorId)}/measurements?${search.toString()}`;
}

export function buildOpenAqParametersUrl(params: OpenAqRequestParams = {}) {
  return `${OPENAQ_BASE_URL}/parameters?${commonSearch(params).toString()}`;
}

export function buildOpenAqProvidersUrl(params: OpenAqRequestParams = {}) {
  return `${OPENAQ_BASE_URL}/providers?${commonSearch(params).toString()}`;
}

export function buildOpenAqOwnersUrl(params: OpenAqRequestParams = {}) {
  return `${OPENAQ_BASE_URL}/owners?${commonSearch(params).toString()}`;
}

export function buildOpenAqLicensesUrl(params: OpenAqRequestParams = {}) {
  return `${OPENAQ_BASE_URL}/licenses?${commonSearch(params).toString()}`;
}

export async function fetchOpenAqLocations(params: OpenAqRequestParams) {
  return fetchOpenAqList(buildOpenAqLocationsUrl(params), "locations");
}

export async function fetchOpenAqLocation(locationId: string) {
  return fetchOpenAqRecord(buildOpenAqLocationUrl(locationId), "location");
}

export async function fetchOpenAqLocationLatest(locationId: string, params: OpenAqRequestParams = {}) {
  return fetchOpenAqList(buildOpenAqLocationLatestUrl(locationId, params), "measurements");
}

export async function fetchOpenAqLocationSensors(locationId: string, params: OpenAqRequestParams = {}) {
  return fetchOpenAqList(buildOpenAqLocationSensorsUrl(locationId, params), "sensors");
}

export async function fetchOpenAqSensor(sensorId: string) {
  return fetchOpenAqRecord(buildOpenAqSensorUrl(sensorId), "sensor");
}

export async function fetchOpenAqSensorMeasurements(sensorId: string, params: OpenAqRequestParams = {}) {
  return fetchOpenAqList(buildOpenAqSensorMeasurementsUrl(sensorId, params), "measurements");
}

export async function fetchOpenAqParameters(params: OpenAqRequestParams = {}) {
  return fetchOpenAqList(buildOpenAqParametersUrl(params), "parameters");
}

export async function fetchOpenAqProviders(params: OpenAqRequestParams = {}) {
  return fetchOpenAqList(buildOpenAqProvidersUrl(params), "providers");
}

export async function fetchOpenAqOwners(params: OpenAqRequestParams = {}) {
  return fetchOpenAqList(buildOpenAqOwnersUrl(params), "owners");
}

export async function fetchOpenAqLicenses(params: OpenAqRequestParams = {}) {
  return fetchOpenAqList(buildOpenAqLicensesUrl(params), "licenses");
}

export async function findOpenAqLocationsNearPoint(params: OpenAqRequestParams) {
  const validation = validateOpenAqRequest(params);
  if (!validation.valid) return { ...validation, fetched: 0, locations: [], warnings: [], errors: validation.errors };
  const result = await fetchOpenAqLocations(validation.params);
  return {
    ...result,
    locations: (result.records as unknown[]).map((record) => normalizeOpenAqLocation(record, validation.params)).filter(Boolean) as AirQualityLocation[],
  };
}

export async function fetchAndBuildOpenAqAirQualityObservationContext(params: OpenAqRequestParams) {
  const validation = validateOpenAqRequest(params);
  if (!validation.valid) return { status: validation.status, context: null, fetched: 0, warnings: [], errors: validation.errors };
  const keyStatus = getOpenAqApiKeyStatus();
  if (!keyStatus.apiKeyConfigured) {
    return {
      status: "requiresConfiguration" as const,
      sourceId: "openaq",
      requiresApiKey: true,
      envVar: "OPENAQ_API_KEY",
      message: keyStatus.message,
      context: null,
      fetched: 0,
      warnings: [keyStatus.message],
      errors: [],
    };
  }
  const warnings: string[] = [];
  const errors: string[] = [];
  let locations: AirQualityLocation[] = [];
  const sensors: AirQualitySensor[] = [];
  const measurements: AirQualityMeasurement[] = [];
  const rawRefs: string[] = [];

  if (validation.params.locationId) {
    const location = await fetchOpenAqLocation(validation.params.locationId);
    if (location.status === "rateLimited") return { ...location, context: null };
    if (location.record) locations = [normalizeOpenAqLocation(location.record, validation.params)].filter(Boolean) as AirQualityLocation[];
    rawRefs.push(location.endpoint);
  } else if (!validation.params.sensorId && validation.params.includeLocations) {
    const locationResult = await fetchOpenAqLocations(validation.params);
    if (locationResult.status === "rateLimited") return { ...locationResult, context: null };
    locations = locationResult.records.map((record) => normalizeOpenAqLocation(record, validation.params)).filter(Boolean) as AirQualityLocation[];
    rawRefs.push(locationResult.endpoint);
    errors.push(...locationResult.errors);
  }

  if (validation.params.sensorId) {
    const sensor = await fetchOpenAqSensor(validation.params.sensorId);
    const measurementResult = await fetchOpenAqSensorMeasurements(validation.params.sensorId, validation.params);
    if (sensor.record) sensors.push(normalizeOpenAqSensor(sensor.record));
    measurements.push(...measurementResult.records.map((record) => normalizeOpenAqLatestMeasurement(record, validation.params)).filter(Boolean) as AirQualityMeasurement[]);
    rawRefs.push(sensor.endpoint, measurementResult.endpoint);
    errors.push(...sensor.errors, ...measurementResult.errors);
  }

  for (const location of locations.slice(0, validation.params.limit)) {
    if (validation.params.includeSensors) {
      const sensorResult = await fetchOpenAqLocationSensors(location.locationId, validation.params);
      sensors.push(...sensorResult.records.map((record) => normalizeOpenAqSensor(record, location)).filter(Boolean) as AirQualitySensor[]);
      rawRefs.push(sensorResult.endpoint);
      errors.push(...sensorResult.errors);
    }
    if (validation.params.includeLatest) {
      const latest = await fetchOpenAqLocationLatest(location.locationId, validation.params);
      measurements.push(...latest.records.map((record) => normalizeOpenAqLatestMeasurement(record, { ...validation.params, locationId: location.locationId }, location)).filter(Boolean) as AirQualityMeasurement[]);
      rawRefs.push(latest.endpoint);
      errors.push(...latest.errors);
    }
  }

  const [providers, owners, licenses] = await Promise.all([
    validation.params.includeProviders ? fetchOpenAqProviders(validation.params) : Promise.resolve(emptyResult("providers")),
    validation.params.includeOwners ? fetchOpenAqOwners(validation.params) : Promise.resolve(emptyResult("owners")),
    validation.params.includeLicenses ? fetchOpenAqLicenses(validation.params) : Promise.resolve(emptyResult("licenses")),
  ]);
  rawRefs.push(providers.endpoint, owners.endpoint, licenses.endpoint);
  errors.push(...providers.errors, ...owners.errors, ...licenses.errors);

  const providerLicense = buildProviderLicense(providers.records, owners.records, licenses.records);
  const context = buildOpenAqAirQualityObservationContext(validation.params, locations, measurements, sensors, providerLicense, rawRefs.filter(Boolean));
  if (!locations.length && !validation.params.sensorId) warnings.push("No nearby OpenAQ location found for the controlled query.");
  if (context.riskFactors.staleData) warnings.push("OpenAQ latest measurements are stale; treat as context only.");
  if (context.riskFactors.missingProviderLicense) warnings.push("Provider/license metadata is incomplete; commercial and attribution review required.");
  context.warnings.push(...warnings);
  return {
    status: errors.length && !measurements.length && !locations.length ? "error" as const : locations.length || measurements.length ? "ready" as const : "empty" as const,
    context,
    fetched: locations.length + sensors.length + measurements.length,
    warnings,
    errors,
  };
}

export function normalizeOpenAqLocation(record: unknown, params?: OpenAqRequestParams): AirQualityLocation | null {
  const item = asRecord(record);
  const coordinates = asRecord(item.coordinates);
  const latitude = numberValue(coordinates.latitude ?? coordinates.lat ?? item.latitude);
  const longitude = numberValue(coordinates.longitude ?? coordinates.lon ?? item.longitude);
  const locationId = stringValue(item.id ?? item.locationId);
  if (!locationId) return null;
  const sensorList = Array.isArray(item.sensors) ? item.sensors : [];
  const parameters = sensorList.map((sensor) => stringValue(asRecord(asRecord(sensor).parameter).name ?? asRecord(sensor).parameter)).filter(Boolean) as string[];
  return {
    locationId,
    locationName: stringValue(item.name ?? item.locality),
    country: stringValue(asRecord(item.country).code ?? item.country),
    latitude,
    longitude,
    timezone: stringValue(item.timezone),
    provider: normalizeRef(item.provider),
    owner: normalizeRef(item.owner),
    license: normalizeLicenseRef(item.license),
    isMobile: Boolean(item.isMobile ?? item.mobile),
    isMonitor: item.isMonitor === undefined ? true : Boolean(item.isMonitor),
    sensorsAvailable: numberValue(item.sensorsCount) ?? sensorList.length,
    parametersAvailable: [...new Set(parameters)],
    bounds: item.bounds,
    distanceKm: typeof params?.lat === "number" && typeof params.lon === "number" && typeof latitude === "number" && typeof longitude === "number"
      ? Number(distanceKm(params.lat, params.lon, latitude, longitude).toFixed(2))
      : numberValue(item.distance) ? Number(((numberValue(item.distance) ?? 0) / 1000).toFixed(2)) : undefined,
  };
}

export function normalizeOpenAqSensor(record: unknown, location?: AirQualityLocation): AirQualitySensor {
  const item = asRecord(record);
  const parameter = asRecord(item.parameter);
  return {
    sensorId: String(item.id ?? item.sensorId ?? ""),
    locationId: stringValue(asRecord(item.location).id ?? item.locationId) ?? location?.locationId,
    parameter: stringValue(parameter.name ?? parameter.displayName ?? item.parameter),
    unit: stringValue(asRecord(item.unit).symbol ?? asRecord(item.parameter).units ?? item.unit),
    provider: normalizeRef(item.provider ?? location?.provider),
    status: stringValue(item.status),
  };
}

export function normalizeOpenAqLatestMeasurement(record: unknown, params?: OpenAqRequestParams, location?: AirQualityLocation): AirQualityMeasurement | null {
  const item = asRecord(record);
  const parameter = asRecord(item.parameter);
  const coordinates = asRecord(item.coordinates);
  const date = asRecord(item.date);
  const period = asRecord(item.period);
  const observedAt = stringValue(asRecord(item.datetime).utc ?? asRecord(item.datetime).local ?? date.utc ?? item.date ?? asRecord(period.datetimeFrom).utc);
  const name = stringValue(parameter.name ?? parameter.displayName ?? item.parameter);
  if (!name) return null;
  return {
    locationId: stringValue(asRecord(item.location).id ?? item.locationId) ?? location?.locationId ?? params?.locationId,
    sensorId: stringValue(asRecord(item.sensor).id ?? item.sensorId),
    parameter: name.toLowerCase(),
    value: numberValue(item.value) ?? null,
    unit: stringValue(asRecord(item.unit).symbol ?? parameter.units ?? item.unit),
    observedAt,
    stalenessMinutes: stalenessMinutes(observedAt),
    coordinates: {
      latitude: numberValue(coordinates.latitude ?? coordinates.lat) ?? location?.latitude,
      longitude: numberValue(coordinates.longitude ?? coordinates.lon) ?? location?.longitude,
    },
    provider: normalizeRef(item.provider ?? location?.provider),
    owner: normalizeRef(item.owner ?? location?.owner),
    license: normalizeLicenseRef(item.license ?? location?.license),
    sourceName: "OpenAQ",
    qualityFlags: Array.isArray(item.flags) ? item.flags.map(String) : undefined,
  };
}

export function normalizeOpenAqProvider(record: unknown) {
  const item = asRecord(record);
  return { id: item.id as string | number | undefined, name: stringValue(item.name), raw: record };
}

export function normalizeOpenAqLicense(record: unknown) {
  const item = asRecord(record);
  return { id: item.id as string | number | undefined, name: stringValue(item.name), url: stringValue(item.url), attribution: stringValue(item.attribution), raw: record };
}

export function buildOpenAqAirQualityObservationContext(
  params: OpenAqRequestParams,
  locations: AirQualityLocation[],
  measurements: AirQualityMeasurement[],
  sensors: AirQualitySensor[] = [],
  providerLicense: AirQualityProviderLicense = buildProviderLicense([], [], []),
  rawRefs: string[] = []
): AirQualityObservationContext {
  const validation = validateOpenAqRequest(params);
  if (!validation.valid) throw new Error(validation.message);
  const latest = summarizeLatest(measurements);
  const staleData = measurements.some((item) => (item.stalenessMinutes ?? 9999) > 180);
  const missingProviderLicense = measurements.some((item) => !item.provider?.name || !item.license?.name) || providerLicense.licenses.length === 0;
  const riskFactors = {
    elevatedPm25Context: exceeds(latest.pm25, 35),
    elevatedPm10Context: exceeds(latest.pm10, 100),
    ozoneContext: exceeds(latest.o3, 100),
    smokePossibleContext: ["wildfire_smoke_context", "incident_context"].includes(validation.params.purpose) && (exceeds(latest.pm25, 20) || exceeds(latest.pm10, 75)),
    volcanicAshPossibleContext: ["volcanic_ash_context", "dust_haze_context"].includes(validation.params.purpose) && (exceeds(latest.pm10, 75) || exceeds(latest.so2, 20)),
    urbanPollutionContext: validation.params.purpose === "urban_pollution_context" || exceeds(latest.no2, 80) || exceeds(latest.co, 10),
    respiratoryExposureContext: exceeds(latest.pm25, 20) || exceeds(latest.pm10, 75) || exceeds(latest.o3, 100),
    staleData,
    noNearbyLocation: locations.length === 0 && !validation.params.sensorId,
    missingProviderLicense,
    providerDependentReliability: true,
  };
  const score = scoreOpenAqAirQualityContext({ measurements, locations, sensors, riskFactors, providerLicense });
  const generatedAt = new Date().toISOString();
  return {
    sourceId: "openaq",
    sourceName: "OpenAQ",
    purpose: validation.params.purpose,
    generatedAt,
    query: validation.params as AirQualityQuery,
    locations,
    sensors,
    measurements,
    latest,
    providerLicense,
    riskFactors,
    confidence: score.confidence,
    airQualityContextScore: score.airQualityContextScore,
    stalenessMinutes: minNumber(measurements.map((item) => item.stalenessMinutes)),
    limitations: LIMITATIONS,
    warnings: score.caveats,
    caveats: [
      "OpenAQ air quality context is not medical advice, an official health advisory or an evacuation order.",
      "Follow local health or environmental authorities for official air quality advisories.",
      providerLicense.licenseCaveat,
    ],
    evidenceRefs: [],
    rawRefs,
  };
}

export function buildOpenAqEvidence(context: AirQualityObservationContext, params: OpenAqRequestParams): ArgusKnowledgeEvidenceItem {
  const confidence = context.confidence;
  return {
    id: `openaq-evidence-${params.incidentId ?? params.routeAnalysisId ?? params.fenixSimulationId ?? context.query.locationId ?? context.query.sensorId ?? context.generatedAt}`,
    incidentId: params.incidentId,
    sourceId: "openaq",
    sourceName: "OpenAQ",
    title: "OpenAQ air quality observation context",
    url: context.rawRefs[0] ?? OPENAQ_BASE_URL,
    summary: buildOpenAqExcerpt(context),
    quote: buildOpenAqExcerpt(context),
    confidenceScore: {
      sourceReliability: 84,
      corroborationCount: Math.max(1, context.locations.length),
      geolocationPrecision: context.locations.length ? 86 : 60,
      timestampPrecision: context.riskFactors.staleData ? 50 : 84,
      documentQuality: context.riskFactors.missingProviderLicense ? 62 : 82,
      extractionConfidence: 90,
      conflictWithOtherSources: 0,
      finalConfidence: confidence,
      label: confidence >= 80 ? "high" : confidence >= 60 ? "medium" : "low",
    },
    locationConfidence: context.locations.length ? 0.86 : 0.5,
    timestampConfidence: context.riskFactors.staleData ? 0.5 : 0.84,
    extractedAt: context.generatedAt,
    conflicts: [],
  };
}

export function buildOpenAqExcerpt(context: AirQualityObservationContext) {
  const parts = ["pm25", "pm10", "o3", "no2", "so2", "co"].map((key) => labelValue((context.latest as Record<string, unknown>)[key], key.toUpperCase())).filter(Boolean);
  const location = context.locations[0];
  return `OpenAQ air quality context near ${location?.locationName ?? location?.locationId ?? context.query.locationId ?? "controlled query"}: ${parts.join(", ") || "latest measurements unavailable"}. Staleness ${context.stalenessMinutes ?? "n/a"} min. Provider/license metadata is provider-dependent; not an official health alert or medical advice.`;
}

export function scoreOpenAqAirQualityContext(input: AirQualityObservationContext | { measurements: AirQualityMeasurement[]; locations: AirQualityLocation[]; sensors: AirQualitySensor[]; riskFactors: AirQualityObservationContext["riskFactors"]; providerLicense: AirQualityProviderLicense }) {
  let score = 58;
  if (input.measurements.some((item) => item.parameter === "pm25")) score += 10;
  if (input.measurements.some((item) => item.parameter === "pm10")) score += 8;
  if (input.measurements.some((item) => ["o3", "no2", "so2", "co"].includes(item.parameter))) score += 6;
  if (input.locations.length >= 2) score += 5;
  if (input.sensors.some((item) => item.status?.toLowerCase().includes("active"))) score += 2;
  if (input.riskFactors.staleData) score -= 18;
  if (input.riskFactors.missingProviderLicense) score -= 12;
  if (input.locations.some((item) => item.isMobile)) score -= 4;
  const confidence = Math.max(35, Math.min(90, score));
  return {
    confidence,
    airQualityContextScore: confidence,
    respiratoryExposureContext: input.riskFactors.respiratoryExposureContext,
    smokeContextConfidence: input.riskFactors.smokePossibleContext ? Math.max(40, confidence - 8) : 35,
    caveats: [
      ...(input.riskFactors.staleData ? ["OpenAQ latest measurement is stale."] : []),
      ...(input.riskFactors.missingProviderLicense ? ["Provider/license metadata incomplete; attribution and commercial use require review."] : []),
      "OpenAQ is context only and does not diagnose, order evacuation or confirm smoke causality.",
    ],
  };
}

export function getOpenAqAdapterStatus() {
  const keyStatus = getOpenAqApiKeyStatus();
  return {
    adapterId: "openAqAdapter",
    sourceId: "openaq",
    status: keyStatus.apiKeyConfigured ? "active_contextual" as const : "requiresConfiguration" as const,
    ready: keyStatus.apiKeyConfigured,
    requiresApiKey: true,
    apiKeyConfigured: keyStatus.apiKeyConfigured,
    requiresConfiguration: !keyStatus.apiKeyConfigured,
    envVar: "OPENAQ_API_KEY",
    accessType: "api_json_requires_key",
    sourceRole: "air_quality_observation_source",
    isIncidentSource: false,
    officialSource: false,
    aggregatorSource: true,
    providerDependentReliability: true,
    licenseStatus: "provider_dependent",
    commercialUse: "check_license_per_provider",
    mapLayer: {
      id: "openaq-air-quality-observations",
      name: "OpenAQ Air Quality Observations",
      layerType: "air_quality_observation_context",
      isIncidentLayer: false,
      defaultVisible: false,
      requiresConfiguration: true,
      noBulkGlobal: true,
      providerLicenseRequired: true,
      sublayers: ["PM2.5", "PM10", "Ozone", "NO2", "SO2", "CO", "Sensor Locations", "Smoke/Aerosol Context"],
    },
    phase1Capabilities: ["locations", "sensors", "latest measurements", "parameters", "providers", "owners", "licenses", "KnowledgeEvidence air_quality_observation_context"],
    phase2Planned: ["hourly/recent measurements", "wildfire smoke correlation with FIRMS", "volcano/dust/haze correlation with EONET/GDACS", "NAV air exposure routing", "AURA respiratory guidance layer"],
    capabilities: ["locationId", "sensorId", "lat_lon_radius", "bbox", "latest_measurements", "provider_license_metadata", "map_layer:openaq_air_quality_observations"],
    limitations: LIMITATIONS,
    message: keyStatus.message,
  };
}

async function fetchOpenAqList(endpoint: string, key: string) {
  const keyStatus = getOpenAqApiKeyStatus();
  if (!keyStatus.apiKeyConfigured) return { status: "requiresConfiguration" as const, fetched: 0, endpoint, records: [], warnings: [keyStatus.message], errors: [], key };
  const result = await fetchJson(endpoint);
  const records = Array.isArray(asRecord(result.data).results) ? asRecord(result.data).results as unknown[] : [];
  return { status: result.status, fetched: records.length, endpoint, records, warnings: result.warnings, errors: result.errors, key };
}

async function fetchOpenAqRecord(endpoint: string, key: string) {
  const keyStatus = getOpenAqApiKeyStatus();
  if (!keyStatus.apiKeyConfigured) return { status: "requiresConfiguration" as const, fetched: 0, endpoint, record: null, warnings: [keyStatus.message], errors: [], key };
  const result = await fetchJson(endpoint);
  const records = Array.isArray(asRecord(result.data).results) ? asRecord(result.data).results as unknown[] : [];
  return { status: result.status, fetched: records.length ? 1 : 0, endpoint, record: records[0] ?? null, warnings: result.warnings, errors: result.errors, key };
}

async function fetchJson(endpoint: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, { cache: "no-store", headers: buildOpenAqHeaders(), signal: controller.signal });
    if (response.status === 429) return { status: "rateLimited" as const, data: null, warnings: ["OpenAQ rate limited request; retry with backoff."], errors: [] };
    if (!response.ok) return { status: "error" as const, data: null, warnings: [], errors: [`OpenAQ responded ${response.status}`] };
    const data = await response.json();
    const records = Array.isArray(asRecord(data).results) ? asRecord(data).results as unknown[] : [];
    return { status: records.length ? "ready" as const : "empty" as const, data, warnings: [], errors: [] };
  } catch (error) {
    return { status: "error" as const, data: null, warnings: [], errors: [error instanceof Error ? error.message : "OpenAQ fetch failed"] };
  } finally {
    clearTimeout(timeout);
  }
}

function commonSearch(params: OpenAqRequestParams) {
  const search = new URLSearchParams();
  search.set("limit", String(params.limit ?? 20));
  if (params.page) search.set("page", String(params.page));
  const parameters = list(params.parameters);
  if (parameters.length) search.set("parameters", parameters.join(","));
  if (params.providers && list(params.providers).length) search.set("providers", list(params.providers).join(","));
  if (params.owners && list(params.owners).length) search.set("owners", list(params.owners).join(","));
  if (params.licenses && list(params.licenses).length) search.set("licenses", list(params.licenses).join(","));
  return search;
}

function buildProviderLicense(providers: unknown[], owners: unknown[], licenses: unknown[]): AirQualityProviderLicense {
  return {
    providers: providers.map(normalizeOpenAqProvider),
    owners: owners.map(normalizeOpenAqProvider),
    licenses: licenses.map(normalizeOpenAqLicense),
    attributionRequired: true,
    commercialUseStatus: "check_license_per_provider",
    licenseCaveat: "OpenAQ provider/license metadata varies by location; check provider license, attribution, redistribution and commercial-use terms before operational or commercial reuse.",
  };
}

function summarizeLatest(measurements: AirQualityMeasurement[]) {
  const latest: AirQualityObservationContext["latest"] = {};
  for (const parameter of PARAMETER_WHITELIST) {
    const records = measurements.filter((item) => item.parameter === parameter && typeof item.value === "number");
    if (records.length) latest[parameter] = records.sort((a, b) => (a.stalenessMinutes ?? 9999) - (b.stalenessMinutes ?? 9999))[0].value;
  }
  const newest = measurements.filter((item) => item.observedAt).sort((a, b) => new Date(b.observedAt ?? 0).getTime() - new Date(a.observedAt ?? 0).getTime())[0];
  latest.observedAt = newest?.observedAt;
  latest.worstParameter = ["pm25", "pm10", "o3", "no2", "so2", "co"].find((key) => latest[key] !== undefined);
  return latest;
}

function invalid(message: string) {
  return { valid: false as const, status: "invalidRequest" as const, message, errors: [message] };
}

function normalizePurpose(purpose?: OpenAqPurpose | string): OpenAqPurpose {
  return SUPPORTED_PURPOSES.includes(purpose as OpenAqPurpose) ? purpose as OpenAqPurpose : "general";
}

function list(value?: string[] | string) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function isValidBbox(value: string) {
  const [minLon, minLat, maxLon, maxLat] = value.split(",").map(Number);
  return [minLon, minLat, maxLon, maxLat].every(Number.isFinite) && minLon >= -180 && maxLon <= 180 && minLat >= -90 && maxLat <= 90 && minLon < maxLon && minLat < maxLat;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeRef(value: unknown) {
  const item = asRecord(value);
  if (!Object.keys(item).length) return undefined;
  return { id: item.id as string | number | undefined, name: stringValue(item.name ?? item.label) };
}

function normalizeLicenseRef(value: unknown) {
  const item = asRecord(value);
  if (!Object.keys(item).length) return undefined;
  return { id: item.id as string | number | undefined, name: stringValue(item.name), url: stringValue(item.url) };
}

function stalenessMinutes(value?: string) {
  if (!value) return undefined;
  const observed = new Date(value).getTime();
  return Number.isFinite(observed) ? Math.max(0, Math.round((Date.now() - observed) / 60_000)) : undefined;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function deg2rad(value: number) {
  return value * (Math.PI / 180);
}

function exceeds(value: unknown, threshold: number) {
  return typeof value === "number" && value >= threshold;
}

function minNumber(values: Array<number | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number");
  return valid.length ? Math.min(...valid) : undefined;
}

function labelValue(value: unknown, label: string) {
  return value === undefined || value === null || value === "" ? "" : `${label} ${value}`;
}

function emptyResult(key: string) {
  return { status: "empty" as const, fetched: 0, endpoint: "", records: [], warnings: [], errors: [], key };
}
