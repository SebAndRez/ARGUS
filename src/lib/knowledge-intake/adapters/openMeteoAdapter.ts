import type { ArgusKnowledgeEvidenceItem } from "@/types/knowledgeIntake";

export type OpenMeteoPurpose =
  | "general"
  | "wildfire"
  | "flood"
  | "nav"
  | "aura"
  | "fenix"
  | "incident_context"
  | "citizen_report_context";

export type OpenMeteoRequestParams = {
  lat?: number;
  lon?: number;
  forecastDays?: number;
  purpose?: OpenMeteoPurpose | string;
  incidentId?: string;
  sourceIncidentId?: string;
  persist?: boolean;
  timezone?: string;
  units?: "metric";
  includeHourly?: boolean;
  includeDaily?: boolean;
};

export type OpenMeteoRiskFactors = {
  highWind: boolean;
  strongGusts: boolean;
  heavyRain: boolean;
  precipitationRisk: boolean;
  snowRisk: boolean;
  lowVisibility: boolean;
  heatStress: boolean;
  coldStress: boolean;
  wildfireWeather: boolean;
  floodWeather: boolean;
  navWeatherRisk: boolean;
  auraMedicalWeatherRisk: boolean;
};

export type OpenMeteoWeatherContext = {
  id: string;
  sourceId: "open-meteo";
  sourceName: "Open-Meteo";
  latitude: number;
  longitude: number;
  timezone?: string;
  forecastDays: number;
  purpose: OpenMeteoPurpose;
  generatedAt: string;
  hourlySummary: Record<string, number | string | null>;
  dailySummary: Record<string, number | string | null>;
  riskFactors: OpenMeteoRiskFactors;
  rawForecastRef: string;
  metadata: Record<string, unknown>;
};

type OpenMeteoForecastResponse = {
  latitude?: number;
  longitude?: number;
  timezone?: string;
  hourly?: Record<string, unknown[]>;
  daily?: Record<string, unknown[]>;
  hourly_units?: Record<string, string>;
  daily_units?: Record<string, string>;
  generationtime_ms?: number;
};

type ValidationResult =
  | { valid: true; params: Required<Pick<OpenMeteoRequestParams, "lat" | "lon" | "forecastDays" | "timezone" | "includeHourly" | "includeDaily">> & OpenMeteoRequestParams & { purpose: OpenMeteoPurpose } }
  | { valid: false; status: "invalidRequest"; message: string; errors: string[] };

const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast";
const REQUEST_TIMEOUT_MS = 12_000;
const SUPPORTED_PURPOSES: OpenMeteoPurpose[] = [
  "general",
  "wildfire",
  "flood",
  "nav",
  "aura",
  "fenix",
  "incident_context",
  "citizen_report_context",
];

const HOURLY_VARIABLES = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "precipitation",
  "precipitation_probability",
  "rain",
  "showers",
  "snowfall",
  "weather_code",
  "cloud_cover",
  "visibility",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
];

const DAILY_VARIABLES = [
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "rain_sum",
  "snowfall_sum",
  "precipitation_hours",
  "wind_speed_10m_max",
  "wind_gusts_10m_max",
];

export function getOpenMeteoVariablesForPurpose(purpose: OpenMeteoPurpose | string = "general") {
  const normalized = normalizePurpose(purpose);
  if (normalized === "wildfire") {
    return {
      hourly: ["temperature_2m", "relative_humidity_2m", "precipitation", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "cloud_cover"],
      daily: ["temperature_2m_max", "temperature_2m_min", "precipitation_sum", "wind_speed_10m_max", "wind_gusts_10m_max"],
    };
  }
  if (normalized === "flood") {
    return {
      hourly: ["precipitation", "precipitation_probability", "rain", "showers", "snowfall", "weather_code"],
      daily: ["precipitation_sum", "rain_sum", "snowfall_sum", "precipitation_hours"],
    };
  }
  if (normalized === "nav") {
    return {
      hourly: ["visibility", "precipitation", "rain", "snowfall", "wind_speed_10m", "wind_gusts_10m", "temperature_2m"],
      daily: ["precipitation_sum", "snowfall_sum", "wind_speed_10m_max", "wind_gusts_10m_max"],
    };
  }
  if (normalized === "aura") {
    return {
      hourly: ["temperature_2m", "apparent_temperature", "relative_humidity_2m", "visibility", "wind_speed_10m", "wind_gusts_10m"],
      daily: ["temperature_2m_max", "temperature_2m_min", "precipitation_sum"],
    };
  }
  return { hourly: HOURLY_VARIABLES, daily: DAILY_VARIABLES };
}

export function validateOpenMeteoRequest(params: OpenMeteoRequestParams): ValidationResult {
  if (typeof params.lat !== "number" || typeof params.lon !== "number" || !Number.isFinite(params.lat) || !Number.isFinite(params.lon)) {
    return { valid: false, status: "invalidRequest", message: "lat/lon required for Open-Meteo weather context", errors: ["lat/lon required for Open-Meteo weather context"] };
  }
  if (params.lat < -90 || params.lat > 90) {
    return { valid: false, status: "invalidRequest", message: "lat must be between -90 and 90", errors: ["lat must be between -90 and 90"] };
  }
  if (params.lon < -180 || params.lon > 180) {
    return { valid: false, status: "invalidRequest", message: "lon must be between -180 and 180", errors: ["lon must be between -180 and 180"] };
  }
  const forecastDays = Math.trunc(params.forecastDays ?? 3);
  if (forecastDays < 1 || forecastDays > 3) {
    return { valid: false, status: "invalidRequest", message: "forecastDays must be between 1 and 3 for this phase", errors: ["forecastDays must be between 1 and 3 for this phase"] };
  }
  const purpose = normalizePurpose(params.purpose);
  if (params.persist && !params.incidentId && !params.sourceIncidentId && !purpose) {
    return { valid: false, status: "invalidRequest", message: "persist=true requires incidentId, sourceIncidentId or clear purpose", errors: ["persist=true requires incidentId, sourceIncidentId or clear purpose"] };
  }
  return {
    valid: true,
    params: {
      ...params,
      lat: params.lat,
      lon: params.lon,
      forecastDays,
      purpose,
      timezone: params.timezone ?? "auto",
      includeHourly: params.includeHourly ?? true,
      includeDaily: params.includeDaily ?? true,
      persist: params.persist ?? false,
      units: "metric",
    },
  };
}

export async function fetchOpenMeteoForecast(params: OpenMeteoRequestParams) {
  const validation = validateOpenMeteoRequest(params);
  if (!validation.valid) return { ...validation, fetched: 0, response: null, endpoint: null };
  const endpoint = buildOpenMeteoUrl(validation.params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`);
    const data = (await response.json()) as OpenMeteoForecastResponse;
    return { status: hasForecastData(data) ? "ready" as const : "empty" as const, fetched: hasForecastData(data) ? 1 : 0, response: data, endpoint, warnings: [], errors: [] };
  } catch (error) {
    return { status: "error" as const, fetched: 0, response: null, endpoint, warnings: [], errors: [error instanceof Error ? error.message : "Open-Meteo fetch failed"] };
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeOpenMeteoForecast(response: OpenMeteoForecastResponse, params: OpenMeteoRequestParams) {
  return buildOpenMeteoWeatherContext(response, params);
}

export function buildOpenMeteoWeatherContext(response: OpenMeteoForecastResponse, params: OpenMeteoRequestParams): OpenMeteoWeatherContext {
  const validation = validateOpenMeteoRequest(params);
  if (!validation.valid) throw new Error(validation.message);
  const input = validation.params;
  const hourlySummary = summarizeHourly(response.hourly);
  const dailySummary = summarizeDaily(response.daily);
  const riskFactors = deriveRiskFactors(hourlySummary, dailySummary, input.purpose);
  const generatedAt = new Date().toISOString();
  return {
    id: `open-meteo-${input.lat.toFixed(4)}-${input.lon.toFixed(4)}-${input.forecastDays}d-${input.purpose}-${Date.now()}`,
    sourceId: "open-meteo",
    sourceName: "Open-Meteo",
    latitude: input.lat,
    longitude: input.lon,
    timezone: response.timezone ?? input.timezone,
    forecastDays: input.forecastDays,
    purpose: input.purpose,
    generatedAt,
    hourlySummary,
    dailySummary,
    riskFactors,
    rawForecastRef: buildOpenMeteoUrl(input),
    metadata: {
      sourceUrl: OPEN_METEO_BASE_URL,
      sourceRole: "weather_context",
      evidenceType: "weather_context",
      licenseStatus: "nonCommercialFree",
      commercialUse: "requiresReview",
      institutionalUse: "requiresReview",
      officialSource: false,
      alertSource: false,
      layer: {
        id: "open-meteo-weather-context",
        label: "Open-Meteo Weather Context",
        layerType: "weather_context_overlay",
        isIncidentLayer: false,
      },
      consumers: ["ARGUS Risk / Predictive Engine", "ARGUS Fenix Twin", "ARGUS NAV / Routing Intelligence", "AURA Medic Mesh"],
      limitations: [
        "Context only; not an official weather alert source.",
        "Do not create incidents, route closures, evacuation orders or critical decisions from Open-Meteo alone.",
      ],
      units: { hourly: response.hourly_units, daily: response.daily_units },
      generationtimeMs: response.generationtime_ms,
    },
  };
}

export function buildOpenMeteoEvidence(context: OpenMeteoWeatherContext, params: OpenMeteoRequestParams): ArgusKnowledgeEvidenceItem {
  return {
    id: `open-meteo-evidence-${params.incidentId ?? params.sourceIncidentId ?? context.id}`,
    incidentId: params.incidentId,
    sourceId: "open-meteo",
    sourceName: "Open-Meteo",
    title: "Open-Meteo weather context",
    url: context.rawForecastRef,
    summary: buildWeatherExcerpt(context),
    quote: buildWeatherExcerpt(context),
    confidenceScore: {
      sourceReliability: 86,
      corroborationCount: 1,
      geolocationPrecision: 92,
      timestampPrecision: 86,
      documentQuality: 82,
      extractionConfidence: 90,
      conflictWithOtherSources: 0,
      finalConfidence: 84,
      label: "medium",
    },
    locationConfidence: 0.92,
    timestampConfidence: 0.86,
    extractedAt: context.generatedAt,
    conflicts: [],
  };
}

export function buildWeatherExcerpt(context: OpenMeteoWeatherContext) {
  const flags = Object.entries(context.riskFactors).filter(([, active]) => active).map(([key]) => key);
  const temp = labelValue(context.hourlySummary.temperatureAvgC, "avg temp C");
  const rain = labelValue(context.dailySummary.precipitationSumMm, "precip mm");
  const wind = labelValue(context.hourlySummary.windSpeedMaxKmh, "max wind km/h");
  return `Open-Meteo ${context.forecastDays}d context near ${context.latitude.toFixed(4)}, ${context.longitude.toFixed(4)}: ${[temp, rain, wind].filter(Boolean).join(", ") || "forecast available"}. Risk factors: ${flags.length ? flags.join(", ") : "none elevated"}.`;
}

export function getOpenMeteoAdapterStatus() {
  return {
    adapterId: "openMeteoAdapter",
    sourceId: "open-meteo",
    status: "ready" as const,
    requiresApiKey: false,
    requiresConfiguration: false,
    licenseStatus: "nonCommercialFree",
    commercialUse: "requiresReview",
    institutionalUse: "requiresReview",
    role: "weather_context",
    globalCoverage: true,
    alertSource: false,
    officialSource: false,
    mapLayer: "Open-Meteo Weather Context",
    layerType: "weather_context_overlay",
    isIncidentLayer: false,
    capabilities: ["forecast_by_coordinate", "weather_context", "risk_factors", "no_api_key", "map_layer:open_meteo_weather_context"],
    limitations: [
      "Not an official alert source.",
      "No global bulk ingestion.",
      "No incident creation by default.",
      "Commercial or institutional use requires review.",
    ],
    message: "Open-Meteo forecast is available as no-key global weather context by coordinate.",
  };
}

function normalizePurpose(purpose?: OpenMeteoPurpose | string): OpenMeteoPurpose {
  return SUPPORTED_PURPOSES.includes(purpose as OpenMeteoPurpose) ? purpose as OpenMeteoPurpose : "general";
}

function buildOpenMeteoUrl(params: OpenMeteoRequestParams & { lat: number; lon: number; forecastDays: number; purpose: OpenMeteoPurpose; timezone: string; includeHourly: boolean; includeDaily: boolean }) {
  const variables = getOpenMeteoVariablesForPurpose(params.purpose);
  const search = new URLSearchParams({
    latitude: String(params.lat),
    longitude: String(params.lon),
    timezone: params.timezone,
    forecast_days: String(params.forecastDays),
  });
  if (params.includeHourly) search.set("hourly", variables.hourly.join(","));
  if (params.includeDaily) search.set("daily", variables.daily.join(","));
  return `${OPEN_METEO_BASE_URL}?${search.toString()}`;
}

function hasForecastData(response: OpenMeteoForecastResponse) {
  return Boolean(Object.keys(response.hourly ?? {}).length || Object.keys(response.daily ?? {}).length);
}

function numericValues(value: unknown[] | undefined) {
  return (value ?? []).map(Number).filter(Number.isFinite);
}

function max(values: number[]) {
  return values.length ? Math.max(...values) : null;
}

function min(values: number[]) {
  return values.length ? Math.min(...values) : null;
}

function sum(values: number[]) {
  return values.length ? Number(values.reduce((total, value) => total + value, 0).toFixed(2)) : null;
}

function avg(values: number[]) {
  return values.length ? Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(2)) : null;
}

function summarizeHourly(hourly?: Record<string, unknown[]>) {
  return {
    timeStart: String(hourly?.time?.[0] ?? ""),
    timeEnd: String(hourly?.time?.[(hourly.time?.length ?? 1) - 1] ?? ""),
    temperatureAvgC: avg(numericValues(hourly?.temperature_2m)),
    apparentTemperatureMaxC: max(numericValues(hourly?.apparent_temperature)),
    apparentTemperatureMinC: min(numericValues(hourly?.apparent_temperature)),
    humidityMinPct: min(numericValues(hourly?.relative_humidity_2m)),
    precipitationMaxMm: max(numericValues(hourly?.precipitation)),
    precipitationProbabilityMaxPct: max(numericValues(hourly?.precipitation_probability)),
    rainMaxMm: max(numericValues(hourly?.rain)),
    showersMaxMm: max(numericValues(hourly?.showers)),
    snowfallMaxCm: max(numericValues(hourly?.snowfall)),
    cloudCoverAvgPct: avg(numericValues(hourly?.cloud_cover)),
    visibilityMinM: min(numericValues(hourly?.visibility)),
    windSpeedMaxKmh: max(numericValues(hourly?.wind_speed_10m)),
    windDirectionDominantDeg: avg(numericValues(hourly?.wind_direction_10m)),
    windGustsMaxKmh: max(numericValues(hourly?.wind_gusts_10m)),
    weatherCodeMax: max(numericValues(hourly?.weather_code)),
  };
}

function summarizeDaily(daily?: Record<string, unknown[]>) {
  return {
    dateStart: String(daily?.time?.[0] ?? ""),
    dateEnd: String(daily?.time?.[(daily.time?.length ?? 1) - 1] ?? ""),
    temperatureMaxC: max(numericValues(daily?.temperature_2m_max)),
    temperatureMinC: min(numericValues(daily?.temperature_2m_min)),
    precipitationSumMm: sum(numericValues(daily?.precipitation_sum)),
    rainSumMm: sum(numericValues(daily?.rain_sum)),
    snowfallSumCm: sum(numericValues(daily?.snowfall_sum)),
    precipitationHours: sum(numericValues(daily?.precipitation_hours)),
    windSpeedMaxKmh: max(numericValues(daily?.wind_speed_10m_max)),
    windGustsMaxKmh: max(numericValues(daily?.wind_gusts_10m_max)),
  };
}

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function deriveRiskFactors(hourly: Record<string, number | string | null>, daily: Record<string, number | string | null>, purpose: OpenMeteoPurpose): OpenMeteoRiskFactors {
  const wind = Math.max(asNumber(hourly.windSpeedMaxKmh) ?? 0, asNumber(daily.windSpeedMaxKmh) ?? 0);
  const gust = Math.max(asNumber(hourly.windGustsMaxKmh) ?? 0, asNumber(daily.windGustsMaxKmh) ?? 0);
  const rain = Math.max(asNumber(hourly.rainMaxMm) ?? 0, asNumber(daily.rainSumMm) ?? 0);
  const precipitation = Math.max(asNumber(hourly.precipitationMaxMm) ?? 0, asNumber(daily.precipitationSumMm) ?? 0);
  const precipitationProbability = asNumber(hourly.precipitationProbabilityMaxPct) ?? 0;
  const snowfall = Math.max(asNumber(hourly.snowfallMaxCm) ?? 0, asNumber(daily.snowfallSumCm) ?? 0);
  const visibility = asNumber(hourly.visibilityMinM) ?? 99_999;
  const apparentMax = asNumber(hourly.apparentTemperatureMaxC) ?? asNumber(daily.temperatureMaxC) ?? 0;
  const apparentMin = asNumber(hourly.apparentTemperatureMinC) ?? asNumber(daily.temperatureMinC) ?? 99;
  const humidityMin = asNumber(hourly.humidityMinPct) ?? 100;
  const highWind = wind >= 40;
  const strongGusts = gust >= 55;
  const heavyRain = precipitation >= 25 || rain >= 20;
  const precipitationRisk = precipitationProbability >= 60 || precipitation >= 10;
  const snowRisk = snowfall >= 1;
  const lowVisibility = visibility <= 2_000;
  const heatStress = apparentMax >= 32;
  const coldStress = apparentMin <= 0;
  const wildfireWeather = (purpose === "wildfire" || purpose === "fenix" || purpose === "incident_context") && (highWind || strongGusts) && humidityMin <= 35 && precipitation < 2;
  const floodWeather = (purpose === "flood" || purpose === "incident_context" || purpose === "fenix") && (heavyRain || precipitation >= 20);
  const navWeatherRisk = ["nav", "incident_context", "citizen_report_context", "fenix"].includes(purpose) && (lowVisibility || heavyRain || snowRisk || highWind || coldStress);
  const auraMedicalWeatherRisk = ["aura", "incident_context", "citizen_report_context"].includes(purpose) && (heatStress || coldStress || lowVisibility || strongGusts);
  return { highWind, strongGusts, heavyRain, precipitationRisk, snowRisk, lowVisibility, heatStress, coldStress, wildfireWeather, floodWeather, navWeatherRisk, auraMedicalWeatherRisk };
}

function labelValue(value: number | string | null | undefined, label: string) {
  return value === null || value === undefined || value === "" ? "" : `${label} ${value}`;
}
