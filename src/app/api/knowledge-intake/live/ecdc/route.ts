import { NextRequest, NextResponse } from "next/server";
import { buildEcdcEvidencePayload, buildEcdcIncidentPayload, fetchEcdcFeeds, type EcdcParams } from "@/lib/knowledge-intake/adapters/ecdcAdapter";
import { saveContextEvidenceIfNew } from "@/lib/knowledge-intake/persistence/contextEvidence";
import { upsertKnowledgeIncidentByExternalId } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const input: EcdcParams = { feeds: p.get("feeds") ?? undefined, feedTypes: p.get("feedTypes") ?? undefined, top: num(p, "top") ?? 20, since: p.get("since") ?? undefined, disease: p.get("disease") ?? undefined, country: p.get("country") ?? undefined, region: p.get("region") ?? undefined, persist: p.get("persist") === "true", createIncidents: p.get("createIncidents") === "true", updateExisting: p.get("updateExisting") !== "false", includePageMetadata: p.get("includePageMetadata") !== "false", includePdfUrl: p.get("includePdfUrl") !== "false", includeRaw: p.get("includeRaw") !== "false" };
  const result = await fetchEcdcFeeds(input);
  let incidentsCreated = 0;
  let incidentsUpdated = 0;
  let evidenceCreated = 0;
  const errors = [...result.errors];
  const warnings = [...result.warnings, "ECDC CDTR is evidence/report by default and does not create direct incidents unless item extraction is clear."];
  if (input.persist) {
    const { user, response: authResponse } = await requireOperator();
    if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
    for (const context of result.items) {
      try {
        let incidentId: string | undefined;
        if (input.createIncidents && !context.requiresReview && context.feedType !== "cdtr") {
          const saved = await upsertKnowledgeIncidentByExternalId(buildEcdcIncidentPayload(context));
          incidentId = saved.incident.id;
          if (saved.action === "inserted") incidentsCreated += 1;
          if (saved.action === "updated") incidentsUpdated += 1;
        }
        const evidence = buildEcdcEvidencePayload(context);
        const savedEvidence = await saveContextEvidenceIfNew({ sourceId: "ecdc", sourceName: "ECDC", evidenceType: context.evidenceType, title: evidence.title, url: evidence.url, excerpt: evidence.summary, rawRef: evidence.id, confidenceScore: evidence.confidenceScore.finalConfidence, metadataJson: context, incidentId });
        if (savedEvidence.action === "inserted") evidenceCreated += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "ECDC persistence failed");
      }
    }
  }
  return NextResponse.json({ status: result.status, source: "ECDC RSS/data", sourceId: "ecdc", sourceRole: "european_public_health_threats_source", isIncidentSource: true, isContextSource: true, requiresApiKey: false, feedsFetched: result.feedsFetched, itemsFetched: result.itemsFetched, normalized: result.items.length, incidentsCreated, incidentsUpdated, evidenceCreated, matchedWhoDonIncidents: 0, requiresReview: result.items.filter((item) => item.requiresReview).length, ecdcPublicHealthThreatContexts: result.items, warnings, errors });
}
function num(params: URLSearchParams, key: string) {
  const value = params.get(key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
