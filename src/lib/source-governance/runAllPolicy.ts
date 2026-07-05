import {
  getAllSourceGovernancePolicies,
  getSourceGovernancePolicy,
  hasRequiredContext,
} from "@/lib/source-governance/sourceGovernanceRegistry";
import type { SourceContextState } from "@/lib/source-governance/sourceRoles";

export interface RunAllFlags {
  includeMediaSignals?: boolean;
  includeHistoricalImports?: boolean;
  includeInfrastructureContext?: boolean;
  includeHumanitarianContext?: boolean;
  includeWeatherContext?: boolean;
  includeAirQualityContext?: boolean;
  includeFloodForecastContext?: boolean;
  includeObservedFloodContext?: boolean;
  includeVehicleContext?: boolean;
  includeVolcanoMemory?: boolean;
  includeEarthquakeImpact?: boolean;
  includeHealthContext?: boolean;
  includeCoastalOceanContext?: boolean;
  includeContextual?: boolean;
  includeHydrologicalContext?: boolean;
  includeCriticalInfrastructureContext?: boolean;
  includePublicHealth?: boolean;
  includeEcdc?: boolean;
  includeVolcanoReports?: boolean;
  includeSmithsonianGvp?: boolean;
  includeImpact?: boolean;
}

export interface RunAllDecision {
  sourceId: string;
  allowed: boolean;
  defaultSource: boolean;
  requiresContext: boolean;
  requiresConfiguration: boolean;
  reasons: string[];
}

const FLAG_BY_SOURCE_ID: Record<string, keyof RunAllFlags> = {
  gdelt: "includeMediaSignals",
  reliefweb: "includeMediaSignals",
  "news-evidence": "includeMediaSignals",
  "liveuamap-manual": "includeMediaSignals",
  "noaa-ncei-tsunami": "includeHistoricalImports",
  "noaa-storm-events": "includeHistoricalImports",
  openfema: "includeHistoricalImports",
  "smithsonian-gvp": "includeVolcanoMemory",
  nhtsa: "includeVehicleContext",
  "osm-overpass": "includeInfrastructureContext",
  "hdx-hapi": "includeHumanitarianContext",
  "open-meteo": "includeWeatherContext",
  openaq: "includeAirQualityContext",
  "copernicus-glofas": "includeFloodForecastContext",
  "copernicus-gfm": "includeObservedFloodContext",
  "usgs-shakemap": "includeEarthquakeImpact",
  "usgs-pager": "includeEarthquakeImpact",
  "noaa-coops": "includeCoastalOceanContext",
  "noaa-ndbc": "includeCoastalOceanContext",
  "ioc-slsmf": "includeCoastalOceanContext",
  "usgs-water": "includeHydrologicalContext",
  "who-don": "includeHealthContext",
  ecdc: "includeHealthContext",
};

export function getDefaultRunAllSources() {
  return getAllSourceGovernancePolicies()
    .filter((source) => source.runAllDefault)
    .map((source) => source.sourceId);
}

export function getRunAllSourcesForFlags(flags: RunAllFlags = {}, context: SourceContextState = {}) {
  return getAllSourceGovernancePolicies()
    .filter((source) => getRunAllDecision(source.sourceId, flags, context).allowed)
    .map((source) => source.sourceId);
}

export function filterRunAllSourcesByGovernance(sources: string[], flags: RunAllFlags = {}, context: SourceContextState = {}) {
  return sources.filter((sourceId) => getRunAllDecision(sourceId, flags, context).allowed);
}

export function explainRunAllBlockedSources(sources: string[] = getAllSourceGovernancePolicies().map((source) => source.sourceId), flags: RunAllFlags = {}, context: SourceContextState = {}) {
  return sources
    .map((sourceId) => getRunAllDecision(sourceId, flags, context))
    .filter((decision) => !decision.allowed);
}

export function getRunAllDecision(sourceId: string, flags: RunAllFlags = {}, context: SourceContextState = {}): RunAllDecision {
  const policy = getSourceGovernancePolicy(sourceId);
  if (!policy) {
    return { sourceId, allowed: false, defaultSource: false, requiresContext: false, requiresConfiguration: false, reasons: ["No governance policy registered."] };
  }

  const reasons: string[] = [];
  const flagName = FLAG_BY_SOURCE_ID[policy.sourceId];
  const flagEnabled = flagName ? flags[flagName] === true || flags.includeContextual === true && policy.queryMode !== "global_polling" : false;
  const hasContext = hasRequiredContext(policy.sourceId, context);

  if (policy.requiresConfiguration) reasons.push("Requires configuration; missing/present env values are not exposed here.");
  if (policy.runAllDefault) reasons.push("Default run-all live source.");
  if (!policy.runAllDefault && !flagEnabled) reasons.push(flagName ? `Requires ${flagName}=true.` : "Not enabled for run-all.");
  if (!policy.runAllDefault && flagEnabled && !hasContext) reasons.push("Flag enabled, but bounded event/AOI/route context is required.");
  if (policy.sourceRole === "osint_signal") reasons.push("OSINT cannot create confirmed incidents and remains review-only.");
  if (policy.sourceRole === "historical_memory") reasons.push("Historical memory is controlled import only, never live polling.");

  const flagContextAllowed =
    !policy.runAllDefault &&
    flagEnabled &&
    hasContext &&
    !policy.requiresConfiguration &&
    policy.sourceRole !== "historical_memory" &&
    policy.sourceRole !== "osint_signal";

  return {
    sourceId: policy.sourceId,
    allowed: (policy.runAllDefault && !policy.requiresConfiguration) || flagContextAllowed,
    defaultSource: policy.runAllDefault,
    requiresContext: !hasContext && !policy.runAllDefault,
    requiresConfiguration: policy.requiresConfiguration,
    reasons,
  };
}
