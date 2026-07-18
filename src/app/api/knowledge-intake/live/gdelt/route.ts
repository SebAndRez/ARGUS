import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import { buildGdeltCrisisNarrativeContext, buildGdeltCrossSourceCorroborationContext, buildGdeltEvidence, buildGdeltNewsCoverageSnapshot, fetchGdeltDoc, validateGdeltRequest, type GdeltParams } from "@/lib/knowledge-intake/adapters/gdeltAdapter";
import { saveContextEvidenceIfNew } from "@/lib/knowledge-intake/persistence/contextEvidence";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // ARGUS Prompt 9/10 (SEC-1): esta lectura en vivo no tenia auth NI rate
  // limit por defecto (solo `?persist=true` pasaba por requireOperator).
  // No se exige sesion: consumidores anonimos legitimos (ej. /app, NASA
  // EONET) dependen de esta lectura publica. Solo se acota el abuso/costo.
  const rateLimitOutcome = await enforceRateLimit({ policy: "knowledge_intake_live_read", request });
  const rateLimited = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimited) return rateLimited;
  const p = request.nextUrl.searchParams;
  const input: GdeltParams = { templateId: p.get("templateId") ?? undefined, query: p.get("query") ?? undefined, queryMode: (p.get("queryMode") as "analyst") ?? undefined, hazardType: p.get("hazardType") ?? undefined, purpose: p.get("purpose") ?? "command_center_osint", locationHint: p.get("locationHint") ?? undefined, country: p.get("country") ?? undefined, region: p.get("region") ?? undefined, language: p.get("language") ?? undefined, sourceCountry: p.get("sourceCountry") ?? undefined, domain: p.get("domain") ?? undefined, timespan: p.get("timespan") ?? "24h", startDateTime: p.get("startDateTime") ?? undefined, endDateTime: p.get("endDateTime") ?? undefined, maxRecords: num(p, "maxRecords") ?? 75, modes: p.get("modes") ?? undefined, persist: p.get("persist") === "true", incidentId: p.get("incidentId") ?? undefined, createCandidate: p.get("createCandidate") === "true", includeRaw: p.get("includeRaw") === "true" };
  const validation = validateGdeltRequest(input);
  if (!validation.valid) return NextResponse.json({ status: validation.status, message: validation.message, sourceId: "gdelt", errors: validation.errors }, { status: 400 });
  const result = await fetchGdeltDoc(validation.params);
  const context = result.context;
  if (!context) return NextResponse.json({ status: result.status, sourceId: "gdelt", errors: result.errors, warnings: result.warnings }, { status: 502 });
  const snapshot = buildGdeltNewsCoverageSnapshot(validation.params, context);
  const narrative = buildGdeltCrisisNarrativeContext(validation.params, context);
  const corroboration = buildGdeltCrossSourceCorroborationContext(validation.params, context);
  let evidenceCreated = false;
  const errors = [...result.errors];
  const warnings = [...result.warnings];
  if (input.persist) {
    const { user, response: authResponse } = await requireOperator();
    if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
    try {
      const evidence = buildGdeltEvidence(context, validation.params);
      const saved = await saveContextEvidenceIfNew({ sourceId: "gdelt", sourceName: "GDELT", evidenceType: "media_signal_context", title: evidence.title, url: evidence.url, excerpt: evidence.summary, rawRef: evidence.id, confidenceScore: evidence.confidenceScore.finalConfidence, metadataJson: { context, snapshot, narrative, corroboration }, incidentId: validation.params.incidentId });
      evidenceCreated = saved.action === "inserted";
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "GDELT persistence failed");
      warnings.push("KnowledgeEvidence persistence failed; preview returned.");
    }
  }
  return NextResponse.json({ status: result.status, source: "GDELT", sourceId: "gdelt", sourceRole: "global_osint_media_signal_source", isOfficialSource: false, isIncidentSource: false, isMediaSignalSource: true, requiresApiKey: false, templateId: validation.params.templateId, query: context.query, modesFetched: validation.params.modes, articlesFetched: context.articles.length, uniqueDomains: snapshot.uniqueDomains, uniqueSourceCountries: snapshot.uniqueSourceCountries, uniqueLanguages: snapshot.uniqueLanguages, coverageSpike: context.coverageSpike, confidence: context.confidence, requiresReview: true, persisted: evidenceCreated, evidenceCreated, candidateCreated: false, mediaSignalContext: context, newsCoverageSnapshot: snapshot, crisisNarrativeContext: narrative, crossSourceCorroborationContext: corroboration, warnings, errors });
}
function num(params: URLSearchParams, key: string) {
  const value = params.get(key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
