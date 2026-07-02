import type {
  ArgusHazardDomain,
  ArgusIncidentKnowledge,
  ArgusKnowledgeEvidenceItem,
} from "@/types/knowledgeIntake";

type ReliefWebParams = {
  country?: string;
  disasterType?: string;
  limit?: number;
};

type ReliefWebReport = {
  id?: string;
  fields?: {
    title?: string;
    body?: string;
    url?: string;
    date?: { created?: string; original?: string };
    country?: Array<{ name?: string; iso3?: string }>;
    disaster_type?: Array<{ name?: string }>;
    primary_country?: { name?: string; iso3?: string };
    source?: Array<{ name?: string }>;
  };
};

type ReliefWebResponse = {
  data?: ReliefWebReport[];
};

function domainFromReliefWeb(report: ReliefWebReport): ArgusHazardDomain {
  const text = [
    report.fields?.title,
    report.fields?.body,
    ...(report.fields?.disaster_type?.map((item) => item.name) ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/earthquake|sismo|terremoto/.test(text)) return "earthquake";
  if (/flood|inund/.test(text)) return "flood";
  if (/wildfire|fire|incendio/.test(text)) return "wildfire";
  if (/storm|hurricane|cyclone|tornado/.test(text)) return "storm";
  if (/volcano|volcan/.test(text)) return "volcano";
  if (/drought|sequ/.test(text)) return "drought";
  if (/health|cholera|disease|outbreak|salud/.test(text)) return "public_health";
  if (/conflict|war|violence|displacement/.test(text)) return "humanitarian_crisis";
  return "humanitarian_crisis";
}

function compactText(value?: string) {
  return value?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchReliefWebJson(params: ReliefWebParams) {
  const appName = process.env.RELIEFWEB_APP_NAME;
  if (!appName) {
    throw new Error("RELIEFWEB_APP_NAME missing. ReliefWeb v2 requires an approved appname.");
  }
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);
  const body: Record<string, unknown> = {
    appname: "argus-grid",
    profile: "full",
    limit,
    sort: ["date:desc"],
    fields: {
      include: ["title", "body", "url", "date", "country", "primary_country", "disaster_type", "source"],
    },
  };
  const filters = [
    params.country
      ? {
          field: "country",
          value: params.country,
        }
      : null,
    params.disasterType
      ? {
          field: "disaster_type",
          value: params.disasterType,
        }
      : null,
  ].filter(Boolean);

  if (filters.length > 0) body.filter = { operator: "AND", conditions: filters };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`https://api.reliefweb.int/v2/reports?appname=${encodeURIComponent(appName)}`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`ReliefWeb responded ${response.status}. Check RELIEFWEB_APP_NAME approval.`);
    }
    return (await response.json()) as ReliefWebResponse;
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeReliefWebReport(report: ReliefWebReport): {
  incident: ArgusIncidentKnowledge;
  evidence: ArgusKnowledgeEvidenceItem;
} {
  const title = report.fields?.title ?? "ReliefWeb report";
  const summary = compactText(report.fields?.body)?.slice(0, 700) || title;
  const domain = domainFromReliefWeb(report);
  const country = report.fields?.primary_country?.iso3 ?? report.fields?.country?.[0]?.iso3;
  const countryName = report.fields?.primary_country?.name ?? report.fields?.country?.[0]?.name;
  const date = report.fields?.date?.original ?? report.fields?.date?.created;
  const id = `reliefweb-${report.id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
  const sourceName = report.fields?.source?.[0]?.name ?? "ReliefWeb";
  const confidenceScore = country ? 76 : 62;

  const incident: ArgusIncidentKnowledge = {
    id,
    title,
    summary,
    domain,
    subtype: report.fields?.disaster_type?.[0]?.name ?? "reliefweb_report",
    severity: domain === "humanitarian_crisis" ? "high" : "medium",
    confidenceScore,
    actionabilityScore: country ? 54 : 35,
    sourceReliabilityScore: 82,
    evidenceCount: 1,
    sourceIds: ["reliefweb"],
    sourceNames: ["ReliefWeb", sourceName].filter((value, index, array) => array.indexOf(value) === index),
    occurredAt: date,
    detectedAt: date,
    country,
    locality: countryName,
    technicalFactors: {},
    causes: [],
    contributingFactors: report.fields?.disaster_type?.map((item) => item.name ?? "").filter(Boolean) ?? [],
    responseActions: ["Review ReliefWeb source report and local official context"],
    lessonsLearned: [],
    recommendedActions: [
      {
        id: `rec-${id}`,
        audience: "institutional",
        priority: "medium",
        text: "Use this as humanitarian context and verify operational details with local authorities.",
        rationale: "ReliefWeb is reliable for humanitarian reporting, but many reports lack precise event coordinates.",
        confidenceScore,
        safetyLimit: "Not a direct operational instruction.",
        requiresHumanValidation: true,
      },
    ],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["reliefweb", domain, country ?? "global"],
    language: "en",
    rawEvidenceRefs: [report.fields?.url ?? id],
    createdAt: date ?? new Date().toISOString(),
    updatedAt: date ?? new Date().toISOString(),
  };

  const evidence: ArgusKnowledgeEvidenceItem = {
    id: `evidence-${id}`,
    incidentId: id,
    sourceId: "reliefweb",
    sourceName: "ReliefWeb",
    title,
    url: report.fields?.url,
    summary,
    confidenceScore: {
      sourceReliability: 82,
      corroborationCount: 1,
      geolocationPrecision: country ? 45 : 15,
      timestampPrecision: date ? 70 : 30,
      documentQuality: summary.length > 120 ? 72 : 45,
      extractionConfidence: confidenceScore,
      conflictWithOtherSources: 0,
      finalConfidence: confidenceScore,
      label: confidenceScore >= 75 ? "high" : "medium",
    },
    locationConfidence: country ? 45 : 15,
    timestampConfidence: date ? 70 : 30,
    extractedAt: new Date().toISOString(),
  };

  return { incident, evidence };
}

export async function fetchReliefWebReports(params: ReliefWebParams = {}) {
  if (!process.env.RELIEFWEB_APP_NAME) {
    return {
      adapterId: "reliefwebAdapter",
      sourceId: "reliefweb",
      sourceName: "ReliefWeb",
      status: "requiresConfiguration" as const,
      disabled: true,
      message: "RELIEFWEB_APP_NAME missing. ReliefWeb v2 requires an approved appname.",
      count: 0,
      incidents: [],
      evidence: [],
    };
  }
  const data = await fetchReliefWebJson(params);
  const normalized = (data.data ?? []).map(normalizeReliefWebReport);
  return {
    adapterId: "reliefwebAdapter",
    sourceId: "reliefweb",
    sourceName: "ReliefWeb",
    status: "ready" as const,
    fetchedAt: new Date().toISOString(),
    count: normalized.length,
    incidents: normalized.map((item) => item.incident),
    evidence: normalized.map((item) => item.evidence),
  };
}

export function reliefwebAdapter() {
  const configured = Boolean(process.env.RELIEFWEB_APP_NAME);
  return {
    adapterId: "reliefwebAdapter",
    sourceId: "reliefweb",
    status: configured ? ("ready" as const) : ("requiresConfiguration" as const),
    message: configured
      ? "ReliefWeb v2 appname is configured; controlled ingestion can run on demand."
      : "RELIEFWEB_APP_NAME missing. ReliefWeb v2 requires an approved appname.",
    envelopes: [],
  };
}
