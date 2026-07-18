import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import { fetchAndNormalizeSmithsonianGvp, type GvpFetchParams } from "@/lib/knowledge-intake/adapters/smithsonianGvpAdapter";
import { runSmithsonianGvpCatalogImport } from "@/lib/knowledge-intake/persistence/smithsonianGvpIngestionJobs";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

function boolParam(value: string | null, fallback: boolean) {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function numParam(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  const persist = params.get("persist") === "true";
  const input: GvpFetchParams = {
    layer: (params.get("layer") as GvpFetchParams["layer"]) ?? undefined,
    volcanoNumber: params.get("volcanoNumber") ?? undefined,
    vnum: params.get("vnum") ?? undefined,
    volcanoName: params.get("volcanoName") ?? undefined,
    country: params.get("country") ?? undefined,
    region: params.get("region") ?? undefined,
    bbox: params.get("bbox") ?? undefined,
    lat: numParam(params.get("lat")),
    lon: numParam(params.get("lon")),
    radiusKm: numParam(params.get("radiusKm")),
    minVei: numParam(params.get("minVei")),
    eruptionStartYear: numParam(params.get("eruptionStartYear")),
    eruptionEndYear: numParam(params.get("eruptionEndYear")),
    includeHolocene: boolParam(params.get("includeHolocene"), true),
    includePleistocene: boolParam(params.get("includePleistocene"), false),
    includeEruptions: boolParam(params.get("includeEruptions"), true),
    includeActivityReports: boolParam(params.get("includeActivityReports"), false),
    reportType: (params.get("reportType") as GvpFetchParams["reportType"]) ?? undefined,
    reportDate: params.get("reportDate") ?? undefined,
    persist,
    createIncidents: boolParam(params.get("createIncidents"), false),
    updateExisting: boolParam(params.get("updateExisting"), true),
    limit: numParam(params.get("limit")) ?? 500,
    includeRaw: boolParam(params.get("includeRaw"), false),
  };

  try {
    if (persist && input.layer !== "activity_reports" && !input.includeActivityReports) {
      const { user, response: authResponse } = await requireOperator();
      if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
      const result = await runSmithsonianGvpCatalogImport(input);
      return NextResponse.json({
        ...result,
        source: "Smithsonian GVP",
        sourceId: "smithsonian-gvp",
        sourceRole: "global_volcanism_knowledge_source",
        isIncidentSource: "reports_only_with_guardrails",
        isKnowledgeSource: true,
        requiresApiKey: false,
        persisted: true,
      });
    }
    const result = await fetchAndNormalizeSmithsonianGvp(input);
    return NextResponse.json({
      ...result,
      source: result.sourceName,
      persisted: false,
      evidenceCreated: 0,
      incidentsCreated: 0,
      incidentsUpdated: 0,
      requiresReview: input.createIncidents === true && input.includeActivityReports === true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        source: "Smithsonian GVP",
        sourceId: "smithsonian-gvp",
        requiresApiKey: false,
        volcanoesFetched: 0,
        eruptionsFetched: 0,
        reportsFetched: 0,
        normalized: 0,
        persisted: persist,
        evidenceCreated: 0,
        incidentsCreated: 0,
        incidentsUpdated: 0,
        warnings: [],
        errors: [error instanceof Error ? error.message : "Smithsonian GVP request failed"],
      },
      { status: persist ? 500 : 502 }
    );
  }
}
