import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import {
  fetchNwsActiveAlerts,
  fetchNwsForecastByPoint,
  fetchNwsHourlyForecastByPoint,
  fetchNwsPointMetadata,
  type NwsFetchParams,
} from "@/lib/knowledge-intake/adapters/nwsAdapter";
import { runNwsKnowledgeIngestion } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

function parsePoint(value: string | null) {
  if (!value) return null;
  const [latRaw, lonRaw] = value.split(",");
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function paramsFromSearch(searchParams: URLSearchParams): NwsFetchParams {
  const limit = Number(searchParams.get("limit") ?? "100");
  return {
    area: searchParams.get("area") ?? undefined,
    point: searchParams.get("point") ?? undefined,
    zone: searchParams.get("zone") ?? undefined,
    status: searchParams.get("status") ?? "actual",
    messageType: searchParams.get("messageType") ?? searchParams.get("message_type") ?? undefined,
    event: searchParams.get("event") ?? undefined,
    severity: searchParams.get("severity") ?? undefined,
    urgency: searchParams.get("urgency") ?? undefined,
    certainty: searchParams.get("certainty") ?? undefined,
    limit: Number.isFinite(limit) ? limit : 100,
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
  const params = request.nextUrl.searchParams;
  const mode = params.get("mode") ?? "alerts";
  const persist = params.get("persist") === "true";
  const input = paramsFromSearch(params);

  try {
    if (persist && mode === "alerts") {
      const { user, response: authResponse } = await requireOperator();
      if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
      const result = await runNwsKnowledgeIngestion({ ...input, mode: "alerts", persist: true });
      return NextResponse.json({
        ...result,
        source: "NWS / api.weather.gov",
        sourceId: "nws",
        requiresApiKey: false,
        requiresConfiguration: false,
        userAgentConfigured: !result.warnings?.some((warning) => warning.includes("NWS_USER_AGENT")),
        persisted: true,
        // Full normalized lists (not the 5-row `sampleIncidents`/`sampleEvidence`
        // kept for the job-dashboard summary) — the operational map renders
        // every alert it fetched, same as the non-persist path below.
        incidents: result.incidents,
        evidence: result.evidence,
      });
    }

    if (mode === "point" || mode === "forecast" || mode === "hourly") {
      const point = parsePoint(params.get("point"));
      if (!point) {
        return NextResponse.json(
          {
            status: "error",
            source: "NWS / api.weather.gov",
            sourceId: "nws",
            requiresApiKey: false,
            requiresConfiguration: false,
            persisted: false,
            warnings: [],
            errors: ["point=lat,lon is required for point, forecast and hourly modes."],
          },
          { status: 400 }
        );
      }
      const context =
        mode === "point"
          ? await fetchNwsPointMetadata(point.lat, point.lon)
          : mode === "forecast"
            ? await fetchNwsForecastByPoint(point.lat, point.lon)
            : await fetchNwsHourlyForecastByPoint(point.lat, point.lon);
      return NextResponse.json({
        status: "ready",
        source: "NWS / api.weather.gov",
        sourceId: "nws",
        mode,
        requiresApiKey: false,
        requiresConfiguration: false,
        persisted: false,
        fetched: 1,
        normalized: 0,
        incidents: [],
        evidence: [],
        context,
        warnings: ["Forecast and point metadata are context only; ARGUS does not persist hourly forecast periods as incidents."],
        errors: [],
      });
    }

    const result = await fetchNwsActiveAlerts(input);
    return NextResponse.json({
      status: result.status,
      source: result.sourceName,
      sourceId: result.sourceId,
      requiresApiKey: false,
      requiresConfiguration: false,
      userAgentConfigured: result.userAgentConfigured,
      fetched: result.fetched,
      normalized: result.count,
      persisted: false,
      inserted: 0,
      updated: 0,
      skipped: 0,
      incidents: result.incidents,
      evidence: result.evidence,
      warnings: result.warnings,
      errors: result.errors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        source: "NWS / api.weather.gov",
        sourceId: "nws",
        requiresApiKey: false,
        requiresConfiguration: false,
        userAgentConfigured: Boolean(process.env.NWS_USER_AGENT?.trim()),
        fetched: 0,
        normalized: 0,
        persisted: false,
        inserted: 0,
        updated: 0,
        skipped: 0,
        incidents: [],
        evidence: [],
        warnings: [],
        errors: [error instanceof Error ? error.message : "NWS ingestion failed"],
      },
      { status: 502 }
    );
  }
}
