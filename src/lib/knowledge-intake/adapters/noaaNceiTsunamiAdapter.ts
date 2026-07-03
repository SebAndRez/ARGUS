import type {
  ArgusEvidenceConfidenceScore,
  ArgusIncidentKnowledge,
  ArgusIncidentSeverity,
  ArgusKnowledgeEvidenceItem,
} from "@/types/knowledgeIntake";

export type NoaaNceiTsunamiDatasetType = "events" | "runups" | "events-with-runups";

export type NoaaNceiTsunamiFetchParams = {
  dataset?: NoaaNceiTsunamiDatasetType;
  eventId?: string;
  year?: number;
  startYear?: number;
  endYear?: number;
  country?: string;
  region?: string;
  bbox?: string;
  minWaterHeight?: number;
  minDeaths?: number;
  cause?: string;
  validity?: string;
  limit?: number;
  offset?: number;
  persist?: boolean;
  includeRunups?: boolean;
  maxRunupsPerEvent?: number;
};

export type NoaaNceiTsunamiRow = Record<string, string>;

export type NoaaNceiTsunamiEvent = {
  sourceId: "noaa-ncei-tsunami";
  datasetType: "tsunami_event_database";
  tsunamiEventId: string;
  eventDate?: string;
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  sourceLatitude?: number;
  sourceLongitude?: number;
  sourceLocationText?: string;
  country?: string;
  region?: string;
  cause?: string;
  validity?: string;
  tsunamiMagnitude?: number;
  tsunamiIntensity?: number;
  maxWaterHeight?: number;
  deaths?: number;
  injuries?: number;
  housesDestroyed?: number;
  housesDamaged?: number;
  damageEstimate?: string;
  sourceEarthquakeMagnitude?: number;
  sourceEarthquakeDepth?: number;
  sourceVolcano?: string;
  raw: NoaaNceiTsunamiRow;
  dataQualityFlags: string[];
};

export type NoaaNceiTsunamiRunup = {
  sourceId: "noaa-ncei-tsunami";
  datasetType: "tsunami_runup_database";
  tsunamiEventId: string;
  runupId: string;
  locationName?: string;
  country?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  arrivalTime?: string;
  maxWaterHeight?: number;
  inundationDistance?: number;
  deaths?: number;
  injuries?: number;
  damage?: string;
  observationType?: string;
  validity?: string;
  measurementQuality?: string;
  raw: NoaaNceiTsunamiRow;
  dataQualityFlags: string[];
};

const SOURCE_ID = "noaa-ncei-tsunami";
const SOURCE_NAME = "NOAA NCEI/WDS Global Historical Tsunami Database";
const CITATION = "NCEI/WDS Global Historical Tsunami Database, DOI 10.7289/V5PN93H7";
const DEFAULT_EVENTS_URL = "https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1/tsunamis/events";
const DEFAULT_RUNUPS_URL = "https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1/tsunamis/runups";
const REQUEST_TIMEOUT_MS = 25_000;

function nowIso() {
  return new Date().toISOString();
}

function sanitizeId(value: string) {
  return value.replace(/[^a-zA-Z0-9:_-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function compactText(value?: string | number | null) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getField(row: NoaaNceiTsunamiRow, aliases: string[]) {
  const exact = aliases.find((alias) => row[alias] !== undefined);
  if (exact) return row[exact];
  const normalized = new Map(Object.keys(row).map((key) => [normalizeKey(key), key]));
  const key = aliases.map(normalizeKey).map((alias) => normalized.get(alias)).find(Boolean);
  return key ? row[key] : undefined;
}

function numberField(row: NoaaNceiTsunamiRow, aliases: string[]) {
  const raw = compactText(getField(row, aliases));
  if (!raw) return undefined;
  const cleaned = raw.replace(/,/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

function intField(row: NoaaNceiTsunamiRow, aliases: string[]) {
  const value = numberField(row, aliases);
  return typeof value === "number" ? Math.trunc(value) : undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function limitFrom(params: NoaaNceiTsunamiFetchParams, fallback = 100) {
  return clamp(Math.trunc(Number(params.limit ?? fallback)) || fallback, 1, 5000);
}

function offsetFrom(params: NoaaNceiTsunamiFetchParams) {
  return Math.max(0, Math.trunc(Number(params.offset ?? 0)) || 0);
}

function addQuery(url: string, params: NoaaNceiTsunamiFetchParams, dataset: "events" | "runups") {
  const next = new URL(url);
  const limit = limitFrom(params);
  const offset = offsetFrom(params);
  const pairs: Array<[string, string | number | undefined]> = [
    ["id", params.eventId],
    ["eventId", params.eventId],
    ["year", params.year],
    ["startYear", params.startYear],
    ["endYear", params.endYear],
    ["country", params.country],
    ["region", params.region],
    ["cause", params.cause],
    ["validity", params.validity],
    ["limit", limit],
    ["offset", offset],
  ];
  for (const [key, value] of pairs) {
    if (value !== undefined && value !== "") next.searchParams.set(key, String(value));
  }
  if (dataset === "runups" && params.eventId) next.searchParams.set("tsunamiEventId", params.eventId);
  if (params.bbox) next.searchParams.set("bbox", params.bbox);
  return next.toString();
}

export function buildNoaaNceiTsunamiEventsUrl(params: NoaaNceiTsunamiFetchParams = {}) {
  const base = process.env.NOAA_NCEI_TSUNAMI_EVENTS_URL?.trim() || DEFAULT_EVENTS_URL;
  return addQuery(base, params, "events");
}

export function buildNoaaNceiTsunamiRunupsUrl(params: NoaaNceiTsunamiFetchParams = {}) {
  const base = process.env.NOAA_NCEI_TSUNAMI_RUNUPS_URL?.trim() || DEFAULT_RUNUPS_URL;
  return addQuery(base, params, "runups");
}

function parseDelimitedRows(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const clean = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    const next = clean[index + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((item) => item.trim())) rows.push(row);
  }
  return rows;
}

export function parseNoaaNceiTsunamiTsv(text: string, datasetType: "events" | "runups"): NoaaNceiTsunamiRow[] {
  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows = parseDelimitedRows(text, delimiter);
  const [headers, ...body] = rows;
  if (!headers?.length) return [];
  const normalizedHeaders = headers.map((header) => compactText(header));
  return body
    .filter((row) => row.some((value) => compactText(value)))
    .map((row) => {
      const record = Object.fromEntries(normalizedHeaders.map((header, index) => [header, compactText(row[index])]));
      return { datasetType, ...record };
    });
}

function rowsFromHazelJson(value: unknown): NoaaNceiTsunamiRow[] {
  if (Array.isArray(value)) return value.map((item) => stringifyRecord(item));
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const candidates = [record.items, record.results, record.data, record.events, record.runups, record.features];
  const array = candidates.find(Array.isArray) as unknown[] | undefined;
  if (!array) return [];
  return array.map((item) => {
    if (item && typeof item === "object" && "properties" in item) {
      return stringifyRecord((item as { properties?: unknown }).properties ?? item);
    }
    return stringifyRecord(item);
  });
}

function stringifyRecord(value: unknown): NoaaNceiTsunamiRow {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, item == null ? "" : String(item)]));
}

async function fetchRows(url: string, datasetType: "events" | "runups") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "text/tab-separated-values, text/csv, application/json, */*" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`NOAA NCEI responded ${response.status} for ${url}`);
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    const trimmed = text.trim();
    if (contentType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return rowsFromHazelJson(JSON.parse(trimmed));
    }
    return parseNoaaNceiTsunamiTsv(text, datasetType);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchNoaaNceiTsunamiEvents(params: NoaaNceiTsunamiFetchParams = {}) {
  const endpoint = buildNoaaNceiTsunamiEventsUrl(params);
  return { endpoint, rows: await fetchRows(endpoint, "events") };
}

export async function fetchNoaaNceiTsunamiRunups(params: NoaaNceiTsunamiFetchParams = {}) {
  const endpoint = buildNoaaNceiTsunamiRunupsUrl(params);
  return { endpoint, rows: await fetchRows(endpoint, "runups") };
}

function buildEventDate(year?: number, month?: number, day?: number, hour?: number, minute?: number, second?: number) {
  if (typeof year !== "number" || year <= 0) return undefined;
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, second ?? 0));
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function parseEventId(row: NoaaNceiTsunamiRow) {
  return compactText(getField(row, ["ID", "EVENT_ID", "TSUNAMI_EVENT_ID", "TSEVENT_ID", "Tsunami Event ID", "id", "eventId"]));
}

export function mapNoaaNceiTsunamiCause(cause?: string) {
  const normalized = compactText(cause).toLowerCase();
  if (!normalized) return "unknown";
  if (normalized.includes("earthquake") || normalized === "eq") return "earthquake";
  if (normalized.includes("volcan")) return "volcanic";
  if (normalized.includes("landslide")) return "landslide";
  if (normalized.includes("meteor")) return "meteorological";
  return normalized;
}

export function mapNoaaNceiTsunamiValidity(validity?: string) {
  const normalized = compactText(validity).toLowerCase();
  if (!normalized) return "unknown";
  if (normalized.includes("definite") || normalized === "4") return "definite";
  if (normalized.includes("probable") || normalized === "3") return "probable";
  if (normalized.includes("question") || normalized.includes("doubt") || normalized === "2") return "questionable";
  if (normalized.includes("very doubtful") || normalized === "1") return "very_doubtful";
  return normalized;
}

function dataQualityFlags(input: {
  year?: number;
  lat?: number;
  lon?: number;
  validity?: string;
  deaths?: number;
  maxWaterHeight?: number;
  isRunup?: boolean;
}) {
  const validity = mapNoaaNceiTsunamiValidity(input.validity);
  return [
    input.year !== undefined && input.year < 1900 ? "ancientEvent" : undefined,
    input.year !== undefined && input.year <= 0 ? "approximateDate" : undefined,
    typeof input.lat !== "number" || typeof input.lon !== "number" ? "missingCoordinates" : undefined,
    validity === "questionable" || validity === "very_doubtful" ? "lowValidity" : undefined,
    input.isRunup && (validity === "questionable" || validity === "very_doubtful") ? "uncertainRunup" : undefined,
    input.deaths === undefined && input.maxWaterHeight === undefined ? "missingImpactData" : undefined,
    "historicalDataQualityCaution",
  ].filter((item): item is string => Boolean(item));
}

export function normalizeNoaaNceiTsunamiEvent(row: NoaaNceiTsunamiRow): NoaaNceiTsunamiEvent | null {
  const tsunamiEventId = parseEventId(row);
  if (!tsunamiEventId) return null;
  const year = intField(row, ["YEAR", "Year", "year"]);
  const month = intField(row, ["MONTH", "Month", "month"]);
  const day = intField(row, ["DAY", "Day", "day"]);
  const hour = intField(row, ["HOUR", "Hour", "hour"]);
  const minute = intField(row, ["MINUTE", "Minute", "minute"]);
  const second = intField(row, ["SECOND", "Second", "second"]);
  const sourceLatitude = numberField(row, ["LATITUDE", "SOURCE_LATITUDE", "EQ_LATITUDE", "latitude", "lat"]);
  const sourceLongitude = numberField(row, ["LONGITUDE", "SOURCE_LONGITUDE", "EQ_LONGITUDE", "longitude", "lon", "lng"]);
  const validity = compactText(getField(row, ["VALIDITY", "Tsunami Validity", "validity"]));
  const deaths = intField(row, ["DEATHS", "TOTAL_DEATHS", "Deaths", "deaths"]);
  const maxWaterHeight = numberField(row, ["MAXIMUM_WATER_HEIGHT", "MAX_WATER_HEIGHT", "Max Water Height", "maxWaterHeight"]);
  return {
    sourceId: SOURCE_ID,
    datasetType: "tsunami_event_database",
    tsunamiEventId,
    eventDate: buildEventDate(year, month, day, hour, minute, second),
    year,
    month,
    day,
    hour,
    minute,
    second,
    sourceLatitude,
    sourceLongitude,
    sourceLocationText: compactText(getField(row, ["LOCATION_NAME", "LOCATION", "SOURCE_LOCATION", "Location Name", "locationName"])),
    country: compactText(getField(row, ["COUNTRY", "Country", "country"])),
    region: compactText(getField(row, ["REGION", "Region", "region"])),
    cause: mapNoaaNceiTsunamiCause(getField(row, ["CAUSE", "Tsunami Cause", "cause"])),
    validity: mapNoaaNceiTsunamiValidity(validity),
    tsunamiMagnitude: numberField(row, ["TSUNAMI_MAGNITUDE", "Tsunami Magnitude", "tsunamiMagnitude"]),
    tsunamiIntensity: numberField(row, ["TSUNAMI_INTENSITY", "Tsunami Intensity", "tsunamiIntensity"]),
    maxWaterHeight,
    deaths,
    injuries: intField(row, ["INJURIES", "TOTAL_INJURIES", "Injuries", "injuries"]),
    housesDestroyed: intField(row, ["HOUSES_DESTROYED", "Houses Destroyed", "housesDestroyed"]),
    housesDamaged: intField(row, ["HOUSES_DAMAGED", "Houses Damaged", "housesDamaged"]),
    damageEstimate: compactText(getField(row, ["DAMAGE_MILLIONS_DOLLARS", "DAMAGE_DESCRIPTION", "Damage", "damageEstimate"])),
    sourceEarthquakeMagnitude: numberField(row, ["EQ_MAGNITUDE", "EARTHQUAKE_MAGNITUDE", "eqMagnitude"]),
    sourceEarthquakeDepth: numberField(row, ["EQ_DEPTH", "EARTHQUAKE_DEPTH", "eqDepth"]),
    sourceVolcano: compactText(getField(row, ["VOLCANO_NAME", "SOURCE_VOLCANO", "volcanoName"])),
    raw: row,
    dataQualityFlags: dataQualityFlags({ year, lat: sourceLatitude, lon: sourceLongitude, validity, deaths, maxWaterHeight }),
  };
}

export function normalizeNoaaNceiTsunamiRunup(row: NoaaNceiTsunamiRow): NoaaNceiTsunamiRunup | null {
  const tsunamiEventId = parseEventId(row);
  if (!tsunamiEventId) return null;
  const runupId = compactText(getField(row, ["RUNUP_ID", "ID", "Runup ID", "runupId"])) ||
    sanitizeId([tsunamiEventId, getField(row, ["LOCATION_NAME", "Location Name"]), getField(row, ["LATITUDE", "lat"]), getField(row, ["LONGITUDE", "lon"])].filter(Boolean).join(":"));
  const latitude = numberField(row, ["LATITUDE", "RUNUP_LATITUDE", "latitude", "lat"]);
  const longitude = numberField(row, ["LONGITUDE", "RUNUP_LONGITUDE", "longitude", "lon", "lng"]);
  const validity = compactText(getField(row, ["VALIDITY", "Runup Validity", "validity"]));
  const maxWaterHeight = numberField(row, ["WATER_HEIGHT", "MAXIMUM_WATER_HEIGHT", "MAX_WATER_HEIGHT", "Runup Height", "maxWaterHeight"]);
  const deaths = intField(row, ["DEATHS", "Deaths", "deaths"]);
  return {
    sourceId: SOURCE_ID,
    datasetType: "tsunami_runup_database",
    tsunamiEventId,
    runupId,
    locationName: compactText(getField(row, ["LOCATION_NAME", "LOCATION", "Location Name", "locationName"])),
    country: compactText(getField(row, ["COUNTRY", "Country", "country"])),
    region: compactText(getField(row, ["REGION", "Region", "region"])),
    latitude,
    longitude,
    arrivalTime: compactText(getField(row, ["ARRIVAL_TIME", "Arrival Time", "arrivalTime"])),
    maxWaterHeight,
    inundationDistance: numberField(row, ["INUNDATION_DISTANCE", "INUNDATION", "Inundation Distance", "inundationDistance"]),
    deaths,
    injuries: intField(row, ["INJURIES", "Injuries", "injuries"]),
    damage: compactText(getField(row, ["DAMAGE", "Damage", "damage"])),
    observationType: compactText(getField(row, ["MEASUREMENT_TYPE", "OBSERVATION_TYPE", "Observation Type", "observationType"])),
    validity: mapNoaaNceiTsunamiValidity(validity),
    measurementQuality: compactText(getField(row, ["MEASUREMENT_QUALITY", "Quality", "measurementQuality"])),
    raw: row,
    dataQualityFlags: dataQualityFlags({ lat: latitude, lon: longitude, validity, deaths, maxWaterHeight, isRunup: true }),
  };
}

function matchesFilters(event: NoaaNceiTsunamiEvent, params: NoaaNceiTsunamiFetchParams) {
  if (params.eventId && event.tsunamiEventId !== params.eventId) return false;
  if (params.year && event.year !== params.year) return false;
  if (params.startYear && (event.year ?? -Infinity) < params.startYear) return false;
  if (params.endYear && (event.year ?? Infinity) > params.endYear) return false;
  if (params.country && !event.country?.toLowerCase().includes(params.country.toLowerCase())) return false;
  if (params.region && !event.region?.toLowerCase().includes(params.region.toLowerCase())) return false;
  if (params.minWaterHeight && (event.maxWaterHeight ?? 0) < params.minWaterHeight) return false;
  if (params.minDeaths && (event.deaths ?? 0) < params.minDeaths) return false;
  if (params.cause && event.cause !== mapNoaaNceiTsunamiCause(params.cause)) return false;
  if (params.validity && event.validity !== mapNoaaNceiTsunamiValidity(params.validity)) return false;
  return true;
}

export function scoreNoaaNceiHistoricalTsunamiSeverity(event: NoaaNceiTsunamiEvent, runups: NoaaNceiTsunamiRunup[] = []): ArgusIncidentSeverity {
  const highestRunup = Math.max(event.maxWaterHeight ?? 0, ...runups.map((runup) => runup.maxWaterHeight ?? 0));
  const deaths = event.deaths ?? 0;
  const injuries = event.injuries ?? 0;
  const homes = (event.housesDestroyed ?? 0) + (event.housesDamaged ?? 0);
  if (deaths >= 100 || highestRunup >= 10 || homes >= 1000) return "critical";
  if (deaths > 0 || injuries >= 50 || highestRunup >= 5 || homes >= 100) return "high";
  if (injuries > 0 || highestRunup >= 1 || runups.length >= 5) return "medium";
  return "low";
}

export function scoreNoaaNceiTsunamiHistoricalConfidence(event: NoaaNceiTsunamiEvent, runups: NoaaNceiTsunamiRunup[] = []) {
  let score = 82;
  if (event.validity === "definite") score += 8;
  if (event.validity === "probable") score += 4;
  if (event.validity === "questionable") score -= 18;
  if (event.validity === "very_doubtful") score -= 30;
  if ((event.year ?? 0) > 0 && (event.year ?? 0) < 1900) score -= 8;
  if (typeof event.sourceLatitude !== "number" || typeof event.sourceLongitude !== "number") score -= 10;
  if (runups.length > 0) score += Math.min(8, runups.length);
  if (runups.some((runup) => runup.validity === "questionable" || runup.validity === "very_doubtful")) score -= 5;
  return clamp(Math.round(score), 25, 96);
}

function evidenceConfidence(runup: NoaaNceiTsunamiRunup): ArgusEvidenceConfidenceScore {
  const hasCoordinates = typeof runup.latitude === "number" && typeof runup.longitude === "number";
  const validity = mapNoaaNceiTsunamiValidity(runup.validity);
  const finalConfidence = clamp((hasCoordinates ? 82 : 68) - (validity === "questionable" ? 14 : validity === "very_doubtful" ? 25 : 0), 25, 92);
  return {
    sourceReliability: 94,
    corroborationCount: 1,
    geolocationPrecision: hasCoordinates ? 76 : 35,
    timestampPrecision: runup.arrivalTime ? 70 : 45,
    documentQuality: 82,
    extractionConfidence: 84,
    conflictWithOtherSources: 0,
    finalConfidence,
    label: finalConfidence >= 80 ? "high" : finalConfidence >= 55 ? "medium" : "low",
  };
}

export function buildNoaaNceiTsunamiExternalId(event: NoaaNceiTsunamiEvent) {
  return `${SOURCE_ID}:${sanitizeId(event.tsunamiEventId)}`;
}

export function buildNoaaNceiTsunamiGroupKey(event: NoaaNceiTsunamiEvent) {
  return `${SOURCE_ID}:event:${sanitizeId(event.tsunamiEventId)}`;
}

export function buildNoaaNceiTsunamiIncident(event: NoaaNceiTsunamiEvent, runups: NoaaNceiTsunamiRunup[] = []): ArgusIncidentKnowledge {
  const detectedAt = nowIso();
  const highestRunup = Math.max(event.maxWaterHeight ?? 0, ...runups.map((runup) => runup.maxWaterHeight ?? 0));
  const countriesAffectedFromRunups = [...new Set(runups.map((runup) => runup.country).filter(Boolean))];
  const confidenceScore = scoreNoaaNceiTsunamiHistoricalConfidence(event, runups);
  const titlePlace = event.sourceLocationText || event.country || event.region || "Unknown source area";
  const summary = [
    `Historical tsunami record for ${titlePlace}${event.year ? ` (${event.year})` : ""}.`,
    event.cause ? `Cause: ${event.cause}.` : undefined,
    highestRunup > 0 ? `Highest recorded water height/runup: ${highestRunup} m.` : undefined,
    event.deaths ? `Reported deaths: ${event.deaths}.` : undefined,
    "This is NOAA/NCEI historical memory, not a live warning or evacuation order.",
  ].filter(Boolean).join(" ");
  return {
    id: `noaa-ncei-tsunami-${sanitizeId(event.tsunamiEventId)}`,
    title: `Historical Tsunami - ${titlePlace}${event.year ? ` ${event.year}` : ""}`,
    summary,
    domain: "tsunami",
    subtype: "historical_tsunami",
    severity: scoreNoaaNceiHistoricalTsunamiSeverity(event, runups),
    confidenceScore,
    actionabilityScore: 22,
    sourceReliabilityScore: 94,
    evidenceCount: runups.length,
    sourceIds: [SOURCE_ID],
    sourceNames: [SOURCE_NAME],
    occurredAt: event.eventDate,
    detectedAt,
    country: event.country,
    region: event.region,
    locality: event.sourceLocationText,
    latitude: event.sourceLatitude,
    longitude: event.sourceLongitude,
    geometry: typeof event.sourceLatitude === "number" && typeof event.sourceLongitude === "number"
      ? { type: "Point", coordinates: [event.sourceLongitude, event.sourceLatitude] }
      : undefined,
    casualties: {
      fatalities: event.deaths,
      deaths: event.deaths,
      injured: event.injuries,
      injuries: event.injuries,
    },
    impact: {
      homesAffected: (event.housesDestroyed ?? 0) + (event.housesDamaged ?? 0) || undefined,
      economicLossText: event.damageEstimate,
      environmentalImpact: highestRunup > 0 ? `Historical tsunami max water height/runup ${highestRunup} m.` : undefined,
    },
    technicalFactors: {
      tsunamiEventId: event.tsunamiEventId,
      groupKey: buildNoaaNceiTsunamiGroupKey(event),
      cause: event.cause,
      validity: event.validity,
      tsunamiMagnitude: event.tsunamiMagnitude,
      tsunamiIntensity: event.tsunamiIntensity,
      maxWaterHeight: event.maxWaterHeight,
      waveHeightM: highestRunup || undefined,
      sourceEarthquakeMagnitude: event.sourceEarthquakeMagnitude,
      sourceEarthquakeDepth: event.sourceEarthquakeDepth,
      sourceVolcano: event.sourceVolcano,
      runupCount: runups.length,
      highestRunup: highestRunup || undefined,
      countriesAffectedFromRunups,
      historicalDataset: true,
      isLiveSource: false,
      notLiveSource: true,
      citation: CITATION,
      sourceRole: "historical_tsunami_dataset",
      sourceUrl: buildNoaaNceiTsunamiEventsUrl({ eventId: event.tsunamiEventId, limit: 1 }),
      dataQualityFlags: event.dataQualityFlags,
      noInventedGeometry: true,
      historicalSeverity: scoreNoaaNceiHistoricalTsunamiSeverity(event, runups),
      medicalContext: ["drowning", "hypothermia", "trauma", "contaminated water", "historical displacement context"],
      routingContext: ["Historical coastal tsunami memory only; do not close routes without current official authority."],
      fenixScenarioContext: ["Simulation based on NOAA/NCEI historical tsunami record; not an official inundation model."],
    } as ArgusIncidentKnowledge["technicalFactors"],
    causes: [event.cause ?? "unknown"],
    contributingFactors: [event.validity, event.sourceVolcano ? `volcano:${event.sourceVolcano}` : undefined].filter((item): item is string => Boolean(item)),
    responseActions: [
      "Use as historical tsunami memory and scenario context only.",
      "Validate current tsunami threat with NOAA Tsunami Warning Centers and local authorities.",
    ],
    lessonsLearned: [],
    recommendedActions: [],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["tsunami", "historical", "noaa", "ncei", "runup", "coastal", "not_live", "data_quality_caution"],
    language: "en",
    rawEvidenceRefs: [buildNoaaNceiTsunamiExternalId(event), event.tsunamiEventId],
    createdAt: detectedAt,
    updatedAt: detectedAt,
  };
}

export function buildNoaaNceiTsunamiRunupEvidence(runup: NoaaNceiTsunamiRunup, event?: NoaaNceiTsunamiEvent): ArgusKnowledgeEvidenceItem {
  const location = runup.locationName || runup.country || runup.region || "unknown location";
  const excerpt = [
    `Historical tsunami runup observation at ${location}.`,
    runup.maxWaterHeight !== undefined ? `Water height/runup ${runup.maxWaterHeight} m.` : undefined,
    runup.inundationDistance !== undefined ? `Inundation distance ${runup.inundationDistance} m.` : undefined,
    runup.deaths ? `Reported deaths ${runup.deaths}.` : undefined,
    `Citation: ${CITATION}.`,
  ].filter(Boolean).join(" ");
  return {
    id: `${SOURCE_ID}-runup-${sanitizeId(runup.tsunamiEventId)}-${sanitizeId(runup.runupId)}`,
    incidentId: event ? `noaa-ncei-tsunami-${sanitizeId(event.tsunamiEventId)}` : undefined,
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    title: `Historical tsunami runup observation - ${location}`,
    url: buildNoaaNceiTsunamiRunupsUrl({ eventId: runup.tsunamiEventId, limit: 1 }),
    quote: excerpt.slice(0, 1600),
    summary: excerpt.slice(0, 1600),
    confidenceScore: evidenceConfidence(runup),
    locationConfidence: typeof runup.latitude === "number" && typeof runup.longitude === "number" ? 0.76 : 0.35,
    timestampConfidence: runup.arrivalTime ? 0.7 : 0.45,
    extractedAt: nowIso(),
    conflicts: [
      "Historical runup observation only; not a live warning, evacuation order or official inundation model.",
      ...runup.dataQualityFlags,
    ],
  };
}

export function normalizeNoaaNceiTsunamiDataset(
  eventsRows: NoaaNceiTsunamiRow[],
  runupsRows: NoaaNceiTsunamiRow[],
  params: NoaaNceiTsunamiFetchParams = {}
) {
  const limit = limitFrom(params);
  const offset = offsetFrom(params);
  const events = eventsRows.map(normalizeNoaaNceiTsunamiEvent).filter((item): item is NoaaNceiTsunamiEvent => Boolean(item));
  const filteredEvents = events.filter((event) => matchesFilters(event, params)).slice(offset, offset + limit);
  const runups = runupsRows.map(normalizeNoaaNceiTsunamiRunup).filter((item): item is NoaaNceiTsunamiRunup => Boolean(item));
  const runupsByEvent = new Map<string, NoaaNceiTsunamiRunup[]>();
  for (const runup of runups) {
    if (!runupsByEvent.has(runup.tsunamiEventId)) runupsByEvent.set(runup.tsunamiEventId, []);
    runupsByEvent.get(runup.tsunamiEventId)!.push(runup);
  }
  const maxRunups = clamp(Math.trunc(Number(params.maxRunupsPerEvent ?? 50)) || 50, 0, 500);
  const incidents = filteredEvents.map((event) => buildNoaaNceiTsunamiIncident(event, (runupsByEvent.get(event.tsunamiEventId) ?? []).slice(0, maxRunups)));
  const evidence = filteredEvents.flatMap((event) => (runupsByEvent.get(event.tsunamiEventId) ?? []).slice(0, maxRunups).map((runup) => buildNoaaNceiTsunamiRunupEvidence(runup, event)));
  return {
    events: filteredEvents,
    runups,
    associatedRunups: filteredEvents.reduce((count, event) => count + Math.min(maxRunups, runupsByEvent.get(event.tsunamiEventId)?.length ?? 0), 0),
    incidents,
    evidence,
  };
}

export async function fetchAndNormalizeNoaaNceiTsunamis(params: NoaaNceiTsunamiFetchParams = {}) {
  const dataset = params.dataset ?? "events-with-runups";
  const includeRunups = params.includeRunups ?? dataset !== "events";
  const warnings = [
    "NOAA NCEI/WDS Global Historical Tsunami Database is historical memory only; it is not a live warning source.",
    "Do not infer evacuation orders, expected wave heights or official inundation geometry from this dataset alone.",
    "Historical event and runup quality varies by age, validity and source documentation.",
  ];
  const eventsResult = dataset === "runups" ? { endpoint: "", rows: [] } : await fetchNoaaNceiTsunamiEvents(params);
  const runupsResult = includeRunups ? await fetchNoaaNceiTsunamiRunups(params) : { endpoint: "", rows: [] };
  const normalized = normalizeNoaaNceiTsunamiDataset(eventsResult.rows, runupsResult.rows, params);
  return {
    status: normalized.incidents.length || normalized.runups.length ? "ready" as const : "empty" as const,
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    sourceRole: "historical_tsunami_dataset" as const,
    isLiveSource: false,
    requiresApiKey: false,
    citation: CITATION,
    eventsEndpoint: eventsResult.endpoint,
    runupsEndpoint: runupsResult.endpoint,
    fetchedEvents: eventsResult.rows.length,
    fetchedRunups: runupsResult.rows.length,
    normalizedEvents: normalized.events.length,
    normalizedRunups: normalized.runups.length,
    associatedRunups: normalized.associatedRunups,
    incidents: normalized.incidents,
    evidence: normalized.evidence,
    sampleRunups: normalized.runups.slice(0, 10),
    warnings,
    errors: [] as string[],
  };
}

export function getNoaaNceiTsunamiAdapterStatus() {
  return {
    adapterId: "noaaNceiTsunamiAdapter",
    sourceId: SOURCE_ID,
    status: "ready" as const,
    sourceRole: "historical_tsunami_dataset",
    isLiveSource: false,
    requiresApiKey: false,
    requiresConfiguration: false,
    officialSource: true,
    citationRequired: true,
    citation: CITATION,
    coverage: "Global historical tsunami records",
    importMode: "controlled_event_year_region_country_limit",
    runAllDefault: false,
    mapLayer: {
      id: "noaa-ncei-historical-tsunamis",
      name: "NOAA NCEI Historical Tsunamis",
      sourceId: SOURCE_ID,
      layerType: "historical_tsunami",
      isLiveSource: false,
      defaultVisible: false,
      noInventedGeometry: true,
      sublayers: ["Tsunami Sources", "Runup Observations", "High Runup Events", "Fatal Historical Tsunamis"],
    },
    capabilities: [
      "Tsunami Event Database",
      "Tsunami Runup Database",
      "KnowledgeIncident per historical event",
      "KnowledgeEvidence per runup observation",
      "historical severity scoring",
      "data quality flags",
    ],
    limitations: [
      "Historical only; not a live warning center.",
      "No invented coastal geometry or inundation polygons.",
      "Data quality varies by event age, validity and observation method.",
      "Runups create evidence, not separate KnowledgeIncident records.",
    ],
    phase2Planned: ["Tsunami Deposits", "Marigrams", "NOAA CO-OPS", "NDBC", "IOC Sea Level", "SHOA/JMA/BMKG/local authorities"],
  };
}
