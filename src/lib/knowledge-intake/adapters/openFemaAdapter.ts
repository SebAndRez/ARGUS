import type {
  ArgusEvidenceConfidenceScore,
  ArgusHazardDomain,
  ArgusIncidentKnowledge,
  ArgusKnowledgeEvidenceItem,
} from "@/types/knowledgeIntake";

export type OpenFemaMode = "preview" | "import";

export type OpenFemaDisasterDeclarationsParams = {
  year?: number;
  state?: string;
  incidentTypes?: string[];
  declarationType?: string;
  disasterNumber?: string | number;
  limit?: number;
  skip?: number;
  persist?: boolean;
  mode?: OpenFemaMode;
};

export type OpenFemaDisasterDeclarationRow = Record<string, unknown>;
type OpenFemaUrlParams = OpenFemaDisasterDeclarationsParams & {
  includeNumericFilters?: boolean;
};

export type OpenFemaOperationalPrecedent = {
  precedentType: "fema_disaster_declaration";
  basis: string;
  disasterNumber?: string;
  incidentType?: string;
  designatedArea?: string;
  declarationType?: string;
  programsActivated: string[];
  dates: {
    declaredAt?: string;
    incidentBeginDate?: string;
    incidentEndDate?: string;
    disasterCloseoutDate?: string;
  };
  suggestedOperationalFocus: string[];
  caveat: string;
};

const OPENFEMA_SOURCE_ID = "openfema";
const OPENFEMA_SOURCE_NAME = "OpenFEMA";
const OPENFEMA_ENDPOINT = "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries.json";
const REQUEST_TIMEOUT_MS = 20_000;
const CAVEAT = "ARGUS recommendation based on FEMA precedent; not an official FEMA instruction. Requires validation with the competent local authority.";
const SELECT_FIELDS = [
  "disasterNumber",
  "femaDeclarationString",
  "declarationTitle",
  "declarationType",
  "incidentType",
  "state",
  "designatedArea",
  "fipsStateCode",
  "fipsCountyCode",
  "placeCode",
  "declarationDate",
  "incidentBeginDate",
  "incidentEndDate",
  "disasterCloseoutDate",
  "ihProgramDeclared",
  "iaProgramDeclared",
  "paProgramDeclared",
  "hmProgramDeclared",
].join(",");
const NUMERIC_SELECT_FIELDS = `${SELECT_FIELDS},fyDeclared`;

function nowIso() {
  return new Date().toISOString();
}

function sanitizeId(value: string) {
  return value.replace(/[^a-zA-Z0-9:_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function compactText(value?: unknown, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

function parseDate(value?: unknown) {
  const raw = compactText(value);
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function parseBoolean(value?: unknown) {
  if (typeof value === "boolean") return value;
  const text = compactText(value).toLowerCase();
  return text === "true" || text === "1" || text === "yes";
}

function clampLimit(limit?: number, defaultLimit = 100, max = 5000) {
  const numeric = Math.trunc(Number(limit ?? defaultLimit));
  if (!Number.isFinite(numeric)) return defaultLimit;
  return Math.min(Math.max(numeric, 1), max);
}

function normalizeToken(value?: unknown) {
  return compactText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function odataString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function hasControlledFilter(params: OpenFemaDisasterDeclarationsParams) {
  return Boolean(params.year || params.state || params.disasterNumber || params.incidentTypes?.length);
}

function programsActivated(row: OpenFemaDisasterDeclarationRow) {
  return [
    parseBoolean(row.ihProgramDeclared) ? "Individual and Households Program" : undefined,
    parseBoolean(row.iaProgramDeclared) ? "Individual Assistance" : undefined,
    parseBoolean(row.paProgramDeclared) ? "Public Assistance" : undefined,
    parseBoolean(row.hmProgramDeclared) ? "Hazard Mitigation" : undefined,
  ].filter((item): item is string => Boolean(item));
}

function evidenceConfidence(): ArgusEvidenceConfidenceScore {
  return {
    sourceReliability: 90,
    corroborationCount: 1,
    geolocationPrecision: 42,
    timestampPrecision: 88,
    documentQuality: 90,
    extractionConfidence: 88,
    conflictWithOtherSources: 0,
    finalConfidence: 88,
    label: "high",
  };
}

export function buildOpenFemaDisasterDeclarationsUrl(params: OpenFemaUrlParams = {}) {
  const limit = clampLimit(params.limit, params.mode === "import" ? 1000 : 100);
  const skip = Math.max(0, Math.trunc(Number(params.skip ?? 0)));
  const filters: string[] = [];
  if (params.includeNumericFilters && params.year) {
    filters.push(`declarationDate ge '${Math.trunc(params.year)}-01-01T00:00:00.000z'`);
    filters.push(`declarationDate lt '${Math.trunc(params.year) + 1}-01-01T00:00:00.000z'`);
  }
  if (params.state?.trim()) filters.push(`state eq ${odataString(params.state.trim().toUpperCase())}`);
  if (params.declarationType?.trim()) filters.push(`declarationType eq ${odataString(params.declarationType.trim())}`);
  if (params.includeNumericFilters && params.disasterNumber !== undefined && compactText(params.disasterNumber)) filters.push(`disasterNumber eq ${Math.trunc(Number(params.disasterNumber))}`);
  if (params.incidentTypes?.length) {
    const incidentFilters = params.incidentTypes.map((item) => `incidentType eq ${odataString(item.trim())}`);
    filters.push(incidentFilters.length === 1 ? incidentFilters[0] : `(${incidentFilters.join(" or ")})`);
  }

  const url = new URL(OPENFEMA_ENDPOINT);
  url.searchParams.set("$select", NUMERIC_SELECT_FIELDS);
  url.searchParams.set("$top", String(limit));
  if (skip > 0) url.searchParams.set("$skip", String(skip));
  url.searchParams.set("$orderby", "declarationDate desc");
  if (filters.length > 0) url.searchParams.set("$filter", filters.join(" and "));
  return url.toString().replace(/\+/g, "%20");
}

export async function fetchOpenFemaDisasterDeclarations(params: OpenFemaDisasterDeclarationsParams = {}) {
  const mode = params.mode ?? "preview";
  const limit = clampLimit(params.limit, mode === "import" ? 1000 : hasControlledFilter(params) ? 100 : 25);
  if (params.persist && !hasControlledFilter(params)) {
    throw new Error("OpenFEMA persist=true requires at least one controlled filter: year, state, disasterNumber or incidentTypes.");
  }
  const endpoint = buildOpenFemaDisasterDeclarationsUrl({ ...params, limit, includeNumericFilters: false });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate, br",
        "User-Agent": process.env.OPENFEMA_USER_AGENT?.trim() || "ARGUS-Knowledge-Intake/1.0 https://argus.local",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenFEMA responded ${response.status} for Disaster Declarations Summaries.`);
    const data = await response.json() as { DisasterDeclarationsSummaries?: OpenFemaDisasterDeclarationRow[] };
    const rows = postFilterRows(data.DisasterDeclarationsSummaries ?? [], params);
    return {
      endpoint,
      rows,
      warnings: [
        "OpenFEMA Disaster Declarations Summaries is an institutional historical/periodic dataset, not a live sensor or forecast.",
        "Coverage is limited to the United States and FEMA territories. Absence of a declaration does not mean absence of disaster impact.",
        "ARGUS recommendations based on FEMA precedent are not official FEMA instructions or promises of federal assistance.",
      ],
    };
  } finally {
    clearTimeout(timeout);
  }
}

function postFilterRows(rows: OpenFemaDisasterDeclarationRow[], params: OpenFemaDisasterDeclarationsParams) {
  return rows.filter((row) => {
    if (params.year) {
      const fyDeclared = Number(row.fyDeclared);
      const declarationYear = parseDate(row.declarationDate)?.slice(0, 4);
      if (fyDeclared !== Math.trunc(params.year) && declarationYear !== String(Math.trunc(params.year))) return false;
    }
    if (params.disasterNumber !== undefined && compactText(params.disasterNumber)) {
      if (compactText(row.disasterNumber) !== compactText(params.disasterNumber)) return false;
    }
    return true;
  });
}

export function mapOpenFemaIncidentTypeToArgusDomain(incidentType?: unknown): ArgusHazardDomain {
  const normalized = normalizeToken(incidentType);
  if (normalized.includes("fire")) return "wildfire";
  if (normalized.includes("flood")) return "flood";
  if (normalized.includes("hurricane") || normalized.includes("typhoon")) return "hurricane";
  if (normalized.includes("tornado")) return "tornado";
  if (normalized.includes("earthquake")) return "earthquake";
  if (normalized.includes("severe storm") || normalized.includes("storm") || normalized.includes("straight line wind")) return "storm";
  if (normalized.includes("snow") || normalized.includes("winter") || normalized.includes("ice")) return "winter_storm";
  if (normalized.includes("drought")) return "drought";
  if (normalized.includes("volcano")) return "volcano";
  if (normalized.includes("mud") || normalized.includes("landslide")) return "landslide";
  if (normalized.includes("biological") || normalized.includes("pandemic")) return "public_health";
  return "natural_disaster";
}

export function mapOpenFemaDeclarationType(row: OpenFemaDisasterDeclarationRow) {
  const type = compactText(row.declarationType, "Disaster Declaration");
  const normalized = normalizeToken(type);
  if (normalized === "dr" || normalized.includes("major")) return "Major Disaster";
  if (normalized === "em" || normalized.includes("emergency")) return "Emergency";
  if (normalized === "fm" || normalized.includes("fire management")) return "Fire Management Assistance";
  return type;
}

export function buildOpenFemaExternalId(row: OpenFemaDisasterDeclarationRow) {
  const disasterNumber = compactText(row.disasterNumber, "unknown");
  const area = compactText(row.designatedArea, "unknown-area");
  const declaredAt = parseDate(row.declarationDate)?.slice(0, 10) ?? "unknown-date";
  return `OPENFEMA:${sanitizeId(disasterNumber)}:${sanitizeId(area)}:${declaredAt}`;
}

export function buildOpenFemaGroupKey(row: OpenFemaDisasterDeclarationRow) {
  return compactText(row.disasterNumber, "unknown");
}

export function buildOpenFemaInstitutionalLessons(row: OpenFemaDisasterDeclarationRow) {
  const lessons: string[] = [];
  if (parseBoolean(row.paProgramDeclared)) lessons.push("Public Assistance was authorized; infrastructure/public services recovery may be relevant.");
  if (parseBoolean(row.iaProgramDeclared) || parseBoolean(row.ihProgramDeclared)) lessons.push("Individual/household assistance was authorized; household impact and shelter/recovery support may be relevant.");
  if (parseBoolean(row.hmProgramDeclared)) lessons.push("Hazard mitigation was authorized; long-term mitigation planning may be relevant.");
  const declarationType = mapOpenFemaDeclarationType(row);
  if (declarationType === "Major Disaster") lessons.push("Federal major disaster declaration precedent.");
  if (declarationType === "Emergency") lessons.push("Emergency declaration precedent.");
  const domain = mapOpenFemaIncidentTypeToArgusDomain(row.incidentType);
  if (domain === "wildfire") lessons.push("Fire precedent suggests damage assessment, local coordination, public communications and mitigation planning may be relevant.");
  if (domain === "flood" || domain === "hurricane" || domain === "storm") lessons.push("Severe weather/flood precedent suggests area designation, debris/removal context, emergency protective measures and recovery coordination may be relevant.");
  if (domain === "earthquake") lessons.push("Earthquake precedent suggests damage assessment, infrastructure inspection, household assistance screening and recovery coordination may be relevant.");
  return lessons;
}

export function buildOpenFemaOperationalPrecedent(row: OpenFemaDisasterDeclarationRow): OpenFemaOperationalPrecedent {
  const programs = programsActivated(row);
  const focus = [
    "damage assessment",
    "area designation",
    parseBoolean(row.paProgramDeclared) ? "public assistance coordination" : undefined,
    parseBoolean(row.iaProgramDeclared) || parseBoolean(row.ihProgramDeclared) ? "household assistance screening" : undefined,
    parseBoolean(row.hmProgramDeclared) ? "hazard mitigation planning" : undefined,
    "local authority validation",
  ].filter((item): item is string => Boolean(item));
  return {
    precedentType: "fema_disaster_declaration",
    basis: "FEMA declaration and assistance programs",
    disasterNumber: compactText(row.disasterNumber) || undefined,
    incidentType: compactText(row.incidentType) || undefined,
    designatedArea: compactText(row.designatedArea) || undefined,
    declarationType: mapOpenFemaDeclarationType(row),
    programsActivated: programs,
    dates: {
      declaredAt: parseDate(row.declarationDate),
      incidentBeginDate: parseDate(row.incidentBeginDate),
      incidentEndDate: parseDate(row.incidentEndDate),
      disasterCloseoutDate: parseDate(row.disasterCloseoutDate),
    },
    suggestedOperationalFocus: focus,
    caveat: CAVEAT,
  };
}

export function normalizeOpenFemaDisasterDeclaration(row: OpenFemaDisasterDeclarationRow): ArgusIncidentKnowledge {
  const externalId = buildOpenFemaExternalId(row);
  const incidentType = compactText(row.incidentType, "Disaster");
  const declarationType = mapOpenFemaDeclarationType(row);
  const domain = mapOpenFemaIncidentTypeToArgusDomain(incidentType);
  const declaredAt = parseDate(row.declarationDate) ?? nowIso();
  const occurredAt = parseDate(row.incidentBeginDate) ?? declaredAt;
  const designatedArea = compactText(row.designatedArea);
  const state = compactText(row.state);
  const title = compactText(row.declarationTitle) || `${declarationType} - ${incidentType}${designatedArea ? ` - ${designatedArea}` : ""}${state ? `, ${state}` : ""}`;
  const programs = programsActivated(row);
  const institutionalLessons = buildOpenFemaInstitutionalLessons(row);
  const operationalPrecedent = buildOpenFemaOperationalPrecedent(row);
  const summary = [
    `FEMA/OpenFEMA declaration record ${compactText(row.femaDeclarationString) || compactText(row.disasterNumber)} for ${incidentType}.`,
    designatedArea || state ? `Designated area: ${[designatedArea, state].filter(Boolean).join(", ")}.` : undefined,
    programs.length ? `Programs activated: ${programs.join(", ")}.` : "No IA/PA/HM program activation is indicated in this record.",
    CAVEAT,
  ].filter(Boolean).join(" ");

  return {
    id: `openfema-${sanitizeId(externalId)}`,
    title,
    summary: summary.slice(0, 1200),
    domain,
    subtype: incidentType,
    severity: declarationType === "Major Disaster" ? "medium" : "low",
    confidenceScore: 88,
    actionabilityScore: 22,
    sourceReliabilityScore: 90,
    evidenceCount: 1,
    sourceIds: [OPENFEMA_SOURCE_ID],
    sourceNames: [OPENFEMA_SOURCE_NAME],
    occurredAt,
    detectedAt: declaredAt,
    country: "US",
    region: state || undefined,
    locality: designatedArea || undefined,
    latitude: undefined,
    longitude: undefined,
    geometry: undefined,
    impact: {
      infrastructureAffected: parseBoolean(row.paProgramDeclared) ? ["public infrastructure/public services recovery context"] : undefined,
      homesAffected: parseBoolean(row.iaProgramDeclared) || parseBoolean(row.ihProgramDeclared) ? undefined : undefined,
      environmentalImpact: `${incidentType} institutional declaration/recovery context from FEMA/OpenFEMA.`,
    },
    technicalFactors: {
      disasterNumber: compactText(row.disasterNumber),
      femaDeclarationString: compactText(row.femaDeclarationString),
      declarationType,
      incidentType,
      declaredAt,
      incidentBeginDate: parseDate(row.incidentBeginDate),
      incidentEndDate: parseDate(row.incidentEndDate),
      disasterCloseoutDate: parseDate(row.disasterCloseoutDate),
      designatedArea,
      fipsStateCode: compactText(row.fipsStateCode),
      fipsCountyCode: compactText(row.fipsCountyCode),
      placeCode: compactText(row.placeCode),
      individualHouseholdsProgramDeclared: parseBoolean(row.ihProgramDeclared),
      individualAssistanceDeclared: parseBoolean(row.iaProgramDeclared),
      publicAssistanceDeclared: parseBoolean(row.paProgramDeclared),
      hazardMitigationDeclared: parseBoolean(row.hmProgramDeclared),
      isDeclaration: true,
      isLiveSensor: false,
      institutionalDataset: true,
      historicalDataset: true,
      notLiveSource: true,
      sourceRole: "disaster_declaration_recovery_dataset",
      sourceUrl: buildOpenFemaDisasterDeclarationsUrl({ disasterNumber: row.disasterNumber as string | number, limit: 1 }),
      groupKey: buildOpenFemaGroupKey(row),
      operationalPrecedent,
      institutionalLessons,
      routingContext: ["Institutional/historical context only; do not close routes or mark active blockages."],
      fenixScenarioContext: ["Can seed an ARGUS Fenix institutional demo scenario; not an active event."],
      medicalContext: parseBoolean(row.iaProgramDeclared) || parseBoolean(row.ihProgramDeclared)
        ? ["household recovery context", "shelter/recovery support context"]
        : ["institutional recovery context"],
      dataQualityFlags: [
        "institutional_dataset_not_live",
        "not_worldwide_coverage",
        "declaration_absence_not_absence_of_disaster",
        "assistance_amounts_not_total_disaster_cost",
      ],
    },
    causes: [incidentType],
    contributingFactors: programs,
    responseActions: [
      "Use as FEMA institutional precedent for ARGUS recommendations only.",
      "Validate current conditions and instructions with competent local authorities.",
      CAVEAT,
    ],
    lessonsLearned: [],
    recommendedActions: [
      {
        id: `openfema-rec-${sanitizeId(externalId)}`,
        audience: "institutional",
        priority: "low",
        text: `Based on FEMA precedent, ARGUS may prioritize ${operationalPrecedent.suggestedOperationalFocus.join(", ")}.`,
        rationale: "OpenFEMA declaration and assistance-program record.",
        confidenceScore: 78,
        safetyLimit: CAVEAT,
        requiresHumanValidation: true,
      },
    ],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: [
      "openfema",
      "FEMA",
      "institutional_dataset",
      "disaster_declaration_recovery_dataset",
      "not_live",
      "controlled_import",
      "fema_precedent",
      domain,
      incidentType,
      state,
      declarationType,
    ].filter((item): item is string => Boolean(item)),
    language: "en",
    rawEvidenceRefs: [externalId, compactText(row.femaDeclarationString), compactText(row.disasterNumber)].filter(Boolean),
    createdAt: declaredAt,
    updatedAt: parseDate(row.disasterCloseoutDate) ?? declaredAt,
  };
}

export function buildOpenFemaEvidence(row: OpenFemaDisasterDeclarationRow, incident: ArgusIncidentKnowledge): ArgusKnowledgeEvidenceItem {
  const programs = programsActivated(row);
  const excerpt = [
    `FEMA disaster declaration record ${compactText(row.femaDeclarationString) || compactText(row.disasterNumber)}.`,
    compactText(row.designatedArea) ? `Designated area: ${compactText(row.designatedArea)}, ${compactText(row.state)}.` : undefined,
    `Incident type: ${compactText(row.incidentType)}; declaration type: ${mapOpenFemaDeclarationType(row)}.`,
    programs.length ? `Programs activated: ${programs.join(", ")}.` : undefined,
  ].filter(Boolean).join(" ");
  return {
    id: `openfema-evidence-${sanitizeId(buildOpenFemaExternalId(row))}`,
    incidentId: incident.id,
    sourceId: OPENFEMA_SOURCE_ID,
    sourceName: OPENFEMA_SOURCE_NAME,
    title: "FEMA disaster declaration record",
    url: incident.technicalFactors.sourceUrl,
    quote: excerpt.slice(0, 1600),
    summary: excerpt.slice(0, 1600),
    confidenceScore: evidenceConfidence(),
    locationConfidence: 0.42,
    timestampConfidence: 0.88,
    extractedAt: nowIso(),
    conflicts: [
      "Institutional historical/periodic declaration dataset: not live, not forecast and not a worldwide disaster feed.",
      CAVEAT,
    ],
  };
}

export function normalizeOpenFemaDisasterDeclarations(rows: OpenFemaDisasterDeclarationRow[]) {
  const incidents: ArgusIncidentKnowledge[] = [];
  const evidence: ArgusKnowledgeEvidenceItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const externalId = buildOpenFemaExternalId(row);
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    const incident = normalizeOpenFemaDisasterDeclaration(row);
    incidents.push(incident);
    evidence.push(buildOpenFemaEvidence(row, incident));
  }
  return { incidents, evidence };
}

export async function fetchAndNormalizeOpenFemaDisasterDeclarations(params: OpenFemaDisasterDeclarationsParams = {}) {
  const mode = params.mode ?? "preview";
  const limit = clampLimit(params.limit, mode === "import" ? 1000 : hasControlledFilter(params) ? 100 : 25);
  const result = await fetchOpenFemaDisasterDeclarations({ ...params, limit, mode });
  const normalized = normalizeOpenFemaDisasterDeclarations(result.rows);
  return {
    status: normalized.incidents.length === 0 ? "empty" as const : "ready" as const,
    sourceId: OPENFEMA_SOURCE_ID,
    sourceName: OPENFEMA_SOURCE_NAME,
    sourceRole: "disaster_declaration_recovery_dataset" as const,
    isLiveSensor: false,
    requiresApiKey: false as const,
    requiresConfiguration: false as const,
    endpoint: result.endpoint,
    fetched: result.rows.length,
    normalized: normalized.incidents.length,
    incidents: normalized.incidents,
    evidence: normalized.evidence,
    institutionalLessons: normalized.incidents.flatMap((incident) => incident.technicalFactors.institutionalLessons ?? []).slice(0, 20),
    operationalPrecedents: normalized.incidents.map((incident) => incident.technicalFactors.operationalPrecedent).filter(Boolean).slice(0, 10),
    warnings: result.warnings,
    errors: [] as string[],
  };
}

export function getOpenFemaAdapterStatus() {
  return {
    adapterId: "openFemaAdapter",
    sourceId: OPENFEMA_SOURCE_ID,
    status: "ready" as const,
    registryStatus: "active_institutional",
    sourceRole: "disaster_declaration_recovery_dataset",
    isLiveSensor: false,
    requiresApiKey: false,
    requiresConfiguration: false,
    officialSource: true,
    coverage: "United States and FEMA territories",
    importMode: "controlled_filters",
    runAllDefault: false,
    institutionalLearning: "enabled",
    playbookLearning: "enabled",
    mapLayer: {
      id: "openfema-disaster-declarations",
      name: "OpenFEMA Disaster Declarations",
      layerType: "institutional_disaster_declarations",
      sourceId: OPENFEMA_SOURCE_ID,
      isLiveSource: false,
      defaultVisible: false,
      groupKey: "disasterNumber",
      filters: ["year", "state", "incidentType", "declarationType", "disasterNumber"],
    },
    futureDatasets: [
      "Public Assistance Funded Projects Details",
      "Public Assistance Applicants",
      "Individual Assistance aggregate datasets",
      "Hazard Mitigation Assistance",
      "NFIP / Flood Insurance",
    ],
    capabilities: [
      "disaster_declarations_summaries",
      "preview",
      "controlled_import",
      "dedup_disaster_area_declaration_date",
      "institutional_evidence",
      "institutional_lessons",
      "operational_precedents",
      "playbook_ready",
    ],
    limitations: [
      "Not a live/sensorial source.",
      "Not a forecast or active weather alert source.",
      "Not complete worldwide disaster coverage.",
      "Coverage is limited to the United States and FEMA territories.",
      "FEMA declaration does not equal total real-world impact.",
      "Absence of a declaration does not mean absence of disaster.",
      "Assistance amounts do not equal total disaster cost.",
      "ARGUS recommendations based on FEMA precedent are not official FEMA instructions.",
    ],
  };
}
