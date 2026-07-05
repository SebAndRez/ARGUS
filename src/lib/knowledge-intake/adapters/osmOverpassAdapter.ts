import type { ArgusKnowledgeEvidenceItem } from "@/types/knowledgeIntake";
import type {
  CriticalInfrastructureContext,
  OsmElementType,
  OsmGeometryMode,
  OsmOverpassRequestParams,
  OsmPoi,
  OsmPurpose,
} from "@/types/osm";
import {
  getDefaultCategoriesForPurpose,
  getOsmCategory,
  isOsmCategoryId,
  osmAttribution,
  osmCategoryRegistry,
  osmCriticalInfrastructureLayer,
} from "@/lib/osm/osmCategoryRegistry";

export type { OsmOverpassRequestParams } from "@/types/osm";

type ValidatedOsmParams = Required<Pick<OsmOverpassRequestParams, "radiusKm" | "purpose" | "categories" | "limit" | "timeoutSeconds" | "persist" | "includeGeometry" | "geometryMode" | "includeTags" | "maxElements" | "cacheTtlMinutes">> & OsmOverpassRequestParams & {
  purpose: OsmPurpose;
  bbox?: [number, number, number, number];
};

type ValidationResult =
  | { valid: true; params: ValidatedOsmParams; warnings: string[] }
  | { valid: false; status: "invalidRequest"; message: string; errors: string[] };

type OverpassElement = {
  type: OsmElementType;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
  remark?: string;
};

type OsmContextFetchResult = {
  status: "ready" | "empty" | "partial" | "timeout" | "rateLimited" | "error" | "invalidRequest";
  fetched: number;
  normalized: number;
  context: CriticalInfrastructureContext | null;
  warnings: string[];
  errors: string[];
  retryAfter?: string | null;
  fromCache: boolean;
};

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const SOURCE_ID = "osm-overpass";
const SOURCE_NAME = "OpenStreetMap / Overpass";
const SOURCE_URL = "https://overpass-api.de/api/interpreter";
const DEFAULT_RADIUS_KM = 5;
const DEFAULT_LIMIT = 100;
const DEFAULT_TIMEOUT_SECONDS = 15;
const MAX_TIMEOUT_SECONDS = 25;
const DEFAULT_CACHE_TTL_MINUTES = 360;
const MAX_GENERAL_LIMIT = 250;
const PURPOSES: OsmPurpose[] = ["aura_medical", "fenix_shelter", "fenix_exposure", "nav_route_context", "command_center_nearby", "emergency_services", "logistics", "incident_context", "map_viewport", "general"];
const LIMITATIONS = [
  "OpenStreetMap is collaborative data; quality and completeness vary by region.",
  "OpenStreetMap / Overpass is not an official universal registry, routing engine, geocoder, tile server or availability source.",
  "ARGUS does not create KnowledgeIncident records from OSM POIs.",
  "Mapped facilities must be locally verified before operational decisions.",
  "OSM tags such as opening_hours or capacity are not real-time emergency availability.",
  "No global Overpass queries, raw Overpass QL, Nominatim geocoding or public OSM tile production use are enabled in this phase.",
];

const memoryCache = new Map<string, { expiresAt: number; value: OsmContextFetchResult }>();

export function validateOsmOverpassRequest(params: OsmOverpassRequestParams): ValidationResult {
  const purpose = normalizePurpose(params.purpose);
  const bbox = normalizeBbox(params.bbox);
  const hasPoint = typeof params.lat === "number" || typeof params.lon === "number";
  if (!bbox && !hasPoint) {
    return { valid: false, status: "invalidRequest", message: "lat/lon/radius or bbox required for OSM Overpass critical infrastructure context", errors: ["lat/lon/radius or bbox required for OSM Overpass critical infrastructure context"] };
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

  const requestedCategories = params.categories?.length ? params.categories : getDefaultCategoriesForPurpose(purpose);
  const invalidCategories = requestedCategories.filter((item) => !isOsmCategoryId(item));
  if (invalidCategories.length) {
    return { valid: false, status: "invalidRequest", message: `Unsupported OSM categories: ${invalidCategories.join(", ")}`, errors: [`Unsupported OSM categories: ${invalidCategories.join(", ")}. Use the ARGUS OSM category whitelist.`] };
  }
  const categories = Array.from(new Set(requestedCategories));
  const categoryDefs = categories.map((item) => getOsmCategory(item)).filter(Boolean);
  const includesHeavy = categoryDefs.some((item) => item?.heavy);
  const maxCategoryRadius = Math.min(...categoryDefs.map((item) => item?.maxRadiusKm ?? maxRadiusForPurpose(purpose)), maxRadiusForPurpose(purpose));
  const radiusKm = Math.min(Math.max(Number(params.radiusKm ?? DEFAULT_RADIUS_KM), 0.1), maxCategoryRadius);
  const requestedRadius = Number(params.radiusKm ?? DEFAULT_RADIUS_KM);
  if (!bbox && Number.isFinite(requestedRadius) && requestedRadius > maxCategoryRadius) {
    return { valid: false, status: "invalidRequest", message: `radiusKm exceeds ${maxCategoryRadius} km for purpose/categories`, errors: [`radiusKm exceeds ${maxCategoryRadius} km for purpose/categories`] };
  }
  if (bbox) {
    const area = bboxAreaKm2(bbox);
    const maxArea = includesHeavy ? 25 : purpose === "map_viewport" ? 250 : 625;
    if (area > maxArea) {
      return { valid: false, status: "invalidRequest", message: `bbox area exceeds ${maxArea} km2 for OSM Overpass context`, errors: [`bbox area exceeds ${maxArea} km2 for OSM Overpass context`] };
    }
  }
  const categoryMaxElements = Math.min(...categoryDefs.map((item) => item?.maxElements ?? MAX_GENERAL_LIMIT));
  const limit = Math.min(Math.max(Math.trunc(params.limit ?? DEFAULT_LIMIT), 1), Math.min(params.maxElements ?? categoryMaxElements, categoryMaxElements, MAX_GENERAL_LIMIT));
  const timeoutSeconds = Math.min(Math.max(Math.trunc(params.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS), 1), MAX_TIMEOUT_SECONDS);
  const geometryMode = normalizeGeometryMode(params.geometryMode, includesHeavy);
  const warnings: string[] = [];
  if (includesHeavy) warnings.push("Heavy OSM categories are restricted to small radius/bbox and capped element counts.");
  if (limit < (params.limit ?? DEFAULT_LIMIT)) warnings.push("OSM result limit was capped by category safety rules.");
  return {
    valid: true,
    params: {
      ...params,
      bbox,
      purpose,
      radiusKm,
      categories,
      limit,
      timeoutSeconds,
      persist: params.persist ?? false,
      includeGeometry: params.includeGeometry ?? true,
      geometryMode,
      includeTags: params.includeTags ?? true,
      maxElements: limit,
      cacheTtlMinutes: Math.max(Math.trunc(params.cacheTtlMinutes ?? DEFAULT_CACHE_TTL_MINUTES), 30),
    },
    warnings,
  };
}

export function buildOverpassQuery(params: OsmOverpassRequestParams) {
  const validation = validateOsmOverpassRequest(params);
  if (!validation.valid) throw new Error(validation.message);
  return validation.params.bbox ? buildOverpassBBoxQuery(validation.params) : buildOverpassRadiusQuery(validation.params);
}

export function buildOverpassRadiusQuery(params: ValidatedOsmParams) {
  if (typeof params.lat !== "number" || typeof params.lon !== "number") throw new Error("lat/lon required for radius query");
  const meters = Math.round(params.radiusKm * 1000);
  return buildQuery(params, `(around:${meters},${params.lat.toFixed(6)},${params.lon.toFixed(6)})`);
}

export function buildOverpassBBoxQuery(params: ValidatedOsmParams) {
  if (!params.bbox) throw new Error("bbox required for bbox query");
  const [west, south, east, north] = params.bbox;
  return buildQuery(params, `(${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)})`);
}

export async function fetchOverpass(params: OsmOverpassRequestParams) {
  const validation = validateOsmOverpassRequest(params);
  if (!validation.valid) return { ...validation, fetched: 0, elements: [] as OverpassElement[], warnings: [], errors: validation.errors };
  const query = validation.params.bbox ? buildOverpassBBoxQuery(validation.params) : buildOverpassRadiusQuery(validation.params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), validation.params.timeoutSeconds * 1000);
  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": process.env.ARGUS_USER_AGENT ?? "ARGUS/OSM-Overpass-Critical-Infrastructure",
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: controller.signal,
    });
    if (response.status === 429) {
      return { status: "rateLimited" as const, fetched: 0, elements: [] as OverpassElement[], retryAfter: response.headers.get("retry-after"), warnings: validation.warnings, errors: ["Overpass rate limit response"] };
    }
    if (!response.ok) {
      return { status: response.status === 504 ? "timeout" as const : "error" as const, fetched: 0, elements: [] as OverpassElement[], warnings: validation.warnings, errors: [`Overpass responded ${response.status}`] };
    }
    const data = await response.json() as OverpassResponse;
    const elements = parseOverpassResponse(data);
    return { status: elements.length ? "ready" as const : "empty" as const, fetched: elements.length, elements, warnings: [...validation.warnings, ...(data.remark ? [data.remark] : [])], errors: [] };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { status: aborted ? "timeout" as const : "error" as const, fetched: 0, elements: [] as OverpassElement[], warnings: validation.warnings, errors: [aborted ? "Overpass request timed out" : error instanceof Error ? error.message : "Overpass fetch failed"] };
  } finally {
    clearTimeout(timeout);
  }
}

export function parseOverpassResponse(response: OverpassResponse) {
  return (response.elements ?? []).filter((item) => item.type && typeof item.id === "number");
}

export function normalizeOsmElement(element: OverpassElement, params: OsmOverpassRequestParams): OsmPoi | null {
  const validation = validateOsmOverpassRequest(params);
  if (!validation.valid) return null;
  const tags = normalizeOsmTags(element.tags ?? {});
  const categories = classifyOsmPoi(tags);
  if (!categories.length) return null;
  const lat = element.lat ?? element.center?.lat ?? element.geometry?.[0]?.lat;
  const lon = element.lon ?? element.center?.lon ?? element.geometry?.[0]?.lon;
  const latitude = Number.isFinite(lat) ? Number(lat) : null;
  const longitude = Number.isFinite(lon) ? Number(lon) : null;
  const category = categories.find((item) => validation.params.categories.includes(item)) ?? categories[0];
  if (!validation.params.categories.some((item) => categories.includes(item))) return null;
  const categoryDef = getOsmCategory(category);
  return {
    osmType: element.type,
    osmId: element.id,
    name: tags.name,
    category,
    categories,
    subcategory: categoryDef?.label,
    tags: validation.params.includeTags ? tags : {},
    latitude,
    longitude,
    geometry: validation.params.includeGeometry ? simplifyOsmGeometry(element, validation.params.geometryMode) : undefined,
    geometryType: geometryType(element),
    distanceKm: typeof validation.params.lat === "number" && typeof validation.params.lon === "number" && latitude !== null && longitude !== null ? distanceKm(validation.params.lat, validation.params.lon, latitude, longitude) : null,
    address: pickPrefix(tags, "addr:"),
    contact: { ...pickPrefix(tags, "contact:"), phone: tags.phone, website: tags.website },
    openingHours: tags.opening_hours,
    operator: tags.operator,
    source: SOURCE_ID,
    license: "ODbL",
    attribution: osmAttribution,
    confidence: scorePoi(tags, element),
    caveats: categoryDef?.caveats ?? LIMITATIONS,
  };
}

export function normalizeOsmTags(tags: Record<string, string>) {
  const usefulKeys = new Set(["name", "amenity", "emergency", "healthcare", "aeroway", "highway", "bridge", "tunnel", "barrier", "ford", "shop", "tourism", "leisure", "social_facility", "building", "operator", "opening_hours", "phone", "website", "capacity", "access", "man_made", "harbour", "port"]);
  return Object.fromEntries(Object.entries(tags).filter(([key]) => usefulKeys.has(key) || key.startsWith("addr:") || key.startsWith("contact:")).map(([key, value]) => [key, String(value)]));
}

export function classifyOsmPoi(tags: Record<string, string>) {
  return osmCategoryRegistry
    .filter((category) => category.tags.some((matcher) => tags[matcher.key] !== undefined && (matcher.value === "*" || tags[matcher.key] === matcher.value)))
    .map((category) => category.id);
}

export function buildOsmCriticalInfrastructureContext(params: OsmOverpassRequestParams, elements: OverpassElement[], fromCache = false): CriticalInfrastructureContext {
  const validation = validateOsmOverpassRequest(params);
  if (!validation.valid) throw new Error(validation.message);
  const pois = dedupeOsmElements(elements.map((element) => normalizeOsmElement(element, validation.params)).filter(Boolean) as OsmPoi[]).slice(0, validation.params.limit);
  const countsByCategory = countBy(pois.flatMap((poi) => poi.categories.filter((category) => validation.params.categories.includes(category))));
  const nearestByCategory = Object.fromEntries(validation.params.categories.map((category) => [category, nearest(pois.filter((poi) => poi.categories.includes(category)))]));
  const cacheKey = buildOsmCacheKey(validation.params);
  return {
    id: `osm-overpass-${hash(cacheKey)}-${Date.now()}`,
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    purpose: validation.params.purpose,
    generatedAt: new Date().toISOString(),
    query: {
      lat: validation.params.lat,
      lon: validation.params.lon,
      radiusKm: validation.params.bbox ? undefined : validation.params.radiusKm,
      bbox: validation.params.bbox,
      categories: validation.params.categories,
      limit: validation.params.limit,
      timeoutSeconds: validation.params.timeoutSeconds,
    },
    pois,
    countsByCategory,
    nearestByCategory,
    medical: {
      nearestHospital: nearestByCategory.medical_hospital ?? null,
      nearestClinic: nearestByCategory.medical_clinic ?? null,
      nearestPharmacy: nearestByCategory.medical_pharmacy ?? null,
      nearestDefibrillator: nearestByCategory.medical_defibrillator ?? null,
      nearestHelipad: nearestByCategory.medical_helipad ?? null,
    },
    emergency: {
      nearestFireStation: nearestByCategory.emergency_fire_station ?? null,
      nearestPolice: nearestByCategory.emergency_police ?? null,
      nearestAssemblyPoint: nearestByCategory.emergency_assembly_point ?? null,
      shelters: pois.filter((poi) => poi.categories.includes("shelter")),
    },
    nav: {
      bridges: pois.filter((poi) => poi.categories.includes("bridge")),
      tunnels: pois.filter((poi) => poi.categories.includes("tunnel")),
      fuelStations: pois.filter((poi) => poi.categories.includes("fuel")),
      chargingStations: pois.filter((poi) => poi.categories.includes("charging_station")),
      roadContext: pois.filter((poi) => ["road", "bridge", "tunnel", "ford", "barrier"].some((category) => poi.categories.includes(category))),
    },
    fenix: {
      shelters: pois.filter((poi) => poi.categories.includes("shelter") || poi.categories.includes("emergency_assembly_point")),
      schools: pois.filter((poi) => poi.categories.includes("school") || poi.categories.includes("university")),
      communityCentres: pois.filter((poi) => poi.categories.includes("community_centre") || poi.categories.includes("sports_centre")),
      buildings: pois.filter((poi) => poi.categories.includes("buildings")),
      exposureCandidates: pois.filter((poi) => ["buildings", "bridge", "tunnel", "school", "community_centre"].some((category) => poi.categories.includes(category))),
    },
    logistics: {
      fuel: pois.filter((poi) => poi.categories.includes("fuel") || poi.categories.includes("charging_station")),
      water: pois.filter((poi) => poi.categories.includes("drinking_water") || poi.categories.includes("water_tower")),
      supermarkets: pois.filter((poi) => poi.categories.includes("supermarket")),
      aerodromes: pois.filter((poi) => poi.categories.includes("aerodrome") || poi.categories.includes("medical_helipad")),
      ports: pois.filter((poi) => poi.categories.includes("port_harbour")),
    },
    coverageCaveats: LIMITATIONS,
    licenseAttribution: { attribution: osmAttribution, license: "ODbL", source: "OpenStreetMap / Overpass API" },
    dataQualityCaveats: LIMITATIONS,
    cache: { cacheKey, ttlMinutes: validation.params.cacheTtlMinutes, fromCache },
    confidence: scoreOsmCriticalInfrastructureContext({ pois } as CriticalInfrastructureContext),
    limitations: LIMITATIONS,
    evidenceRefs: pois.map((poi) => `${SOURCE_ID}:${poi.osmType}:${poi.osmId}`),
  };
}

export function buildOsmEvidence(context: CriticalInfrastructureContext, params: OsmOverpassRequestParams): ArgusKnowledgeEvidenceItem {
  const summary = buildOsmExcerpt(context);
  return {
    id: `${SOURCE_ID}-evidence-${params.incidentId ?? params.routeAnalysisId ?? params.fenixSimulationId ?? context.id}`,
    incidentId: params.incidentId,
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    title: "OpenStreetMap critical infrastructure context",
    url: SOURCE_URL,
    summary,
    quote: summary,
    confidenceScore: {
      sourceReliability: 86,
      corroborationCount: 1,
      geolocationPrecision: context.pois.length ? 82 : 30,
      timestampPrecision: 50,
      documentQuality: 80,
      extractionConfidence: 88,
      conflictWithOtherSources: 0,
      finalConfidence: context.confidence,
      label: context.confidence >= 80 ? "high" : context.confidence >= 55 ? "medium" : "low",
    },
    locationConfidence: context.pois.length ? 0.82 : 0.3,
    timestampConfidence: 0.5,
    extractedAt: context.generatedAt,
    conflicts: [],
  };
}

export function scoreOsmCriticalInfrastructureContext(context: Pick<CriticalInfrastructureContext, "pois">) {
  let score = 84;
  if (!context.pois.length) score -= 35;
  if (context.pois.some((poi) => poi.tags.name)) score += 3;
  if (context.pois.some((poi) => poi.latitude === null || poi.longitude === null)) score -= 8;
  return Math.min(Math.max(score, 35), 92);
}

export function dedupeOsmElements(elements: OsmPoi[]) {
  return Array.from(new Map(elements.map((element) => [`${element.source}:${element.osmType}:${element.osmId}`, element])).values());
}

export function simplifyOsmGeometry(element: OverpassElement, mode: OsmGeometryMode = "centroid_and_simple_geometry") {
  if (mode === "centroid") return element.center ?? (typeof element.lat === "number" && typeof element.lon === "number" ? { lat: element.lat, lon: element.lon } : null);
  if (mode === "full_geometry") return element.geometry ?? element.center ?? null;
  if (element.geometry?.length) return element.geometry.slice(0, 25);
  return element.center ?? (typeof element.lat === "number" && typeof element.lon === "number" ? { lat: element.lat, lon: element.lon } : null);
}

export function getOsmOverpassAdapterStatus() {
  return {
    adapterId: "osmOverpassAdapter",
    sourceId: SOURCE_ID,
    status: "ready" as const,
    sourceRole: "critical_infrastructure_geospatial_source",
    isIncidentSource: false,
    requiresApiKey: false,
    requiresConfiguration: false,
    officialSource: false,
    aggregatorSource: false,
    communitySource: true,
    licenseStatus: "ODbL",
    attributionRequired: true,
    attribution: osmAttribution,
    phase1Capabilities: ["Overpass POI/context", "medical facilities", "emergency services", "shelters/assembly points", "roads/bridges/tunnels context", "fuel/charging/water/logistics", "critical infrastructure evidence"],
    phase2Planned: ["routing engine with OSRM/Valhalla/GraphHopper/ORS", "self-hosted Overpass/extracts", "official local infrastructure registries", "availability/capacity integrations", "geocoding provider"],
    capabilities: ["lat_lon_radius", "bbox", "whitelisted_categories", "cache_ttl", "critical_infrastructure_context", "KnowledgeEvidence critical_infrastructure_context", "map_layer:osm_critical_infrastructure"],
    categories: osmCategoryRegistry.map((item) => ({ id: item.id, label: item.label, group: item.group, heavy: Boolean(item.heavy), maxRadiusKm: item.maxRadiusKm, maxElements: item.maxElements })),
    mapLayer: osmCriticalInfrastructureLayer,
    limitations: LIMITATIONS,
    message: "OpenStreetMap / Overpass is active as contextual critical infrastructure source with mandatory bounded queries, whitelist categories, cache and attribution.",
  };
}

export async function fetchAndBuildOsmCriticalInfrastructureContext(params: OsmOverpassRequestParams): Promise<OsmContextFetchResult> {
  const validation = validateOsmOverpassRequest(params);
  if (!validation.valid) return { ...validation, fetched: 0, normalized: 0, context: null, warnings: [], errors: validation.errors, fromCache: false };
  const cacheKey = buildOsmCacheKey(validation.params);
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const cachedContext = cached.value.context ? { ...cached.value.context, cache: { ...cached.value.context.cache, fromCache: true } } : null;
    return { ...cached.value, context: cachedContext, fromCache: true, warnings: [...cached.value.warnings, "OSM Overpass context returned from cache."] };
  }
  const result = await fetchOverpass(validation.params);
  if (result.status === "invalidRequest" || !("elements" in result)) {
    return { ...result, normalized: 0, context: null, fromCache: false };
  }
  const context = buildOsmCriticalInfrastructureContext(validation.params, result.elements, false);
  const status = result.status === "ready" && context.pois.length >= validation.params.limit ? "partial" as const : result.status === "ready" && !context.pois.length ? "empty" as const : result.status;
  const output = {
    status,
    fetched: result.fetched,
    normalized: context.pois.length,
    context,
    warnings: [
      ...result.warnings,
      ...(context.pois.length >= validation.params.limit ? ["OSM result reached ARGUS limit; response may be partial."] : []),
      ...LIMITATIONS,
    ],
    errors: result.errors,
    retryAfter: "retryAfter" in result ? result.retryAfter : undefined,
    fromCache: false,
  };
  memoryCache.set(cacheKey, { expiresAt: Date.now() + validation.params.cacheTtlMinutes * 60_000, value: output });
  return output;
}

export function buildOsmCacheKey(params: ValidatedOsmParams) {
  const area = params.bbox
    ? params.bbox.map((item) => item.toFixed(3)).join(",")
    : `${params.lat?.toFixed(3)},${params.lon?.toFixed(3)},${params.radiusKm.toFixed(2)}`;
  return [SOURCE_ID, params.purpose, params.categories.slice().sort().join("|"), area, params.limit, params.geometryMode].join(":");
}

function buildQuery(params: ValidatedOsmParams, areaSelector: string) {
  const clauses = params.categories.flatMap((categoryId) => {
    const category = getOsmCategory(categoryId);
    if (!category) return [];
    return category.tags.flatMap((matcher) => {
      const value = matcher.value === "*" ? `["${matcher.key}"]` : `["${matcher.key}"="${matcher.value}"]`;
      return [`node${value}${areaSelector};`, `way${value}${areaSelector};`, `relation${value}${areaSelector};`];
    });
  });
  const outMode = params.includeGeometry && params.geometryMode === "full_geometry" ? "out tags center geom" : "out tags center";
  return [`[out:json][timeout:${params.timeoutSeconds}];`, "(", ...clauses, ");", `${outMode} ${params.limit};`].join("\n");
}

function normalizePurpose(purpose?: OsmPurpose | string): OsmPurpose {
  return PURPOSES.includes(purpose as OsmPurpose) ? purpose as OsmPurpose : "general";
}

function normalizeGeometryMode(value?: OsmGeometryMode, heavy = false): OsmGeometryMode {
  if (heavy) return "centroid";
  return value === "centroid" || value === "full_geometry" || value === "centroid_and_simple_geometry" ? value : "centroid_and_simple_geometry";
}

function normalizeBbox(value?: string | [number, number, number, number]) {
  if (!value) return undefined;
  const parts = (Array.isArray(value) ? value : value.split(",")).map(Number);
  if (parts.length !== 4 || parts.some((item) => !Number.isFinite(item))) return undefined;
  const [west, south, east, north] = parts;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return undefined;
  return [west, south, east, north] as [number, number, number, number];
}

function maxRadiusForPurpose(purpose: OsmPurpose) {
  if (purpose === "aura_medical" || purpose === "command_center_nearby" || purpose === "emergency_services") return 10;
  if (purpose === "fenix_shelter" || purpose === "fenix_exposure" || purpose === "nav_route_context" || purpose === "logistics") return 25;
  return 10;
}

function bboxAreaKm2(bbox: [number, number, number, number]) {
  const [west, south, east, north] = bbox;
  const latKm = Math.abs(north - south) * 111;
  const lonKm = Math.abs(east - west) * 111 * Math.max(Math.cos(((north + south) / 2) * Math.PI / 180), 0.2);
  return latKm * lonKm;
}

function geometryType(element: OverpassElement): OsmPoi["geometryType"] {
  if (element.type === "node") return "point";
  if (element.center) return "centroid";
  if ((element.geometry?.length ?? 0) > 2 && element.geometry?.[0]?.lat === element.geometry?.at(-1)?.lat && element.geometry?.[0]?.lon === element.geometry?.at(-1)?.lon) return "polygon";
  if (element.geometry?.length) return "line";
  return "unknown";
}

function pickPrefix(tags: Record<string, string>, prefix: string) {
  return Object.fromEntries(Object.entries(tags).filter(([key, value]) => key.startsWith(prefix) && value).map(([key, value]) => [key.replace(prefix, ""), value]));
}

function scorePoi(tags: Record<string, string>, element: OverpassElement) {
  let score = 78;
  if (tags.name) score += 6;
  if (element.lat || element.center?.lat || element.geometry?.length) score += 6;
  if (tags.operator) score += 3;
  if (tags.opening_hours) score += 2;
  return Math.min(score, 92);
}

function nearest(pois: OsmPoi[]) {
  return pois.slice().sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY))[0] ?? null;
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Number((2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

function buildOsmExcerpt(context: CriticalInfrastructureContext) {
  const topCounts = Object.entries(context.countsByCategory).slice(0, 6).map(([category, count]) => `${category}:${count}`).join(", ") || "no mapped POIs";
  return `OpenStreetMap shows mapped infrastructure near the query area (${topCounts}). OSM is collaborative data; availability and official status must be verified locally.`;
}

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = Math.imul(31, h) + value.charCodeAt(i) | 0;
  return Math.abs(h).toString(36);
}
