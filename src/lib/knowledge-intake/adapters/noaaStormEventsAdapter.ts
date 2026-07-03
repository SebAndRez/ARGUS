import { gunzipSync } from "node:zlib";
import type {
  ArgusEvidenceConfidenceScore,
  ArgusHazardDomain,
  ArgusIncidentKnowledge,
  ArgusIncidentSeverity,
  ArgusKnowledgeEvidenceItem,
} from "@/types/knowledgeIntake";

export type NoaaStormEventsMode = "preview" | "import";

export type NoaaStormEventsFetchParams = {
  year?: number;
  state?: string;
  eventTypes?: string[];
  limit?: number;
  offset?: number;
  persist?: boolean;
  mode?: NoaaStormEventsMode;
  minDeaths?: number;
  minInjuries?: number;
  hasCoordinates?: boolean;
};

export type NoaaStormEventDetailRow = Record<string, string>;

export type NoaaDamageParseResult = {
  value?: number;
  raw?: string;
  parsed: boolean;
  warning?: string;
};

const NOAA_SOURCE_ID = "noaa-storm-events";
const NOAA_SOURCE_NAME = "NOAA Storm Events";
const NOAA_BULK_DIR = "https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/";
const REQUEST_TIMEOUT_MS = 20_000;
const US_STATE_NAMES: Record<string, string> = {
  AL: "ALABAMA",
  AK: "ALASKA",
  AZ: "ARIZONA",
  AR: "ARKANSAS",
  CA: "CALIFORNIA",
  CO: "COLORADO",
  CT: "CONNECTICUT",
  DE: "DELAWARE",
  FL: "FLORIDA",
  GA: "GEORGIA",
  HI: "HAWAII",
  ID: "IDAHO",
  IL: "ILLINOIS",
  IN: "INDIANA",
  IA: "IOWA",
  KS: "KANSAS",
  KY: "KENTUCKY",
  LA: "LOUISIANA",
  ME: "MAINE",
  MD: "MARYLAND",
  MA: "MASSACHUSETTS",
  MI: "MICHIGAN",
  MN: "MINNESOTA",
  MS: "MISSISSIPPI",
  MO: "MISSOURI",
  MT: "MONTANA",
  NE: "NEBRASKA",
  NV: "NEVADA",
  NH: "NEW HAMPSHIRE",
  NJ: "NEW JERSEY",
  NM: "NEW MEXICO",
  NY: "NEW YORK",
  NC: "NORTH CAROLINA",
  ND: "NORTH DAKOTA",
  OH: "OHIO",
  OK: "OKLAHOMA",
  OR: "OREGON",
  PA: "PENNSYLVANIA",
  RI: "RHODE ISLAND",
  SC: "SOUTH CAROLINA",
  SD: "SOUTH DAKOTA",
  TN: "TENNESSEE",
  TX: "TEXAS",
  UT: "UTAH",
  VT: "VERMONT",
  VA: "VIRGINIA",
  WA: "WASHINGTON",
  WV: "WEST VIRGINIA",
  WI: "WISCONSIN",
  WY: "WYOMING",
  DC: "DISTRICT OF COLUMBIA",
  PR: "PUERTO RICO",
  VI: "VIRGIN ISLANDS",
  GU: "GUAM",
  AS: "AMERICAN SAMOA",
  MP: "NORTHERN MARIANA ISLANDS",
};

function nowIso() {
  return new Date().toISOString();
}

function sanitizeId(value: string) {
  return value.replace(/[^a-zA-Z0-9:_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeToken(value?: string) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function clampLimit(limit?: number, defaultLimit = 100, max = 5000) {
  const numeric = Math.trunc(Number(limit ?? defaultLimit));
  if (!Number.isFinite(numeric)) return defaultLimit;
  return Math.min(Math.max(numeric, 1), max);
}

function parseNumber(value?: string) {
  if (!value?.trim()) return undefined;
  const numeric = Number(value.trim());
  return Number.isFinite(numeric) ? numeric : undefined;
}

function parseInteger(value?: string) {
  const numeric = parseNumber(value);
  return typeof numeric === "number" ? Math.trunc(numeric) : 0;
}

function compactText(value?: string, fallback = "") {
  return (value ?? fallback).replace(/\s+/g, " ").trim();
}

function parseNoaaDate(value?: string) {
  const raw = value?.trim();
  if (!raw) return undefined;
  const direct = Date.parse(raw);
  if (Number.isFinite(direct)) return new Date(direct).toISOString();
  const match = raw.match(/^(\d{1,2})-([A-Z]{3})-(\d{2,4})\s+(\d{1,2}):(\d{2}):(\d{2})$/i);
  if (!match) return undefined;
  const [, day, monthRaw, yearRaw, hour, minute, second] = match;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(monthRaw.toLowerCase());
  if (month < 0) return undefined;
  const shortYear = Number(yearRaw);
  const year = yearRaw.length === 2 ? (shortYear >= 50 ? 1900 + shortYear : 2000 + shortYear) : shortYear;
  const date = new Date(Date.UTC(year, month, Number(day), Number(hour), Number(minute), Number(second)));
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function csvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((item) => item.length > 0)) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((item) => item.length > 0)) rows.push(row);
  }
  return rows;
}

export function parseNoaaStormEventsDetailsCsv(csvText: string): NoaaStormEventDetailRow[] {
  const rows = csvRows(csvText.replace(/^\uFEFF/, ""));
  const [headers, ...body] = rows;
  if (!headers?.length) return [];
  const normalizedHeaders = headers.map((header) => header.trim());
  return body
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => Object.fromEntries(normalizedHeaders.map((header, index) => [header, row[index]?.trim() ?? ""])));
}

export function parseNoaaDamageValue(value?: string | null): NoaaDamageParseResult {
  const raw = value?.trim();
  if (!raw) return { parsed: true, value: undefined, raw };
  const cleaned = raw.replace(/[$,\s]/g, "").toUpperCase();
  if (cleaned === "0") return { parsed: true, value: 0, raw };
  const match = cleaned.match(/^(-?\d+(?:\.\d+)?)([KMB])?$/);
  if (!match) return { parsed: false, raw, warning: `Unparseable NOAA damage value: ${raw}` };
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return { parsed: false, raw, warning: `Unparseable NOAA damage value: ${raw}` };
  const multiplier = match[2] === "K" ? 1_000 : match[2] === "M" ? 1_000_000 : match[2] === "B" ? 1_000_000_000 : 1;
  return { parsed: true, value: Math.round(base * multiplier), raw };
}

export function mapNoaaEventTypeToArgusDomain(eventType?: string): ArgusHazardDomain {
  const normalized = normalizeToken(eventType);
  if (normalized.includes("tornado")) return "tornado";
  if (normalized.includes("flash flood") || normalized === "flood" || normalized.includes("flood")) return "flood";
  if (normalized.includes("hurricane") || normalized.includes("typhoon")) return "hurricane";
  if (normalized.includes("winter storm") || normalized.includes("blizzard") || normalized.includes("ice storm") || normalized.includes("heavy snow")) return "winter_storm";
  if (normalized.includes("excessive heat") || normalized === "heat" || normalized.includes("heat")) return "heatwave";
  if (normalized.includes("extreme cold") || normalized.includes("wind chill") || normalized.includes("cold")) return "coldwave";
  if (normalized.includes("drought")) return "drought";
  if (normalized.includes("wildfire")) return "wildfire";
  if (normalized.includes("fog")) return "extreme_weather";
  if (normalized.includes("wind") || normalized.includes("hail") || normalized.includes("lightning") || normalized.includes("thunderstorm") || normalized.includes("tropical storm")) return "storm";
  return "extreme_weather";
}

export function buildNoaaStormExternalId(row: NoaaStormEventDetailRow) {
  const eventId = row.EVENT_ID || row.event_id;
  if (eventId) return `NOAA-STORM:${sanitizeId(eventId)}`;
  const fallback = [row.EPISODE_ID, row.BEGIN_DATE_TIME, row.STATE, row.CZ_NAME, row.EVENT_TYPE].filter(Boolean).join(":");
  return `NOAA-STORM:${sanitizeId(fallback || "unknown")}`;
}

function historicalSeverity(row: NoaaStormEventDetailRow, propertyDamage?: number, cropDamage?: number): ArgusIncidentSeverity {
  const deaths = parseInteger(row.DEATHS_DIRECT) + parseInteger(row.DEATHS_INDIRECT);
  const injuries = parseInteger(row.INJURIES_DIRECT) + parseInteger(row.INJURIES_INDIRECT);
  const damage = (propertyDamage ?? 0) + (cropDamage ?? 0);
  const domain = mapNoaaEventTypeToArgusDomain(row.EVENT_TYPE);
  if (deaths > 0 || injuries >= 50 || damage >= 10_000_000) return "critical";
  if (injuries >= 10 || damage >= 1_000_000 || domain === "tornado" || domain === "hurricane") return "high";
  if (injuries > 0 || damage >= 50_000) return "medium";
  return "low";
}

function evidenceConfidence(hasCoordinates: boolean): ArgusEvidenceConfidenceScore {
  return {
    sourceReliability: 88,
    corroborationCount: 1,
    geolocationPrecision: hasCoordinates ? 72 : 38,
    timestampPrecision: 84,
    documentQuality: 82,
    extractionConfidence: 86,
    conflictWithOtherSources: 0,
    finalConfidence: hasCoordinates ? 86 : 80,
    label: "high",
  };
}

function medicalContextForDomain(domain: ArgusHazardDomain) {
  if (domain === "heatwave") return ["heat illness", "dehydration", "mortality context"];
  if (domain === "coldwave" || domain === "winter_storm") return ["hypothermia", "isolation risk", "cold exposure"];
  if (domain === "flood") return ["drowning risk", "hypothermia", "contaminated water"];
  if (domain === "tornado" || domain === "storm" || domain === "hurricane") return ["trauma risk", "debris injury", "structural damage"];
  return ["historical severe weather medical context"];
}

export function normalizeNoaaStormEventDetail(row: NoaaStormEventDetailRow): ArgusIncidentKnowledge | null {
  const externalId = buildNoaaStormExternalId(row);
  const eventType = compactText(row.EVENT_TYPE, "Storm Event");
  const domain = mapNoaaEventTypeToArgusDomain(eventType);
  const occurredAt = parseNoaaDate(row.BEGIN_DATE_TIME) ?? parseNoaaDate(row.BEGIN_YEARMONTH);
  const endedAt = parseNoaaDate(row.END_DATE_TIME);
  const detectedAt = occurredAt ?? nowIso();
  const beginLat = parseNumber(row.BEGIN_LAT);
  const beginLon = parseNumber(row.BEGIN_LON);
  const endLat = parseNumber(row.END_LAT);
  const endLon = parseNumber(row.END_LON);
  const hasCoordinates = typeof beginLat === "number" && typeof beginLon === "number";
  const propertyDamage = parseNoaaDamageValue(row.DAMAGE_PROPERTY);
  const cropDamage = parseNoaaDamageValue(row.DAMAGE_CROPS);
  const dataQualityFlags = [
    "historical_dataset_not_live",
    "methodology_varies_by_period_and_event_type",
    !hasCoordinates ? "missing_begin_coordinates" : undefined,
    propertyDamage.warning,
    cropDamage.warning,
  ].filter((item): item is string => Boolean(item));
  const severity = historicalSeverity(row, propertyDamage.value, cropDamage.value);
  const deaths = parseInteger(row.DEATHS_DIRECT) + parseInteger(row.DEATHS_INDIRECT);
  const injuries = parseInteger(row.INJURIES_DIRECT) + parseInteger(row.INJURIES_INDIRECT);
  const locality = compactText(row.CZ_NAME || row.BEGIN_LOCATION || row.COUNTY);
  const eventNarrative = compactText(row.EVENT_NARRATIVE);
  const episodeNarrative = compactText(row.EPISODE_NARRATIVE);
  const summary =
    eventNarrative ||
    episodeNarrative ||
    `${eventType} historical NOAA Storm Events record${locality ? ` for ${locality}` : ""}${row.STATE ? `, ${row.STATE}` : ""}.`;

  return {
    id: `noaa-storm-events-${sanitizeId(externalId)}`,
    title: `${eventType}${locality ? ` - ${locality}` : ""}${row.STATE ? `, ${row.STATE}` : ""}`,
    summary: summary.slice(0, 1200),
    domain,
    subtype: eventType,
    severity,
    confidenceScore: hasCoordinates ? 84 : 78,
    actionabilityScore: 18,
    sourceReliabilityScore: 88,
    evidenceCount: eventNarrative || episodeNarrative ? 1 : 0,
    sourceIds: [NOAA_SOURCE_ID],
    sourceNames: [NOAA_SOURCE_NAME],
    occurredAt,
    detectedAt,
    country: "US",
    region: row.STATE,
    locality,
    latitude: beginLat,
    longitude: beginLon,
    geometry: hasCoordinates ? { type: "Point", coordinates: [beginLon, beginLat] } : undefined,
    casualties: {
      fatalities: deaths,
      deaths,
      injured: injuries,
      injuries,
    },
    impact: {
      propertyDamage: propertyDamage.value,
      cropDamage: cropDamage.value,
      economicLossText: [
        row.DAMAGE_PROPERTY ? `property=${row.DAMAGE_PROPERTY}` : undefined,
        row.DAMAGE_CROPS ? `crops=${row.DAMAGE_CROPS}` : undefined,
      ].filter(Boolean).join("; ") || undefined,
      environmentalImpact: `${eventType} historical impact record from NOAA/NCEI.`,
    },
    technicalFactors: {
      episodeId: row.EPISODE_ID,
      eventType,
      magnitude: parseNumber(row.MAGNITUDE),
      magnitudeType: row.MAGNITUDE_TYPE,
      tornadoScale: row.TOR_F_SCALE,
      floodCause: row.FLOOD_CAUSE,
      beginLocation: row.BEGIN_LOCATION,
      endLocation: row.END_LOCATION,
      beginRange: row.BEGIN_RANGE,
      beginAzimuth: row.BEGIN_AZIMUTH,
      endRange: row.END_RANGE,
      endAzimuth: row.END_AZIMUTH,
      beginLat,
      beginLon,
      endLat,
      endLon,
      originalReportSource: row.SOURCE,
      endsAt: endedAt,
      dataQualityFlags,
      historicalDataset: true,
      notLiveSource: true,
      sourceRole: "historical_training_dataset",
      sourceUrl: buildNoaaStormEventsDetailsUrl(Number(row.BEGIN_YEARMONTH?.slice(0, 4)) || new Date(occurredAt ?? Date.now()).getUTCFullYear()),
      historicalPriority: severity === "critical" ? "P2" : severity === "high" ? "P3" : "P4",
      geospatialConfidence: hasCoordinates ? 0.72 : 0.25,
      rawDamageProperty: row.DAMAGE_PROPERTY,
      rawDamageCrops: row.DAMAGE_CROPS,
      medicalContext: medicalContextForDomain(domain),
      routingContext: ["Historical weather impact context only; do not close routes or mark active blockages."],
      fenixScenarioContext: ["Can seed an ARGUS Fenix historical demo scenario; not an active incident."],
    },
    causes: [eventType],
    contributingFactors: [row.MAGNITUDE_TYPE, row.TOR_F_SCALE, row.FLOOD_CAUSE].filter((item): item is string => Boolean(item)),
    responseActions: [
      "Use as historical context and training memory only.",
      "Validate current conditions with live official sources before operational decisions.",
    ],
    lessonsLearned: [],
    recommendedActions: [],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: [
      "noaa-storm-events",
      "NOAA",
      "NCEI",
      "historical_training_dataset",
      "not_live",
      "data_quality_caution",
      domain,
      eventType,
      row.STATE,
    ].filter((item): item is string => Boolean(item)),
    language: "en",
    rawEvidenceRefs: [externalId, row.EVENT_ID, row.EPISODE_ID].filter((item): item is string => Boolean(item)),
    createdAt: detectedAt,
    updatedAt: endedAt ?? detectedAt,
  };
}

export function buildNoaaStormEvidence(row: NoaaStormEventDetailRow, incident: ArgusIncidentKnowledge): ArgusKnowledgeEvidenceItem | null {
  const excerpt = compactText(row.EVENT_NARRATIVE) || compactText(row.EPISODE_NARRATIVE);
  if (!excerpt) return null;
  const hasCoordinates = typeof incident.latitude === "number" && typeof incident.longitude === "number";
  return {
    id: `noaa-storm-events-evidence-${sanitizeId(buildNoaaStormExternalId(row))}`,
    incidentId: incident.id,
    sourceId: NOAA_SOURCE_ID,
    sourceName: NOAA_SOURCE_NAME,
    title: "NOAA Storm Events narrative",
    url: incident.technicalFactors.sourceUrl,
    quote: excerpt.slice(0, 1600),
    summary: excerpt.slice(0, 1600),
    confidenceScore: evidenceConfidence(hasCoordinates),
    locationConfidence: hasCoordinates ? 0.72 : 0.25,
    timestampConfidence: incident.occurredAt ? 0.84 : 0.5,
    extractedAt: nowIso(),
    conflicts: ["Historical record: not live, not forecast, methodology and completeness vary across periods."],
  };
}

export function normalizeNoaaStormEventDetails(rows: NoaaStormEventDetailRow[]) {
  const incidents: ArgusIncidentKnowledge[] = [];
  const evidence: ArgusKnowledgeEvidenceItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const incident = normalizeNoaaStormEventDetail(row);
    if (!incident) continue;
    const externalId = buildNoaaStormExternalId(row);
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    incidents.push(incident);
    const item = buildNoaaStormEvidence(row, incident);
    if (item) evidence.push(item);
  }
  return { incidents, evidence };
}

export function buildNoaaStormEventsDetailsUrl(year: number) {
  const template = process.env.NOAA_STORM_EVENTS_DETAILS_URL_TEMPLATE?.trim();
  if (template) return template.replace(/\{year\}/g, String(year));
  return `${NOAA_BULK_DIR}StormEvents_details-ftp_v1.0_d${year}_latest.csv.gz`;
}

async function fetchTextWithTimeout(url: string, accept = "text/plain, text/csv, text/html, */*") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: "no-store", headers: { Accept: accept }, signal: controller.signal });
    if (!response.ok) throw new Error(`NOAA responded ${response.status} for ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBytesWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "text/csv, application/gzip, */*" }, signal: controller.signal });
    if (!response.ok) throw new Error(`NOAA responded ${response.status} for ${url}`);
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveNoaaDetailsUrl(year: number) {
  const explicit = process.env.NOAA_STORM_EVENTS_DETAILS_URL_TEMPLATE?.trim();
  if (explicit) return buildNoaaStormEventsDetailsUrl(year);
  const index = await fetchTextWithTimeout(NOAA_BULK_DIR, "text/html, text/plain");
  const regex = new RegExp(`href=["']?([^"'<>]*StormEvents_details-ftp_v1\\.0_d${year}_c\\d+\\.csv\\.gz)`, "i");
  const match = index.match(regex);
  if (!match?.[1]) {
    throw new Error(`NOAA Storm Events Details CSV for ${year} was not found in the official NCEI bulk directory.`);
  }
  return new URL(match[1], NOAA_BULK_DIR).toString();
}

function applyFilters(rows: NoaaStormEventDetailRow[], params: NoaaStormEventsFetchParams) {
  const state = params.state?.trim().toUpperCase();
  const stateName = state ? US_STATE_NAMES[state] ?? state : undefined;
  const eventTypes = new Set((params.eventTypes ?? []).map((item) => normalizeToken(item)));
  const minDeaths = Math.max(0, Math.trunc(params.minDeaths ?? 0));
  const minInjuries = Math.max(0, Math.trunc(params.minInjuries ?? 0));
  return rows.filter((row) => {
    if (stateName && row.STATE?.trim().toUpperCase() !== stateName) return false;
    if (eventTypes.size > 0 && !eventTypes.has(normalizeToken(row.EVENT_TYPE))) return false;
    if (minDeaths > 0 && parseInteger(row.DEATHS_DIRECT) + parseInteger(row.DEATHS_INDIRECT) < minDeaths) return false;
    if (minInjuries > 0 && parseInteger(row.INJURIES_DIRECT) + parseInteger(row.INJURIES_INDIRECT) < minInjuries) return false;
    if (params.hasCoordinates === true && (parseNumber(row.BEGIN_LAT) === undefined || parseNumber(row.BEGIN_LON) === undefined)) return false;
    return true;
  });
}

export async function fetchNoaaStormEventsDetailsCsv(params: NoaaStormEventsFetchParams) {
  if (!params.year) throw new Error("year is required for NOAA Storm Events Details CSV.");
  const year = Math.trunc(params.year);
  if (year < 1950 || year > new Date().getUTCFullYear() + 1) throw new Error("year must be a valid NOAA Storm Events year.");
  const endpoint = await resolveNoaaDetailsUrl(year);
  const bytes = await fetchBytesWithTimeout(endpoint);
  const csvText = endpoint.endsWith(".gz") ? gunzipSync(bytes).toString("utf8") : bytes.toString("utf8");
  return { endpoint, csvText };
}

export async function fetchAndNormalizeNoaaStormEvents(params: NoaaStormEventsFetchParams) {
  const limit = clampLimit(params.limit, params.mode === "import" ? 1000 : 100);
  const offset = Math.max(0, Math.trunc(params.offset ?? 0));
  const warnings = [
    "NOAA Storm Events is a historical dataset, not a live alert source or forecast.",
    "Coverage is limited to the United States and NOAA/NWS territories; methods and completeness vary across periods.",
  ];
  const { endpoint, csvText } = await fetchNoaaStormEventsDetailsCsv(params);
  const rows = parseNoaaStormEventsDetailsCsv(csvText);
  const filtered = applyFilters(rows, params);
  const selected = filtered.slice(offset, offset + limit);
  const normalized = normalizeNoaaStormEventDetails(selected);
  return {
    status: normalized.incidents.length === 0 ? "empty" as const : "ready" as const,
    sourceId: NOAA_SOURCE_ID,
    sourceName: NOAA_SOURCE_NAME,
    sourceRole: "historical_training_dataset" as const,
    isLiveSource: false,
    requiresApiKey: false as const,
    requiresConfiguration: false as const,
    endpoint,
    fetched: rows.length,
    parsed: rows.length,
    filtered: filtered.length,
    normalized: normalized.incidents.length,
    incidents: normalized.incidents,
    evidence: normalized.evidence,
    warnings,
    errors: [] as string[],
  };
}

export function getNoaaStormEventsAdapterStatus() {
  return {
    adapterId: "noaaStormEventsAdapter",
    sourceId: NOAA_SOURCE_ID,
    status: "ready" as const,
    sourceRole: "historical_training_dataset",
    isLiveSource: false,
    requiresApiKey: false,
    requiresConfiguration: false,
    officialSource: true,
    coverage: "United States and NOAA/NWS territories",
    importMode: "controlled_year_state_eventType",
    runAllDefault: false,
    mapLayer: {
      id: "noaa-storm-events-historical",
      name: "NOAA Storm Events Historical",
      layerType: "historical_events",
      sourceId: NOAA_SOURCE_ID,
      isLiveSource: false,
      defaultVisible: false,
      filters: ["year", "eventType", "domain", "deaths", "injuries", "damage"],
    },
    capabilities: ["details_csv", "preview", "controlled_import", "dedup_source_event_id", "historical_evidence"],
    limitations: [
      "Not live, not forecast and not a sensor feed.",
      "Not a worldwide weather dataset.",
      "Do not trigger evacuations, SOS, sanctions, route closures or citizen alerts.",
      "Damage and coordinates require caution; methodology and completeness vary historically.",
    ],
  };
}
