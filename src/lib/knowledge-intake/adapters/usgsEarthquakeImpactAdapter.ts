import { usgsEarthquakeImpactMapLayers } from "@/lib/earthquake/usgsEarthquakeImpactLayerRegistry";
import type {
  EarthquakeImpactAssessmentContext,
  EarthquakeOperationalImpactContext,
  EarthquakeShakingContext,
  PagerAlertLevel,
} from "@/types/earthquakeImpact";

type UsgsProductContent = { url?: string; contentType?: string; length?: number };
type UsgsProduct = {
  id?: string;
  code?: string;
  source?: string;
  status?: string;
  updateTime?: number;
  preferredWeight?: number;
  properties?: Record<string, string | number | undefined>;
  contents?: Record<string, UsgsProductContent>;
};
type UsgsEventDetail = {
  id?: string;
  properties?: {
    mag?: number | null;
    place?: string | null;
    time?: number | null;
    updated?: number | null;
    url?: string | null;
    detail?: string | null;
    products?: Record<string, UsgsProduct[]>;
  };
  geometry?: { type?: string; coordinates?: [number, number, number?] };
};

export type UsgsEarthquakeImpactParams = {
  eventId?: string;
  incidentId?: string;
  includeShakeMap?: boolean;
  includePager?: boolean;
  includeContours?: boolean;
  includeGrid?: boolean;
  includeShape?: boolean;
  includeStations?: boolean;
  includeFault?: boolean;
  includePagerXml?: boolean;
  includePagerSummary?: boolean;
  persist?: boolean;
  updateIncident?: boolean;
  createIncidentIfMissing?: boolean;
  includeRaw?: boolean;
};

const EVENT_API_BASE = process.env.USGS_EVENT_API_BASE?.trim() || "https://earthquake.usgs.gov/fdsnws/event/1";
const REQUEST_TIMEOUT_MS = 12_000;
const SHAKEMAP_LIMITATIONS = [
  "ShakeMap is not earthquake prediction, damage confirmation, evacuation order or route closure confirmation.",
  "Early ShakeMap versions can update; contours can be generalized for visualization.",
];
const PAGER_LIMITATIONS = [
  "PAGER is modelled impact estimation, not confirmed deaths, injuries, damage or economic loss.",
  "PAGER does not issue evacuation, route closure or local authority orders.",
];

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/geo+json, application/json",
        "User-Agent": "ARGUS-GRID/0.1 usgs-earthquake-impact",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`USGS ComCat responded ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function value(product: UsgsProduct | undefined, keys: string[]) {
  for (const key of keys) {
    const raw = product?.properties?.[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  }
  return undefined;
}

function numValue(product: UsgsProduct | undefined, keys: string[]) {
  const raw = value(product, keys);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeAlert(value?: string): PagerAlertLevel {
  const alert = value?.toLowerCase();
  if (alert === "green" || alert === "yellow" || alert === "orange" || alert === "red") return alert;
  return "unknown";
}

function alertRank(alert: PagerAlertLevel) {
  return alert === "red" ? 4 : alert === "orange" ? 3 : alert === "yellow" ? 2 : alert === "green" ? 1 : 0;
}

function contentUrl(product: UsgsProduct | undefined, names: string[]) {
  const contents = product?.contents ?? {};
  for (const name of names) {
    const exact = contents[name]?.url;
    if (exact) return exact;
  }
  const entry = Object.entries(contents).find(([key]) => names.some((name) => key.toLowerCase().includes(name.toLowerCase())));
  return entry?.[1].url;
}

function productVersion(product?: UsgsProduct) {
  return value(product, ["version", "productVersion"]) ?? product?.code?.match(/v(\d+)/i)?.[1] ?? (product?.updateTime ? String(product.updateTime) : undefined);
}

function eventUrl(eventDetail: UsgsEventDetail) {
  return eventDetail.properties?.url ?? (eventDetail.id ? `${EVENT_API_BASE}/query?eventid=${encodeURIComponent(eventDetail.id)}&format=geojson` : undefined);
}

export async function fetchUsgsEventDetail(eventId: string) {
  const url = `${EVENT_API_BASE}/query?eventid=${encodeURIComponent(eventId)}&format=geojson`;
  return fetchJsonWithTimeout<UsgsEventDetail>(url);
}

export function extractShakeMapProducts(eventDetail: UsgsEventDetail) {
  return (eventDetail.properties?.products?.shakemap ?? []).filter((product) => product.status !== "DELETE" && product.status !== "deleted");
}

export function extractPagerProducts(eventDetail: UsgsEventDetail) {
  return (eventDetail.properties?.products?.losspager ?? []).filter((product) => product.status !== "DELETE" && product.status !== "deleted");
}

export function selectPreferredUsgsProduct(products: UsgsProduct[], productType: "shakemap" | "losspager") {
  void productType;
  return [...products].sort((a, b) => {
    const preferred = (b.preferredWeight ?? 0) - (a.preferredWeight ?? 0);
    if (preferred !== 0) return preferred;
    const version = Number(productVersion(b) ?? 0) - Number(productVersion(a) ?? 0);
    if (Number.isFinite(version) && version !== 0) return version;
    return (b.updateTime ?? 0) - (a.updateTime ?? 0);
  })[0];
}

export function normalizeShakeMapProduct(product: UsgsProduct | undefined, eventDetail: UsgsEventDetail): EarthquakeShakingContext | undefined {
  if (!product || !eventDetail.id) return undefined;
  const [lon, lat, depthKm] = eventDetail.geometry?.coordinates ?? [];
  const version = productVersion(product);
  return {
    sourceId: "usgs-shakemap",
    sourceName: "USGS ShakeMap",
    eventId: eventDetail.id,
    eventUrl: eventUrl(eventDetail),
    shakemapId: product.id,
    shakemapCode: product.code,
    shakemapVersion: version,
    shakemapStatus: product.status,
    productSource: product.source,
    generatedAt: value(product, ["eventtime", "eventTime"]),
    updatedAt: product.updateTime ? new Date(product.updateTime).toISOString() : undefined,
    magnitude: eventDetail.properties?.mag ?? undefined,
    depthKm,
    epicenter: { lat, lon, place: eventDetail.properties?.place ?? undefined },
    maxMmi: numValue(product, ["maxmmi", "max_mmi", "maximum-mmi", "maximum_mmi"]),
    gridUrl: contentUrl(product, ["download/grid.xml", "grid.xml"]),
    shapeUrl: contentUrl(product, ["shape.zip", "shape"]),
    rasterUrl: contentUrl(product, ["raster.zip", "raster"]),
    kmlUrl: contentUrl(product, ["download/intensity.kmz", "kml", "kmz"]),
    stationListUrl: contentUrl(product, ["stationlist.json", "stationlist.xml", "stationlist"]),
    faultGeometryUrl: contentUrl(product, ["fault.kmz", "rupture.json", "fault"]),
    contourUrl: contentUrl(product, ["download/cont_mi.json", "cont_mi.json", "contour", "contours"]),
    uncertainty: value(product, ["uncertainty"]),
    preferredProduct: true,
    confidence: product.id || product.code ? 90 : 76,
    limitations: SHAKEMAP_LIMITATIONS,
    caveats: ["Estimated shaking footprint; verify local authorities before operational decisions."],
    evidenceRefs: [`usgs-shakemap:${eventDetail.id}:${product.code ?? product.id ?? "product"}:${version ?? product.updateTime ?? "unknown"}`],
  };
}

export function normalizePagerProduct(product: UsgsProduct | undefined, eventDetail: UsgsEventDetail): EarthquakeImpactAssessmentContext | undefined {
  if (!product || !eventDetail.id) return undefined;
  const fatality = normalizeAlert(value(product, ["alertlevel", "fatality-alert", "fatalityAlert", "fatality_alert"]));
  const economic = normalizeAlert(value(product, ["economic-alert", "economicAlert", "economic_alert"]));
  const overall = normalizeAlert(value(product, ["overall-alert", "pager-alert", "alert"]) ?? (alertRank(fatality) >= alertRank(economic) ? fatality : economic));
  const version = productVersion(product);
  return {
    sourceId: "usgs-pager",
    sourceName: "USGS PAGER",
    eventId: eventDetail.id,
    eventUrl: eventUrl(eventDetail),
    pagerProductId: product.id,
    pagerCode: product.code,
    pagerVersion: version,
    pagerStatus: product.status,
    productSource: product.source,
    updatedAt: product.updateTime ? new Date(product.updateTime).toISOString() : undefined,
    alertLevelFatality: fatality,
    alertLevelEconomic: economic,
    overallPagerAlert: overall,
    estimatedFatalitiesRange: value(product, ["fatality-range", "fatality_range", "fatalities"]),
    estimatedEconomicLossRange: value(product, ["economic-losses", "economic_loss", "economic-loss-range"]),
    citiesExposed: [],
    buildingVulnerabilityComments: value(product, ["vulnerability", "building-vulnerability"]),
    secondaryHazards: value(product, ["secondary-hazards", "secondary_hazards"])?.split(/[;,]/).map((item) => item.trim()).filter(Boolean) ?? [],
    historicAnalogues: [],
    preferredProduct: true,
    confidence: product.id || product.code ? 86 : 68,
    limitations: PAGER_LIMITATIONS,
    caveats: ["Estimated/modelled impact; not confirmed fatalities, injuries, damage or losses."],
    evidenceRefs: [`usgs-pager:${eventDetail.id}:${product.code ?? product.id ?? "product"}:${version ?? product.updateTime ?? "unknown"}`],
  };
}

export const buildEarthquakeShakingContext = (eventDetail: UsgsEventDetail, product: UsgsProduct | undefined) =>
  normalizeShakeMapProduct(product, eventDetail);

export const buildEarthquakeImpactAssessmentContext = (eventDetail: UsgsEventDetail, product: UsgsProduct | undefined) =>
  normalizePagerProduct(product, eventDetail);

export function scoreEarthquakeOperationalImpact(context: EarthquakeOperationalImpactContext) {
  return context.impactScore;
}

export function buildEarthquakeOperationalImpactContext(params: {
  eventId: string;
  shakingContext?: EarthquakeShakingContext;
  impactAssessmentContext?: EarthquakeImpactAssessmentContext;
  earthquakeIncidentId?: string;
}): EarthquakeOperationalImpactContext {
  const pagerAlert = params.impactAssessmentContext?.overallPagerAlert ?? "unknown";
  const pagerScore = alertRank(pagerAlert) * 22;
  const maxMmi = params.shakingContext?.maxMmi;
  const mmiScore = typeof maxMmi === "number" ? Math.min(92, Math.max(10, Math.round(maxMmi * 10))) : 0;
  const impactScore = Math.max(pagerScore, mmiScore);
  const recommendedPriority =
    pagerAlert === "red" || (maxMmi ?? 0) >= 9
      ? "P0"
      : pagerAlert === "orange" || (maxMmi ?? 0) >= 8
        ? "P1"
        : pagerAlert === "yellow" || (maxMmi ?? 0) >= 6
          ? "P2"
          : pagerAlert === "green" || (maxMmi ?? 0) >= 4
            ? "P3"
            : "P4";
  return {
    eventId: params.eventId,
    earthquakeIncidentId: params.earthquakeIncidentId,
    shakingContext: params.shakingContext,
    impactAssessmentContext: params.impactAssessmentContext,
    maxMmi,
    pagerAlert,
    populationExposureScore: pagerScore,
    impactScore,
    recommendedPriority,
    priorityReason: `Priority from PAGER ${pagerAlert} and max MMI ${maxMmi ?? "unavailable"}; not based on magnitude alone.`,
    affectedInfrastructure: [],
    affectedRoutes: [],
    affectedMedicalFacilities: [],
    tsunamiContext: "Use NOAA/local tsunami authorities for tsunami warnings; PAGER/ShakeMap do not confirm tsunami.",
    secondaryHazardContext: params.impactAssessmentContext?.secondaryHazards ?? [],
    uncertaintyScore: 100 - Math.min(95, Math.max(params.shakingContext?.confidence ?? 0, params.impactAssessmentContext?.confidence ?? 0)),
    requiresReview: recommendedPriority === "P0" || recommendedPriority === "P1",
    authorityCaveat: "Estimated USGS impact context; verify local emergency, seismic, tsunami, transport and health authorities.",
    evidenceRefs: [
      ...(params.shakingContext?.evidenceRefs ?? []),
      ...(params.impactAssessmentContext?.evidenceRefs ?? []),
    ],
  };
}

export function buildShakeMapEvidence(context: EarthquakeShakingContext, incidentId?: string) {
  return {
    incidentId,
    sourceId: "usgs-shakemap",
    sourceName: "USGS ShakeMap",
    evidenceType: "earthquake_shaking_context",
    title: `USGS ShakeMap for event ${context.eventId}`,
    url: context.contourUrl ?? context.gridUrl ?? context.eventUrl,
    excerpt: `ShakeMap ${context.shakemapCode ?? ""} version ${context.shakemapVersion ?? "unknown"} max MMI ${context.maxMmi ?? "unavailable"}; layers: ${[context.contourUrl && "contours", context.gridUrl && "grid", context.faultGeometryUrl && "fault"].filter(Boolean).join(", ") || "metadata URLs"}.`,
    rawRef: context.evidenceRefs[0],
    confidenceScore: context.confidence,
    metadataJson: context,
  };
}

export function buildPagerEvidence(context: EarthquakeImpactAssessmentContext, incidentId?: string) {
  return {
    incidentId,
    sourceId: "usgs-pager",
    sourceName: "USGS PAGER",
    evidenceType: "earthquake_impact_assessment_context",
    title: `USGS PAGER impact assessment for event ${context.eventId}`,
    url: context.eventUrl,
    excerpt: `PAGER ${context.pagerCode ?? ""} version ${context.pagerVersion ?? "unknown"} alert ${context.overallPagerAlert}; estimated/modelled impact only.`,
    rawRef: context.evidenceRefs[0],
    confidenceScore: context.confidence,
    metadataJson: context,
  };
}

export async function fetchAndBuildUsgsEarthquakeImpact(params: UsgsEarthquakeImpactParams) {
  if (!params.eventId) throw new Error("eventId is required for USGS ShakeMap/PAGER preview.");
  const includeShakeMap = params.includeShakeMap ?? true;
  const includePager = params.includePager ?? true;
  const eventDetail = await fetchUsgsEventDetail(params.eventId);
  const shakemapProducts = includeShakeMap ? extractShakeMapProducts(eventDetail) : [];
  const pagerProducts = includePager ? extractPagerProducts(eventDetail) : [];
  const shakemapProduct = selectPreferredUsgsProduct(shakemapProducts, "shakemap");
  const pagerProduct = selectPreferredUsgsProduct(pagerProducts, "losspager");
  const earthquakeShakingContext = normalizeShakeMapProduct(shakemapProduct, eventDetail);
  const earthquakeImpactAssessmentContext = normalizePagerProduct(pagerProduct, eventDetail);
  const earthquakeOperationalImpactContext = buildEarthquakeOperationalImpactContext({
    eventId: params.eventId,
    shakingContext: earthquakeShakingContext,
    impactAssessmentContext: earthquakeImpactAssessmentContext,
    earthquakeIncidentId: params.incidentId,
  });
  const warnings = [];
  if (includeShakeMap && !earthquakeShakingContext) warnings.push("No ShakeMap product is available for this event.");
  if (includePager && !earthquakeImpactAssessmentContext) warnings.push("No LossPAGER product is available for this event.");
  return {
    adapterId: "usgsEarthquakeImpactAdapter",
    sourceId: "usgs-earthquake-impact",
    status: earthquakeShakingContext || earthquakeImpactAssessmentContext ? "ready" as const : "notAvailable" as const,
    eventId: params.eventId,
    eventDetail: params.includeRaw ? eventDetail : undefined,
    hasShakeMap: Boolean(earthquakeShakingContext),
    hasPager: Boolean(earthquakeImpactAssessmentContext),
    shakemapVersion: earthquakeShakingContext?.shakemapVersion,
    pagerVersion: earthquakeImpactAssessmentContext?.pagerVersion,
    earthquakeShakingContext,
    earthquakeImpactAssessmentContext,
    earthquakeOperationalImpactContext,
    recommendedPriority: earthquakeOperationalImpactContext.recommendedPriority,
    requiresReview: earthquakeOperationalImpactContext.requiresReview,
    products: {
      shakemapAvailable: shakemapProducts.length,
      pagerAvailable: pagerProducts.length,
    },
    warnings,
    errors: [],
  };
}

export function getUsgsEarthquakeImpactAdapterStatus() {
  return {
    adapterId: "usgsEarthquakeImpactAdapter",
    sourceId: "usgs-earthquake-impact",
    status: "ready" as const,
    requiresApiKey: false,
    requiresConfiguration: false,
    sourceRole: "earthquake_impact_enrichment_source",
    mapLayers: usgsEarthquakeImpactMapLayers,
    capabilities: ["detect ComCat shakemap products", "detect ComCat losspager products", "preferred/latest product selection", "EarthquakeShakingContext", "EarthquakeImpactAssessmentContext", "EarthquakeOperationalImpactContext"],
    phase1Capabilities: ["ShakeMap metadata and URLs", "PAGER metadata and alert colors", "operational impact scoring", "evidence creation", "guarded incident update"],
    limitations: [...SHAKEMAP_LIMITATIONS, ...PAGER_LIMITATIONS, "No DYFI, local authority, grid/raster analytics or confirmed damage parsing in this phase."],
  };
}
