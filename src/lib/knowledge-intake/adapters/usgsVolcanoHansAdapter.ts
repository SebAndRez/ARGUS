import type {
  ArgusIncidentKnowledge,
  ArgusIncidentSeverity,
  ArgusKnowledgeEvidenceItem,
  VolcanoAlertLevel,
  VolcanoAviationColorCode,
} from "@/types/knowledgeIntake";

export type UsgsVolcanoHansMode = "elevated" | "monitored" | "notices" | "geojson" | "all";
export type UsgsVolcanoHansObservatory = "all" | "avo" | "calvo" | "cvo" | "hvo" | "nmi" | "yvo";
export type UsgsVolcanoHansStatus = "ready" | "empty" | "partial" | "error";

export type UsgsVolcanoHansFetchParams = {
  mode?: UsgsVolcanoHansMode;
  observatory?: UsgsVolcanoHansObservatory;
  days?: number;
  limit?: number;
  persist?: boolean;
  includeNotices?: boolean;
  includeGeoJson?: boolean;
};

type HansRecord = Record<string, unknown>;

const SOURCE_ID = "usgs-volcano-hans";
const SOURCE_NAME = "USGS Volcano HANS";
const COVERAGE_NOTE = "USGS monitored volcanoes; global architecture supports additional regional volcano sources.";
const REQUEST_TIMEOUT_MS = 12_000;

const ENDPOINTS = {
  elevated: "https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes",
  monitored: "https://volcanoes.usgs.gov/hans-public/api/volcano/getMonitoredVolcanoes",
  capElevated: "https://volcanoes.usgs.gov/hans-public/api/volcano/getCapElevated",
  recentNotices: "https://volcanoes.usgs.gov/hans-public/api/notice/getRecentNotices",
  newestOrRecent: "https://volcanoes.usgs.gov/hans-public/api/notice/getNewestOrRecent",
  vscElevated: "https://volcanoes.usgs.gov/vsc/api/volcanoApi/elevated",
  vscGeoJson: "https://volcanoes.usgs.gov/vsc/api/volcanoApi/geojson",
};

function stringValue(record: HansRecord | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function numberValue(record: HansRecord | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function dateValue(record: HansRecord | undefined, keys: string[]) {
  const value = stringValue(record, keys);
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function normalizeLevel(value?: string): VolcanoAlertLevel {
  const level = value?.trim().toUpperCase();
  if (level === "NORMAL" || level === "ADVISORY" || level === "WATCH" || level === "WARNING" || level === "UNASSIGNED") return level;
  return level ? "UNKNOWN" : "UNKNOWN";
}

function normalizeColor(value?: string): VolcanoAviationColorCode {
  const color = value?.trim().toUpperCase();
  if (color === "GREEN" || color === "YELLOW" || color === "ORANGE" || color === "RED" || color === "UNASSIGNED") return color;
  return color ? "UNKNOWN" : "UNKNOWN";
}

function stripHtml(value?: string) {
  return value?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function asArray(data: unknown): HansRecord[] {
  if (Array.isArray(data)) return data.filter((item): item is HansRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  if (data && typeof data === "object") {
    const record = data as HansRecord;
    for (const key of ["data", "items", "volcanoes", "notices", "features"]) {
      const value = record[key];
      if (Array.isArray(value)) return asArray(value);
    }
    if ((record.type === "Feature" || record.properties) && typeof record.properties === "object") {
      return [record];
    }
    return [record];
  }
  return [];
}

function featureProperties(record: HansRecord): HansRecord {
  const properties = record.properties;
  return properties && typeof properties === "object" && !Array.isArray(properties)
    ? { ...(properties as HansRecord), geometry: record.geometry }
    : record;
}

function featurePoint(record: HansRecord) {
  const geometry = record.geometry as { type?: string; coordinates?: unknown } | undefined;
  if (geometry?.type === "Point" && Array.isArray(geometry.coordinates)) {
    const longitude = Number(geometry.coordinates[0]);
    const latitude = Number(geometry.coordinates[1]);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude, geometry };
  }
  return null;
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json, application/geo+json, text/plain",
        "User-Agent": "ARGUS-GRID/0.1 knowledge-intake-usgs-volcano-hans",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`USGS Volcano HANS responded ${response.status}`);
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error("USGS Volcano HANS returned non-JSON content");
    }
  } finally {
    clearTimeout(timeout);
  }
}

function withObservatory(url: string, observatory: UsgsVolcanoHansObservatory = "all", days?: number) {
  if (observatory === "all") return url;
  if (url.includes("/recent/{OBS}/{DAYS}")) return url.replace("{OBS}", observatory.toUpperCase()).replace("{DAYS}", String(days ?? 7));
  const params = new URLSearchParams({ obs: observatory.toUpperCase() });
  return `${url}?${params.toString()}`;
}

export async function fetchUsgsVolcanoElevated(params: UsgsVolcanoHansFetchParams = {}) {
  const warnings: string[] = [];
  try {
    const data = await fetchJsonWithTimeout<unknown>(withObservatory(ENDPOINTS.elevated, params.observatory));
    return { records: asArray(data), endpoint: ENDPOINTS.elevated, warnings };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "USGS HANS elevated endpoint failed");
    const data = await fetchJsonWithTimeout<unknown>(ENDPOINTS.vscElevated);
    warnings.push("VSC elevated fallback used.");
    return { records: asArray(data), endpoint: ENDPOINTS.vscElevated, warnings };
  }
}

export async function fetchUsgsVolcanoMonitored(params: UsgsVolcanoHansFetchParams = {}) {
  const data = await fetchJsonWithTimeout<unknown>(withObservatory(ENDPOINTS.monitored, params.observatory));
  return { records: asArray(data), endpoint: ENDPOINTS.monitored };
}

export async function fetchUsgsVolcanoRecentNotices(params: UsgsVolcanoHansFetchParams = {}) {
  const days = Math.min(Math.max(params.days ?? 7, 1), 7);
  const observatory = params.observatory ?? "all";
  const warnings: string[] = [];
  const endpoint = observatory === "all"
    ? ENDPOINTS.recentNotices
    : `https://volcanoes.usgs.gov/hans-public/api/notice/recent/{OBS}/{DAYS}`;
  try {
    const data = await fetchJsonWithTimeout<unknown>(withObservatory(endpoint, observatory, days));
    return { notices: asArray(data), endpoint, warnings };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "USGS HANS recent notices endpoint failed");
    const data = await fetchJsonWithTimeout<unknown>(ENDPOINTS.newestOrRecent);
    warnings.push("Newest-or-recent notices fallback used.");
    return { notices: asArray(data), endpoint: ENDPOINTS.newestOrRecent, warnings };
  }
}

export async function fetchUsgsVolcanoGeoJson() {
  const data = await fetchJsonWithTimeout<unknown>(ENDPOINTS.vscGeoJson);
  return { records: asArray(data), endpoint: ENDPOINTS.vscGeoJson };
}

export function mapUsgsVolcanoAlertLevelToSeverity(alertLevel?: string): ArgusIncidentSeverity {
  const level = normalizeLevel(alertLevel);
  if (level === "WARNING") return "critical";
  if (level === "WATCH") return "high";
  if (level === "ADVISORY") return "medium";
  if (level === "NORMAL") return "low";
  return "unknown";
}

export function mapUsgsVolcanoColorCodeToAviationRisk(colorCode?: string) {
  const color = normalizeColor(colorCode);
  if (color === "RED") return "critical_aviation_ash_hazard_context";
  if (color === "ORANGE") return "high_aviation_ash_hazard_context";
  if (color === "YELLOW") return "elevated_aviation_awareness_context";
  if (color === "GREEN") return "normal_aviation_monitoring_context";
  return "unknown_aviation_context";
}

function severityFromAlertAndColor(alertLevel?: string, colorCode?: string): ArgusIncidentSeverity {
  const alertSeverity = mapUsgsVolcanoAlertLevelToSeverity(alertLevel);
  const color = normalizeColor(colorCode);
  if (alertSeverity === "critical" || color === "RED") return "critical";
  if (alertSeverity === "high" || color === "ORANGE") return "high";
  if (alertSeverity === "medium" || color === "YELLOW") return "medium";
  if (alertSeverity === "low" || color === "GREEN") return "low";
  return "unknown";
}

function priorityFromSeverity(severity: ArgusIncidentSeverity) {
  if (severity === "critical") return "critical" as const;
  if (severity === "high") return "high" as const;
  if (severity === "medium") return "medium" as const;
  return "low" as const;
}

export function buildUsgsVolcanoExternalId(record: HansRecord) {
  const normalized = featureProperties(record);
  const noticeId = stringValue(normalized, ["noticeId", "id", "notice_id"]);
  if (noticeId) return `notice:${noticeId}`;
  const volcanoCode = stringValue(normalized, ["volcanoCd", "volcanoCode", "vnum", "vNum", "vnum_str", "volcano_number", "volcanoNumber", "cd"]);
  const alertLevel = normalizeLevel(stringValue(normalized, ["alertLevel", "alert_level", "alert"]));
  const colorCode = normalizeColor(stringValue(normalized, ["colorCode", "aviationColorCode", "color_code", "aviation_color_code"]));
  return `volcano:${volcanoCode ?? stringValue(normalized, ["vName", "volcanoName", "name"]) ?? "unknown"}:${alertLevel}:${colorCode}`;
}

function buildCurrentVolcanoExternalId(record: HansRecord) {
  const normalized = featureProperties(record);
  const volcanoCode = stringValue(normalized, ["volcanoCd", "volcanoCode", "vnum", "vNum", "vnum_str", "volcano_number", "volcanoNumber", "cd"]);
  return `volcano-current:${volcanoCode ?? stringValue(normalized, ["vName", "volcanoName", "name"]) ?? "unknown"}`;
}

export function normalizeUsgsVolcanoRecord(record: HansRecord): ArgusIncidentKnowledge | null {
  const data = featureProperties(record);
  const point = featurePoint(record);
  const volcanoName = stringValue(data, ["vName", "volcanoName", "volcano_name", "name", "volcano"]);
  const volcanoCode = stringValue(data, ["volcanoCd", "volcanoCode", "vnum", "vNum", "vnum_str", "cd"]);
  if (!volcanoName && !volcanoCode) return null;
  const alertLevelRaw = stringValue(data, ["alertLevel", "alert_level", "alert"]);
  const colorCodeRaw = stringValue(data, ["colorCode", "aviationColorCode", "color_code", "aviation_color_code"]);
  const alertLevel = normalizeLevel(alertLevelRaw);
  const aviationColorCode = normalizeColor(colorCodeRaw);
  const severity = severityFromAlertAndColor(alertLevel, aviationColorCode);
  const latitude = point?.latitude ?? numberValue(data, ["lat", "latitude"]);
  const longitude = point?.longitude ?? numberValue(data, ["long", "lon", "longitude"]);
  const updatedAt = dateValue(data, ["sentUtc", "alertDate", "updated", "updatedAt", "lastModified", "noticeDate"]) ?? new Date().toISOString();
  const noticeUrl = stringValue(data, ["noticeUrl", "url", "link"]);
  const synopsis = stripHtml(stringValue(data, ["noticeSynopsis", "synopsis", "summary", "description"])) ??
    `${SOURCE_NAME} reports ${volcanoName ?? "a USGS monitored volcano"} at alert level ${alertLevel} and aviation color code ${aviationColorCode}.`;
  const id = `usgs-volcano-hans-${buildCurrentVolcanoExternalId(data).replace(/[^a-zA-Z0-9:_-]+/g, "-")}`;

  return {
    id,
    title: `${volcanoName ?? "USGS monitored volcano"} - ${alertLevel} / ${aviationColorCode}`,
    summary: `${synopsis} ${COVERAGE_NOTE}`,
    domain: "volcano",
    subtype: "usgs_volcano_hans_alert",
    severity,
    confidenceScore: severity === "unknown" ? 72 : 88,
    actionabilityScore: severity === "critical" ? 66 : severity === "high" ? 58 : severity === "medium" ? 46 : 28,
    sourceReliabilityScore: 92,
    evidenceCount: noticeUrl ? 1 : 0,
    sourceIds: [SOURCE_ID],
    sourceNames: [SOURCE_NAME],
    occurredAt: dateValue(data, ["alertDate", "sentUtc", "noticeDate"]) ?? updatedAt,
    detectedAt: updatedAt,
    country: stringValue(data, ["country", "countryCode"]),
    region: stringValue(data, ["region", "subregion", "state"]),
    locality: volcanoName,
    latitude,
    longitude,
    geometry: point?.geometry ?? (typeof latitude === "number" && typeof longitude === "number" ? { type: "Point", coordinates: [longitude, latitude] } : undefined),
    technicalFactors: {
      volcanoName,
      volcanoNumber: stringValue(data, ["vnum", "vNum", "volcanoNumber", "volcano_number"]),
      volcanoCode,
      observatory: stringValue(data, ["obs", "observatory"]),
      alertLevel,
      previousAlertLevel: normalizeLevel(stringValue(data, ["alertLevelPrev", "previousAlertLevel"])),
      aviationColorCode,
      previousAviationColorCode: normalizeColor(stringValue(data, ["colorCodePrev", "previousColorCode", "previousAviationColorCode"])),
      nvewsThreat: stringValue(data, ["nvewsThreat", "nvews_threat"]),
      noticeId: stringValue(data, ["noticeId", "id"]),
      noticeType: stringValue(data, ["noticeType", "type"]),
      noticeSynopsis: synopsis,
      ashfallRisk: aviationColorCode === "RED" || aviationColorCode === "ORANGE" ? "possible_ash_aviation_context" : "not_indicated_by_color_code",
      aviationRisk: mapUsgsVolcanoColorCodeToAviationRisk(aviationColorCode),
      lastNoticeAt: updatedAt,
      sourceCoverageNote: COVERAGE_NOTE,
      priorityHint: severity === "critical" ? "P1" : severity === "high" ? "P2" : severity === "medium" ? "P3" : "P4",
      medicalContext: ["ash exposure", "respiratory irritation", "eye irritation", "low visibility context"],
      routingContext: ["Volcano HANS can mark hazard context; do not close routes without transport or local authority confirmation."],
      fenixScenarioContext: ["Can seed an ARGUS Fenix preview scenario; not an official local evacuation model."],
    },
    impact: {
      environmentalImpact: "Volcanic activity context from USGS Volcano HANS for monitored volcanoes.",
    },
    causes: ["Volcanic alert or notice from USGS Volcano HANS"],
    contributingFactors: [`Alert level: ${alertLevel}`, `Aviation color code: ${aviationColorCode}`],
    responseActions: [
      "Use USGS Volcano HANS as official USGS monitored-volcano awareness.",
      "Keep terrestrial alert level separate from aviation color code.",
      "Validate local or regional volcano authorities before critical civil protection, routing or evacuation decisions.",
    ],
    lessonsLearned: [],
    recommendedActions: [
      {
        id: `rec-${id}`,
        audience: "institutional",
        priority: priorityFromSeverity(severity),
        text: "Review the HANS notice, observatory update and local/regional official volcano authority before operational escalation.",
        rationale: "USGS HANS is authoritative for USGS monitored volcanoes, but it is not a complete worldwide local authority.",
        confidenceScore: 82,
        safetyLimit: "Informational ARGUS estimate; not an official evacuation, route closure or civil protection order.",
        requiresHumanValidation: true,
      },
    ],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["usgs-volcano-hans", "volcano", "aviation-hazard", "ashfall", alertLevel.toLowerCase(), aviationColorCode.toLowerCase()],
    language: "en",
    rawEvidenceRefs: [noticeUrl, `${SOURCE_ID}:${buildCurrentVolcanoExternalId(data)}`].filter((item): item is string => Boolean(item)),
    createdAt: updatedAt,
    updatedAt,
  };
}

export function normalizeUsgsVolcanoNotice(notice: HansRecord): ArgusKnowledgeEvidenceItem | null {
  const data = featureProperties(notice);
  const noticeId = stringValue(data, ["noticeId", "notice_identifier", "id", "notice_id"]);
  const volcanoName = stringValue(data, ["vName", "volcanoName", "volcano_name", "name", "volcano", "volcanoes"]);
  const volcanoCode = stringValue(data, ["volcanoCd", "volcanoCode", "vnum", "vNum", "vnum_str", "cd"]);
  if (!noticeId && !volcanoName && !volcanoCode) return null;
  const synopsis = stripHtml(stringValue(data, ["noticeSynopsis", "synopsis", "summary", "description", "noticeData", "notice_data", "notice_category"])) ?? "USGS Volcano HANS notice.";
  const sentUtc = dateValue(data, ["sentUtc", "sent_utc", "noticeDate", "alertDate", "updatedAt"]) ?? new Date().toISOString();
  return {
    id: `${SOURCE_ID}:notice:${noticeId ?? volcanoCode ?? volcanoName ?? sentUtc}`,
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    title: `${volcanoName ?? "USGS volcano"} notice${noticeId ? ` ${noticeId}` : ""}`,
    url: stringValue(data, ["noticeUrl", "notice_url", "url", "link"]),
    quote: synopsis.slice(0, 500),
    summary: synopsis,
    confidenceScore: {
      sourceReliability: 92,
      corroborationCount: 1,
      geolocationPrecision: numberValue(data, ["lat", "latitude"]) && numberValue(data, ["long", "lon", "longitude"]) ? 82 : 45,
      timestampPrecision: 86,
      documentQuality: 76,
      extractionConfidence: 78,
      conflictWithOtherSources: 0,
      finalConfidence: 84,
      label: "high",
    },
    locationConfidence: numberValue(data, ["lat", "latitude"]) && numberValue(data, ["long", "lon", "longitude"]) ? 82 : 45,
    timestampConfidence: 86,
    extractedAt: sentUtc,
    conflicts: [],
  };
}

export function normalizeUsgsVolcanoEvents(records: HansRecord[]) {
  const seen = new Set<string>();
  return records
    .map(normalizeUsgsVolcanoRecord)
    .filter((incident): incident is ArgusIncidentKnowledge => Boolean(incident))
    .filter((incident) => {
      const key = incident.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export async function fetchUsgsVolcanoHans(params: UsgsVolcanoHansFetchParams = {}) {
  const mode = params.mode ?? "elevated";
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 250);
  const includeNotices = params.includeNotices ?? true;
  const includeGeoJson = params.includeGeoJson ?? false;
  const warnings: string[] = [];
  const errors: string[] = [];
  const records: HansRecord[] = [];
  let notices: HansRecord[] = [];
  let endpoint: string | undefined;
  let geoJsonEndpoint: string | undefined;

  try {
    if (mode === "elevated" || mode === "all") {
      const result = await fetchUsgsVolcanoElevated(params);
      records.push(...result.records);
      endpoint = result.endpoint;
      warnings.push(...result.warnings);
    }
    if (mode === "monitored" || mode === "all") {
      const result = await fetchUsgsVolcanoMonitored(params);
      records.push(...result.records);
      endpoint = endpoint ?? result.endpoint;
    }
    if (includeGeoJson || mode === "geojson" || mode === "all") {
      const result = await fetchUsgsVolcanoGeoJson();
      records.push(...result.records);
      geoJsonEndpoint = result.endpoint;
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "USGS Volcano HANS volcano fetch failed");
  }

  if (includeNotices || mode === "notices" || mode === "all") {
    try {
      const result = await fetchUsgsVolcanoRecentNotices(params);
      notices = result.notices;
      warnings.push(...result.warnings);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "USGS Volcano HANS notices fetch failed");
    }
  }

  const incidentRecords = mode === "notices" ? notices : records.length > 0 ? records : notices;
  const incidents = normalizeUsgsVolcanoEvents(incidentRecords).slice(0, limit);
  const evidence = notices.map(normalizeUsgsVolcanoNotice).filter((item): item is ArgusKnowledgeEvidenceItem => Boolean(item)).slice(0, limit);
  const status: UsgsVolcanoHansStatus = incidents.length > 0
    ? errors.length > 0 ? "partial" : "ready"
    : evidence.length > 0
      ? "partial"
      : errors.length > 0
        ? "error"
        : "empty";

  return {
    adapterId: "usgsVolcanoHansAdapter",
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    status,
    fetchedAt: new Date().toISOString(),
    endpoint,
    geoJsonEndpoint,
    fetched: records.length + notices.length,
    volcanoRecords: records.length,
    noticeRecords: notices.length,
    count: incidents.length,
    evidenceCount: evidence.length,
    incidents,
    evidence,
    warnings,
    errors,
    requiresApiKey: false,
    requiresConfiguration: false,
    coverageNote: COVERAGE_NOTE,
  };
}

export function getUsgsVolcanoHansAdapterStatus() {
  return {
    adapterId: "usgsVolcanoHansAdapter",
    sourceId: SOURCE_ID,
    status: "ready" as const,
    requiresApiKey: false,
    requiresConfiguration: false,
    message: "USGS Volcano HANS public endpoints are available for no-key controlled Knowledge Intake ingestion.",
    capabilities: ["volcano_alerts", "recent_notices", "geojson_fallback", "no_api_key", "official_usgs_monitored_volcanoes", "map_layer:usgs_volcano_hans_alerts"],
    mapLayer: "USGS Volcano HANS Alerts",
    limitations: [
      "Official USGS source for USGS monitored volcanoes; not a complete worldwide volcano authority.",
      "Aviation color code is kept separate from terrestrial alert level and must not become an automatic civil evacuation order.",
    ],
    coverageNote: COVERAGE_NOTE,
    envelopes: [],
  };
}
