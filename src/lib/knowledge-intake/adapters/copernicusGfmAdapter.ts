import type { ArgusIncidentKnowledge, ArgusKnowledgeEvidenceItem } from "@/types/knowledgeIntake";
import type { ObservedFloodExtentContext } from "@/types/copernicusFlood";

export type CopernicusGfmParams = {
  aoiId?: string;
  productId?: string;
  lat?: number;
  lon?: number;
  bbox?: string;
  since?: string;
  until?: string;
  incidentId?: string;
  routeAnalysisId?: string;
  fenixSimulationId?: string;
  persist?: boolean;
  createIncident?: boolean;
  updateExisting?: boolean;
  includeGeometry?: boolean;
  includeRaster?: boolean;
  includeAffectedPopulation?: boolean;
  includeAffectedLandcover?: boolean;
  includeMetadata?: boolean;
};

const LIMITATIONS = [
  "GFM is satellite observation dependent on Sentinel acquisition and processing, not a continuous live sensor.",
  "Flood extent can have false positives/negatives and advisory/exclusion caveats.",
  "No victim, damage, route closure or evacuation confirmation is created by GFM alone.",
  "Raster downloads are not performed by default in phase 1.",
];

export function getGfmConfigStatus() {
  const configured = Boolean(process.env.COPERNICUS_GFM_ACCESS_TOKEN?.trim());
  return {
    status: configured ? "configured" as const : "requiresConfiguration" as const,
    sourceId: "copernicus-gfm",
    requiresApiKey: true,
    requiresConfiguration: !configured,
    envVars: ["COPERNICUS_GFM_API_BASE", "COPERNICUS_GFM_ACCESS_TOKEN"],
    message: configured ? "Copernicus GFM token is configured." : "Copernicus GFM access token is required for satellite flood observation access.",
  };
}

export function buildGfmHeaders(): Record<string, string> {
  const token = process.env.COPERNICUS_GFM_ACCESS_TOKEN?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function validateGfmRequest(params: CopernicusGfmParams) {
  if (!hasLocation(params)) return invalid("point, bbox, AOI, productId or linked incident/simulation/route required for Copernicus flood context");
  if ((params.lat === undefined) !== (params.lon === undefined)) return invalid("lat and lon must be provided together");
  if (params.lat !== undefined && (params.lat < -90 || params.lat > 90)) return invalid("lat must be between -90 and 90");
  if (params.lon !== undefined && (params.lon < -180 || params.lon > 180)) return invalid("lon must be between -180 and 180");
  if (params.bbox && !validBbox(params.bbox)) return invalid("bbox must be minLon,minLat,maxLon,maxLat and bounded for phase 1");
  return { valid: true as const, params: { ...params, includeMetadata: params.includeMetadata ?? true, includeGeometry: params.includeGeometry ?? false, includeRaster: params.includeRaster ?? false } };
}

export function buildGfmProductsUrl(params: CopernicusGfmParams = {}) {
  const base = process.env.COPERNICUS_GFM_API_BASE?.trim() || "https://api.gfm.eodc.eu/v2";
  const search = new URLSearchParams();
  if (params.aoiId) search.set("aoi", params.aoiId);
  if (params.productId) search.set("productId", params.productId);
  if (params.bbox) search.set("bbox", params.bbox);
  if (params.since) search.set("since", params.since);
  if (params.until) search.set("until", params.until);
  return `${base.replace(/\/$/, "")}/products?${search.toString()}`;
}

export async function fetchGfmProducts(params: CopernicusGfmParams) {
  const config = getGfmConfigStatus();
  if (config.requiresConfiguration) return { status: "requiresConfiguration" as const, endpoint: buildGfmProductsUrl(params), products: [], warnings: [config.message], errors: [] };
  const endpoint = buildGfmProductsUrl(params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(endpoint, { cache: "no-store", headers: buildGfmHeaders(), signal: controller.signal });
    if (!response.ok) return { status: "error" as const, endpoint, products: [], warnings: [], errors: [`GFM responded ${response.status}`] };
    const data = await response.json();
    const products = Array.isArray(data?.products) ? data.products : Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    return { status: products.length ? "ready" as const : "empty" as const, endpoint, products, warnings: [], errors: [] };
  } catch (error) {
    return { status: "error" as const, endpoint, products: [], warnings: [], errors: [error instanceof Error ? error.message : "GFM fetch failed"] };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchGfmProductMetadata(productId: string) {
  return fetchGfmProducts({ productId });
}
export async function fetchGfmAoiProducts(params: CopernicusGfmParams) {
  return fetchGfmProducts(params);
}
export async function fetchGfmVectorLayer(params: CopernicusGfmParams) {
  return fetchGfmProducts(params);
}
export async function fetchGfmRasterMetadata(params: CopernicusGfmParams) {
  return fetchGfmProducts(params);
}

export function normalizeGfmProduct(product: unknown, params: CopernicusGfmParams = {}) {
  const item = asRecord(product);
  return {
    aoiId: stringValue(item.aoiId ?? item.aoi),
    productId: stringValue(item.productId ?? item.id),
    satellite: stringValue(item.satellite ?? "Sentinel-1"),
    acquisitionTime: stringValue(item.acquisitionTime ?? item.acquisition_time),
    processedTime: stringValue(item.processedTime ?? item.processed_time),
    observedFloodExtentAreaKm2: numberValue(item.observedFloodExtentAreaKm2 ?? item.flood_area_km2),
    observedWaterExtentAreaKm2: numberValue(item.observedWaterExtentAreaKm2),
    maximumFloodExtentAreaKm2: numberValue(item.maximumFloodExtentAreaKm2),
    likelihood: stringValue(item.likelihood),
    advisoryFlags: list(item.advisoryFlags),
    exclusionMask: item.exclusionMask,
    affectedPopulation: params.includeAffectedPopulation ? item.affectedPopulation : undefined,
    affectedLandcover: params.includeAffectedLandcover ? item.affectedLandcover : undefined,
    geometry: params.includeGeometry ? item.geometry : undefined,
    rasterUrl: params.includeRaster ? stringValue(item.rasterUrl ?? item.raster_url) : undefined,
    vectorUrl: stringValue(item.vectorUrl ?? item.vector_url),
    raw: item,
  };
}

export function buildObservedFloodExtentContext(params: CopernicusGfmParams, normalized: ReturnType<typeof normalizeGfmProduct>[] = []): ObservedFloodExtentContext {
  const product = normalized[0];
  const confidence = scoreGfmObservedFloodExtent(product);
  return {
    sourceId: "copernicus-gfm",
    sourceName: "Copernicus GFM",
    query: params as Record<string, unknown>,
    aoiId: product?.aoiId ?? params.aoiId,
    productId: product?.productId ?? params.productId,
    satellite: product?.satellite,
    acquisitionTime: product?.acquisitionTime,
    processedTime: product?.processedTime,
    observedFloodExtentAreaKm2: product?.observedFloodExtentAreaKm2,
    observedWaterExtentAreaKm2: product?.observedWaterExtentAreaKm2,
    maximumFloodExtentAreaKm2: product?.maximumFloodExtentAreaKm2,
    likelihood: product?.likelihood,
    advisoryFlags: product?.advisoryFlags ?? [],
    exclusionMask: product?.exclusionMask,
    affectedPopulation: product?.affectedPopulation,
    affectedLandcover: product?.affectedLandcover,
    geometry: product?.geometry,
    rasterUrl: product?.rasterUrl,
    vectorUrl: product?.vectorUrl,
    confidence,
    staleness: stalenessHours(product?.acquisitionTime),
    limitations: LIMITATIONS,
    caveats: ["Observed satellite flood extent is not a perfect map and is not an official road closure or evacuation order."],
    requiresReview: !shouldCreateObservedFloodIncident({ confidence, advisoryFlags: product?.advisoryFlags ?? [], observedFloodExtentAreaKm2: product?.observedFloodExtentAreaKm2 }),
    evidenceRefs: [],
  };
}

export function buildGfmEvidence(context: ObservedFloodExtentContext, params: CopernicusGfmParams): ArgusKnowledgeEvidenceItem {
  return evidence("copernicus-gfm", "Copernicus GFM", `copernicus-gfm-${params.incidentId ?? context.productId ?? context.aoiId ?? Date.now()}`, params.incidentId, "Copernicus GFM observed flood extent context", `GFM observed flood extent context for product ${context.productId ?? "n/a"}; satellite observation caveats apply.`, context.confidence);
}

export function scoreGfmObservedFloodExtent(product?: { observedFloodExtentAreaKm2?: number; advisoryFlags?: string[] }) {
  let score = 68;
  if ((product?.observedFloodExtentAreaKm2 ?? 0) > 0) score += 12;
  if (product?.advisoryFlags?.length) score -= 15;
  return Math.max(35, Math.min(90, score));
}

export function shouldCreateObservedFloodIncident(input: { confidence?: number; advisoryFlags?: string[]; observedFloodExtentAreaKm2?: number }) {
  return (input.confidence ?? 0) >= 75 && (input.observedFloodExtentAreaKm2 ?? 0) > 0 && !(input.advisoryFlags ?? []).length;
}

export function buildGfmIncidentPayload(context: ObservedFloodExtentContext): ArgusIncidentKnowledge {
  const now = new Date().toISOString();
  const id = `copernicus-gfm-flood-${context.productId ?? context.aoiId ?? now}`;
  return {
    id,
    title: "Observed flood extent from Copernicus GFM",
    summary: "Satellite observed flood extent with GFM caveats; verify locally before operational decisions.",
    domain: "flood",
    subtype: "flood_observed",
    severity: "medium",
    confidenceScore: context.confidence,
    actionabilityScore: 50,
    sourceReliabilityScore: 93,
    evidenceCount: 1,
    sourceIds: ["copernicus-gfm"],
    sourceNames: ["Copernicus GFM"],
    occurredAt: context.acquisitionTime,
    detectedAt: context.processedTime,
    technicalFactors: { groupKey: id, sourceRole: "satellite_flood_observation_source", sourceUrl: context.vectorUrl ?? context.rasterUrl, noInventedGeometry: true },
    causes: [],
    contributingFactors: ["satellite_observed_flood_extent"],
    responseActions: ["Review GFM product, advisory flags and local authority reports."],
    lessonsLearned: [],
    recommendedActions: [{ id: `rec-${id}`, audience: "institutional", priority: "medium", text: "Review possible flood impact area with local authorities and field reports.", rationale: "GFM is satellite observation, not an official evacuation or road closure source.", confidenceScore: context.confidence, safetyLimit: "No evacuation order or road closure is generated by ARGUS.", requiresHumanValidation: true }],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["copernicus-gfm", "flood_observed"],
    rawEvidenceRefs: [context.productId ?? id],
    createdAt: now,
    updatedAt: now,
  };
}

export function getGfmAdapterStatus() {
  const config = getGfmConfigStatus();
  return {
    adapterId: "copernicusGfmAdapter",
    sourceId: "copernicus-gfm",
    status: config.requiresConfiguration ? "requiresConfiguration" as const : "active_contextual" as const,
    ready: !config.requiresConfiguration,
    requiresApiKey: true,
    requiresConfiguration: config.requiresConfiguration,
    envVars: config.envVars,
    sourceRole: "satellite_flood_observation_source",
    isObservationSource: true,
    isIncidentSource: true,
    phase1Capabilities: ["observed flood extent", "observed water extent", "maximum flood extent", "affected population/landcover metadata", "KnowledgeEvidence observed_flood_extent_context"],
    mapLayer: { id: "copernicus-gfm-observed-flood-extent", name: "Copernicus GFM Observed Flood Extent", layerType: "observed_flood_extent", isIncidentLayer: true, isObservationLayer: true, defaultVisible: false, requiresConfiguration: true },
    limitations: LIMITATIONS,
    message: config.message,
  };
}

function hasLocation(params: CopernicusGfmParams) {
  return Boolean(params.productId || params.aoiId || (params.lat !== undefined && params.lon !== undefined) || params.bbox || params.incidentId || params.routeAnalysisId || params.fenixSimulationId);
}
function validBbox(value: string) {
  const [minLon, minLat, maxLon, maxLat] = value.split(",").map(Number);
  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) return false;
  return minLon >= -180 && maxLon <= 180 && minLat >= -90 && maxLat <= 90 && minLon < maxLon && minLat < maxLat && (maxLon - minLon) <= 10 && (maxLat - minLat) <= 10;
}
function stalenessHours(value?: string) {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.max(0, Math.round((Date.now() - time) / 3_600_000)) : undefined;
}
function invalid(message: string) {
  return { valid: false as const, status: "invalidRequest" as const, message, errors: [message] };
}
function evidence(sourceId: string, sourceName: string, id: string, incidentId: string | undefined, title: string, summary: string, score: number): ArgusKnowledgeEvidenceItem {
  return { id, incidentId, sourceId, sourceName, title, summary, confidenceScore: { sourceReliability: 93, corroborationCount: 1, geolocationPrecision: 65, timestampPrecision: 75, documentQuality: 70, extractionConfidence: score, conflictWithOtherSources: 0, finalConfidence: score, label: score >= 80 ? "high" : "medium" }, locationConfidence: 0.65, timestampConfidence: 0.75, extractedAt: new Date().toISOString() };
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
function list(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
  return [];
}
