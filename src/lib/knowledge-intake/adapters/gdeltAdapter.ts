import type { ArgusKnowledgeEvidenceItem } from "@/types/knowledgeIntake";
import { gdeltQueryRegistry, getGdeltTemplate } from "@/lib/gdelt/gdeltQueryRegistry";

export type GdeltParams = {
  templateId?: string;
  query?: string;
  queryMode?: "template" | "analyst";
  hazardType?: string;
  purpose?: string;
  locationHint?: string;
  country?: string;
  region?: string;
  language?: string;
  sourceCountry?: string;
  domain?: string;
  timespan?: string;
  startDateTime?: string;
  endDateTime?: string;
  maxRecords?: number;
  sort?: string;
  modes?: string[] | string;
  persist?: boolean;
  incidentId?: string;
  candidateIncident?: boolean;
  createCandidate?: boolean;
  includeArticles?: boolean;
  includeTimeline?: boolean;
  includeTone?: boolean;
  includeSourceCountries?: boolean;
  includeLanguages?: boolean;
  includeRaw?: boolean;
  cacheTtlMinutes?: number;
};

const GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const MODE_MAP: Record<string, string> = {
  artlist: "ArtList",
  timelinevol: "TimelineVol",
  timelinevolraw: "TimelineVolRaw",
  timelinetone: "TimelineTone",
  timelinesourcecountry: "TimelineSourceCountry",
  timelinelang: "TimelineLang",
};
const LIMITATIONS = [
  "GDELT is not an official source and does not confirm incidents by itself.",
  "Media coverage is uneven and can duplicate or amplify rumors.",
  "ARGUS does not confirm victims, attacks, outbreaks, disasters or route closures from GDELT alone.",
  "No full article text is copied; metadata/snippets and source URLs are retained.",
  "No automatic citizen alerts are created from GDELT signals.",
];

export function validateGdeltRequest(params: GdeltParams) {
  if (!params.templateId && !params.incidentId && !(params.query && params.queryMode === "analyst")) {
    return invalid("templateId, incidentId or analyst-approved query required for GDELT media signal context");
  }
  if (params.templateId && !getGdeltTemplate(params.templateId)) return invalid("Unknown GDELT templateId");
  if (params.query && params.queryMode !== "analyst") return invalid("Free query is disabled unless queryMode=analyst");
  const maxRecords = Math.trunc(params.maxRecords ?? getGdeltTemplate(params.templateId)?.maxRecords ?? 75);
  if (maxRecords < 1 || maxRecords > 250) return invalid("maxRecords must be between 1 and 250 for GDELT phase 1");
  const timespan = params.timespan ?? getGdeltTemplate(params.templateId)?.defaultTimespan ?? "24h";
  if (!/^\d+[hd]$/.test(timespan)) return invalid("timespan must use GDELT short format like 24h or 7d");
  if (timespan.endsWith("d") && Number(timespan.slice(0, -1)) > 7) return invalid("timespan is capped at 7d for GDELT phase 1");
  const modes = normalizeModes(params);
  const unsupported = modes.filter((mode) => !MODE_MAP[mode]);
  if (unsupported.length) return invalid(`Unsupported GDELT modes: ${unsupported.join(", ")}`);
  return { valid: true as const, params: { ...params, maxRecords, timespan, modes, sort: params.sort ?? "datedesc", cacheTtlMinutes: params.cacheTtlMinutes ?? 30 } };
}

export function buildGdeltQueryFromTemplate(templateId: string, params: GdeltParams = {}) {
  const template = getGdeltTemplate(templateId);
  if (!template) throw new Error("Unknown GDELT templateId");
  const parts = [`(${template.queryTerms.map((term) => `"${term}"`).join(" OR ")})`];
  if (params.country) parts.push(params.country);
  if (params.region) parts.push(params.region);
  if (params.locationHint) parts.push(params.locationHint);
  return parts.join(" ");
}

export function buildGdeltDocUrl(params: GdeltParams & { mode?: string }) {
  const validation = validateGdeltRequest(params);
  const input = validation.valid ? validation.params : params;
  const query = input.query ?? (input.templateId ? buildGdeltQueryFromTemplate(input.templateId, input) : input.incidentId ?? "");
  const search = new URLSearchParams();
  search.set("query", query);
  search.set("mode", params.mode ?? "ArtList");
  search.set("format", "json");
  search.set("maxrecords", String(input.maxRecords ?? 75));
  search.set("sort", input.sort ?? "datedesc");
  if (input.timespan) search.set("timespan", input.timespan);
  if (input.startDateTime) search.set("startdatetime", input.startDateTime);
  if (input.endDateTime) search.set("enddatetime", input.endDateTime);
  if (input.language) search.set("sourcelang", input.language);
  if (input.sourceCountry) search.set("sourcecountry", input.sourceCountry);
  if (input.domain) search.set("domainis", input.domain);
  return `${GDELT_DOC_URL}?${search.toString()}`;
}

export async function fetchGdeltDoc(params: GdeltParams) {
  const validation = validateGdeltRequest(params);
  if (!validation.valid) return { status: validation.status, errors: validation.errors, warnings: [], results: [], context: null };
  const modeResults = [];
  for (const mode of validation.params.modes) {
    const gdeltMode = MODE_MAP[mode];
    const endpoint = buildGdeltDocUrl({ ...validation.params, mode: gdeltMode });
    const result = await fetchJson(endpoint);
    modeResults.push({ ...result, mode, endpoint });
  }
  const context = buildGdeltMediaSignalContext(validation.params, modeResults as unknown as Array<{ mode: string; data: unknown }>);
  return { status: context.articles.length || context.timeline.length ? "ready" as const : "empty" as const, results: modeResults, context, warnings: context.limitations, errors: modeResults.flatMap((item) => item.errors) };
}

export async function fetchGdeltArtList(params: GdeltParams) {
  return fetchJson(buildGdeltDocUrl({ ...params, mode: "ArtList" }));
}
export async function fetchGdeltTimelineVol(params: GdeltParams) {
  return fetchJson(buildGdeltDocUrl({ ...params, mode: "TimelineVol" }));
}
export async function fetchGdeltTimelineVolRaw(params: GdeltParams) {
  return fetchJson(buildGdeltDocUrl({ ...params, mode: "TimelineVolRaw" }));
}
export async function fetchGdeltTimelineTone(params: GdeltParams) {
  return fetchJson(buildGdeltDocUrl({ ...params, mode: "TimelineTone" }));
}
export async function fetchGdeltTimelineSourceCountry(params: GdeltParams) {
  return fetchJson(buildGdeltDocUrl({ ...params, mode: "TimelineSourceCountry" }));
}
export async function fetchGdeltTimelineLang(params: GdeltParams) {
  return fetchJson(buildGdeltDocUrl({ ...params, mode: "TimelineLang" }));
}

export function normalizeGdeltArticle(article: unknown, params: GdeltParams = {}) {
  const item = asRecord(article);
  const url = stringValue(item.url);
  const title = stringValue(item.title) ?? "GDELT article";
  const domain = stringValue(item.domain) ?? hostnameFromUrl(url);
  const publishedAt = stringValue(item.seendate ?? item.datetime ?? item.publishedAt);
  return {
    title,
    url,
    domain,
    sourceCountry: stringValue(item.sourcecountry),
    sourceLanguage: stringValue(item.language),
    publishedAt,
    snippet: stringValue(item.extrasource) ?? stringValue(item.summary),
    image: stringValue(item.image),
    socialImage: stringValue(item.socialimage),
    tone: numberValue(item.tone),
    themes: listUnknown(item.themes),
    persons: listUnknown(item.persons),
    organizations: listUnknown(item.organizations),
    locationsMentioned: listUnknown(item.locations),
    sourceAttribution: "GDELT Project",
    raw: params.includeRaw ? item : undefined,
    dedupeKey: buildArticleDedupeKey({ url, title, domain, publishedAt }),
    confidence: url ? 72 : 55,
    limitations: LIMITATIONS,
  };
}

export function normalizeGdeltTimeline(response: unknown, mode: string, params: GdeltParams = {}) {
  const data = asRecord(response);
  const timeline = Array.isArray(data.timeline) ? data.timeline : Array.isArray(data.timelinevol) ? data.timelinevol : [];
  return timeline.map((point) => {
    const item = asRecord(point);
    return {
      timeBucket: stringValue(item.date ?? item.datetime ?? item.time),
      volume: numberValue(item.value ?? item.volume ?? item.norm),
      rawCount: numberValue(item.count),
      norm: numberValue(item.norm),
      mode,
      query: params.query ?? params.templateId,
      confidence: 65,
    };
  });
}

export function dedupeGdeltArticles(articles: ReturnType<typeof normalizeGdeltArticle>[]) {
  const seen = new Set<string>();
  return articles.filter((article) => {
    if (seen.has(article.dedupeKey)) return false;
    seen.add(article.dedupeKey);
    return true;
  });
}

export function buildGdeltMediaSignalContext(params: GdeltParams, results: Array<{ mode: string; data: unknown }>) {
  const artData = results.find((item) => item.mode === "artlist")?.data;
  const articles = dedupeGdeltArticles((Array.isArray(asRecord(artData).articles) ? asRecord(artData).articles as unknown[] : []).map((article) => normalizeGdeltArticle(article, params)));
  const timeline = results.filter((item) => item.mode.startsWith("timeline")).flatMap((item) => normalizeGdeltTimeline(item.data, item.mode, params));
  const sourceCountries = summarize(articles.map((item) => item.sourceCountry).filter(Boolean) as string[]);
  const languages = summarize(articles.map((item) => item.sourceLanguage).filter(Boolean) as string[]);
  const uniqueDomains = new Set(articles.map((item) => item.domain).filter(Boolean)).size;
  const coverageSpike = detectGdeltCoverageSpike({ timeline });
  const confidence = scoreGdeltMediaSignal({ articleCount: articles.length, uniqueDomains, coverageSpike: coverageSpike.coverageSpike });
  return {
    sourceId: "gdelt",
    sourceName: "GDELT",
    query: params.query ?? (params.templateId ? buildGdeltQueryFromTemplate(params.templateId, params) : params.incidentId),
    queryTemplateId: params.templateId,
    purpose: params.purpose ?? "command_center_osint",
    hazardType: params.hazardType ?? getGdeltTemplate(params.templateId)?.hazardType,
    locationHint: params.locationHint,
    country: params.country,
    region: params.region,
    timeWindow: params.timespan ?? "24h",
    generatedAt: new Date().toISOString(),
    articles,
    timeline,
    toneTimeline: timeline.filter((item) => item.mode === "timelinetone"),
    sourceCountries,
    languages,
    coverageSpike: coverageSpike.coverageSpike,
    coverageSpikeScore: coverageSpike.coverageSpikeScore,
    multiSourceSignal: uniqueDomains >= 3,
    sourceDiversityScore: Math.min(100, uniqueDomains * 12),
    toneRiskSignal: false,
    localMediaSignal: false,
    officialSourceMatched: false,
    crossSourceMatches: [],
    rumorRisk: articles.length > 0 && uniqueDomains < 2,
    uncertaintyScore: 100 - confidence,
    confidence,
    requiresReview: true,
    limitations: LIMITATIONS,
    evidenceRefs: [],
  };
}

export function buildGdeltNewsCoverageSnapshot(_params: GdeltParams, context: ReturnType<typeof buildGdeltMediaSignalContext>) {
  return {
    queryTemplateId: context.queryTemplateId,
    query: context.query,
    timeWindow: context.timeWindow,
    articleCount: context.articles.length,
    uniqueDomains: new Set(context.articles.map((item) => item.domain).filter(Boolean)).size,
    uniqueSourceCountries: context.sourceCountries.length,
    uniqueLanguages: context.languages.length,
    topDomains: summarize(context.articles.map((item) => item.domain).filter(Boolean) as string[]),
    topSourceCountries: context.sourceCountries,
    topLanguages: context.languages,
    latestArticles: context.articles.slice(0, 5),
    coverageTrend: context.timeline,
    coverageSpike: context.coverageSpike,
    confidence: context.confidence,
    limitations: LIMITATIONS,
  };
}

export function buildGdeltCrisisNarrativeContext(_params: GdeltParams, context: ReturnType<typeof buildGdeltMediaSignalContext>) {
  return { query: context.query, hazardType: context.hazardType, dominantThemes: [], dominantEntities: [], dominantLocations: [], dominantLanguages: context.languages, toneSummary: "Timeline tone is media-derived context only.", rumorRisk: context.rumorRisk, misinformationRiskHint: context.rumorRisk, confidence: context.confidence, requiresReview: true, limitations: LIMITATIONS };
}

export function buildGdeltCrossSourceCorroborationContext(_params: GdeltParams, context: ReturnType<typeof buildGdeltMediaSignalContext>) {
  return { gdeltSignal: context, officialMatches: [], nearbyOfficialIncidents: [], matchingSources: [], corroborationScore: 0, corroborationLevel: "weak_media_only" as const, requiresReview: true, limitations: LIMITATIONS, evidenceRefs: [] };
}

export function buildGdeltEvidence(context: ReturnType<typeof buildGdeltMediaSignalContext>, params: GdeltParams): ArgusKnowledgeEvidenceItem {
  return {
    id: `gdelt-${params.incidentId ?? params.templateId ?? "media"}-${context.generatedAt}`,
    incidentId: params.incidentId,
    sourceId: "gdelt",
    sourceName: "GDELT",
    title: "GDELT media signal context",
    url: context.articles[0]?.url,
    summary: `GDELT media signal for ${context.query}: ${context.articles.length} articles, ${new Set(context.articles.map((item) => item.domain).filter(Boolean)).size} domains. Signal only; requires review.`,
    confidenceScore: { sourceReliability: 78, corroborationCount: context.articles.length, geolocationPrecision: params.country || params.locationHint ? 45 : 15, timestampPrecision: 75, documentQuality: 65, extractionConfidence: context.confidence, conflictWithOtherSources: 0, finalConfidence: context.confidence, label: context.confidence >= 75 ? "high" : context.confidence >= 55 ? "medium" : "low" },
    locationConfidence: params.country || params.locationHint ? 0.45 : 0.15,
    timestampConfidence: 0.75,
    extractedAt: context.generatedAt,
  };
}

export function scoreGdeltMediaSignal(input: { articleCount: number; uniqueDomains: number; coverageSpike: boolean }) {
  let score = 42 + Math.min(25, input.articleCount) + Math.min(25, input.uniqueDomains * 4);
  if (input.coverageSpike) score += 8;
  return Math.min(86, score);
}

export function detectGdeltCoverageSpike(input: { timeline: Array<{ volume?: number }> }) {
  const values = input.timeline.map((item) => item.volume).filter((value): value is number => typeof value === "number");
  if (values.length < 4) return { coverageSpike: false, coverageSpikeScore: 0 };
  const latest = values[values.length - 1];
  const avg = values.slice(0, -1).reduce((sum, value) => sum + value, 0) / (values.length - 1);
  const score = avg > 0 ? latest / avg : 0;
  return { coverageSpike: score >= 2, coverageSpikeScore: Number(score.toFixed(2)) };
}

export function getGdeltAdapterStatus() {
  return {
    adapterId: "gdeltAdapter",
    sourceId: "gdelt",
    status: "active_contextual_osint" as const,
    ready: true,
    requiresApiKey: false,
    requiresConfiguration: false,
    sourceRole: "global_osint_media_signal_source",
    isOfficialSource: false,
    isIncidentSource: false,
    isMediaSignalSource: true,
    templates: gdeltQueryRegistry,
    phase1Capabilities: ["DOC API ArtList", "TimelineVol", "TimelineTone", "TimelineSourceCountry", "TimelineLang", "MediaSignalContext", "NewsCoverageSnapshot", "CrisisNarrativeContext", "CrossSourceCorroborationContext"],
    mapLayer: { id: "gdelt-media-signals", name: "GDELT Media Signals", layerType: "media_signal", isIncidentLayer: false, isOfficialLayer: false, defaultVisible: false, analystModeOnly: true },
    limitations: LIMITATIONS,
  };
}

async function fetchJson(endpoint: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return { status: "error" as const, endpoint, data: null, warnings: [], errors: [`GDELT responded ${response.status}`] };
    const data = await response.json();
    return { status: "ready" as const, endpoint, data, warnings: [], errors: [] };
  } catch (error) {
    return { status: "error" as const, endpoint, data: null, warnings: [], errors: [error instanceof Error ? error.message : "GDELT fetch failed"] };
  } finally {
    clearTimeout(timeout);
  }
}
function normalizeModes(params: GdeltParams) {
  const modes = list(params.modes);
  if (modes.length) return modes.map((mode) => mode.toLowerCase());
  return ["artlist", "timelinevol", "timelinetone", "timelinesourcecountry", "timelinelang"];
}
function buildArticleDedupeKey(input: { url?: string; title?: string; domain?: string; publishedAt?: string }) {
  if (input.url) return input.url.toLowerCase().replace(/[?#].*$/, "");
  const bucket = input.publishedAt?.slice(0, 10) ?? "unknown-date";
  return `${input.domain ?? "unknown"}-${(input.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80)}-${bucket}`;
}
function summarize(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([value, count]) => ({ value, count }));
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
function listUnknown(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
  return [];
}
function hostnameFromUrl(value?: string) {
  if (!value) return undefined;
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}
