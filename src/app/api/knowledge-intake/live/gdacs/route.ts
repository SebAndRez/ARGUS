import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import { fetchGdacsEvents, type GdacsAlertLevel, type GdacsEventType } from "@/lib/knowledge-intake/adapters/gdacsAdapter";
import { runGdacsKnowledgeIngestion } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

function splitList(value: string | null) {
  return value
    ? value.split(/[;,]/).map((item) => item.trim()).filter(Boolean)
    : undefined;
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
  const limit = Number(params.get("limit") ?? "100");
  const page = Number(params.get("page") ?? "1");
  const daysBack = Number(params.get("daysBack") ?? "7");
  const persist = params.get("persist") === "true";
  const input = {
    eventTypes: splitList(params.get("eventTypes")) as GdacsEventType[] | undefined,
    fromDate: params.get("fromDate") ?? undefined,
    toDate: params.get("toDate") ?? undefined,
    daysBack: Number.isFinite(daysBack) ? daysBack : 7,
    alertLevels: splitList(params.get("alertLevels")) as GdacsAlertLevel[] | undefined,
    limit: Number.isFinite(limit) ? limit : 100,
    page: Number.isFinite(page) ? page : 1,
  };

  try {
    if (persist) {
      const { user, response: authResponse } = await requireOperator();
      if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
      const result = await runGdacsKnowledgeIngestion(input);
      return NextResponse.json({
        ...result,
        source: "GDACS",
        requiresApiKey: false,
        requiresConfiguration: false,
        incidents: result.sampleIncidents,
      });
    }

    const result = await fetchGdacsEvents(input);
    return NextResponse.json({
      status: result.status,
      source: result.sourceName,
      sourceId: result.sourceId,
      requiresApiKey: false,
      requiresConfiguration: false,
      fetched: result.fetched,
      normalized: result.count,
      persisted: false,
      inserted: 0,
      updated: 0,
      skipped: 0,
      incidents: result.incidents,
      warnings: result.warnings,
      errors: result.errors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        source: "GDACS",
        sourceId: "gdacs",
        requiresApiKey: false,
        requiresConfiguration: false,
        fetched: 0,
        normalized: 0,
        persisted: false,
        inserted: 0,
        updated: 0,
        skipped: 0,
        incidents: [],
        warnings: [],
        errors: [error instanceof Error ? error.message : "GDACS ingestion failed"],
      },
      { status: 502 }
    );
  }
}
