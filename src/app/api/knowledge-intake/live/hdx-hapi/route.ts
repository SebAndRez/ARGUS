import { NextRequest, NextResponse } from "next/server";
import { buildHapiEvidence, buildHapiHumanitarianContextSnapshot, getHapiIdentifierStatus, validateHapiRequest, type HapiRequestParams } from "@/lib/knowledge-intake/adapters/hdxHapiAdapter";
import { saveContextEvidenceIfNew } from "@/lib/knowledge-intake/persistence/contextEvidence";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const input: HapiRequestParams = {
    locationCode: params.get("locationCode") ?? undefined,
    locationName: params.get("locationName") ?? undefined,
    admin1Code: params.get("admin1Code") ?? undefined,
    admin2Code: params.get("admin2Code") ?? undefined,
    pCode: params.get("pCode") ?? undefined,
    adminLevel: numberParam(params, "adminLevel"),
    sector: params.get("sector") ?? undefined,
    populationGroup: params.get("populationGroup") ?? undefined,
    referencePeriod: params.get("referencePeriod") ?? undefined,
    fromDate: params.get("fromDate") ?? undefined,
    toDate: params.get("toDate") ?? undefined,
    indicators: params.get("indicators") ?? undefined,
    purpose: params.get("purpose") ?? "general",
    incidentId: params.get("incidentId") ?? undefined,
    routeAnalysisId: params.get("routeAnalysisId") ?? undefined,
    fenixSimulationId: params.get("fenixSimulationId") ?? undefined,
    persist: params.get("persist") === "true",
    limit: numberParam(params, "limit") ?? 1000,
    offset: numberParam(params, "offset") ?? 0,
    includeMetadata: boolParam(params, "includeMetadata", true),
    includeLocations: boolParam(params, "includeLocations", true),
    includeFunding: boolParam(params, "includeFunding", false),
    includeRainfall: boolParam(params, "includeRainfall", false),
    includeNationalRisk: boolParam(params, "includeNationalRisk", false),
  };
  const validation = validateHapiRequest(input);
  if (!validation.valid) return NextResponse.json({ status: validation.status, message: validation.message, sourceId: "hdx-hapi", errors: validation.errors }, { status: 400 });
  const identifier = getHapiIdentifierStatus();
  if (identifier.requiresConfiguration) return NextResponse.json({ ...identifier, sourceRole: "humanitarian_context_indicator_source", isIncidentSource: false }, { status: 503 });
  const result = await buildHapiHumanitarianContextSnapshot(validation.params);
  let persisted = false;
  let evidenceCreated = false;
  const warnings = [...result.warnings];
  const errors = [...result.errors];
  if (input.persist && result.humanitarianContextSnapshot) {
    try {
      const evidence = buildHapiEvidence(result.humanitarianContextSnapshot, validation.params);
      const saved = await saveContextEvidenceIfNew({ sourceId: "hdx-hapi", sourceName: "HDX / OCHA HAPI", evidenceType: "humanitarian_context", title: evidence.title, url: evidence.url, excerpt: evidence.summary, rawRef: evidence.id, confidenceScore: evidence.confidenceScore.finalConfidence, metadataJson: result.humanitarianContextSnapshot, incidentId: validation.params.incidentId });
      persisted = saved.action === "inserted";
      evidenceCreated = persisted;
    } catch (error) {
      warnings.push("KnowledgeEvidence persistence failed; preview returned without persistence.");
      errors.push(error instanceof Error ? error.message : "HAPI persistence failed");
    }
  }
  return NextResponse.json({ status: result.status, source: "HDX / OCHA HAPI", sourceId: "hdx-hapi", sourceRole: "humanitarian_context_indicator_source", isIncidentSource: false, requiresApiKey: true, requiresConfiguration: false, indicatorsRequested: validation.params.indicators, indicatorsFetched: result.indicatorsFetched, indicatorsMissing: result.indicatorsMissing, normalized: result.humanitarianContextSnapshot ? 1 : 0, persisted, evidenceCreated, humanitarianContextSnapshot: result.humanitarianContextSnapshot, qualityWarnings: result.warnings, warnings, errors }, { status: result.status === "empty" ? 200 : 200 });
}

function numberParam(params: URLSearchParams, key: string) {
  const value = params.get(key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
function boolParam(params: URLSearchParams, key: string, fallback: boolean) {
  const value = params.get(key);
  return value === null ? fallback : value === "true";
}
