import type { ArgusIncidentKnowledge, ArgusKnowledgeEvidenceItem } from "@/types/knowledgeIntake";
import { ecdcFeedRegistry } from "@/lib/ecdc/ecdcFeedRegistry";
import { extractCdtrPeriod, extractEcdcCountriesFromText, extractEcdcDiseaseFromText } from "@/lib/public-health/ecdcExtractors";
import { buildPublicHealthCrossSourceKey } from "@/lib/public-health/ecdcWhoDonDedupe";

export type EcdcParams = {
  feeds?: string[] | string;
  feedTypes?: string[] | string;
  top?: number;
  since?: string;
  disease?: string;
  country?: string;
  region?: string;
  persist?: boolean;
  createIncidents?: boolean;
  updateExisting?: boolean;
  includePageMetadata?: boolean;
  includePdfUrl?: boolean;
  includeRaw?: boolean;
  purpose?: string;
};

const LIMITATIONS = [
  "ECDC RSS/data is public health context, not a clinical source or diagnosis.",
  "CDTR may cover multiple threats and creates evidence by default, not direct incidents.",
  "EpiPulse/EWRS private systems are not included.",
  "No automatic travel restrictions, quarantine orders or citizen alerts are created.",
  "Locations are country/region approximate unless separately resolved by authoritative data.",
];

export function getEcdcAdapterStatus() {
  return {
    adapterId: "ecdcAdapter",
    sourceId: "ecdc",
    status: "active_contextual" as const,
    ready: true,
    requiresApiKey: false,
    requiresConfiguration: false,
    sourceRole: "european_public_health_threats_source",
    isIncidentSource: true,
    isContextSource: true,
    feeds: ecdcFeedRegistry,
    phase1Capabilities: ["RSS feed ingest", "CDTR evidence/report", "risk assessment evidence/incidents", "epidemiological update evidence/incidents", "cross-source dedupe with WHO DON"],
    mapLayer: { id: "ecdc-public-health-threats", name: "ECDC Public Health Threats", layerType: "public_health_threat", isIncidentLayer: true, isContextLayer: true, defaultVisible: true, approximateLocationCaveat: true },
    limitations: LIMITATIONS,
  };
}

export async function fetchEcdcFeeds(params: EcdcParams = {}) {
  const selected = selectFeeds(params);
  const results = await Promise.all(selected.map((feed) => fetchEcdcFeed(feed, params)));
  const items = results.flatMap((result) => result.items);
  const errors = results.flatMap((result) => result.errors);
  const warnings = results.flatMap((result) => result.warnings);
  return {
    status: items.length ? "ready" as const : errors.length === selected.length ? "error" as const : "empty" as const,
    feedsFetched: results.filter((result) => result.status !== "error").length,
    itemsFetched: items.length,
    items,
    warnings,
    errors,
  };
}

export async function fetchEcdcFeed(feedConfig: (typeof ecdcFeedRegistry)[number], params: EcdcParams = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(feedConfig.url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return { status: "error" as const, feedId: feedConfig.id, items: [], warnings: [], errors: [`ECDC feed ${feedConfig.id} responded ${response.status}`] };
    const xml = await response.text();
    const parsed = parseEcdcRss(xml, feedConfig).slice(0, Math.min(Math.max(Math.trunc(params.top ?? feedConfig.maxItems), 1), 100));
    const filtered = parsed.filter((item) => filterContext(item, params));
    return { status: filtered.length ? "ready" as const : "empty" as const, feedId: feedConfig.id, items: filtered, warnings: [], errors: [] };
  } catch (error) {
    return { status: "error" as const, feedId: feedConfig.id, items: [], warnings: [`ECDC feed ${feedConfig.id} failed; continuing with other feeds.`], errors: [error instanceof Error ? error.message : "ECDC feed fetch failed"] };
  } finally {
    clearTimeout(timeout);
  }
}

export function parseEcdcRss(xml: string, feedConfig: (typeof ecdcFeedRegistry)[number]) {
  const itemBlocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  return itemBlocks.map((block) => normalizeEcdcRssItem({
    rssGuid: tag(block, "guid") || tag(block, "link") || tag(block, "title"),
    title: tag(block, "title"),
    url: tag(block, "link"),
    publishedAt: tag(block, "pubDate"),
    summary: tag(block, "description"),
    categories: [...block.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((match) => decode(match[1])),
    rawItem: block,
  }, feedConfig));
}

export function normalizeEcdcRssItem(item: Record<string, unknown>, feedConfig: (typeof ecdcFeedRegistry)[number]) {
  const title = stringValue(item.title) ?? "ECDC public health report";
  const summary = compact(stringValue(item.summary));
  const text = `${title} ${summary} ${(item.categories as string[] | undefined)?.join(" ") ?? ""}`;
  const disease = extractEcdcDisease(text);
  const { countries, regions } = extractEcdcCountriesFromText(text);
  const publishedAt = parseDateString(stringValue(item.publishedAt));
  const cdtr = extractCdtrPeriod(title);
  const publicHealthThreatGroupKey = buildEcdcThreatGroupKey({ disease, countries, regions, publishedAt, feedType: feedConfig.feedType });
  return {
    sourceId: "ecdc",
    sourceName: "ECDC",
    feedId: feedConfig.id,
    feedType: feedConfig.feedType,
    feedLabel: feedConfig.label,
    rssGuid: stringValue(item.rssGuid),
    title,
    url: stringValue(item.url),
    publishedAt,
    summary,
    publicationType: extractEcdcPublicationType(item, feedConfig),
    disease,
    countries,
    regions,
    euEeaRelevance: regions.includes("EU/EEA") || regions.includes("Europe") || feedConfig.scope.includes("EU"),
    globalRelevance: regions.includes("global"),
    riskAssessmentLevel: /high risk|very high/i.test(text) ? "high" : /moderate/i.test(text) ? "moderate" : undefined,
    cdtrWeek: cdtr.cdtrWeek,
    cdtrPeriod: cdtr.cdtrPeriod,
    reportPdfUrl: extractEcdcPdfUrl(text),
    evidenceType: feedConfig.evidenceType,
    publicHealthThreatGroupKey,
    crossSourceGroupKey: buildPublicHealthCrossSourceKey({ disease, countries, regions, publishedAt }),
    extractionConfidence: disease !== "unknown disease" && (countries.length || regions.length) ? 82 : 58,
    requiresReview: disease === "unknown disease" || (!countries.length && !regions.length) || feedConfig.feedType === "cdtr",
    sourceAttribution: "European Centre for Disease Prevention and Control",
    limitations: LIMITATIONS,
    rawItem: item.rawItem,
  };
}

export async function fetchEcdcPageMetadata(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const html = await response.text();
  return { url, reportPdfUrl: extractEcdcPdfUrl(html), title: tag(html, "title") };
}

export function extractEcdcPdfUrl(text?: string) {
  return text?.match(/https?:\/\/[^\s"'<>]+\.pdf/i)?.[0];
}

export function extractEcdcDisease(item: unknown) {
  const record = asRecord(item);
  return extractEcdcDiseaseFromText(`${record.title ?? ""} ${record.summary ?? ""}`);
}

export function extractEcdcCountries(item: unknown) {
  const record = asRecord(item);
  return extractEcdcCountriesFromText(`${record.title ?? ""} ${record.summary ?? ""}`).countries;
}

export function extractEcdcPublicationType(_item: unknown, feedConfig: (typeof ecdcFeedRegistry)[number]) {
  return feedConfig.feedType;
}

export function buildEcdcThreatGroupKey(input: { disease?: string; countries?: string[]; regions?: string[]; publishedAt?: string; feedType?: string }) {
  return `ecdc-${input.feedType ?? "report"}-${buildPublicHealthCrossSourceKey(input)}`;
}

export function buildEcdcPublicHealthThreatContext(item: unknown) {
  return item;
}

export function buildEcdcIncidentPayload(context: ReturnType<typeof normalizeEcdcRssItem>): ArgusIncidentKnowledge {
  const now = new Date().toISOString();
  return {
    id: context.publicHealthThreatGroupKey,
    title: context.title,
    summary: `${context.summary || context.title} ECDC context; follow local public health authorities.`,
    domain: "public_health",
    subtype: "public_health_threat",
    severity: scoreEcdcPublicHealthSeverity(context),
    confidenceScore: context.extractionConfidence,
    actionabilityScore: 45,
    sourceReliabilityScore: 93,
    evidenceCount: 1,
    sourceIds: ["ecdc"],
    sourceNames: ["ECDC"],
    occurredAt: context.publishedAt,
    detectedAt: context.publishedAt,
    country: context.countries[0],
    region: context.regions[0],
    technicalFactors: { groupKey: context.publicHealthThreatGroupKey, sourceRole: "european_public_health_threats_source", sourceUrl: context.url, medicalContext: ["Public health context only; not a diagnosis."] },
    causes: [],
    contributingFactors: [context.disease],
    responseActions: ["Review ECDC report and local public health authority guidance."],
    lessonsLearned: [],
    recommendedActions: [{ id: `rec-${context.publicHealthThreatGroupKey}`, audience: "institutional", priority: "medium", text: "Review ECDC evidence and WHO/local authority context before action.", rationale: "ECDC is an official regional source, but ARGUS does not create restrictions or diagnoses.", confidenceScore: context.extractionConfidence, safetyLimit: "No travel restriction, quarantine or citizen alert is generated by ARGUS.", requiresHumanValidation: true }],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["ecdc", context.feedType, context.disease],
    rawEvidenceRefs: [context.url ?? context.publicHealthThreatGroupKey],
    createdAt: now,
    updatedAt: now,
  };
}

export function buildEcdcEvidencePayload(context: ReturnType<typeof normalizeEcdcRssItem>): ArgusKnowledgeEvidenceItem {
  return {
    id: `ecdc-${context.rssGuid ?? context.url ?? context.publicHealthThreatGroupKey}`,
    incidentId: context.requiresReview ? undefined : context.publicHealthThreatGroupKey,
    sourceId: "ecdc",
    sourceName: "ECDC",
    title: context.title,
    url: context.url,
    summary: context.summary || context.title,
    confidenceScore: { sourceReliability: 93, corroborationCount: 1, geolocationPrecision: context.countries.length ? 45 : 25, timestampPrecision: context.publishedAt ? 85 : 40, documentQuality: 82, extractionConfidence: context.extractionConfidence, conflictWithOtherSources: 0, finalConfidence: context.extractionConfidence, label: context.extractionConfidence >= 80 ? "high" : "medium" },
    locationConfidence: context.countries.length ? 0.45 : 0.25,
    timestampConfidence: context.publishedAt ? 0.85 : 0.4,
    extractedAt: new Date().toISOString(),
  };
}

export function scoreEcdcPublicHealthSeverity(context: { feedType?: string; riskAssessmentLevel?: string; extractionConfidence?: number }) {
  if (context.riskAssessmentLevel === "high") return "high" as const;
  if (context.feedType === "risk_assessment") return "medium" as const;
  return "medium" as const;
}

export function crossSourceDedupeWithWhoDon(context: { crossSourceGroupKey?: string }) {
  return { crossSourceGroupKey: context.crossSourceGroupKey, matchedWhoDonIncidentId: null, requiresReview: true };
}

export function getEcdcFeedRegistryStatus() {
  return { sourceId: "ecdc", feeds: ecdcFeedRegistry, limitations: LIMITATIONS };
}

function selectFeeds(params: EcdcParams) {
  const ids = list(params.feeds);
  const types = list(params.feedTypes);
  return ecdcFeedRegistry.filter((feed) => (ids.length ? ids.includes(feed.id) : feed.defaultEnabled) && (!types.length || types.includes(feed.feedType)));
}
function filterContext(item: ReturnType<typeof normalizeEcdcRssItem>, params: EcdcParams) {
  const text = `${item.title} ${item.summary} ${item.disease} ${item.countries.join(" ")} ${item.regions.join(" ")}`.toLowerCase();
  if (params.disease && !text.includes(params.disease.toLowerCase())) return false;
  if (params.country && !text.includes(params.country.toLowerCase())) return false;
  if (params.region && !text.includes(params.region.toLowerCase())) return false;
  if (params.since && item.publishedAt && new Date(item.publishedAt).getTime() < new Date(params.since).getTime()) return false;
  return true;
}
function parseDateString(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
function tag(xml: string, name: string) {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decode(match[1]) : undefined;
}
function decode(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}
function compact(value?: string) {
  return value?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
}
function list(value?: string[] | string) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
function stringValue(value: unknown) {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}
