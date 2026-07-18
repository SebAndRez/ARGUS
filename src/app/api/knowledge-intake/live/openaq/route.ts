import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import {
  buildOpenAqEvidence,
  fetchAndBuildOpenAqAirQualityObservationContext,
  getOpenAqAdapterStatus,
  getOpenAqApiKeyStatus,
  validateOpenAqRequest,
  type OpenAqRequestParams,
} from "@/lib/knowledge-intake/adapters/openAqAdapter";
import { saveWeatherContextEvidenceIfFreshMissing } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

function numberParam(params: URLSearchParams, key: string) {
  const value = params.get(key);
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boolParam(params: URLSearchParams, key: string, fallback = true) {
  const value = params.get(key);
  if (value === null) return fallback;
  return value === "true";
}

function listParam(params: URLSearchParams, key: string) {
  const value = params.get(key);
  return value ? value.split(/[;,]/).map((item) => item.trim()).filter(Boolean) : undefined;
}

export async function GET(request: NextRequest) {
  // ARGUS Prompt 9/10 (SEC-1): esta lectura en vivo no tenia auth NI rate
  // limit por defecto (solo `?persist=true` pasaba por requireOperator).
  // No se exige sesion: consumidores anonimos legitimos (ej. /app, NASA
  // EONET) dependen de esta lectura publica. Solo se acota el abuso/costo.
  const rateLimitOutcome = await enforceRateLimit({ policy: "knowledge_intake_live_read", request });
  const rateLimited = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimited) return rateLimited;
  const search = request.nextUrl.searchParams;
  const input: OpenAqRequestParams = {
    locationId: search.get("locationId") ?? undefined,
    sensorId: search.get("sensorId") ?? undefined,
    lat: numberParam(search, "lat"),
    lon: numberParam(search, "lon"),
    radiusKm: numberParam(search, "radiusKm") ?? 25,
    bbox: search.get("bbox") ?? undefined,
    parameters: listParam(search, "parameters") ?? ["pm25", "pm10", "o3", "no2", "so2", "co"],
    country: search.get("country") ?? undefined,
    providers: listParam(search, "providers"),
    owners: listParam(search, "owners"),
    licenses: listParam(search, "licenses"),
    limit: numberParam(search, "limit") ?? 20,
    page: numberParam(search, "page"),
    purpose: search.get("purpose") ?? "general",
    incidentId: search.get("incidentId") ?? undefined,
    routeAnalysisId: search.get("routeAnalysisId") ?? undefined,
    fenixSimulationId: search.get("fenixSimulationId") ?? undefined,
    persist: search.get("persist") === "true",
    includeLocations: boolParam(search, "includeLocations", true),
    includeSensors: boolParam(search, "includeSensors", true),
    includeLatest: boolParam(search, "includeLatest", true),
    includeParameters: boolParam(search, "includeParameters", true),
    includeProviders: boolParam(search, "includeProviders", true),
    includeOwners: boolParam(search, "includeOwners", true),
    includeLicenses: boolParam(search, "includeLicenses", true),
  };

  const validation = validateOpenAqRequest(input);
  if (!validation.valid) {
    return NextResponse.json({
      status: validation.status,
      message: validation.message,
      source: "OpenAQ",
      sourceId: "openaq",
      sourceRole: "air_quality_observation_source",
      isIncidentSource: false,
      requiresApiKey: true,
      requiresConfiguration: getOpenAqApiKeyStatus().requiresConfiguration,
      locationsFound: 0,
      sensorsFound: 0,
      latestFetched: 0,
      normalized: 0,
      persisted: false,
      evidenceCreated: false,
      airQualityObservationContext: null,
      riskFactors: null,
      warnings: [],
      errors: validation.errors,
    }, { status: 400 });
  }

  const keyStatus = getOpenAqApiKeyStatus();
  if (!keyStatus.apiKeyConfigured) {
    return NextResponse.json({
      status: "requiresConfiguration",
      sourceId: "openaq",
      source: "OpenAQ",
      sourceRole: "air_quality_observation_source",
      isIncidentSource: false,
      requiresApiKey: true,
      requiresConfiguration: true,
      envVar: "OPENAQ_API_KEY",
      message: "OpenAQ API key is required to access air quality data.",
      locationsFound: 0,
      sensorsFound: 0,
      latestFetched: 0,
      normalized: 0,
      persisted: false,
      evidenceCreated: false,
      airQualityObservationContext: null,
      riskFactors: null,
      warnings: [keyStatus.message],
      errors: [],
    });
  }

  const result = await fetchAndBuildOpenAqAirQualityObservationContext(validation.params);
  if (result.status === "rateLimited") {
    return NextResponse.json({
      status: "rateLimited",
      source: "OpenAQ",
      sourceId: "openaq",
      sourceRole: "air_quality_observation_source",
      isIncidentSource: false,
      requiresApiKey: true,
      requiresConfiguration: false,
      locationsFound: 0,
      sensorsFound: 0,
      latestFetched: 0,
      normalized: 0,
      persisted: false,
      evidenceCreated: false,
      airQualityObservationContext: null,
      riskFactors: null,
      warnings: ["OpenAQ returned 429; retry with backoff."],
      errors: [],
    }, { status: 429 });
  }
  if (!result.context) {
    return NextResponse.json({
      status: result.status ?? "error",
      source: "OpenAQ",
      sourceId: "openaq",
      sourceRole: "air_quality_observation_source",
      isIncidentSource: false,
      requiresApiKey: true,
      requiresConfiguration: false,
      locationsFound: 0,
      sensorsFound: 0,
      latestFetched: 0,
      normalized: 0,
      persisted: false,
      evidenceCreated: false,
      airQualityObservationContext: null,
      riskFactors: null,
      warnings: result.warnings ?? [],
      errors: result.errors ?? ["OpenAQ context failed"],
    }, { status: 502 });
  }

  const evidence = buildOpenAqEvidence(result.context, validation.params);
  let persisted = false;
  let evidenceCreated = false;
  const warnings = [
    ...result.context.warnings,
    "OpenAQ is air quality context only; it is not an official health alert, medical diagnosis, evacuation order or incident source.",
    "Provider/license metadata must remain visible and reviewed before operational or commercial reuse.",
    ...getOpenAqAdapterStatus().limitations,
  ];
  const errors = [...(result.errors ?? [])];

  if (validation.params.persist) {
    const { user, response: authResponse } = await requireOperator();
    if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
    try {
      const saved = await saveWeatherContextEvidenceIfFreshMissing({
        incidentId: validation.params.incidentId,
        sourceId: "openaq",
        sourceName: "OpenAQ",
        evidenceType: "air_quality_observation_context",
        title: evidence.title,
        url: evidence.url,
        excerpt: evidence.summary,
        rawRef: result.context.rawRefs[0] ?? result.context.generatedAt,
        confidenceScore: evidence.confidenceScore.finalConfidence,
        metadataJson: JSON.parse(JSON.stringify(result.context)),
      });
      persisted = saved.action === "inserted";
      evidenceCreated = saved.action === "inserted";
      if (saved.action === "skipped_fresh") warnings.push("Fresh OpenAQ air quality context already exists; skipped by TTL.");
      if (saved.action === "skipped_no_association") warnings.push("No persisted incident association found; preview returned without persistence.");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "KnowledgeEvidence persistence failed");
      warnings.push("Knowledge DB/migration unavailable or association invalid; preview returned without persistence.");
    }
  }

  return NextResponse.json({
    status: result.context.riskFactors.noNearbyLocation ? "noNearbyLocation" : result.context.riskFactors.staleData ? "staleData" : "ready",
    source: "OpenAQ",
    sourceId: "openaq",
    sourceRole: "air_quality_observation_source",
    isIncidentSource: false,
    requiresApiKey: true,
    requiresConfiguration: false,
    locationsFound: result.context.locations.length,
    sensorsFound: result.context.sensors.length,
    latestFetched: result.context.measurements.length,
    normalized: result.context.measurements.length + result.context.locations.length,
    persisted,
    evidenceCreated,
    airQualityObservationContext: result.context,
    riskFactors: result.context.riskFactors,
    providerLicense: result.context.providerLicense,
    warnings,
    errors,
  });
}
