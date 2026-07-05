import type { ArgusIncidentKnowledge, ArgusKnowledgeEvidenceItem } from "@/types/knowledgeIntake";
import { compactHtml, extractClearCount, extractWhoDonCountries, extractWhoDonDisease, joinSections } from "@/lib/public-health/whoDonExtractors";

export type WhoDonParams = {
  top?: number;
  skip?: number;
  orderby?: string;
  since?: string;
  urlName?: string;
  donId?: string;
  disease?: string;
  country?: string;
  region?: string;
  persist?: boolean;
  createIncidents?: boolean;
  updateExisting?: boolean;
  includeHtmlFields?: boolean;
  includeRaw?: boolean;
  purpose?: string;
};

const WHO_DON_BASE_URL = "https://www.who.int/api/news/diseaseoutbreaknews";
const LIMITATIONS = [
  "WHO DON is not a clinical diagnosis or local surveillance system.",
  "Counts are extracted only when a simple pattern is clear.",
  "WHO advice is shown as WHO advice, not an ARGUS order.",
  "No automatic citizen alerts, quarantine orders or travel restrictions are created.",
  "Exact coordinates are not inferred from DON text.",
];

export function buildWhoDonUrl(params: WhoDonParams = {}) {
  if (params.urlName) return `${WHO_DON_BASE_URL}(${encodeURIComponent(params.urlName)})`;
  const search = new URLSearchParams();
  search.set("$orderby", params.orderby ?? "PublicationDateAndTime desc");
  search.set("$top", String(Math.min(Math.max(Math.trunc(params.top ?? 20), 1), 100)));
  if (params.skip) search.set("$skip", String(Math.max(0, Math.trunc(params.skip))));
  return `${WHO_DON_BASE_URL}?${search.toString()}`;
}

export async function fetchWhoDonItems(params: WhoDonParams = {}) {
  const endpoint = buildWhoDonUrl(params);
  const result = await fetchJson(endpoint);
  const records = Array.isArray(result.data?.value) ? result.data.value : Array.isArray(result.data) ? result.data : [];
  const filtered = records.filter((item: unknown) => filterWhoDonItem(normalizeRecord(item), params));
  return { status: result.status, endpoint, fetched: filtered.length, items: filtered, warnings: result.warnings, errors: result.errors };
}

export async function fetchWhoDonItemByUrlName(urlName: string) {
  return fetchWhoDonItems({ urlName, top: 1 });
}

export function normalizeWhoDonItem(item: unknown) {
  const record = normalizeRecord(item);
  const title = stringValue(record.Title) ?? "WHO Disease Outbreak News";
  const text = joinSections(record);
  const disease = extractWhoDonDisease(record);
  const countries = extractWhoDonCountries(record);
  const publicationDateAndTime = stringValue(record.PublicationDateAndTime ?? record.PublicationDate);
  const url = stringValue(record.ItemDefaultUrl) ?? (stringValue(record.UrlName) ? `https://www.who.int/emergencies/disease-outbreak-news/item/${record.UrlName}` : undefined);
  const caseCounts = extractClearCount(text, ["cases", "case"]);
  const deathCounts = extractClearCount(text, ["deaths", "death"]);
  const outbreakGroupKey = buildWhoDonOutbreakGroupKey({ disease, countries, publicationDateAndTime, title });
  const confidence = countries.length && disease !== "unknown disease" ? 84 : 66;
  return {
    sourceId: "who-don",
    sourceName: "WHO Disease Outbreak News",
    whoId: stringValue(record.Id),
    donId: stringValue(record.DonId),
    urlName: stringValue(record.UrlName),
    title,
    publicationDate: stringValue(record.PublicationDate),
    publicationDateAndTime,
    lastModified: stringValue(record.LastModified),
    sourceUrl: url,
    provider: "World Health Organization",
    disease,
    countries,
    regions: [] as string[],
    eventType: "public_health_outbreak",
    outbreakGroupKey,
    caseCounts,
    deathCounts,
    riskAssessment: compactHtml(stringValue(record.Assessment)),
    whoAdvice: compactHtml(stringValue(record.Advice)),
    responseMeasures: compactHtml(stringValue(record.Response)),
    summary: compactHtml(stringValue(record.Summary)) || title,
    overview: compactHtml(stringValue(record.Overview)),
    rawSections: { overview: record.Overview, epidemiology: record.Epidemiology, assessment: record.Assessment, advice: record.Advice, response: record.Response },
    confidence,
    severity: scoreWhoDonPublicHealthSeverity({ disease, countries, riskAssessment: stringValue(record.Assessment), deathCounts }),
    limitations: LIMITATIONS,
    raw: record,
  };
}

export function buildWhoDonOutbreakGroupKey(input: { disease?: string; countries?: string[]; publicationDateAndTime?: string; title?: string }) {
  const year = input.publicationDateAndTime ? new Date(input.publicationDateAndTime).getUTCFullYear() : new Date().getUTCFullYear();
  const countryPart = input.countries?.length ? [...input.countries].sort().join("-") : "region-unknown";
  const diseasePart = (input.disease && input.disease !== "unknown disease" ? input.disease : input.title ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  return `who-don-${diseasePart}-${countryPart.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${year}`;
}

export function buildWhoPublicHealthOutbreakContext(item: unknown) {
  return normalizeWhoDonItem(item);
}

export function buildWhoHealthAdviceContext(item: unknown) {
  const context = normalizeWhoDonItem(item);
  return {
    donId: context.donId,
    disease: context.disease,
    countries: context.countries,
    publicationDate: context.publicationDateAndTime,
    adviceText: context.whoAdvice,
    travelTradeAdvice: /travel|trade/i.test(context.whoAdvice) ? context.whoAdvice : undefined,
    whoRiskAssessment: context.riskAssessment,
    responseMeasures: context.responseMeasures,
    notMedicalDiagnosis: true,
    followLocalHealthAuthorities: true,
    sourceUrl: context.sourceUrl,
    limitations: LIMITATIONS,
  };
}

export function buildWhoDonIncidentPayload(context: ReturnType<typeof normalizeWhoDonItem>): ArgusIncidentKnowledge {
  const now = new Date().toISOString();
  return {
    id: context.outbreakGroupKey,
    title: context.title,
    summary: `${context.summary} WHO DON context; follow local health authorities.`,
    domain: "public_health",
    subtype: "public_health_outbreak",
    severity: context.severity,
    confidenceScore: context.confidence,
    actionabilityScore: 50,
    sourceReliabilityScore: 95,
    evidenceCount: 1,
    sourceIds: ["who-don"],
    sourceNames: ["WHO Disease Outbreak News"],
    occurredAt: context.publicationDateAndTime,
    detectedAt: context.publicationDateAndTime,
    country: context.countries[0],
    technicalFactors: { groupKey: context.outbreakGroupKey, sourceRole: "official_public_health_outbreak_source", sourceUrl: context.sourceUrl, medicalContext: ["Public health context only; not a diagnosis."] },
    causes: [],
    contributingFactors: [context.disease],
    responseActions: ["Review WHO DON report and local health authority guidance."],
    lessonsLearned: [],
    recommendedActions: [{ id: `rec-${context.outbreakGroupKey}`, audience: "institutional", priority: "medium", text: "Review WHO risk assessment and coordinate with health authorities.", rationale: "WHO DON is official global public health reporting, not an ARGUS order.", confidenceScore: context.confidence, safetyLimit: "No diagnosis, quarantine or travel restriction is generated by ARGUS.", requiresHumanValidation: true }],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["who-don", "public_health_outbreak", context.disease],
    rawEvidenceRefs: [context.sourceUrl ?? context.outbreakGroupKey],
    createdAt: now,
    updatedAt: now,
  };
}

export function buildWhoDonEvidencePayload(context: ReturnType<typeof normalizeWhoDonItem>): ArgusKnowledgeEvidenceItem {
  return {
    id: `who-don-${context.donId ?? context.urlName ?? context.whoId ?? context.outbreakGroupKey}`,
    incidentId: context.outbreakGroupKey,
    sourceId: "who-don",
    sourceName: "WHO Disease Outbreak News",
    title: context.title,
    url: context.sourceUrl,
    summary: context.summary,
    confidenceScore: { sourceReliability: 95, corroborationCount: 1, geolocationPrecision: context.countries.length ? 45 : 10, timestampPrecision: context.publicationDateAndTime ? 90 : 50, documentQuality: 88, extractionConfidence: context.confidence, conflictWithOtherSources: 0, finalConfidence: context.confidence, label: context.confidence >= 80 ? "high" : "medium" },
    locationConfidence: context.countries.length ? 0.45 : 0.1,
    timestampConfidence: context.publicationDateAndTime ? 0.9 : 0.5,
    extractedAt: new Date().toISOString(),
  };
}

export function scoreWhoDonPublicHealthSeverity(context: { disease?: string; countries?: string[]; riskAssessment?: string; deathCounts?: { total?: number } }) {
  const risk = `${context.riskAssessment ?? ""}`.toLowerCase();
  if (/very high|pheic/.test(risk)) return "critical" as const;
  if (/high/.test(risk) || (context.deathCounts?.total ?? 0) > 50 || (context.countries?.length ?? 0) > 1) return "high" as const;
  return "medium" as const;
}

export function getWhoDonAdapterStatus() {
  return {
    adapterId: "whoDonAdapter",
    sourceId: "who-don",
    status: "active" as const,
    ready: true,
    requiresApiKey: false,
    requiresConfiguration: false,
    sourceRole: "official_public_health_outbreak_source",
    isIncidentSource: true,
    phase1Capabilities: ["DON API ingest", "public_health_outbreak incidents", "evidence per DON/update", "conservative disease/country/count extraction", "WHO advice context"],
    mapLayer: { id: "who-disease-outbreak-news", name: "WHO Disease Outbreak News", layerType: "public_health_outbreak", isIncidentLayer: true, defaultVisible: true, approximateLocationCaveat: true },
    limitations: LIMITATIONS,
  };
}

function filterWhoDonItem(item: Record<string, unknown>, params: WhoDonParams) {
  const text = joinSections(item).toLowerCase();
  if (params.donId && stringValue(item.DonId) !== params.donId) return false;
  if (params.disease && !text.includes(params.disease.toLowerCase())) return false;
  if (params.country && !text.includes(params.country.toLowerCase())) return false;
  if (params.since) {
    const published = new Date(String(item.PublicationDateAndTime ?? item.PublicationDate ?? 0)).getTime();
    const since = new Date(params.since).getTime();
    if (Number.isFinite(since) && Number.isFinite(published) && published < since) return false;
  }
  return true;
}

async function fetchJson(endpoint: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return { status: "error" as const, data: null, warnings: [], errors: [`WHO DON responded ${response.status}`] };
    return { status: "ready" as const, data: await response.json(), warnings: [], errors: [] };
  } catch (error) {
    return { status: "error" as const, data: null, warnings: [], errors: [error instanceof Error ? error.message : "WHO DON fetch failed"] };
  } finally {
    clearTimeout(timeout);
  }
}
function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
function stringValue(value: unknown) {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}
