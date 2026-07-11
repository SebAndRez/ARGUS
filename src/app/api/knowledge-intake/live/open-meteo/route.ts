import { NextRequest, NextResponse } from "next/server";
import {
  buildOpenMeteoEvidence,
  buildOpenMeteoWeatherContext,
  fetchOpenMeteoForecast,
  getOpenMeteoAdapterStatus,
  validateOpenMeteoRequest,
  type OpenMeteoPurpose,
} from "@/lib/knowledge-intake/adapters/openMeteoAdapter";
import { saveWeatherContextEvidenceIfFreshMissing } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

function numberParam(params: URLSearchParams, key: string) {
  const value = params.get(key);
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const persist = params.get("persist") === "true";
  const input = {
    lat: numberParam(params, "lat"),
    lon: numberParam(params, "lon"),
    forecastDays: numberParam(params, "forecastDays") ?? 3,
    purpose: (params.get("purpose") ?? "general") as OpenMeteoPurpose,
    incidentId: params.get("incidentId") ?? undefined,
    sourceIncidentId: params.get("sourceIncidentId") ?? undefined,
    persist,
    timezone: params.get("timezone") ?? "auto",
  };
  const status = getOpenMeteoAdapterStatus();
  const validation = validateOpenMeteoRequest(input);

  if (!validation.valid) {
    return NextResponse.json({
      status: validation.status,
      message: validation.message,
      source: "Open-Meteo",
      sourceId: "open-meteo",
      requiresApiKey: false,
      requiresConfiguration: false,
      licenseStatus: "nonCommercialFree",
      commercialUse: "requiresReview",
      fetched: 0,
      normalized: 0,
      persisted: false,
      evidenceCreated: false,
      weatherContext: null,
      riskFactors: null,
      warnings: [],
      errors: validation.errors,
    }, { status: 400 });
  }

  try {
    const forecast = await fetchOpenMeteoForecast(validation.params);
    if (forecast.status === "empty") {
      return NextResponse.json({
        status: "empty",
        source: "Open-Meteo",
        sourceId: "open-meteo",
        requiresApiKey: false,
        requiresConfiguration: false,
        licenseStatus: "nonCommercialFree",
        commercialUse: "requiresReview",
        fetched: 0,
        normalized: 0,
        persisted: false,
        evidenceCreated: false,
        weatherContext: null,
        riskFactors: null,
        warnings: ["Open-Meteo returned an empty forecast payload."],
        errors: [],
      });
    }
    if (forecast.status !== "ready" || !forecast.response) {
      return NextResponse.json({
        status: "error",
        source: "Open-Meteo",
        sourceId: "open-meteo",
        requiresApiKey: false,
        requiresConfiguration: false,
        licenseStatus: "nonCommercialFree",
        commercialUse: "requiresReview",
        fetched: 0,
        normalized: 0,
        persisted: false,
        evidenceCreated: false,
        weatherContext: null,
        riskFactors: null,
        warnings: [],
        errors: forecast.errors ?? ["Open-Meteo fetch failed"],
      }, { status: 502 });
    }

    const weatherContext = buildOpenMeteoWeatherContext(forecast.response, validation.params);
    const evidence = buildOpenMeteoEvidence(weatherContext, validation.params);
    let persisted = false;
    let evidenceCreated = false;
    const warnings = [
      "Open-Meteo is weather context only; it is not an official alert source.",
      "ARGUS does not create KnowledgeIncident records from this forecast.",
      ...status.limitations,
    ];
    const errors: string[] = [];

    if (persist) {
      const { user, response: authResponse } = await requireOperator();
      if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
      try {
        const saved = await saveWeatherContextEvidenceIfFreshMissing({
          incidentId: validation.params.incidentId,
          sourceIncidentId: validation.params.sourceIncidentId,
          sourceId: "open-meteo",
          sourceName: "Open-Meteo",
          evidenceType: "weather_context",
          title: evidence.title,
          url: evidence.url,
          excerpt: evidence.summary,
          rawRef: weatherContext.id,
          confidenceScore: evidence.confidenceScore.finalConfidence,
          metadataJson: JSON.parse(JSON.stringify(weatherContext)),
        });
        persisted = saved.action === "inserted";
        evidenceCreated = saved.action === "inserted";
        if (saved.action === "skipped_fresh") warnings.push("Fresh Open-Meteo weather context already exists for this incident; skipped by TTL.");
        if (saved.action === "skipped_no_association") warnings.push("No persisted incident association found; preview returned without persistence.");
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "KnowledgeEvidence persistence failed");
        warnings.push("Knowledge DB/migration unavailable or association invalid; preview returned without persistence.");
      }
    }

    return NextResponse.json({
      status: "ready",
      source: "Open-Meteo",
      sourceId: "open-meteo",
      requiresApiKey: false,
      requiresConfiguration: false,
      licenseStatus: "nonCommercialFree",
      commercialUse: "requiresReview",
      institutionalUse: "requiresReview",
      fetched: forecast.fetched,
      normalized: 1,
      persisted,
      evidenceCreated,
      weatherContext,
      riskFactors: weatherContext.riskFactors,
      warnings,
      errors,
    });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      source: "Open-Meteo",
      sourceId: "open-meteo",
      requiresApiKey: false,
      requiresConfiguration: false,
      licenseStatus: "nonCommercialFree",
      commercialUse: "requiresReview",
      fetched: 0,
      normalized: 0,
      persisted: false,
      evidenceCreated: false,
      weatherContext: null,
      riskFactors: null,
      warnings: [],
      errors: [error instanceof Error ? error.message : "Open-Meteo weather context failed"],
    }, { status: 500 });
  }
}
