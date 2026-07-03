import { NextRequest, NextResponse } from "next/server";
import {
  buildCoopsEvidence,
  fetchAndBuildCoopsContext,
  getCoopsAdapterStatus,
  validateNoaaCoopsRequest,
  type NoaaCoopsRequestParams,
} from "@/lib/knowledge-intake/adapters/noaaCoopsAdapter";
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
  const input: NoaaCoopsRequestParams = {
    stationId: params.get("stationId") ?? undefined,
    lat: numberParam(params, "lat"),
    lon: numberParam(params, "lon"),
    bbox: params.get("bbox") ?? undefined,
    radiusKm: numberParam(params, "radiusKm") ?? 25,
    products: (params.get("products") ?? "water_level,predictions,wind,air_pressure").split(",").map((item) => item.trim()).filter(Boolean),
    datum: params.get("datum") ?? "MLLW",
    units: params.get("units") ?? "metric",
    timeZone: params.get("timeZone") ?? "gmt",
    purpose: params.get("purpose") ?? "general",
    incidentId: params.get("incidentId") ?? undefined,
    routeAnalysisId: params.get("routeAnalysisId") ?? undefined,
    fenixSimulationId: params.get("fenixSimulationId") ?? undefined,
    persist: booleanParam(params, "persist", false),
    includeMetadata: booleanParam(params, "includeMetadata", true),
    includeWaterLevel: booleanParam(params, "includeWaterLevel", true),
    includePredictions: booleanParam(params, "includePredictions", true),
    includeWind: booleanParam(params, "includeWind", true),
    includeAirPressure: booleanParam(params, "includeAirPressure", true),
    includeAirGap: booleanParam(params, "includeAirGap", params.get("products")?.includes("air_gap") ?? false),
  };
  const status = getCoopsAdapterStatus();
  const validation = validateNoaaCoopsRequest(input);
  if (!validation.valid) {
    return NextResponse.json({
      status: validation.status,
      message: validation.message,
      source: "NOAA CO-OPS",
      sourceId: "noaa-coops",
      sourceRole: status.sourceRole,
      isIncidentSource: false,
      requiresApiKey: false,
      stationsFound: 0,
      productsRequested: [],
      productsFetched: [],
      normalized: 0,
      persisted: false,
      evidenceCreated: false,
      coastalObservationContext: null,
      riskFactors: null,
      warnings: [],
      errors: validation.errors,
    }, { status: 400 });
  }

  const result = await fetchAndBuildCoopsContext(validation.params);
  if (!result.context) {
    return NextResponse.json({
      status: result.status,
      source: "NOAA CO-OPS",
      sourceId: "noaa-coops",
      sourceRole: status.sourceRole,
      isIncidentSource: false,
      requiresApiKey: false,
      stationsFound: 0,
      productsRequested: validation.params.products,
      productsFetched: result.productsFetched,
      normalized: result.normalized,
      persisted: false,
      evidenceCreated: false,
      coastalObservationContext: null,
      riskFactors: null,
      warnings: result.warnings,
      errors: result.errors,
    }, { status: result.status === "invalidRequest" ? 400 : 502 });
  }

  const evidence = buildCoopsEvidence(result.context, validation.params);
  let persisted = false;
  let evidenceCreated = false;
  const warnings = [
    "NOAA CO-OPS is coastal observation context only; it is not a tsunami warning center, evacuation order or route/bridge closure source.",
    "ARGUS does not create KnowledgeIncident records from NOAA CO-OPS readings.",
    ...result.warnings,
    ...status.limitations,
  ];
  const errors = [...result.errors];

  if (validation.params.persist) {
    try {
      const saved = await saveWeatherContextEvidenceIfFreshMissing({
        incidentId: validation.params.incidentId,
        sourceId: "noaa-coops",
        sourceName: "NOAA CO-OPS",
        evidenceType: "coastal_ocean_context",
        title: evidence.title,
        url: evidence.url,
        excerpt: evidence.summary,
        rawRef: result.context.id,
        confidenceScore: evidence.confidenceScore.finalConfidence,
        metadataJson: JSON.parse(JSON.stringify(result.context)),
      });
      persisted = saved.action === "inserted";
      evidenceCreated = saved.action === "inserted";
      if (saved.action === "skipped_fresh") warnings.push("Fresh NOAA CO-OPS coastal context already exists; skipped by TTL.");
      if (saved.action === "skipped_no_association") warnings.push("No persisted incident association found; preview returned without persistence.");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "KnowledgeEvidence persistence failed");
      warnings.push("Knowledge DB/migration unavailable or association invalid; preview returned without persistence.");
    }
  }

  return NextResponse.json({
    status: result.status,
    source: "NOAA CO-OPS",
    sourceId: "noaa-coops",
    sourceRole: status.sourceRole,
    isIncidentSource: false,
    requiresApiKey: false,
    stationsFound: result.context.stations.length,
    productsRequested: validation.params.products,
    productsFetched: result.productsFetched,
    normalized: result.normalized,
    persisted,
    evidenceCreated,
    coastalObservationContext: result.context,
    riskFactors: result.context.riskFactors,
    warnings: [...new Set(warnings)],
    errors,
  });
}
