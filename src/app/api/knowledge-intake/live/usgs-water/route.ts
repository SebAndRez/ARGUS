import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import {
  buildUsgsWaterEvidence,
  fetchAndBuildUsgsWaterContext,
  getUsgsWaterAdapterStatus,
  getUsgsWaterApiKeyStatus,
  validateUsgsWaterRequest,
  type UsgsWaterRequestParams,
} from "@/lib/knowledge-intake/adapters/usgsWaterAdapter";
import { saveWeatherContextEvidenceIfFreshMissing } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { requireOperator } from "@/lib/security/apiGuards";

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
  // ARGUS Prompt 9/10 (SEC-1): esta lectura en vivo no tenia auth NI rate
  // limit por defecto (solo `?persist=true` pasaba por requireOperator).
  // No se exige sesion: consumidores anonimos legitimos (ej. /app, NASA
  // EONET) dependen de esta lectura publica. Solo se acota el abuso/costo.
  const rateLimitOutcome = await enforceRateLimit({ policy: "knowledge_intake_live_read", request });
  const rateLimited = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimited) return rateLimited;
  const params = request.nextUrl.searchParams;
  const input: UsgsWaterRequestParams = {
    site: params.get("site") ?? undefined,
    lat: numberParam(params, "lat"),
    lon: numberParam(params, "lon"),
    bbox: params.get("bbox") ?? undefined,
    radiusKm: numberParam(params, "radiusKm") ?? 25,
    parameters: (params.get("parameters") ?? "00060,00065").split(",").map((item) => item.trim()).filter(Boolean),
    purpose: params.get("purpose") ?? "general",
    incidentId: params.get("incidentId") ?? undefined,
    persist: booleanParam(params, "persist", false),
    includeLocations: booleanParam(params, "includeLocations", true),
    includeLatestConditions: booleanParam(params, "includeLatestConditions", true),
    preferModernApi: booleanParam(params, "preferModernApi", true),
    allowLegacyFallback: booleanParam(params, "allowLegacyFallback", true),
  };
  const status = getUsgsWaterAdapterStatus();
  const keyStatus = getUsgsWaterApiKeyStatus();
  const validation = validateUsgsWaterRequest(input);
  if (!validation.valid) {
    return NextResponse.json({
      status: validation.status,
      message: validation.message,
      source: "USGS Water Data",
      sourceId: "usgs-water",
      sourceRole: "hydrological_monitoring_source",
      isIncidentSource: false,
      requiresApiKey: false,
      optionalApiKeyConfigured: keyStatus.apiKeyConfigured,
      apiFamily: null,
      legacyFallbackUsed: false,
      fetched: 0,
      normalized: 0,
      persisted: false,
      evidenceCreated: false,
      hydrologicalContext: null,
      riskFactors: null,
      warnings: [],
      errors: validation.errors,
    }, { status: 400 });
  }

  const result = await fetchAndBuildUsgsWaterContext(validation.params);
  if (!result.context) {
    return NextResponse.json({
      status: result.status,
      source: "USGS Water Data",
      sourceId: "usgs-water",
      sourceRole: "hydrological_monitoring_source",
      isIncidentSource: false,
      requiresApiKey: false,
      optionalApiKeyConfigured: keyStatus.apiKeyConfigured,
      apiFamily: result.apiFamily,
      legacyFallbackUsed: result.legacyFallbackUsed,
      fetched: result.fetched,
      normalized: result.normalized,
      persisted: false,
      evidenceCreated: false,
      hydrologicalContext: null,
      riskFactors: null,
      warnings: result.warnings,
      errors: result.errors,
    }, { status: result.status === "invalidRequest" ? 400 : 502 });
  }

  const evidence = buildUsgsWaterEvidence(result.context, validation.params);
  let persisted = false;
  let evidenceCreated = false;
  const warnings = [
    "USGS Water is hydrological context only; it is not a weather alert, forecast, evacuation order or route closure.",
    "ARGUS does not create KnowledgeIncident records from USGS Water readings.",
    ...result.warnings,
    ...status.limitations,
  ];
  const errors = [...result.errors];

  if (validation.params.persist) {
    const { user, response: authResponse } = await requireOperator();
    if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
    try {
      const saved = await saveWeatherContextEvidenceIfFreshMissing({
        incidentId: validation.params.incidentId,
        sourceId: "usgs-water",
        sourceName: "USGS Water Data",
        evidenceType: "hydrological_context",
        title: evidence.title,
        url: evidence.url,
        excerpt: evidence.summary,
        rawRef: result.context.id,
        confidenceScore: evidence.confidenceScore.finalConfidence,
        metadataJson: JSON.parse(JSON.stringify(result.context)),
      });
      persisted = saved.action === "inserted";
      evidenceCreated = saved.action === "inserted";
      if (saved.action === "skipped_fresh") warnings.push("Fresh USGS Water hydrological context already exists for this incident; skipped by TTL.");
      if (saved.action === "skipped_no_association") warnings.push("No persisted incident association found; preview returned without persistence.");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "KnowledgeEvidence persistence failed");
      warnings.push("Knowledge DB/migration unavailable or association invalid; preview returned without persistence.");
    }
  }

  return NextResponse.json({
    status: result.status,
    source: "USGS Water Data",
    sourceId: "usgs-water",
    sourceRole: "hydrological_monitoring_source",
    isIncidentSource: false,
    requiresApiKey: false,
    optionalApiKeyConfigured: keyStatus.apiKeyConfigured,
    apiFamily: result.apiFamily,
    legacyFallbackUsed: result.legacyFallbackUsed,
    fetched: result.fetched,
    normalized: result.normalized,
    persisted,
    evidenceCreated,
    hydrologicalContext: result.context,
    riskFactors: result.context.riskFactors,
    warnings: [...new Set(warnings)],
    errors,
  });
}
