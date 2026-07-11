import type { ArgusHazardDomain, ArgusIncidentKnowledge, ArgusIncidentSeverity } from "@/types/knowledgeIntake";

export type GdacsEventType = "EQ" | "TC" | "FL" | "VO" | "DR" | "WF" | "TS" | string;
export type GdacsAlertLevel = "green" | "orange" | "red" | "unknown";

export type GdacsFetchParams = {
  eventTypes?: GdacsEventType[];
  fromDate?: string;
  toDate?: string;
  alertLevels?: GdacsAlertLevel[];
  limit?: number;
  page?: number;
  persist?: boolean;
  daysBack?: number;
};

export type GdacsRssFeature = {
  title?: string;
  description?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  dateModified?: string;
  eventType?: string;
  alertLevel?: string;
  eventId?: string;
  episodeId?: string;
  country?: string;
  iso3?: string;
  severity?: string;
  population?: number;
  populationText?: string;
  vulnerability?: string | number;
  latitude?: number;
  longitude?: number;
  geometry?: Record<string, unknown>;
};

type GdacsFetchResult = {
  adapterId: "gdacsAdapter";
  sourceId: "gdacs";
  sourceName: "GDACS";
  status: "ready" | "error" | "empty" | "partial";
  fetchedAt: string;
  fetched: number;
  count: number;
  incidents: ArgusIncidentKnowledge[];
  warnings: string[];
  errors: string[];
  requiresApiKey: false;
  requiresConfiguration: false;
};

const GDACS_FEED_URLS = [
  "https://www.gdacs.org/xml/rss_24h.xml",
  "https://www.gdacs.org/xml/rss_7d.xml",
];

const REQUEST_TIMEOUT_MS = 10_000;

function decodeXml(value: string) {
  return value
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, "$1")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function stripHtml(value?: string) {
  return decodeXml((value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getTagValue(xml: string, tagName: string) {
  const tag = escapeRegExp(tagName);
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function parseDate(value?: string) {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function parseNumber(value?: string) {
  if (!value) return undefined;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCoordinate(value?: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseGdacsRss(xml: string): GdacsRssFeature[] {
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  return items.map((itemXml) => {
    const geoRssPoint = getTagValue(itemXml, "georss:point").split(/\s+/).map(Number);
    const latitude = parseCoordinate(getTagValue(itemXml, "geo:lat")) ?? (Number.isFinite(geoRssPoint[0]) ? geoRssPoint[0] : undefined);
    const longitude = parseCoordinate(getTagValue(itemXml, "geo:long")) ?? (Number.isFinite(geoRssPoint[1]) ? geoRssPoint[1] : undefined);
    return {
      title: stripHtml(getTagValue(itemXml, "title")),
      description: stripHtml(getTagValue(itemXml, "description")),
      link: getTagValue(itemXml, "link"),
      guid: getTagValue(itemXml, "guid"),
      pubDate: getTagValue(itemXml, "pubDate"),
      dateModified: getTagValue(itemXml, "gdacs:datemodified"),
      eventType: getTagValue(itemXml, "gdacs:eventtype").toUpperCase(),
      alertLevel: getTagValue(itemXml, "gdacs:alertlevel").toLowerCase(),
      eventId: getTagValue(itemXml, "gdacs:eventid"),
      episodeId: getTagValue(itemXml, "gdacs:episodeid"),
      country: stripHtml(getTagValue(itemXml, "gdacs:country")),
      iso3: getTagValue(itemXml, "gdacs:iso3"),
      severity: stripHtml(getTagValue(itemXml, "gdacs:severity")),
      population: parseNumber(getTagValue(itemXml, "gdacs:population")),
      populationText: stripHtml(getTagValue(itemXml, "gdacs:population")),
      vulnerability: stripHtml(getTagValue(itemXml, "gdacs:vulnerability")),
      latitude,
      longitude,
      geometry: typeof latitude === "number" && typeof longitude === "number"
        ? { type: "Point", coordinates: [longitude, latitude] }
        : undefined,
    };
  });
}

async function fetchTextWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml",
        "User-Agent": "ARGUS-GRID/0.1 knowledge-intake-gdacs",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GDACS responded ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export function mapGdacsEventTypeToArgusDomain(eventType?: string): ArgusHazardDomain {
  const normalized = eventType?.toUpperCase();
  if (normalized === "EQ") return "earthquake";
  if (normalized === "TC") return "hurricane";
  if (normalized === "FL") return "flood";
  if (normalized === "VO") return "volcano";
  if (normalized === "DR") return "drought";
  if (normalized === "WF") return "wildfire";
  if (normalized === "TS") return "tsunami";
  return "natural_disaster";
}

export function mapGdacsAlertLevelToSeverity(alertLevel?: string): ArgusIncidentSeverity {
  const normalized = alertLevel?.toLowerCase();
  if (normalized === "red") return "critical";
  if (normalized === "orange") return "high";
  if (normalized === "green") return "low";
  return "medium";
}

function normalizeAlertLevel(alertLevel?: string): GdacsAlertLevel {
  const normalized = alertLevel?.toLowerCase();
  if (normalized === "green" || normalized === "orange" || normalized === "red") return normalized;
  return "unknown";
}

/**
 * GDACS floods report `<gdacs:population>` as free text ("0 deaths and 1000
 * displaced") rather than a clean number — the `value` attribute is left at
 * 0 for this hazard type, so it must be parsed from the text.
 */
function parseGdacsCasualtyCounts(populationText?: string): { deaths?: number; displaced?: number } {
  if (!populationText) return {};
  const deathsMatch = populationText.match(/(\d[\d,]*)\s*deaths?/i);
  const displacedMatch = populationText.match(/(\d[\d,]*)\s*displaced/i);
  return {
    deaths: deathsMatch ? Number(deathsMatch[1].replace(/,/g, "")) : undefined,
    displaced: displacedMatch ? Number(displacedMatch[1].replace(/,/g, "")) : undefined,
  };
}

/**
 * A GDACS Green alert is low severity by default. It only rises — and only
 * to medium/high, never critical by this path — when the impact fields
 * themselves justify it: real displaced count or exposed population above a
 * conservative threshold. Confirmed deaths (>0) are handled separately by
 * `detectCriticalImpactSignals` in threatClassifier, which already escalates
 * to critical for any source when free text reports a real (nonzero) death
 * count — this function only covers the displaced/exposed-population case
 * that generic text scan can't see.
 */
const GREEN_ESCALATION_DISPLACED_HIGH = 10_000;
const GREEN_ESCALATION_DISPLACED_MEDIUM = 1_000;
const GREEN_ESCALATION_POPULATION_HIGH = 50_000;

function escalateGdacsGreenSeverity(
  baseSeverity: ArgusIncidentSeverity,
  alertLevel: GdacsAlertLevel,
  casualties: { deaths?: number; displaced?: number },
  populationAffected?: number
): ArgusIncidentSeverity {
  if (alertLevel !== "green") return baseSeverity;
  if ((casualties.displaced ?? 0) >= GREEN_ESCALATION_DISPLACED_HIGH) return "high";
  if ((populationAffected ?? 0) >= GREEN_ESCALATION_POPULATION_HIGH) return "high";
  if ((casualties.displaced ?? 0) >= GREEN_ESCALATION_DISPLACED_MEDIUM) return "medium";
  return baseSeverity;
}

export function buildGdacsExternalId(feature: GdacsRssFeature) {
  const eventType = feature.eventType?.toUpperCase() || "UNKNOWN";
  if (feature.eventId && feature.episodeId) return `${eventType}:${feature.eventId}:${feature.episodeId}`;
  if (feature.eventId) return `${eventType}:${feature.eventId}`;
  const fallback = [
    eventType,
    stripHtml(feature.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80),
    parseDate(feature.pubDate) ?? "unknown-date",
    typeof feature.latitude === "number" ? feature.latitude.toFixed(1) : "no-lat",
    typeof feature.longitude === "number" ? feature.longitude.toFixed(1) : "no-lon",
  ].join(":");
  return fallback;
}

function priorityHint(alertLevel: GdacsAlertLevel, severity: ArgusIncidentSeverity) {
  if (alertLevel === "red" || severity === "critical") return "P0" as const;
  if (alertLevel === "orange" || severity === "high") return "P1" as const;
  if (alertLevel === "green") return "P3" as const;
  return "P2" as const;
}

function medicalContextForDomain(domain: ArgusHazardDomain) {
  if (domain === "earthquake") return ["possible trauma", "entrapment risk", "route disruption"];
  if (domain === "flood") return ["hypothermia risk", "isolation", "water contamination"];
  if (domain === "hurricane" || domain === "storm") return ["trauma risk", "power disruption", "structural damage"];
  if (domain === "wildfire") return ["smoke exposure", "burn risk", "evacuation support"];
  if (domain === "volcano") return ["ash exposure", "respiratory risk"];
  if (domain === "drought") return ["public health stress", "water supply pressure"];
  return ["multi-hazard medical context"];
}

export function normalizeGdacsEvent(feature: GdacsRssFeature): ArgusIncidentKnowledge | null {
  const externalId = buildGdacsExternalId(feature);
  const domain = mapGdacsEventTypeToArgusDomain(feature.eventType);
  const alertLevel = normalizeAlertLevel(feature.alertLevel);
  const casualtyCounts = parseGdacsCasualtyCounts(feature.populationText);
  const severity = escalateGdacsGreenSeverity(
    mapGdacsAlertLevelToSeverity(alertLevel),
    alertLevel,
    casualtyCounts,
    feature.population
  );
  const occurredAt = parseDate(feature.pubDate) ?? parseDate(feature.dateModified);
  const updatedAt = parseDate(feature.dateModified) ?? occurredAt ?? new Date().toISOString();
  const confidenceScore = alertLevel === "unknown" ? 72 : 86;
  const actionabilityScore = alertLevel === "red" ? 82 : alertLevel === "orange" ? 70 : 48;
  const title = feature.title || `GDACS ${feature.eventType ?? "event"}`;
  const sourceUrl = feature.link || feature.guid || `gdacs:${externalId}`;

  return {
    id: `gdacs-${externalId}`,
    title,
    summary: feature.description || `GDACS reported a ${domain} alert. Validate with local official authorities before critical decisions.`,
    domain,
    subtype: feature.eventType ? `gdacs_${feature.eventType.toLowerCase()}` : "gdacs_multi_hazard",
    severity,
    confidenceScore,
    actionabilityScore,
    sourceReliabilityScore: 92,
    evidenceCount: 1,
    sourceIds: ["gdacs"],
    sourceNames: ["GDACS"],
    occurredAt,
    detectedAt: updatedAt,
    country: feature.iso3 || feature.country || undefined,
    region: feature.country || undefined,
    locality: feature.country || undefined,
    latitude: feature.latitude,
    longitude: feature.longitude,
    geometry: feature.geometry,
    impact: feature.population ? { peopleAffected: feature.population } : undefined,
    casualties: casualtyCounts.deaths !== undefined || casualtyCounts.displaced !== undefined ? casualtyCounts : undefined,
    technicalFactors: {
      gdacsEventType: feature.eventType,
      gdacsEventId: feature.eventId,
      gdacsEpisodeId: feature.episodeId,
      gdacsAlertLevel: alertLevel,
      gdacsSeverity: feature.severity,
      vulnerability: feature.vulnerability,
      exposedPopulation: feature.population,
      priorityHint: priorityHint(alertLevel, severity),
      medicalContext: medicalContextForDomain(domain),
      routingContext: ["Use GDACS as affected-area context only; do not mark official route closures from GDACS alone."],
      fenixScenarioContext: ["Can seed a conservative ARGUS Fenix preview scenario; not an official model."],
    },
    causes: [`GDACS ${feature.eventType ?? "multi-hazard"} alert`],
    contributingFactors: [feature.severity, feature.vulnerability ? `Vulnerability: ${feature.vulnerability}` : undefined].filter(
      (item): item is string => Boolean(item)
    ),
    responseActions: [
      "Use GDACS as global awareness context.",
      "Validate local official instructions before critical action.",
      "Do not generate sanctions or automatic citizen actions from GDACS alone.",
    ],
    lessonsLearned: [],
    recommendedActions: [
      {
        id: `rec-gdacs-${externalId}`,
        audience: "institutional",
        priority: severity === "critical" ? "critical" : severity === "high" ? "high" : "medium",
        text: "Review GDACS details, affected area, exposed population and local authority updates before operational escalation.",
        rationale: "GDACS is a reliable global awareness source, but local official validation is required for critical decisions.",
        confidenceScore,
        safetyLimit: "Informational ARGUS estimate; not an official local order, route closure or evacuation instruction.",
        requiresHumanValidation: true,
      },
    ],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["gdacs", "multi-hazard", domain, alertLevel, feature.eventType?.toLowerCase()].filter((item): item is string => Boolean(item)),
    language: "en",
    rawEvidenceRefs: [sourceUrl],
    createdAt: updatedAt,
    updatedAt,
  };
}

export function normalizeGdacsEvents(features: GdacsRssFeature[]) {
  return features.map(normalizeGdacsEvent).filter((incident): incident is ArgusIncidentKnowledge => Boolean(incident));
}

function filterFeatures(features: GdacsRssFeature[], params: GdacsFetchParams) {
  const eventTypes = new Set((params.eventTypes ?? []).map((type) => type.toUpperCase()));
  const alertLevels = new Set((params.alertLevels ?? []).map((level) => level.toLowerCase()));
  const now = Date.now();
  const fromTime = params.fromDate
    ? Date.parse(params.fromDate)
    : typeof params.daysBack === "number"
      ? now - Math.max(params.daysBack, 1) * 24 * 60 * 60 * 1000
      : undefined;
  const toTime = params.toDate ? Date.parse(params.toDate) : undefined;

  return features.filter((feature) => {
    if (eventTypes.size > 0 && !eventTypes.has((feature.eventType ?? "").toUpperCase())) return false;
    if (alertLevels.size > 0 && !alertLevels.has(normalizeAlertLevel(feature.alertLevel))) return false;
    const eventTime = Date.parse(feature.pubDate ?? feature.dateModified ?? "");
    if (Number.isFinite(fromTime) && Number.isFinite(eventTime) && eventTime < fromTime!) return false;
    if (Number.isFinite(toTime) && Number.isFinite(eventTime) && eventTime > toTime!) return false;
    return true;
  });
}

export async function fetchGdacsEvents(params: GdacsFetchParams = {}): Promise<GdacsFetchResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 250);
  const page = Math.max(params.page ?? 1, 1);
  let fetchedFeatures: GdacsRssFeature[] = [];

  for (const feedUrl of GDACS_FEED_URLS) {
    try {
      const xml = await fetchTextWithTimeout(feedUrl);
      fetchedFeatures = parseGdacsRss(xml);
      if (fetchedFeatures.length > 0) break;
      warnings.push(`${feedUrl} returned no GDACS items.`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `GDACS fetch failed for ${feedUrl}`);
    }
  }

  if (fetchedFeatures.length === 0) {
    return {
      adapterId: "gdacsAdapter",
      sourceId: "gdacs",
      sourceName: "GDACS",
      status: errors.length > 0 ? "error" : "empty",
      fetchedAt: new Date().toISOString(),
      fetched: 0,
      count: 0,
      incidents: [],
      warnings,
      errors,
      requiresApiKey: false,
      requiresConfiguration: false,
    };
  }

  const filtered = filterFeatures(fetchedFeatures, params);
  const start = (page - 1) * limit;
  const incidents = normalizeGdacsEvents(filtered).slice(start, start + limit);

  return {
    adapterId: "gdacsAdapter",
    sourceId: "gdacs",
    sourceName: "GDACS",
    status: incidents.length > 0 ? (errors.length > 0 ? "partial" : "ready") : "empty",
    fetchedAt: new Date().toISOString(),
    fetched: fetchedFeatures.length,
    count: incidents.length,
    incidents,
    warnings,
    errors,
    requiresApiKey: false,
    requiresConfiguration: false,
  };
}

export function getGdacsAdapterStatus() {
  return {
    adapterId: "gdacsAdapter",
    sourceId: "gdacs",
    status: "ready" as const,
    requiresApiKey: false,
    requiresConfiguration: false,
    message: "GDACS public RSS feeds are available for no-key controlled Knowledge Intake ingestion.",
    capabilities: ["multi_hazard", "near_real_time", "rss_fallback", "dedup_event_episode"],
    envelopes: [],
  };
}
