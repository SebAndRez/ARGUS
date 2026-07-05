import {
  GVP_ATTRIBUTION,
  GVP_CITATION,
  GVP_DEFAULT_WFS_BASE,
  GVP_OPERATIONAL_CAVEAT,
  getGvpLayerDefinition,
  gvpLayerRegistry,
  gvpMapLayers,
  type GvpLayerType,
} from "@/lib/gvp/gvpLayerRegistry";
import type { EruptionHistoryContext, VolcanicActivityReportContext, VolcanoBaselineContext } from "@/types/volcano";

type GvpRecord = Record<string, unknown>;
type GvpFeature = { type?: string; properties?: GvpRecord; geometry?: { type?: string; coordinates?: unknown } };
type GvpGeoJson = { type?: string; features?: GvpFeature[] };

export type GvpFetchParams = {
  layer?: GvpLayerType | "activity_reports";
  volcanoNumber?: string;
  vnum?: string;
  volcanoName?: string;
  country?: string;
  region?: string;
  bbox?: string;
  lat?: number;
  lon?: number;
  radiusKm?: number;
  minVei?: number;
  eruptionStartYear?: number;
  eruptionEndYear?: number;
  includeHolocene?: boolean;
  includePleistocene?: boolean;
  includeEruptions?: boolean;
  includeActivityReports?: boolean;
  reportType?: "DVAR" | "WVAR";
  reportDate?: string;
  persist?: boolean;
  createIncidents?: boolean;
  updateExisting?: boolean;
  limit?: number;
  includeRaw?: boolean;
};

const SOURCE_ID = "smithsonian-gvp";
const SOURCE_NAME = "Smithsonian GVP";
const REQUEST_TIMEOUT_MS = 15_000;

function str(record: GvpRecord | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function num(record: GvpRecord | undefined, keys: string[]) {
  const raw = str(record, keys);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function list(value?: string) {
  return value?.split(/[;,|]/).map((item) => item.trim()).filter(Boolean) ?? [];
}

function point(feature: GvpFeature) {
  if (feature.geometry?.type === "Point" && Array.isArray(feature.geometry.coordinates)) {
    const lon = Number(feature.geometry.coordinates[0]);
    const lat = Number(feature.geometry.coordinates[1]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { latitude: lat, longitude: lon };
  }
  return null;
}

function yearFrom(value?: string) {
  if (!value) return undefined;
  const match = value.match(/-?\d{1,4}/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const radius = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchTextWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json, application/geo+json, text/csv",
        "User-Agent": "ARGUS-GRID/0.1 smithsonian-gvp-context",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Smithsonian GVP WFS responded ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export function getGvpWfsBaseUrl() {
  return process.env.GVP_WFS_BASE?.trim() || GVP_DEFAULT_WFS_BASE;
}

export function buildGvpWfsUrl(params: GvpFetchParams & { typeName?: string; outputFormat?: string }) {
  const layer = params.layer && params.layer !== "activity_reports" ? params.layer : "holocene_volcanoes";
  const def = getGvpLayerDefinition(layer);
  const url = new URL(getGvpWfsBaseUrl());
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "1.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeName", params.typeName ?? def.typeNameCandidates[0]);
  url.searchParams.set("outputFormat", params.outputFormat ?? def.outputFormat);
  url.searchParams.set("maxFeatures", String(Math.min(Math.max(params.limit ?? def.maxFeatures, 1), 5000)));
  if (params.bbox) url.searchParams.set("bbox", params.bbox);
  return url.toString();
}

export async function fetchGvpWfsLayer(params: GvpFetchParams & { layer: GvpLayerType }) {
  const def = getGvpLayerDefinition(params.layer);
  const warnings: string[] = [];
  for (const typeName of def.typeNameCandidates) {
    const url = buildGvpWfsUrl({ ...params, typeName });
    try {
      const text = await fetchTextWithTimeout(url);
      if (text.trimStart().startsWith("<")) {
        warnings.push(`${typeName}: WFS returned XML instead of GeoJSON; trying next layer candidate.`);
        continue;
      }
      return { text, url, typeName, warnings, layerType: params.layer };
    } catch (error) {
      warnings.push(`${typeName}: ${error instanceof Error ? error.message : "WFS candidate failed"}`);
    }
  }
  throw new Error(`No Smithsonian GVP WFS layer candidate responded for ${params.layer}`);
}

export function parseGvpGeoJson(response: string, layerType: GvpLayerType) {
  const parsed = JSON.parse(response) as GvpGeoJson;
  return (parsed.features ?? []).map((feature) => ({ ...feature, layerType }));
}

export function parseGvpCsv(response: string, layerType: GvpLayerType) {
  const [headerLine, ...lines] = response.split(/\r?\n/).filter(Boolean);
  const headers = headerLine?.split(",").map((item) => item.trim()) ?? [];
  return lines.map((line) => {
    const values = line.split(",");
    const properties = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    return { type: "Feature", properties, layerType };
  });
}

export function normalizeGvpVolcano(feature: GvpFeature): VolcanoBaselineContext | null {
  const properties = feature.properties ?? {};
  const coordinates = point(feature);
  const volcanoNumber = str(properties, ["Volcano_Number", "volcano_number", "VNUM", "vnum", "VolcanoNum", "Number"]);
  const volcanoName = str(properties, ["Volcano_Name", "volcano_name", "VolcanoName", "name", "Name"]);
  if (!volcanoNumber && !volcanoName) return null;
  const latitude = coordinates?.latitude ?? num(properties, ["Latitude", "latitude", "lat"]);
  const longitude = coordinates?.longitude ?? num(properties, ["Longitude", "longitude", "lon", "long"]);
  return {
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    volcanoNumber,
    vnum: volcanoNumber,
    volcanoName,
    synonyms: list(str(properties, ["Synonyms", "synonyms"])),
    country: str(properties, ["Country", "country"]),
    region: str(properties, ["Region", "region"]),
    subregion: str(properties, ["Subregion", "Subregion_Name", "subregion"]),
    latitude,
    longitude,
    elevation: num(properties, ["Elevation", "Elevation_m", "elevation"]),
    volcanoType: str(properties, ["Primary_Volcano_Type", "Volcano_Type", "type"]),
    tectonicSetting: str(properties, ["Tectonic_Setting", "tectonic_setting"]),
    lastKnownEruption: str(properties, ["Last_Known_Eruption", "Last_Eruption", "last_known_eruption"]),
    activityStatus: str(properties, ["Activity_Status", "activity_status", "Status"]),
    rockTypes: list(str(properties, ["Major_Rock_Type", "Rock_Types", "rock_types"])),
    features: list(str(properties, ["Volcano_Features", "Features", "features"])),
    dataVersion: str(properties, ["Data_Version", "dataVersion", "Version"]),
    citation: GVP_CITATION,
    sourceUrl: volcanoNumber ? `https://volcano.si.edu/volcano.cfm?vn=${encodeURIComponent(volcanoNumber)}` : "https://volcano.si.edu/",
    confidence: latitude !== undefined && longitude !== undefined ? 88 : 76,
    limitations: [
      "Catalog baseline context only; does not create incidents.",
      "Not a local official alert, evacuation order, VAAC advisory, SO2 feed or live thermal anomaly source.",
      GVP_OPERATIONAL_CAVEAT,
    ],
    evidenceRefs: [`${SOURCE_ID}:volcano:${volcanoNumber ?? `${volcanoName}:${str(properties, ["Country", "country"]) ?? "unknown"}`}`],
  };
}

export function normalizeGvpEruption(feature: GvpFeature): EruptionHistoryContext | null {
  const properties = feature.properties ?? {};
  const eruptionId = str(properties, ["Eruption_Number", "eruption_number", "Eruption_ID", "eruptionId"]);
  const volcanoNumber = str(properties, ["Volcano_Number", "volcano_number", "VNUM", "vnum"]);
  const volcanoName = str(properties, ["Volcano_Name", "volcano_name", "VolcanoName", "name", "Name"]);
  if (!eruptionId && !volcanoNumber && !volcanoName) return null;
  const startDate = str(properties, ["Start_Date", "start_date", "Start", "Start_Date_Year"]);
  const endDate = str(properties, ["End_Date", "end_date", "End", "End_Date_Year"]);
  const vei = num(properties, ["VEI", "vei"]);
  return {
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    volcanoNumber,
    vnum: volcanoNumber,
    volcanoName,
    eruptionId,
    startDate,
    endDate,
    startYear: num(properties, ["Start_Year", "start_year"]) ?? yearFrom(startDate),
    endYear: num(properties, ["End_Year", "end_year"]) ?? yearFrom(endDate),
    certainty: str(properties, ["Eruption_Category", "Certainty", "certainty"]),
    vei,
    eruptionType: str(properties, ["Activity_Area", "Eruption_Type", "eruption_type"]),
    evidenceMethod: str(properties, ["Evidence_Method", "evidence_method"]),
    deposits: str(properties, ["Deposits", "deposits"]),
    fatalities: num(properties, ["Deaths", "Fatalities", "fatalities"]),
    damage: str(properties, ["Damage", "damage"]),
    tsunamiGenerated: /tsunami/i.test(str(properties, ["Tsunami", "tsunami", "Phenomena"]) ?? ""),
    sourceReferences: list(str(properties, ["References", "Source_References", "source_references"])),
    dataVersion: str(properties, ["Data_Version", "dataVersion", "Version"]),
    citation: GVP_CITATION,
    confidence: eruptionId ? 84 : 72,
    limitations: [
      "Historical eruption context only; does not create incidents.",
      "Historical VEI, fatalities or damage are contextual records, not forecasts or current confirmed impacts.",
      GVP_OPERATIONAL_CAVEAT,
    ],
    evidenceRefs: [`${SOURCE_ID}:eruption:${eruptionId ?? `${volcanoNumber}:${startDate ?? "unknown"}`}`],
  };
}

export function normalizeGvpActivityReport(record: GvpRecord): VolcanicActivityReportContext {
  const reportType = (str(record, ["reportType"]) === "DVAR" ? "DVAR" : "WVAR") as "DVAR" | "WVAR";
  const summary = str(record, ["reportSummary", "summary", "description"]);
  return {
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    reportType,
    reportDate: str(record, ["reportDate", "date"]),
    weekStart: str(record, ["weekStart"]),
    weekEnd: str(record, ["weekEnd"]),
    volcanoNumber: str(record, ["volcanoNumber", "vnum"]),
    vnum: str(record, ["vnum", "volcanoNumber"]),
    volcanoName: str(record, ["volcanoName", "name"]),
    country: str(record, ["country"]),
    region: str(record, ["region"]),
    activityType: "unknown",
    reportSummary: summary,
    observedPhenomena: [],
    preliminary: true,
    requiresLocalAuthorityReview: true,
    sourceUrl: str(record, ["sourceUrl", "url"]) ?? "https://volcano.si.edu/reports_weekly.cfm",
    confidence: summary ? 62 : 40,
    limitations: ["DVAR/WVAR parsing is prepared as preliminary report evidence; verify local observatory.", GVP_OPERATIONAL_CAVEAT],
    evidenceRefs: [`${SOURCE_ID}:report:${reportType}:${str(record, ["reportDate", "date"]) ?? "unknown"}:${str(record, ["volcanoNumber", "vnum", "volcanoName"]) ?? "unknown"}`],
  };
}

export const buildVolcanoBaselineContext = (volcano: VolcanoBaselineContext) => volcano;
export const buildEruptionHistoryContext = (eruption: EruptionHistoryContext) => eruption;
export const buildVolcanicActivityReportContext = (report: VolcanicActivityReportContext) => report;

export function scoreGvpVolcanoContext(context: VolcanoBaselineContext) {
  return context.confidence;
}

export function scoreGvpEruptionHistory(context: EruptionHistoryContext) {
  return context.confidence;
}

export function scoreGvpActivityReport(context: VolcanicActivityReportContext) {
  return context.confidence;
}

export function buildGvpVolcanoEvidence(context: VolcanoBaselineContext) {
  return {
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    evidenceType: "volcano_baseline_context",
    title: `Smithsonian GVP volcano baseline${context.volcanoName ? ` - ${context.volcanoName}` : ""}`,
    url: context.sourceUrl,
    excerpt: [context.volcanoName, context.country, context.volcanoType, context.lastKnownEruption].filter(Boolean).join(" | "),
    rawRef: context.evidenceRefs[0],
    confidenceScore: scoreGvpVolcanoContext(context),
    metadataJson: context,
  };
}

export function buildGvpEruptionEvidence(context: EruptionHistoryContext) {
  return {
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    evidenceType: "eruption_history_context",
    title: `Smithsonian GVP eruption history${context.volcanoName ? ` - ${context.volcanoName}` : ""}`,
    excerpt: [context.volcanoName, context.startDate ?? context.startYear, context.vei !== undefined ? `VEI ${context.vei}` : undefined, context.certainty].filter(Boolean).join(" | "),
    rawRef: context.evidenceRefs[0],
    confidenceScore: scoreGvpEruptionHistory(context),
    metadataJson: context,
  };
}

export function buildGvpActivityReportEvidence(context: VolcanicActivityReportContext) {
  return {
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    evidenceType: "volcanic_activity_report",
    title: `Smithsonian GVP volcanic activity report${context.volcanoName ? ` - ${context.volcanoName}` : ""}`,
    url: context.sourceUrl,
    excerpt: [context.volcanoName, context.reportType, context.reportDate, context.reportSummary].filter(Boolean).join(" | ").slice(0, 700),
    rawRef: context.evidenceRefs[0],
    confidenceScore: scoreGvpActivityReport(context),
    metadataJson: context,
  };
}

export function dedupeGvpVolcanoes(records: VolcanoBaselineContext[]) {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${SOURCE_ID}:${record.volcanoNumber ?? record.vnum ?? `${record.volcanoName}:${record.country}:${record.region}`}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function dedupeGvpEruptions(records: EruptionHistoryContext[]) {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${SOURCE_ID}:${record.eruptionId ?? `${record.volcanoNumber}:${record.startDate}:${record.endDate}:${record.vei}`}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function dedupeGvpActivityReports(records: VolcanicActivityReportContext[]) {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${SOURCE_ID}:${record.reportType}:${record.reportDate}:${record.volcanoNumber ?? `${record.volcanoName}:${record.country}`}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function filterVolcanoes(records: VolcanoBaselineContext[], params: GvpFetchParams) {
  return records.filter((record) => {
    if (params.volcanoNumber && record.volcanoNumber !== params.volcanoNumber) return false;
    if (params.vnum && record.vnum !== params.vnum) return false;
    if (params.volcanoName && !record.volcanoName?.toLowerCase().includes(params.volcanoName.toLowerCase())) return false;
    if (params.country && record.country?.toLowerCase() !== params.country.toLowerCase()) return false;
    if (params.region && !record.region?.toLowerCase().includes(params.region.toLowerCase())) return false;
    if (typeof params.lat === "number" && typeof params.lon === "number" && typeof record.latitude === "number" && typeof record.longitude === "number") {
      if (haversineKm(params.lat, params.lon, record.latitude, record.longitude) > (params.radiusKm ?? 100)) return false;
    }
    return true;
  });
}

function filterEruptions(records: EruptionHistoryContext[], params: GvpFetchParams) {
  return records.filter((record) => {
    if (params.volcanoNumber && record.volcanoNumber !== params.volcanoNumber) return false;
    if (params.vnum && record.vnum !== params.vnum) return false;
    if (params.volcanoName && !record.volcanoName?.toLowerCase().includes(params.volcanoName.toLowerCase())) return false;
    if (typeof params.minVei === "number" && (record.vei ?? -Infinity) < params.minVei) return false;
    if (typeof params.eruptionStartYear === "number" && (record.startYear ?? -Infinity) < params.eruptionStartYear) return false;
    if (typeof params.eruptionEndYear === "number" && (record.endYear ?? record.startYear ?? Infinity) > params.eruptionEndYear) return false;
    return true;
  });
}

export async function fetchGvpHoloceneVolcanoes(params: GvpFetchParams = {}) {
  const result = await fetchGvpWfsLayer({ ...params, layer: "holocene_volcanoes" });
  return { ...result, features: parseGvpGeoJson(result.text, "holocene_volcanoes") };
}

export async function fetchGvpPleistoceneVolcanoes(params: GvpFetchParams = {}) {
  const result = await fetchGvpWfsLayer({ ...params, layer: "pleistocene_volcanoes" });
  return { ...result, features: parseGvpGeoJson(result.text, "pleistocene_volcanoes") };
}

export async function fetchGvpHoloceneEruptions(params: GvpFetchParams = {}) {
  const result = await fetchGvpWfsLayer({ ...params, layer: "holocene_eruptions" });
  return { ...result, features: parseGvpGeoJson(result.text, "holocene_eruptions") };
}

export async function fetchAndNormalizeSmithsonianGvp(params: GvpFetchParams = {}) {
  const limit = Math.min(Math.max(params.limit ?? 500, 1), 5000);
  const includeHolocene = params.includeHolocene ?? params.layer !== "holocene_eruptions";
  const includePleistocene = params.includePleistocene ?? false;
  const includeEruptions = params.includeEruptions ?? true;
  const includeActivityReports = params.includeActivityReports ?? params.layer === "activity_reports";
  const warnings: string[] = [];
  const errors: string[] = [];
  const volcanoFeatures: GvpFeature[] = [];
  const eruptionFeatures: GvpFeature[] = [];

  if (includeHolocene && (!params.layer || params.layer === "holocene_volcanoes")) {
    try {
      const result = await fetchGvpHoloceneVolcanoes({ ...params, limit });
      volcanoFeatures.push(...result.features);
      warnings.push(...result.warnings);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Holocene Volcanoes fetch failed");
    }
  }
  if (includePleistocene && (!params.layer || params.layer === "pleistocene_volcanoes")) {
    try {
      const result = await fetchGvpPleistoceneVolcanoes({ ...params, limit });
      volcanoFeatures.push(...result.features);
      warnings.push(...result.warnings);
    } catch (error) {
      warnings.push(`Pleistocene Volcanoes unavailable: ${error instanceof Error ? error.message : "fetch failed"}`);
    }
  }
  if (includeEruptions && (!params.layer || params.layer === "holocene_eruptions")) {
    try {
      const result = await fetchGvpHoloceneEruptions({ ...params, limit });
      eruptionFeatures.push(...result.features);
      warnings.push(...result.warnings);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Holocene Eruptions fetch failed");
    }
  }

  const volcanoBaselineContexts = filterVolcanoes(dedupeGvpVolcanoes(volcanoFeatures.map(normalizeGvpVolcano).filter((item): item is VolcanoBaselineContext => Boolean(item))), params).slice(0, limit);
  const eruptionHistoryContexts = filterEruptions(dedupeGvpEruptions(eruptionFeatures.map(normalizeGvpEruption).filter((item): item is EruptionHistoryContext => Boolean(item))), params).slice(0, limit);
  const volcanicActivityReportContexts = includeActivityReports
    ? dedupeGvpActivityReports([]).slice(0, limit)
    : [];
  if (includeActivityReports) warnings.push("DVAR/WVAR activity report ingestion is prepared but not scraped in this phase; use stable report records when available.");

  return {
    adapterId: "smithsonianGvpAdapter",
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    status: errors.length > 0 && volcanoBaselineContexts.length + eruptionHistoryContexts.length === 0 ? "error" : warnings.length > 0 || errors.length > 0 ? "partial" : "ready",
    sourceRole: "global_volcanism_knowledge_source",
    isIncidentSource: "reports_only_with_guardrails",
    isKnowledgeSource: true,
    requiresApiKey: false,
    fetchedAt: new Date().toISOString(),
    volcanoesFetched: volcanoFeatures.length,
    eruptionsFetched: eruptionFeatures.length,
    reportsFetched: volcanicActivityReportContexts.length,
    normalized: volcanoBaselineContexts.length + eruptionHistoryContexts.length + volcanicActivityReportContexts.length,
    volcanoBaselineContexts,
    eruptionHistoryContexts,
    volcanicActivityReportContexts,
    warnings,
    errors,
    attribution: GVP_ATTRIBUTION,
    citation: GVP_CITATION,
    caveat: GVP_OPERATIONAL_CAVEAT,
  };
}

export function getGvpAdapterStatus() {
  return {
    adapterId: "smithsonianGvpAdapter",
    sourceId: SOURCE_ID,
    status: "ready" as const,
    requiresApiKey: false,
    requiresConfiguration: false,
    optionalEnvVar: "GVP_WFS_BASE",
    sourceRole: "global_volcanism_knowledge_source",
    mapLayers: gvpMapLayers,
    layers: Object.values(gvpLayerRegistry),
    capabilities: ["WFS volcano catalog", "Holocene volcanoes", "Pleistocene volcanoes optional", "Holocene eruptions", "VolcanoBaselineContext", "EruptionHistoryContext", "prepared DVAR/WVAR report context"],
    phase1Capabilities: ["WFS volcano catalog", "Holocene volcanoes", "Holocene eruptions", "VolcanoBaselineContext", "EruptionHistoryContext", "map layers"],
    phase1_5_or_phase2Capabilities: ["DVAR reports", "WVAR reports", "controlled volcanic_activity incident updates", "VAAC/local observatory integrations"],
    limitations: [
      "Not a local official alert.",
      "Does not replace national volcano observatories.",
      "DVAR/WVAR reports are preliminary when used.",
      "No VAAC, SO2 real-time, thermal anomaly live, evacuation orders or eruption prediction.",
      "Catalog/history never create KnowledgeIncident records.",
    ],
    attribution: GVP_ATTRIBUTION,
    citation: GVP_CITATION,
  };
}
