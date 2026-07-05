import type {
  QueryMode,
  RequiredSourceContext,
  SourceAction,
  SourceGovernancePolicy,
  SourceRole,
  SourceContextState,
} from "@/lib/source-governance/sourceRoles";

const INCIDENT_ACTIONS: SourceAction[] = [
  "create_incident",
  "update_incident",
  "create_evidence",
  "create_context",
  "update_risk",
  "render_layer",
];

const CONTEXT_ACTIONS: SourceAction[] = [
  "create_evidence",
  "create_context",
  "update_risk",
  "render_layer",
];

const CANDIDATE_ACTIONS: SourceAction[] = [
  "create_candidate",
  "create_evidence",
  "create_context",
  "update_risk",
  "render_layer",
];

const MANUAL_ACTIONS: SourceAction[] = [
  "manual_import",
  "create_evidence",
  "create_context",
  "update_risk",
  "render_layer",
];

function policy(input: Partial<SourceGovernancePolicy> & Pick<SourceGovernancePolicy, "sourceId" | "sourceRole" | "queryMode">): SourceGovernancePolicy {
  const roleDefaults = defaultsForRole(input.sourceRole, input.queryMode);
  return {
    ...roleDefaults,
    ...input,
    sourceName: input.sourceName,
    secondaryRoles: input.secondaryRoles ?? [],
    caveats: input.caveats ?? roleDefaults.caveats,
    forbiddenActions: input.forbiddenActions ?? roleDefaults.forbiddenActions,
    allowedActions: input.allowedActions ?? roleDefaults.allowedActions,
  };
}

function defaultsForRole(sourceRole: SourceRole, queryMode: QueryMode): Omit<SourceGovernancePolicy, "sourceId" | "sourceRole" | "queryMode" | "sourceName" | "secondaryRoles"> {
  if (sourceRole === "incident_trigger") {
    return {
      canCreateIncident: true,
      canCreateIncidentWithGuardrails: false,
      canCreateCandidate: false,
      canUpdateIncident: true,
      canCreateEvidence: true,
      canCreateContext: true,
      canUpdateRisk: true,
      citizenVisibleByDefault: true,
      citizenVisibleOnIncidentDetail: true,
      commandCenterVisible: true,
      analystVisible: true,
      fenixVisible: true,
      navVisible: false,
      auraVisible: false,
      runAllDefault: queryMode === "global_polling",
      runAllAllowedWithFlag: true,
      requiresReviewByDefault: false,
      requiresConfiguration: false,
      defaultPersistence: "always",
      persistenceMode: "always",
      riskWeight: 0.9,
      confidenceBase: 0.95,
      caveats: ["Official/live source; preserve source URL, event id and update time."],
      forbiddenActions: [],
      allowedActions: INCIDENT_ACTIONS,
    };
  }

  if (sourceRole === "observed_context") {
    return {
      canCreateIncident: false,
      canCreateIncidentWithGuardrails: true,
      canCreateCandidate: true,
      canUpdateIncident: true,
      canCreateEvidence: true,
      canCreateContext: true,
      canUpdateRisk: true,
      citizenVisibleByDefault: false,
      citizenVisibleOnIncidentDetail: true,
      commandCenterVisible: true,
      analystVisible: true,
      fenixVisible: true,
      navVisible: true,
      auraVisible: true,
      runAllDefault: false,
      runAllAllowedWithFlag: true,
      requiresReviewByDefault: true,
      requiresConfiguration: false,
      defaultPersistence: "event_related",
      persistenceMode: "event_related",
      requiredContext: ["event", "aoi", "incident"],
      riskWeight: 0.78,
      confidenceBase: 0.84,
      caveats: ["Observed context can enrich or corroborate; it does not confirm casualties, damage or official orders."],
      forbiddenActions: [],
      allowedActions: CANDIDATE_ACTIONS.concat("update_incident"),
    };
  }

  if (sourceRole === "forecast_signal") {
    return {
      canCreateIncident: false,
      canCreateIncidentWithGuardrails: false,
      canCreateCandidate: true,
      canUpdateIncident: false,
      canCreateEvidence: true,
      canCreateContext: true,
      canUpdateRisk: true,
      citizenVisibleByDefault: false,
      citizenVisibleOnIncidentDetail: false,
      commandCenterVisible: true,
      analystVisible: true,
      fenixVisible: true,
      navVisible: true,
      auraVisible: true,
      runAllDefault: false,
      runAllAllowedWithFlag: true,
      requiresReviewByDefault: true,
      requiresConfiguration: false,
      defaultPersistence: "event_related",
      persistenceMode: "event_related",
      requiredContext: ["event", "aoi", "point", "simulation", "incident"],
      riskWeight: 0.62,
      confidenceBase: 0.72,
      caveats: ["Forecast/model, not observed reality. Do not create confirmed incidents from this source alone."],
      forbiddenActions: ["create_incident"],
      allowedActions: CANDIDATE_ACTIONS,
    };
  }

  if (sourceRole === "historical_memory") {
    return {
      canCreateIncident: false,
      canCreateIncidentWithGuardrails: false,
      canCreateCandidate: false,
      canUpdateIncident: false,
      canCreateEvidence: true,
      canCreateContext: true,
      canUpdateRisk: true,
      citizenVisibleByDefault: false,
      citizenVisibleOnIncidentDetail: false,
      commandCenterVisible: true,
      analystVisible: true,
      fenixVisible: true,
      navVisible: false,
      auraVisible: false,
      runAllDefault: false,
      runAllAllowedWithFlag: true,
      requiresReviewByDefault: false,
      requiresConfiguration: false,
      defaultPersistence: "manual_import",
      persistenceMode: "manual_import",
      riskWeight: 0.45,
      confidenceBase: 0.82,
      caveats: ["Historical memory only. Do not treat records as live events."],
      forbiddenActions: ["create_incident", "create_candidate"],
      allowedActions: MANUAL_ACTIONS,
    };
  }

  if (sourceRole === "osint_signal") {
    return {
      canCreateIncident: false,
      canCreateIncidentWithGuardrails: false,
      canCreateCandidate: true,
      canUpdateIncident: false,
      canCreateEvidence: true,
      canCreateContext: true,
      canUpdateRisk: false,
      citizenVisibleByDefault: false,
      citizenVisibleOnIncidentDetail: false,
      commandCenterVisible: true,
      analystVisible: true,
      fenixVisible: false,
      navVisible: false,
      auraVisible: false,
      runAllDefault: false,
      runAllAllowedWithFlag: true,
      requiresReviewByDefault: true,
      requiresConfiguration: false,
      defaultPersistence: "event_related",
      persistenceMode: "event_related",
      requiredContext: ["event", "aoi", "incident"],
      riskWeight: 0.35,
      confidenceBase: 0.62,
      caveats: ["OSINT/media signal. Never confirms incidents, casualties or damage by itself."],
      forbiddenActions: ["create_incident", "update_incident"],
      allowedActions: ["create_candidate", "create_evidence", "create_context"],
    };
  }

  return {
    canCreateIncident: false,
    canCreateIncidentWithGuardrails: false,
    canCreateCandidate: false,
    canUpdateIncident: sourceRole === "impact_enrichment",
    canCreateEvidence: true,
    canCreateContext: true,
    canUpdateRisk: true,
    citizenVisibleByDefault: false,
    citizenVisibleOnIncidentDetail: true,
    commandCenterVisible: true,
    analystVisible: true,
    fenixVisible: true,
    navVisible: true,
    auraVisible: true,
    runAllDefault: false,
    runAllAllowedWithFlag: true,
    requiresReviewByDefault: false,
    requiresConfiguration: false,
    defaultPersistence: "event_related",
    persistenceMode: sourceRole === "baseline_context" ? "aoi_related" : "event_related",
    requiredContext: sourceRole === "baseline_context" ? ["aoi", "bbox", "point", "route", "simulation", "incident"] : ["event", "incident", "aoi"],
    riskWeight: sourceRole === "impact_enrichment" ? 0.72 : 0.55,
    confidenceBase: 0.8,
    caveats: ["Context/enrichment source. It cannot create confirmed incidents by itself."],
    forbiddenActions: ["create_incident"],
    allowedActions: CONTEXT_ACTIONS,
  };
}

export const SOURCE_GOVERNANCE_POLICIES: SourceGovernancePolicy[] = [
  policy({ sourceId: "usgs-earthquake", sourceName: "USGS Earthquake", sourceRole: "incident_trigger", queryMode: "global_polling", riskWeight: 0.95, confidenceBase: 0.98, maxPollingWindowHours: 168, caveats: ["Official USGS earthquake feed; preserve eventId, sourceUrl and updateTime."] }),
  policy({ sourceId: "gdacs", sourceName: "GDACS", sourceRole: "incident_trigger", queryMode: "global_polling", riskWeight: 0.92, confidenceBase: 0.94 }),
  policy({ sourceId: "noaa-tsunami", sourceName: "NOAA Tsunami Warning Centers", sourceRole: "incident_trigger", queryMode: "global_polling", riskWeight: 0.98, confidenceBase: 0.98, minSeverityForCitizen: "watch" }),
  policy({ sourceId: "noaa-nhc-cphc", sourceName: "NOAA NHC / CPHC", sourceRole: "incident_trigger", secondaryRoles: ["forecast_signal"], queryMode: "global_polling", riskWeight: 0.94, confidenceBase: 0.96, caveats: ["Active advisories can trigger storm incidents; cones/tracks remain forecast/model context."] }),
  policy({ sourceId: "nws", sourceName: "NWS Alerts", sourceRole: "incident_trigger", queryMode: "global_polling", riskWeight: 0.93, confidenceBase: 0.96, minSeverityForCitizen: "moderate" }),
  policy({ sourceId: "usgs-volcano-hans", sourceName: "USGS Volcano HANS", sourceRole: "incident_trigger", secondaryRoles: ["observed_context"], queryMode: "global_polling", riskWeight: 0.9, confidenceBase: 0.94 }),
  policy({ sourceId: "nasa-eonet", sourceName: "NASA EONET", sourceRole: "incident_trigger", secondaryRoles: ["observed_context"], queryMode: "global_polling", riskWeight: 0.82, confidenceBase: 0.88 }),
  policy({ sourceId: "nasa-firms", sourceName: "NASA FIRMS", sourceRole: "incident_trigger", secondaryRoles: ["observed_context"], queryMode: "global_polling", runAllDefault: false, runAllAllowedWithFlag: true, riskWeight: 0.8, confidenceBase: 0.86, caveats: ["Thermal detections are fire signals; bounded relevance and duplicate filtering are required."] }),
  policy({ sourceId: "who-don", sourceName: "WHO Disease Outbreak News", sourceRole: "incident_trigger", secondaryRoles: ["impact_enrichment"], queryMode: "global_polling", runAllDefault: true, riskWeight: 0.9, confidenceBase: 0.95, caveats: ["Official public health source; do not issue diagnosis, restrictions or automatic citizen alerts."] }),
  policy({ sourceId: "ecdc", sourceName: "ECDC RSS/data", sourceRole: "incident_trigger", secondaryRoles: ["impact_enrichment"], queryMode: "global_polling", canCreateIncident: false, canCreateIncidentWithGuardrails: true, canCreateCandidate: true, requiresReviewByDefault: true, runAllDefault: true, riskWeight: 0.82, confidenceBase: 0.9 }),

  policy({ sourceId: "copernicus-gfm", sourceName: "Copernicus GFM", sourceRole: "observed_context", secondaryRoles: ["impact_enrichment"], queryMode: "aoi_only", requiresConfiguration: true, riskWeight: 0.85, confidenceBase: 0.88, requiredContext: ["aoi", "bbox", "incident", "simulation"], caveats: ["Observed flood from satellite/product context; incident creation requires guardrails and review."] }),
  policy({ sourceId: "noaa-coops", sourceName: "NOAA CO-OPS", sourceRole: "observed_context", secondaryRoles: ["impact_enrichment", "baseline_context"], queryMode: "aoi_only", riskWeight: 0.75, confidenceBase: 0.86 }),
  policy({ sourceId: "noaa-ndbc", sourceName: "NOAA NDBC", sourceRole: "observed_context", secondaryRoles: ["impact_enrichment", "baseline_context"], queryMode: "aoi_only", riskWeight: 0.72, confidenceBase: 0.84 }),
  policy({ sourceId: "ioc-slsmf", sourceName: "IOC SLSMF", sourceRole: "observed_context", secondaryRoles: ["impact_enrichment", "baseline_context"], queryMode: "aoi_only", requiresConfiguration: true, riskWeight: 0.76, confidenceBase: 0.84 }),
  policy({ sourceId: "usgs-water", sourceName: "USGS Water", sourceRole: "observed_context", secondaryRoles: ["impact_enrichment", "baseline_context"], queryMode: "aoi_only", riskWeight: 0.78, confidenceBase: 0.86 }),
  policy({ sourceId: "openaq", sourceName: "OpenAQ", sourceRole: "observed_context", secondaryRoles: ["impact_enrichment", "baseline_context"], queryMode: "aoi_only", canCreateIncidentWithGuardrails: false, requiresConfiguration: true, riskWeight: 0.62, confidenceBase: 0.75 }),
  policy({ sourceId: "usgs-shakemap", sourceName: "USGS ShakeMap", sourceRole: "observed_context", secondaryRoles: ["impact_enrichment", "forecast_signal"], queryMode: "event_enrichment", canCreateIncidentWithGuardrails: true, requiredContext: ["event", "incident"], riskWeight: 0.88, confidenceBase: 0.9, caveats: ["Ground shaking enrichment; early products may update and do not confirm damage."] }),
  policy({ sourceId: "smithsonian-gvp-activity", sourceName: "Smithsonian GVP activity reports", sourceRole: "observed_context", secondaryRoles: ["impact_enrichment"], queryMode: "event_enrichment", canCreateIncidentWithGuardrails: true, requiredContext: ["event", "incident"], riskWeight: 0.74, confidenceBase: 0.82 }),

  policy({ sourceId: "copernicus-glofas", sourceName: "Copernicus GloFAS", sourceRole: "forecast_signal", queryMode: "aoi_only", requiresConfiguration: true, riskWeight: 0.65, confidenceBase: 0.75, requiredContext: ["aoi", "bbox", "point", "simulation", "incident"] }),
  policy({ sourceId: "open-meteo", sourceName: "Open-Meteo", sourceRole: "forecast_signal", secondaryRoles: ["impact_enrichment", "baseline_context"], queryMode: "aoi_only", riskWeight: 0.55, confidenceBase: 0.72 }),
  policy({ sourceId: "usgs-pager", sourceName: "USGS PAGER", sourceRole: "impact_enrichment", secondaryRoles: ["forecast_signal"], queryMode: "event_enrichment", canUpdateIncident: true, requiredContext: ["event", "incident"], riskWeight: 0.84, confidenceBase: 0.86, caveats: ["Estimated impact only. Do not confirm casualties, deaths or damage from PAGER."] }),
  policy({ sourceId: "noaa-nhc-cphc-forecast", sourceName: "NOAA NHC / CPHC forecast products", sourceRole: "forecast_signal", queryMode: "event_enrichment", requiredContext: ["event", "incident"], riskWeight: 0.72, confidenceBase: 0.82 }),

  policy({ sourceId: "hdx-hapi", sourceName: "HDX / OCHA HAPI", sourceRole: "impact_enrichment", secondaryRoles: ["baseline_context"], queryMode: "event_enrichment", requiresConfiguration: true, riskWeight: 0.7, confidenceBase: 0.82, requiredContext: ["event", "aoi", "incident"] }),
  policy({ sourceId: "osm-overpass", sourceName: "OSM / Overpass", sourceRole: "baseline_context", secondaryRoles: ["impact_enrichment"], queryMode: "aoi_only", riskWeight: 0.7, confidenceBase: 0.8, requiredContext: ["aoi", "bbox", "point", "route", "simulation", "incident"], caveats: ["Community geospatial context only; not a routing authority, closure source or availability source."] }),
  policy({ sourceId: "nhtsa", sourceName: "NHTSA", sourceRole: "baseline_context", secondaryRoles: ["historical_memory"], queryMode: "manual_import", defaultPersistence: "manual_import", persistenceMode: "manual_import", riskWeight: 0.42, confidenceBase: 0.82 }),

  policy({ sourceId: "noaa-ncei-tsunami", sourceName: "NOAA NCEI Historical Tsunami", sourceRole: "historical_memory", queryMode: "manual_import", riskWeight: 0.45, confidenceBase: 0.85 }),
  policy({ sourceId: "noaa-storm-events", sourceName: "NOAA Storm Events", sourceRole: "historical_memory", queryMode: "manual_import", riskWeight: 0.42, confidenceBase: 0.82 }),
  policy({ sourceId: "openfema", sourceName: "OpenFEMA", sourceRole: "historical_memory", secondaryRoles: ["impact_enrichment"], queryMode: "manual_import", riskWeight: 0.44, confidenceBase: 0.82 }),
  policy({ sourceId: "smithsonian-gvp", sourceName: "Smithsonian GVP catalog/history", sourceRole: "historical_memory", secondaryRoles: ["baseline_context"], queryMode: "manual_import", riskWeight: 0.48, confidenceBase: 0.86 }),

  policy({ sourceId: "gdelt", sourceName: "GDELT", sourceRole: "osint_signal", queryMode: "event_enrichment", riskWeight: 0.35, confidenceBase: 0.65, requiredContext: ["event", "aoi", "incident"] }),
  policy({ sourceId: "reliefweb", sourceName: "ReliefWeb", sourceRole: "osint_signal", secondaryRoles: ["impact_enrichment"], queryMode: "event_enrichment", riskWeight: 0.42, confidenceBase: 0.7 }),
  policy({ sourceId: "liveuamap-manual", sourceName: "Liveuamap/manual conflict sources", sourceRole: "osint_signal", queryMode: "on_demand", riskWeight: 0.32, confidenceBase: 0.58 }),
  policy({ sourceId: "news-evidence", sourceName: "News evidence", sourceRole: "osint_signal", queryMode: "on_demand", riskWeight: 0.3, confidenceBase: 0.58 }),
];

const SOURCE_ALIASES: Record<string, string> = {
  usgs_earthquake: "usgs-earthquake",
  nasa_firms: "nasa-firms",
  nhtsa_crash: "nhtsa",
  nhtsa_fars_crss: "nhtsa",
  "usgs-earthquake-impact": "usgs-pager",
};

export function normalizeSourceId(sourceId: string) {
  return SOURCE_ALIASES[sourceId] ?? sourceId;
}

const POLICY_BY_SOURCE_ID = new Map(SOURCE_GOVERNANCE_POLICIES.map((item) => [item.sourceId, item]));

export function getSourceGovernancePolicy(sourceId: string) {
  return POLICY_BY_SOURCE_ID.get(normalizeSourceId(sourceId));
}

export function getAllSourceGovernancePolicies() {
  return SOURCE_GOVERNANCE_POLICIES;
}

export function getSourcesByRole(role: SourceRole) {
  return SOURCE_GOVERNANCE_POLICIES.filter((source) => source.sourceRole === role || source.secondaryRoles?.includes(role));
}

export function canSourceCreateIncident(sourceId: string) {
  return getSourceGovernancePolicy(sourceId)?.canCreateIncident === true;
}

export function canSourceCreateCandidate(sourceId: string) {
  return getSourceGovernancePolicy(sourceId)?.canCreateCandidate === true;
}

export function canSourceRunInRunAll(sourceId: string, flags: Record<string, boolean> = {}) {
  const source = getSourceGovernancePolicy(sourceId);
  if (!source) return false;
  if (source.runAllDefault) return true;
  if (!source.runAllAllowedWithFlag) return false;
  return Object.values(flags).some(Boolean);
}

export function isSourceCitizenVisible(sourceId: string, context: SourceContextState = {}) {
  const source = getSourceGovernancePolicy(sourceId);
  if (!source) return false;
  if (source.citizenVisibleByDefault) return true;
  if (context.hasSelectedIncident && source.citizenVisibleOnIncidentDetail) return true;
  return Boolean(context.isValidated && source.citizenVisibleOnIncidentDetail);
}

export function isSourceCommandCenterVisible(sourceId: string) {
  return getSourceGovernancePolicy(sourceId)?.commandCenterVisible === true;
}

export function getSourceQueryMode(sourceId: string) {
  return getSourceGovernancePolicy(sourceId)?.queryMode ?? "disabled_until_configured";
}

export function requiresAoi(sourceId: string) {
  const required = getSourceGovernancePolicy(sourceId)?.requiredContext ?? [];
  return required.includes("aoi") || required.includes("bbox") || required.includes("point") || getSourceQueryMode(sourceId) === "aoi_only";
}

export function requiresEventContext(sourceId: string) {
  const required = getSourceGovernancePolicy(sourceId)?.requiredContext ?? [];
  return required.includes("event") || required.includes("incident") || getSourceQueryMode(sourceId) === "event_enrichment";
}

export function getSourceRiskWeight(sourceId: string) {
  return getSourceGovernancePolicy(sourceId)?.riskWeight ?? 0;
}

export function getSourceCaveats(sourceId: string) {
  return getSourceGovernancePolicy(sourceId)?.caveats ?? ["No governance policy registered for this source."];
}

export function hasRequiredContext(sourceId: string, context: SourceContextState = {}) {
  const required = getSourceGovernancePolicy(sourceId)?.requiredContext ?? [];
  if (!required.length) return true;
  return required.some((item: RequiredSourceContext) => {
    if (item === "event") return context.hasActiveIncident;
    if (item === "incident") return context.hasSelectedIncident || context.hasActiveIncident;
    if (item === "aoi") return context.hasAoi;
    if (item === "bbox") return context.hasBbox;
    if (item === "point") return context.hasPoint;
    if (item === "route") return context.hasRoute;
    if (item === "simulation") return context.hasSimulation;
    return false;
  });
}
