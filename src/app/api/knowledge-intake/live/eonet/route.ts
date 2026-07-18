import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import { fetchEonetEvents, type EonetStatus } from "@/lib/knowledge-intake/adapters/eonetAdapter";
import { runEonetKnowledgeIngestion } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";
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
  const days = Number(params.get("days") ?? "30");
  const limit = Number(params.get("limit") ?? "100");
  const persist = params.get("persist") === "true";
  const input = {
    status: (params.get("status") ?? "open") as EonetStatus,
    days: Number.isFinite(days) ? days : 30,
    start: params.get("start") ?? undefined,
    end: params.get("end") ?? undefined,
    limit: Number.isFinite(limit) ? limit : 100,
    category: splitList(params.get("category")),
    bbox: params.get("bbox") ?? undefined,
    source: splitList(params.get("source")),
  };

  try {
    if (persist) {
      const { user, response: authResponse } = await requireOperator();
      if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
      const result = await runEonetKnowledgeIngestion(input);
      return NextResponse.json({
        ...result,
        source: "NASA EONET",
        sourceId: "nasa-eonet",
        requiresApiKey: false,
        requiresConfiguration: false,
        persisted: true,
        incidents: result.sampleIncidents,
      });
    }

    const result = await fetchEonetEvents(input);
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
        source: "NASA EONET",
        sourceId: "nasa-eonet",
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
        errors: [error instanceof Error ? error.message : "NASA EONET ingestion failed"],
      },
      { status: 502 }
    );
  }
}
