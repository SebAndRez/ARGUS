import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import { buildGfmEvidence, buildGfmIncidentPayload, buildObservedFloodExtentContext, fetchGfmProducts, getGfmConfigStatus, normalizeGfmProduct, shouldCreateObservedFloodIncident, validateGfmRequest, type CopernicusGfmParams } from "@/lib/knowledge-intake/adapters/copernicusGfmAdapter";
import { saveContextEvidenceIfNew } from "@/lib/knowledge-intake/persistence/contextEvidence";
import { upsertKnowledgeIncidentByExternalId } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

/**
 * Read-only preview stays public; `?persist=true` writes `KnowledgeEvidence`
 * (and optionally `KnowledgeIncident`), so that branch requires the same
 * operator/admin session as the equivalent `jobs/*` POST endpoint.
 */
export async function GET(request: NextRequest) {
  // ARGUS Prompt 9/10 (SEC-1): esta lectura en vivo no tenia auth NI rate
  // limit por defecto (solo `?persist=true` pasaba por requireOperator).
  // No se exige sesion: consumidores anonimos legitimos (ej. /app, NASA
  // EONET) dependen de esta lectura publica. Solo se acota el abuso/costo.
  const rateLimitOutcome = await enforceRateLimit({ policy: "knowledge_intake_live_read", request });
  const rateLimited = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimited) return rateLimited;
  const p = request.nextUrl.searchParams;
  const input: CopernicusGfmParams = { aoiId: p.get("aoiId") ?? undefined, productId: p.get("productId") ?? undefined, lat: num(p, "lat"), lon: num(p, "lon"), bbox: p.get("bbox") ?? undefined, since: p.get("since") ?? undefined, until: p.get("until") ?? undefined, incidentId: p.get("incidentId") ?? undefined, routeAnalysisId: p.get("routeAnalysisId") ?? undefined, fenixSimulationId: p.get("fenixSimulationId") ?? undefined, persist: p.get("persist") === "true", createIncident: p.get("createIncident") === "true", includeGeometry: p.get("includeGeometry") === "true", includeRaster: p.get("includeRaster") === "true", includeAffectedPopulation: p.get("includeAffectedPopulation") === "true", includeAffectedLandcover: p.get("includeAffectedLandcover") === "true" };
  const validation = validateGfmRequest(input);
  if (!validation.valid) return NextResponse.json({ status: validation.status, message: validation.message, sourceId: "copernicus-gfm", errors: validation.errors }, { status: 400 });
  const config = getGfmConfigStatus();
  if (config.requiresConfiguration) return NextResponse.json(config, { status: 503 });
  const result = await fetchGfmProducts(validation.params);
  const normalized = result.products.map((product: unknown) => normalizeGfmProduct(product, validation.params));
  const context = buildObservedFloodExtentContext(validation.params, normalized);
  let evidenceCreated = false;
  let incidentCreated = false;
  let incidentUpdated = false;
  const errors = [...result.errors];
  const warnings = [...result.warnings];
  if (input.persist) {
    const { user, response: authResponse } = await requireOperator();
    if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
    try {
      const evidence = buildGfmEvidence(context, validation.params);
      const saved = await saveContextEvidenceIfNew({ sourceId: "copernicus-gfm", sourceName: "Copernicus GFM", evidenceType: "observed_flood_extent_context", title: evidence.title, url: evidence.url, excerpt: evidence.summary, rawRef: evidence.id, confidenceScore: evidence.confidenceScore.finalConfidence, metadataJson: context, incidentId: validation.params.incidentId });
      evidenceCreated = saved.action === "inserted";
      if (input.createIncident && shouldCreateObservedFloodIncident(context)) {
        const savedIncident = await upsertKnowledgeIncidentByExternalId(buildGfmIncidentPayload(context));
        incidentCreated = savedIncident.action === "inserted";
        incidentUpdated = savedIncident.action === "updated";
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "GFM persistence failed");
    }
  }
  return NextResponse.json({ status: result.status, source: "Copernicus GFM", sourceId: "copernicus-gfm", sourceRole: "satellite_flood_observation_source", isIncidentSource: true, isObservationSource: true, requiresApiKey: true, requiresConfiguration: false, productsFetched: result.products.length, normalized: normalized.length, persisted: evidenceCreated, evidenceCreated, incidentCreated, incidentUpdated, observedFloodExtentContext: context, warnings, errors });
}
function num(params: URLSearchParams, key: string) {
  const value = params.get(key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
