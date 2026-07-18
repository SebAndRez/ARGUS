import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import {
  fetchAndNormalizeNoaaStormEvents,
  type NoaaStormEventsFetchParams,
} from "@/lib/knowledge-intake/adapters/noaaStormEventsAdapter";
import { runNoaaStormEventsImport } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

function listParam(value: string | null) {
  return value?.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function paramsFromSearch(searchParams: URLSearchParams): NoaaStormEventsFetchParams {
  const year = Number(searchParams.get("year"));
  return {
    year: Number.isFinite(year) ? year : undefined,
    state: searchParams.get("state") ?? undefined,
    eventTypes: listParam(searchParams.get("eventTypes") ?? searchParams.get("event_types")),
    limit: Number(searchParams.get("limit") ?? "100"),
    offset: Number(searchParams.get("offset") ?? "0"),
    persist: searchParams.get("persist") === "true",
    mode: "preview",
    minDeaths: Number(searchParams.get("minDeaths") ?? "0"),
    minInjuries: Number(searchParams.get("minInjuries") ?? "0"),
    hasCoordinates: searchParams.get("hasCoordinates") === "true" ? true : undefined,
  };
}

export async function GET(request: NextRequest) {
  // ARGUS Prompt 9/10 (SEC-1): esta lectura en vivo no tenia auth NI rate
  // limit por defecto (solo `?persist=true` pasaba por requireOperator).
  // No se exige sesion: consumidores anonimos legitimos (ej. /app, NASA
  // EONET) dependen de esta lectura publica. Solo se acota el abuso/costo.
  const rateLimitOutcome = await enforceRateLimit({ policy: "knowledge_intake_live_read", request });
  const rateLimited = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimited) return rateLimited;
  const params = paramsFromSearch(request.nextUrl.searchParams);
  if (!params.year) {
    return NextResponse.json(
      {
        status: "invalidRequest",
        source: "NOAA Storm Events",
        sourceId: "noaa-storm-events",
        sourceRole: "historical_training_dataset",
        isLiveSource: false,
        requiresApiKey: false,
        requiresConfiguration: false,
        fetched: 0,
        parsed: 0,
        normalized: 0,
        persisted: 0,
        incidents: [],
        warnings: ["NOAA Storm Events preview requires year and never runs as live/global bulk ingestion."],
        errors: ["year is required"],
      },
      { status: 400 }
    );
  }

  try {
    if (params.persist) {
      const { user, response: authResponse } = await requireOperator();
      if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
      const result = await runNoaaStormEventsImport({ ...params, persist: true, mode: "import" });
      return NextResponse.json({
        ...result,
        source: "NOAA Storm Events",
        sourceId: "noaa-storm-events",
        sourceRole: "historical_training_dataset",
        isLiveSource: false,
        requiresApiKey: false,
        requiresConfiguration: false,
        persisted: result.inserted + result.updated,
        incidents: result.sampleIncidents,
      });
    }

    const result = await fetchAndNormalizeNoaaStormEvents({ ...params, persist: false, mode: "preview" });
    return NextResponse.json({
      status: result.status,
      source: result.sourceName,
      sourceId: result.sourceId,
      sourceRole: result.sourceRole,
      isLiveSource: result.isLiveSource,
      requiresApiKey: result.requiresApiKey,
      requiresConfiguration: result.requiresConfiguration,
      fetched: result.fetched,
      parsed: result.parsed,
      filtered: result.filtered,
      normalized: result.normalized,
      persisted: 0,
      incidents: result.incidents,
      evidence: result.evidence,
      warnings: result.warnings,
      errors: result.errors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        source: "NOAA Storm Events",
        sourceId: "noaa-storm-events",
        sourceRole: "historical_training_dataset",
        isLiveSource: false,
        requiresApiKey: false,
        requiresConfiguration: false,
        fetched: 0,
        parsed: 0,
        normalized: 0,
        persisted: 0,
        incidents: [],
        warnings: ["NOAA Storm Events is historical only; verify year and official NCEI CSV availability."],
        errors: [error instanceof Error ? error.message : "NOAA Storm Events preview failed"],
      },
      { status: 502 }
    );
  }
}
