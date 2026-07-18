import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import {
  buildOsmEvidence,
  fetchAndBuildOsmCriticalInfrastructureContext,
  getOsmOverpassAdapterStatus,
  validateOsmOverpassRequest,
  type OsmOverpassRequestParams,
} from "@/lib/knowledge-intake/adapters/osmOverpassAdapter";
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
  const input: OsmOverpassRequestParams = {
    lat: numberParam(params, "lat"),
    lon: numberParam(params, "lon"),
    bbox: params.get("bbox") ?? undefined,
    radiusKm: numberParam(params, "radiusKm") ?? 5,
    purpose: params.get("purpose") ?? "general",
    categories: (params.get("categories") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    limit: numberParam(params, "limit") ?? 100,
    timeoutSeconds: numberParam(params, "timeoutSeconds") ?? 15,
    persist: booleanParam(params, "persist", false),
    incidentId: params.get("incidentId") ?? undefined,
    routeAnalysisId: params.get("routeAnalysisId") ?? undefined,
    fenixSimulationId: params.get("fenixSimulationId") ?? undefined,
    includeGeometry: booleanParam(params, "includeGeometry", true),
    geometryMode: params.get("geometryMode") as OsmOverpassRequestParams["geometryMode"] ?? "centroid_and_simple_geometry",
    includeTags: booleanParam(params, "includeTags", true),
    maxElements: numberParam(params, "maxElements"),
    cacheTtlMinutes: numberParam(params, "cacheTtlMinutes") ?? 360,
  };
  if (!input.categories?.length) delete input.categories;

  const adapterStatus = getOsmOverpassAdapterStatus();
  const validation = validateOsmOverpassRequest(input);
  if (!validation.valid) {
    return NextResponse.json({
      status: validation.status,
      message: validation.message,
      source: "OpenStreetMap / Overpass",
      sourceId: "osm-overpass",
      sourceRole: "critical_infrastructure_geospatial_source",
      isIncidentSource: false,
      requiresApiKey: false,
      purpose: input.purpose ?? "general",
      categories: input.categories ?? [],
      queryArea: null,
      poisFound: 0,
      countsByCategory: {},
      nearestByCategory: {},
      persisted: false,
      evidenceCreated: false,
      criticalInfrastructureContext: null,
      warnings: adapterStatus.limitations,
      errors: validation.errors,
      attribution: adapterStatus.attribution,
      license: adapterStatus.licenseStatus,
    }, { status: 400 });
  }

  const result = await fetchAndBuildOsmCriticalInfrastructureContext(validation.params);
  let persisted = false;
  let evidenceCreated = false;
  const errors = [...result.errors];
  const warnings = [
    "OpenStreetMap / Overpass is contextual geospatial infrastructure only, not an incident source.",
    "ARGUS does not create KnowledgeIncident records from OSM POIs.",
    ...result.warnings,
  ];

  if (validation.params.persist && result.context) {
    const { user, response: authResponse } = await requireOperator();
    if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
    const evidence = buildOsmEvidence(result.context, validation.params);
    try {
      const saved = await saveWeatherContextEvidenceIfFreshMissing({
        incidentId: validation.params.incidentId,
        sourceId: "osm-overpass",
        sourceName: "OpenStreetMap / Overpass",
        evidenceType: "critical_infrastructure_context",
        title: evidence.title,
        url: evidence.url,
        excerpt: evidence.summary,
        rawRef: result.context.id,
        confidenceScore: evidence.confidenceScore.finalConfidence,
        metadataJson: JSON.parse(JSON.stringify(result.context)),
      }, validation.params.cacheTtlMinutes);
      persisted = saved.action === "inserted";
      evidenceCreated = saved.action === "inserted";
      if (saved.action === "skipped_fresh") warnings.push("Fresh OSM critical infrastructure context already exists; skipped by TTL.");
      if (saved.action === "skipped_no_association") warnings.push("No persisted incident association found; preview returned without persistence.");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "KnowledgeEvidence persistence failed");
      warnings.push("Knowledge DB/migration unavailable or association invalid; preview returned without persistence.");
    }
  }

  return NextResponse.json({
    status: result.status,
    source: "OpenStreetMap / Overpass",
    sourceId: "osm-overpass",
    sourceRole: "critical_infrastructure_geospatial_source",
    isIncidentSource: false,
    requiresApiKey: false,
    purpose: validation.params.purpose,
    categories: validation.params.categories,
    queryArea: validation.params.bbox ? { bbox: validation.params.bbox } : { lat: validation.params.lat, lon: validation.params.lon, radiusKm: validation.params.radiusKm },
    poisFound: result.context?.pois.length ?? 0,
    countsByCategory: result.context?.countsByCategory ?? {},
    nearestByCategory: result.context?.nearestByCategory ?? {},
    persisted,
    evidenceCreated,
    criticalInfrastructureContext: result.context,
    warnings: [...new Set(warnings)],
    errors,
    retryAfter: result.retryAfter,
    attribution: adapterStatus.attribution,
    license: adapterStatus.licenseStatus,
  }, { status: result.status === "error" || result.status === "timeout" || result.status === "rateLimited" ? 502 : 200 });
}
