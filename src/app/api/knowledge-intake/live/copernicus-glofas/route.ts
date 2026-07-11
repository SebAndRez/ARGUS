import { NextRequest, NextResponse } from "next/server";
import { buildFloodForecastContext, buildGlofasEvidence, fetchGlofasForecastSubset, getGlofasConfigStatus, validateGlofasRequest, type CopernicusGlofasParams } from "@/lib/knowledge-intake/adapters/copernicusGlofasAdapter";
import { saveContextEvidenceIfNew } from "@/lib/knowledge-intake/persistence/contextEvidence";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const input: CopernicusGlofasParams = { lat: num(p, "lat"), lon: num(p, "lon"), bbox: p.get("bbox") ?? undefined, aoiId: p.get("aoiId") ?? undefined, date: p.get("date") ?? undefined, leadTimeDays: num(p, "leadTimeDays") ?? 7, variable: p.get("variable") ?? undefined, format: p.get("format") ?? undefined, incidentId: p.get("incidentId") ?? undefined, routeAnalysisId: p.get("routeAnalysisId") ?? undefined, fenixSimulationId: p.get("fenixSimulationId") ?? undefined, persist: p.get("persist") === "true" };
  const validation = validateGlofasRequest(input);
  if (!validation.valid) return NextResponse.json({ status: validation.status, message: validation.message, sourceId: "copernicus-glofas", errors: validation.errors }, { status: 400 });
  const config = getGlofasConfigStatus();
  if (config.requiresConfiguration) return NextResponse.json(config, { status: 503 });
  const result = await fetchGlofasForecastSubset(validation.params);
  const context = buildFloodForecastContext(validation.params, result);
  let evidenceCreated = false;
  const errors: string[] = [...result.errors];
  const warnings = [...result.warnings];
  if (input.persist) {
    const { user, response: authResponse } = await requireOperator();
    if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
    try {
      const evidence = buildGlofasEvidence(context, validation.params);
      const saved = await saveContextEvidenceIfNew({ sourceId: "copernicus-glofas", sourceName: "Copernicus GloFAS", evidenceType: "flood_forecast_context", title: evidence.title, url: evidence.url, excerpt: evidence.summary, rawRef: evidence.id, confidenceScore: evidence.confidenceScore.finalConfidence, metadataJson: context, incidentId: validation.params.incidentId });
      evidenceCreated = saved.action === "inserted";
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "GloFAS persistence failed");
    }
  }
  return NextResponse.json({ status: result.status, source: "Copernicus GloFAS", sourceId: "copernicus-glofas", sourceRole: "global_flood_forecast_source", isIncidentSource: false, isForecastSource: true, requiresApiKey: true, requiresConfiguration: false, forecastFetched: result.status !== "requiresConfiguration", normalized: 1, persisted: evidenceCreated, evidenceCreated, floodForecastContext: context, warnings, errors });
}
function num(params: URLSearchParams, key: string) {
  const value = params.get(key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
