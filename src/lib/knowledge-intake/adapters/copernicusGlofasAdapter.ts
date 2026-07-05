import type { ArgusKnowledgeEvidenceItem } from "@/types/knowledgeIntake";
import type { FloodForecastContext } from "@/types/copernicusFlood";

export type CopernicusGlofasParams = {
  lat?: number;
  lon?: number;
  bbox?: string;
  aoiId?: string;
  date?: string;
  leadTimeDays?: number;
  variable?: string;
  format?: string;
  incidentId?: string;
  routeAnalysisId?: string;
  fenixSimulationId?: string;
  persist?: boolean;
  includeRaw?: boolean;
  includeMetadata?: boolean;
};

const LIMITATIONS = [
  "GloFAS is a model forecast, not observed flooding.",
  "Forecast uncertainty increases with lead time and local hydrology.",
  "No confirmed incident, route closure or evacuation order is created by GloFAS alone.",
  "No global grids or heavy NetCDF/GRIB downloads are performed in phase 1.",
];

export function getGlofasConfigStatus() {
  const configured = Boolean(process.env.COPERNICUS_EWDS_API_KEY?.trim());
  return {
    status: configured ? "configured" as const : "requiresConfiguration" as const,
    sourceId: "copernicus-glofas",
    requiresApiKey: true,
    requiresConfiguration: !configured,
    envVars: ["COPERNICUS_EWDS_API_URL", "COPERNICUS_EWDS_API_KEY", "COPERNICUS_EWDS_USER_ID"],
    message: configured ? "Copernicus EWDS credentials are configured." : "Copernicus EWDS API credentials are required for GloFAS forecast access.",
  };
}

export function validateGlofasRequest(params: CopernicusGlofasParams) {
  if (!hasLocation(params)) return invalid("point, bbox, AOI or linked incident/simulation/route required for Copernicus flood context");
  if ((params.lat === undefined) !== (params.lon === undefined)) return invalid("lat and lon must be provided together");
  if (params.lat !== undefined && (params.lat < -90 || params.lat > 90)) return invalid("lat must be between -90 and 90");
  if (params.lon !== undefined && (params.lon < -180 || params.lon > 180)) return invalid("lon must be between -180 and 180");
  if (params.bbox && !validBbox(params.bbox)) return invalid("bbox must be minLon,minLat,maxLon,maxLat and bounded for phase 1");
  const leadTimeDays = Math.min(Math.max(Math.trunc(params.leadTimeDays ?? 7), 1), 30);
  return { valid: true as const, params: { ...params, leadTimeDays, variable: params.variable ?? "river_discharge", format: params.format ?? "metadata" } };
}

export function buildGlofasRequest(params: CopernicusGlofasParams) {
  const base = process.env.COPERNICUS_EWDS_API_URL?.trim() || "https://ewds.climate.copernicus.eu/api";
  return { url: `${base.replace(/\/$/, "")}/glofas/forecast`, body: { ...params, format: params.format ?? "metadata" } };
}

export async function fetchGlofasForecastMetadata(params: CopernicusGlofasParams) {
  const config = getGlofasConfigStatus();
  if (config.requiresConfiguration) return { status: "requiresConfiguration" as const, records: [], warnings: [config.message], errors: [] };
  const request = buildGlofasRequest(params);
  return { status: "prepared" as const, endpoint: request.url, records: [], warnings: ["GloFAS phase 1 prepares controlled forecast metadata requests; heavy NetCDF/GRIB subset parsing is deferred."], errors: [] };
}

export async function fetchGlofasForecastSubset(params: CopernicusGlofasParams) {
  return fetchGlofasForecastMetadata(params);
}

export function parseGlofasForecastResponse(response: unknown, params: CopernicusGlofasParams) {
  return { response, params };
}

export function normalizeGlofasForecast(data: unknown, params: CopernicusGlofasParams): FloodForecastContext {
  return buildFloodForecastContext(params, data);
}

export function buildFloodForecastContext(params: CopernicusGlofasParams, normalized?: unknown): FloodForecastContext {
  const score = scoreGlofasFloodForecast();
  return {
    sourceId: "copernicus-glofas",
    sourceName: "Copernicus GloFAS",
    query: params as Record<string, unknown>,
    forecastRun: params.date,
    leadTimeDays: params.leadTimeDays ?? 7,
    validDate: params.date,
    location: { lat: params.lat, lon: params.lon },
    bbox: params.bbox,
    forecastConfidence: score,
    modelVersion: "GloFAS metadata/prepared phase 1",
    dataFormat: undefined,
    limitations: LIMITATIONS,
    caveats: ["Forecast/model context only; validate with hydromet authority and local observations.", "Raster/NetCDF processing is deferred to phase 2."],
    confidence: score,
    requiresReview: true,
    evidenceRefs: [],
    ...(typeof normalized === "object" && normalized ? { rawMetadata: normalized } as Record<string, unknown> : {}),
  } as FloodForecastContext;
}

export function buildGlofasEvidence(context: FloodForecastContext, params: CopernicusGlofasParams): ArgusKnowledgeEvidenceItem {
  return evidence("copernicus-glofas", "Copernicus GloFAS", `copernicus-glofas-${params.incidentId ?? params.aoiId ?? params.bbox ?? params.lat ?? context.forecastRun ?? Date.now()}`, params.incidentId, "Copernicus GloFAS flood forecast context", "GloFAS forecast context prepared for controlled AOI/point query; not observed flooding or an evacuation order.", context.confidence);
}

export function scoreGlofasFloodForecast() {
  return 74;
}

export function getGlofasAdapterStatus() {
  const config = getGlofasConfigStatus();
  return {
    adapterId: "copernicusGlofasAdapter",
    sourceId: "copernicus-glofas",
    status: config.requiresConfiguration ? "requiresConfiguration" as const : "active_contextual" as const,
    ready: !config.requiresConfiguration,
    requiresApiKey: true,
    requiresConfiguration: config.requiresConfiguration,
    envVars: config.envVars,
    sourceRole: "global_flood_forecast_source",
    isForecastSource: true,
    isIncidentSource: false,
    phase1Capabilities: ["flood forecast context", "river discharge forecast metadata", "return period/exceedance context prepared", "KnowledgeEvidence flood_forecast_context"],
    mapLayer: { id: "copernicus-glofas-flood-forecast", name: "Copernicus GloFAS Flood Forecast", layerType: "flood_forecast", isIncidentLayer: false, isForecastLayer: true, defaultVisible: false, requiresConfiguration: true },
    limitations: LIMITATIONS,
    message: config.message,
  };
}

function hasLocation(params: CopernicusGlofasParams) {
  return Boolean((params.lat !== undefined && params.lon !== undefined) || params.bbox || params.aoiId || params.incidentId || params.routeAnalysisId || params.fenixSimulationId);
}
function validBbox(value: string) {
  const [minLon, minLat, maxLon, maxLat] = value.split(",").map(Number);
  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) return false;
  return minLon >= -180 && maxLon <= 180 && minLat >= -90 && maxLat <= 90 && minLon < maxLon && minLat < maxLat && (maxLon - minLon) <= 10 && (maxLat - minLat) <= 10;
}
function invalid(message: string) {
  return { valid: false as const, status: "invalidRequest" as const, message, errors: [message] };
}
function evidence(sourceId: string, sourceName: string, id: string, incidentId: string | undefined, title: string, summary: string, score: number): ArgusKnowledgeEvidenceItem {
  return { id, incidentId, sourceId, sourceName, title, summary, confidenceScore: { sourceReliability: 92, corroborationCount: 1, geolocationPrecision: 55, timestampPrecision: 65, documentQuality: 65, extractionConfidence: score, conflictWithOtherSources: 0, finalConfidence: score, label: "medium" }, locationConfidence: 0.55, timestampConfidence: 0.65, extractedAt: new Date().toISOString() };
}
