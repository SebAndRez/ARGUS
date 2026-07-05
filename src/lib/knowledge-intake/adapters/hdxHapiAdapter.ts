import type { ArgusKnowledgeEvidenceItem } from "@/types/knowledgeIntake";
import { HAPI_INDICATORS, hapiEndpointRegistry, type HapiIndicator } from "@/lib/humanitarian/hapiEndpointRegistry";

export type HapiPurpose =
  | "fenix_population_context"
  | "fenix_exposure_context"
  | "aura_humanitarian_context"
  | "nav_humanitarian_logistics"
  | "risk_context"
  | "command_center_humanitarian"
  | "incident_context"
  | "humanitarian_monitoring"
  | "general";

export type HapiRequestParams = {
  locationCode?: string;
  locationName?: string;
  admin1Code?: string;
  admin2Code?: string;
  adminLevel?: number;
  pCode?: string;
  sector?: string;
  populationGroup?: string;
  referencePeriod?: string;
  fromDate?: string;
  toDate?: string;
  indicators?: string[] | string;
  purpose?: HapiPurpose | string;
  incidentId?: string;
  routeAnalysisId?: string;
  fenixSimulationId?: string;
  persist?: boolean;
  limit?: number;
  offset?: number;
  includeMetadata?: boolean;
  includeLocations?: boolean;
  includeBaselinePopulation?: boolean;
  includeHumanitarianNeeds?: boolean;
  includeIdps?: boolean;
  includeRefugees?: boolean;
  includeReturnees?: boolean;
  includeOperationalPresence?: boolean;
  includeFoodSecurity?: boolean;
  includeFunding?: boolean;
  includeRainfall?: boolean;
  includeNationalRisk?: boolean;
  cacheTtlHours?: number;
};

type HapiFetchResult = { indicator: HapiIndicator; status: string; endpoint: string; records: unknown[]; error?: string };

const HAPI_BASE_URL = "https://hapi.humdata.org/api/v1";
const LIMITATIONS = [
  "HDX/OCHA HAPI is humanitarian context, not a live incident alert.",
  "Reference period, provider/source and dataset/resource metadata must be reviewed.",
  "Do not sum PIN by sector as unique affected people.",
  "Operational presence does not mean guaranteed real-time availability.",
  "Baseline population is not a live census.",
  "ARGUS does not create KnowledgeIncident records from HAPI indicators.",
];

export function getHapiIdentifierStatus() {
  const configured = Boolean(process.env.HAPI_APP_IDENTIFIER?.trim());
  return {
    status: configured ? "configured" as const : "requiresConfiguration" as const,
    sourceId: "hdx-hapi",
    requiresApiKey: true,
    requiresConfiguration: !configured,
    envVar: "HAPI_APP_IDENTIFIER",
    message: configured
      ? "OCHA HAPI app identifier is configured."
      : "OCHA HAPI app identifier is required to access humanitarian context data.",
  };
}

export function buildHapiParams(params: HapiRequestParams) {
  const search = new URLSearchParams();
  const appIdentifier = process.env.HAPI_APP_IDENTIFIER?.trim();
  if (appIdentifier) search.set("app_identifier", appIdentifier);
  if (params.locationCode) search.set("location_code", params.locationCode.toUpperCase());
  if (params.admin1Code) search.set("admin1_code", params.admin1Code);
  if (params.admin2Code) search.set("admin2_code", params.admin2Code);
  if (params.pCode) search.set("p_code", params.pCode);
  if (params.adminLevel !== undefined) search.set("admin_level", String(params.adminLevel));
  if (params.sector) search.set("sector", params.sector);
  if (params.populationGroup) search.set("population_group", params.populationGroup);
  if (params.referencePeriod) search.set("reference_period", params.referencePeriod);
  if (params.fromDate) search.set("from_date", params.fromDate);
  if (params.toDate) search.set("to_date", params.toDate);
  search.set("limit", String(params.limit ?? 1000));
  search.set("offset", String(params.offset ?? 0));
  return search;
}

export function buildHapiUrl(path: string, params: HapiRequestParams = {}) {
  return `${HAPI_BASE_URL}${path}?${buildHapiParams(params).toString()}`;
}

export async function fetchHapiJson(path: string, params: HapiRequestParams = {}) {
  const identifier = getHapiIdentifierStatus();
  if (identifier.requiresConfiguration) {
    return { status: "requiresConfiguration" as const, endpoint: buildHapiUrl(path, params), records: [], warnings: [identifier.message], errors: [] };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const endpoint = buildHapiUrl(path, params);
    const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
    if (response.status === 404) return { status: "notAvailable" as const, endpoint, records: [], warnings: [`HAPI endpoint ${path} is not available.`], errors: [] };
    if (!response.ok) return { status: "error" as const, endpoint, records: [], warnings: [], errors: [`HAPI responded ${response.status} for ${path}`] };
    const data = await response.json();
    const records = Array.isArray(data?.data) ? data.data : Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
    return { status: records.length ? "ready" as const : "empty" as const, endpoint, records, warnings: [], errors: [] };
  } catch (error) {
    return { status: "error" as const, endpoint: buildHapiUrl(path, params), records: [], warnings: [], errors: [error instanceof Error ? error.message : "HAPI fetch failed"] };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchHapiMetadata(params: HapiRequestParams = {}) {
  return fetchHapiJson("/metadata", params);
}
export async function fetchHapiLocations(params: HapiRequestParams = {}) {
  return fetchHapiJson("/metadata/location", params);
}
export async function fetchHapiAdminBoundsOrPcodes(params: HapiRequestParams = {}) {
  return fetchHapiJson("/metadata/admin-boundaries", params);
}
export async function fetchHapiBaselinePopulation(params: HapiRequestParams = {}) {
  return fetchHapiJson(hapiEndpointRegistry.baseline_population.path, params);
}
export async function fetchHapiHumanitarianNeeds(params: HapiRequestParams = {}) {
  return fetchHapiJson(hapiEndpointRegistry.humanitarian_needs.path, params);
}
export async function fetchHapiIdps(params: HapiRequestParams = {}) {
  return fetchHapiJson(hapiEndpointRegistry.idps.path, params);
}
export async function fetchHapiRefugees(params: HapiRequestParams = {}) {
  return fetchHapiJson(hapiEndpointRegistry.refugees.path, params);
}
export async function fetchHapiReturnees(params: HapiRequestParams = {}) {
  return fetchHapiJson(hapiEndpointRegistry.returnees.path, params);
}
export async function fetchHapiOperationalPresence(params: HapiRequestParams = {}) {
  return fetchHapiJson(hapiEndpointRegistry.operational_presence.path, params);
}
export async function fetchHapiFoodSecurity(params: HapiRequestParams = {}) {
  return fetchHapiJson(hapiEndpointRegistry.food_security.path, params);
}
export async function fetchHapiFunding(params: HapiRequestParams = {}) {
  return fetchHapiJson(hapiEndpointRegistry.funding.path, params);
}
export async function fetchHapiRainfall(params: HapiRequestParams = {}) {
  return fetchHapiJson(hapiEndpointRegistry.rainfall.path, params);
}
export async function fetchHapiNationalRisk(params: HapiRequestParams = {}) {
  return fetchHapiJson(hapiEndpointRegistry.national_risk.path, params);
}

export function validateHapiRequest(params: HapiRequestParams) {
  const hasLocation = Boolean(params.locationCode || params.admin1Code || params.admin2Code || params.pCode || params.incidentId || params.fenixSimulationId);
  if (!hasLocation) return invalid("locationCode, admin code, p-code, incidentId or fenixSimulationId required for HDX HAPI humanitarian context");
  if (params.locationCode && !/^[A-Za-z]{3}$/.test(params.locationCode)) return invalid("locationCode must be ISO3 for HDX HAPI phase 1");
  if (params.adminLevel !== undefined && ![0, 1, 2].includes(params.adminLevel)) return invalid("adminLevel must be 0, 1 or 2");
  const limit = Math.trunc(params.limit ?? 1000);
  if (limit < 1 || limit > 10000) return invalid("limit must be between 1 and 10000");
  const offset = Math.trunc(params.offset ?? 0);
  if (offset < 0) return invalid("offset must be non-negative");
  const indicators = normalizeIndicators(params);
  const unsupported = indicators.filter((item) => !HAPI_INDICATORS.includes(item));
  if (unsupported.length) return invalid(`Unsupported HAPI indicators: ${unsupported.join(", ")}`);
  return { valid: true as const, params: { ...params, limit, offset, indicators, purpose: normalizePurpose(params.purpose), cacheTtlHours: params.cacheTtlHours ?? 24 } };
}

export function normalizeHapiLocation(record: unknown) {
  const item = asRecord(record);
  return {
    locationCode: stringValue(item.location_code ?? item.iso3 ?? item.code),
    locationName: stringValue(item.location_name ?? item.name),
    admin1Code: stringValue(item.admin1_code),
    admin1Name: stringValue(item.admin1_name),
    admin2Code: stringValue(item.admin2_code),
    admin2Name: stringValue(item.admin2_name),
    pCode: stringValue(item.p_code ?? item.pcode),
    adminLevel: numberValue(item.admin_level),
    latitude: numberValue(item.latitude ?? item.lat),
    longitude: numberValue(item.longitude ?? item.lon),
    source: "OCHA HAPI",
    caveats: ["Admin levels and p-codes vary by endpoint and country."],
  };
}
export function normalizeHapiBaselinePopulation(record: unknown) {
  const item = asRecord(record);
  return { total: numberValue(item.population ?? item.total_population ?? item.value), female: numberValue(item.female), male: numberValue(item.male), referencePeriod: stringValue(item.reference_period), provider: stringValue(item.provider ?? item.source), caveats: ["Baseline population is not a live census."] };
}
export function normalizeHapiHumanitarianNeeds(record: unknown) {
  const item = asRecord(record);
  return { pinIntersectoral: numberValue(item.pin ?? item.people_in_need ?? item.value), sector: stringValue(item.sector), severity: stringValue(item.severity), referencePeriod: stringValue(item.reference_period), noSectorSummationCaveat: true };
}
export function normalizeHapiAffectedPeople(record: unknown) {
  const item = asRecord(record);
  return { populationGroup: stringValue(item.population_group ?? item.group), total: numberValue(item.value ?? item.population ?? item.total), referencePeriod: stringValue(item.reference_period), provider: stringValue(item.provider ?? item.source) };
}
export function normalizeHapiOperationalPresence(record: unknown) {
  const item = asRecord(record);
  return { organization: stringValue(item.organization ?? item.org_name), sector: stringValue(item.sector), referencePeriod: stringValue(item.reference_period), operationalPresenceCaveat: "Operational presence indicates mapped humanitarian activity, not guaranteed availability." };
}
export function normalizeHapiFoodSecurity(record: unknown) {
  const item = asRecord(record);
  return { ipcPhase: stringValue(item.ipc_phase ?? item.phase), ipcPopulation: numberValue(item.population ?? item.value), referencePeriod: stringValue(item.reference_period), pCodeCaveat: true };
}
export function normalizeHapiFunding(record: unknown) {
  const item = asRecord(record);
  return { requirements: numberValue(item.requirements), funding: numberValue(item.funding), gap: numberValue(item.gap), plan: stringValue(item.plan), referencePeriod: stringValue(item.reference_period), fundingCaveat: true };
}
export function normalizeHapiRainfall(record: unknown) {
  const item = asRecord(record);
  return { rainfall: numberValue(item.rainfall ?? item.value), anomalyPercent: numberValue(item.anomaly_percent), period: stringValue(item.reference_period ?? item.period), boundaryCaveat: true };
}

export async function buildHapiHumanitarianContextSnapshot(params: HapiRequestParams) {
  const validation = validateHapiRequest(params);
  if (!validation.valid) return { status: validation.status, errors: validation.errors, warnings: [], humanitarianContextSnapshot: null };
  const identifier = getHapiIdentifierStatus();
  if (identifier.requiresConfiguration) return { ...identifier, humanitarianContextSnapshot: null, warnings: [identifier.message], errors: [] };

  const results: HapiFetchResult[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  for (const indicator of validation.params.indicators) {
    const result = await fetchHapiJson(hapiEndpointRegistry[indicator].path, validation.params);
    results.push({ indicator, status: result.status, endpoint: result.endpoint, records: result.records, error: result.errors[0] });
    warnings.push(...result.warnings, ...hapiEndpointRegistry[indicator].caveats);
    errors.push(...result.errors);
  }
  const snapshot = {
    sourceId: "hdx-hapi",
    sourceName: "HDX / OCHA HAPI",
    purpose: validation.params.purpose,
    generatedAt: new Date().toISOString(),
    query: validation.params,
    adminLocation: normalizeHapiLocation(results.flatMap((item) => item.records)[0]),
    baselinePopulation: results.find((item) => item.indicator === "baseline_population")?.records.map(normalizeHapiBaselinePopulation) ?? [],
    humanitarianNeeds: results.find((item) => item.indicator === "humanitarian_needs")?.records.map(normalizeHapiHumanitarianNeeds) ?? [],
    affectedPeople: {
      idps: results.find((item) => item.indicator === "idps")?.records.map(normalizeHapiAffectedPeople) ?? [],
      refugees: results.find((item) => item.indicator === "refugees")?.records.map(normalizeHapiAffectedPeople) ?? [],
      returnees: results.find((item) => item.indicator === "returnees")?.records.map(normalizeHapiAffectedPeople) ?? [],
    },
    operationalPresence: results.find((item) => item.indicator === "operational_presence")?.records.map(normalizeHapiOperationalPresence) ?? [],
    foodSecurity: results.find((item) => item.indicator === "food_security")?.records.map(normalizeHapiFoodSecurity) ?? [],
    funding: results.find((item) => item.indicator === "funding")?.records.map(normalizeHapiFunding) ?? [],
    rainfall: results.find((item) => item.indicator === "rainfall")?.records.map(normalizeHapiRainfall) ?? [],
    nationalRisk: results.find((item) => item.indicator === "national_risk")?.records ?? [],
    dataAvailability: {
      availableIndicators: results.filter((item) => item.records.length).map((item) => item.indicator),
      missingIndicators: results.filter((item) => !item.records.length).map((item) => item.indicator),
      partialIndicators: results.filter((item) => item.status === "notAvailable" || item.status === "error").map((item) => item.indicator),
    },
    datasets: [],
    resources: [],
    providerAttribution: "HDX / OCHA HAPI and original data providers",
    qualityWarnings: [...new Set(warnings)],
    aggregationCaveats: ["Do not sum PIN by sector as unique people.", "Operational presence is not availability.", "Baseline population is not live census."],
    limitations: LIMITATIONS,
    rawResults: results,
  };
  return {
    status: results.some((item) => item.records.length) ? "ready" as const : "empty" as const,
    sourceId: "hdx-hapi",
    indicatorsFetched: results.filter((item) => item.records.length).map((item) => item.indicator),
    indicatorsMissing: results.filter((item) => !item.records.length).map((item) => item.indicator),
    humanitarianContextSnapshot: snapshot,
    warnings: snapshot.qualityWarnings,
    errors,
  };
}

export function buildHapiEvidence(context: Record<string, unknown>, params: HapiRequestParams): ArgusKnowledgeEvidenceItem {
  const generatedAt = String(context.generatedAt ?? new Date().toISOString());
  return evidence("hdx-hapi", "HDX / OCHA HAPI", `hdx-hapi-${params.incidentId ?? params.locationCode ?? params.pCode ?? generatedAt}`, params.incidentId, "HDX HAPI humanitarian context", "Humanitarian context snapshot with reference-period and provider caveats.", 82, generatedAt);
}

export function scoreHapiHumanitarianContext(context: { dataAvailability?: { availableIndicators?: unknown[] } }) {
  return Math.min(90, 62 + ((context.dataAvailability?.availableIndicators?.length ?? 0) * 4));
}

export function getHapiAdapterStatus() {
  const status = getHapiIdentifierStatus();
  return {
    adapterId: "hdxHapiAdapter",
    sourceId: "hdx-hapi",
    status: status.requiresConfiguration ? "requiresConfiguration" as const : "active_contextual" as const,
    ready: !status.requiresConfiguration,
    requiresApiKey: true,
    requiresConfiguration: status.requiresConfiguration,
    envVar: "HAPI_APP_IDENTIFIER",
    optionalPhase2EnvVar: "HDX_API_TOKEN",
    sourceRole: "humanitarian_context_indicator_source",
    isIncidentSource: false,
    phase1Capabilities: HAPI_INDICATORS,
    mapLayer: { id: "hdx-hapi-humanitarian-context", name: "HDX HAPI Humanitarian Context", layerType: "humanitarian_context", isIncidentLayer: false, defaultVisible: false, requiresConfiguration: true },
    limitations: LIMITATIONS,
    message: status.message,
  };
}

function normalizeIndicators(params: HapiRequestParams): HapiIndicator[] {
  const requested = list(params.indicators) as HapiIndicator[];
  if (requested.length) return requested;
  return HAPI_INDICATORS.filter((item) => {
    const key = `include${item.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join("")}` as keyof HapiRequestParams;
    return params[key] !== false && hapiEndpointRegistry[item].enabledByDefault;
  });
}
function normalizePurpose(purpose?: string): HapiPurpose {
  const supported: HapiPurpose[] = ["fenix_population_context", "fenix_exposure_context", "aura_humanitarian_context", "nav_humanitarian_logistics", "risk_context", "command_center_humanitarian", "incident_context", "humanitarian_monitoring", "general"];
  return supported.includes(purpose as HapiPurpose) ? purpose as HapiPurpose : "general";
}
function evidence(sourceId: string, sourceName: string, id: string, incidentId: string | undefined, title: string, summary: string, score: number, extractedAt: string): ArgusKnowledgeEvidenceItem {
  return { id, incidentId, sourceId, sourceName, title, summary, confidenceScore: { sourceReliability: score, corroborationCount: 1, geolocationPrecision: 55, timestampPrecision: 60, documentQuality: 75, extractionConfidence: score, conflictWithOtherSources: 0, finalConfidence: score, label: score >= 80 ? "high" : "medium" }, locationConfidence: 0.55, timestampConfidence: 0.6, extractedAt };
}
function invalid(message: string) {
  return { valid: false as const, status: "invalidRequest" as const, message, errors: [message] };
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
function list(value?: string[] | string) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}
