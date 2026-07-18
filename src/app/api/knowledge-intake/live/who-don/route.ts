import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import { buildWhoDonEvidencePayload, buildWhoDonIncidentPayload, fetchWhoDonItems, normalizeWhoDonItem, type WhoDonParams } from "@/lib/knowledge-intake/adapters/whoDonAdapter";
import { saveContextEvidenceIfNew } from "@/lib/knowledge-intake/persistence/contextEvidence";
import { upsertKnowledgeIncidentByExternalId } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
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
  const input: WhoDonParams = { top: num(p, "top") ?? 20, skip: num(p, "skip") ?? 0, since: p.get("since") ?? undefined, urlName: p.get("urlName") ?? undefined, donId: p.get("donId") ?? undefined, disease: p.get("disease") ?? undefined, country: p.get("country") ?? undefined, region: p.get("region") ?? undefined, persist: p.get("persist") === "true", createIncidents: p.get("createIncidents") === "true", updateExisting: p.get("updateExisting") !== "false", includeRaw: p.get("includeRaw") !== "false" };
  const result = await fetchWhoDonItems(input);
  const contexts = result.items.map(normalizeWhoDonItem);
  let incidentsCreated = 0;
  let incidentsUpdated = 0;
  let evidenceCreated = 0;
  const warnings = [...result.warnings, "WHO DON is official public health context, not diagnosis, local surveillance completeness or automatic citizen alert."];
  const errors = [...result.errors];
  if (input.persist) {
    const { user, response: authResponse } = await requireOperator();
    if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
    for (const context of contexts) {
      try {
        let incidentId: string | undefined;
        if (input.createIncidents) {
          const saved = await upsertKnowledgeIncidentByExternalId(buildWhoDonIncidentPayload(context));
          incidentId = saved.incident.id;
          if (saved.action === "inserted") incidentsCreated += 1;
          if (saved.action === "updated") incidentsUpdated += 1;
        }
        const evidence = buildWhoDonEvidencePayload(context);
        const savedEvidence = await saveContextEvidenceIfNew({ sourceId: "who-don", sourceName: "WHO Disease Outbreak News", evidenceType: "public_health_outbreak_report", title: evidence.title, url: evidence.url, excerpt: evidence.summary, rawRef: evidence.id, confidenceScore: evidence.confidenceScore.finalConfidence, metadataJson: context, incidentId });
        if (savedEvidence.action === "inserted") evidenceCreated += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "WHO DON persistence failed");
      }
    }
  }
  return NextResponse.json({ status: contexts.length ? "ready" : result.status, source: "WHO Disease Outbreak News", sourceId: "who-don", sourceRole: "official_public_health_outbreak_source", isIncidentSource: true, requiresApiKey: false, fetched: result.fetched, normalized: contexts.length, incidentsCreated, incidentsUpdated, evidenceCreated, requiresReview: contexts.filter((item: { confidence: number }) => item.confidence < 80).length, publicHealthOutbreakContexts: contexts, warnings, errors });
}

function num(params: URLSearchParams, key: string) {
  const value = params.get(key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
