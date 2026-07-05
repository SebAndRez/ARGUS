import { NextRequest, NextResponse } from "next/server";
import {
  buildIocSlsmfEvidence,
  fetchAndBuildIocSlsmfContext,
  getIocSlsmfAdapterStatus,
  getIocSlsmfApiKeyStatus,
  validateIocSlsmfRequest,
  type IocSlsmfRequestParams,
} from "@/lib/knowledge-intake/adapters/iocSlsmfAdapter";
import { saveWeatherContextEvidenceIfFreshMissing } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";

export const dynamic = "force-dynamic";

function numberParam(params: URLSearchParams, key: string) {
  const value = params.get(key);
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanParam(params: URLSearchParams, key: string, fallback: boolean) {
  const value = params.get(key);
  if (value === null) return fallback;
  return value === "true";
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const input: IocSlsmfRequestParams = {
    stationCode: params.get("stationCode") ?? undefined,
    lat: numberParam(params, "lat"),
    lon: numberParam(params, "lon"),
    bbox: params.get("bbox") ?? undefined,
    radiusKm: numberParam(params, "radiusKm") ?? 100,
    startTime: params.get("startTime") ?? undefined,
    endTime: params.get("endTime") ?? undefined,
    minutes: numberParam(params, "minutes") ?? 120,
    purpose: params.get("purpose") ?? "general",
    incidentId: params.get("incidentId") ?? undefined,
    routeAnalysisId: params.get("routeAnalysisId") ?? undefined,
    fenixSimulationId: params.get("fenixSimulationId") ?? undefined,
    persist: booleanParam(params, "persist", false),
    includeStations: booleanParam(params, "includeStations", true),
    includeMetadata: booleanParam(params, "includeMetadata", true),
    includeSensors: booleanParam(params, "includeSensors", true),
    includeRecentData: booleanParam(params, "includeRecentData", true),
    apiVersion: params.get("apiVersion") === "legacy" ? "legacy" : "v2",
  };
  const status = getIocSlsmfAdapterStatus();
  const keyStatus = getIocSlsmfApiKeyStatus();
  if (!keyStatus.apiKeyConfigured) {
    return NextResponse.json({
      status: "requiresConfiguration",
      sourceId: "ioc-slsmf",
      source: "IOC Sea Level Monitoring",
      sourceRole: status.sourceRole,
      isIncidentSource: false,
      requiresApiKey: true,
      requiresConfiguration: true,
      envVar: "IOC_SLSMF_API_KEY",
      message: keyStatus.message,
      stationsFound: 0,
      productsFetched: [],
      normalized: 0,
      persisted: false,
      evidenceCreated: false,
      seaLevelObservationContext: null,
      riskFactors: null,
      warnings: [keyStatus.message],
      errors: [],
    }, { status: 200 });
  }

  const validation = validateIocSlsmfRequest(input);
  if (!validation.valid) {
    return NextResponse.json({
      status: validation.status,
      message: validation.message,
      source: "IOC Sea Level Monitoring",
      sourceId: "ioc-slsmf",
      sourceRole: status.sourceRole,
      isIncidentSource: false,
      requiresApiKey: true,
      requiresConfiguration: false,
      stationsFound: 0,
      productsFetched: [],
      normalized: 0,
      persisted: false,
      evidenceCreated: false,
      seaLevelObservationContext: null,
      riskFactors: null,
      warnings: [],
      errors: validation.errors,
    }, { status: 400 });
  }

  const result = await fetchAndBuildIocSlsmfContext(validation.params);
  if (!result.context) {
    return NextResponse.json({
      status: result.status,
      source: "IOC Sea Level Monitoring",
      sourceId: "ioc-slsmf",
      sourceRole: status.sourceRole,
      isIncidentSource: false,
      requiresApiKey: true,
      requiresConfiguration: result.status === "requiresConfiguration",
      stationsFound: 0,
      productsFetched: result.productsFetched,
      normalized: result.normalized,
      persisted: false,
      evidenceCreated: false,
      seaLevelObservationContext: null,
      riskFactors: null,
      warnings: result.warnings,
      errors: result.errors,
    }, { status: result.status === "requiresConfiguration" ? 200 : 502 });
  }

  const evidence = buildIocSlsmfEvidence(result.context, validation.params);
  let persisted = false;
  let evidenceCreated = false;
  const warnings = [
    "IOC SLSMF is sea level observation context only; it is not a tsunami warning center, evacuation order or official inundation model.",
    "ARGUS does not create KnowledgeIncident records from IOC SLSMF readings.",
    ...result.warnings,
  ];
  const errors = [...result.errors];

  if (validation.params.persist) {
    try {
      const saved = await saveWeatherContextEvidenceIfFreshMissing({
        incidentId: validation.params.incidentId,
        sourceId: "ioc-slsmf",
        sourceName: "IOC Sea Level Monitoring Facility",
        evidenceType: "sea_level_observation_context",
        title: evidence.title,
        url: evidence.url,
        excerpt: evidence.summary,
        rawRef: result.context.id,
        confidenceScore: evidence.confidenceScore.finalConfidence,
        metadataJson: JSON.parse(JSON.stringify(result.context)),
      });
      persisted = saved.action === "inserted";
      evidenceCreated = saved.action === "inserted";
      if (saved.action === "skipped_fresh") warnings.push("Fresh IOC SLSMF sea level context already exists; skipped by TTL.");
      if (saved.action === "skipped_no_association") warnings.push("No persisted incident association found; preview returned without persistence.");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "KnowledgeEvidence persistence failed");
      warnings.push("Knowledge DB/migration unavailable or association invalid; preview returned without persistence.");
    }
  }

  return NextResponse.json({
    status: result.status,
    source: "IOC Sea Level Monitoring",
    sourceId: "ioc-slsmf",
    sourceRole: status.sourceRole,
    isIncidentSource: false,
    requiresApiKey: true,
    requiresConfiguration: false,
    stationsFound: result.context.stations.length,
    productsFetched: result.productsFetched,
    normalized: result.normalized,
    persisted,
    evidenceCreated,
    seaLevelObservationContext: result.context,
    riskFactors: result.context.riskFactors,
    warnings: [...new Set(warnings)],
    errors,
  });
}
