import { NextResponse } from "next/server";
import { buildWhoDonEvidencePayload, buildWhoDonIncidentPayload, fetchWhoDonItems, normalizeWhoDonItem, type WhoDonParams } from "@/lib/knowledge-intake/adapters/whoDonAdapter";
import { saveContextEvidenceIfNew } from "@/lib/knowledge-intake/persistence/contextEvidence";
import { upsertKnowledgeIncidentByExternalId } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as WhoDonParams & { sinceDays?: number };
  const since = body.since ?? (body.sinceDays ? new Date(Date.now() - body.sinceDays * 86_400_000).toISOString() : undefined);
  const result = await fetchWhoDonItems({ ...body, top: body.top ?? 50, since });
  const contexts = result.items.map(normalizeWhoDonItem);
  let incidentsCreated = 0;
  let incidentsUpdated = 0;
  let evidenceCreated = 0;
  let skippedDuplicates = 0;
  const errors = [...result.errors];
  for (const context of contexts) {
    try {
      let incidentId: string | undefined;
      if (body.createIncidents ?? true) {
        const saved = await upsertKnowledgeIncidentByExternalId(buildWhoDonIncidentPayload(context));
        incidentId = saved.incident.id;
        if (saved.action === "inserted") incidentsCreated += 1;
        if (saved.action === "updated") incidentsUpdated += 1;
        if (saved.action === "skipped") skippedDuplicates += 1;
      }
      const evidence = buildWhoDonEvidencePayload(context);
      const savedEvidence = await saveContextEvidenceIfNew({ sourceId: "who-don", sourceName: "WHO Disease Outbreak News", evidenceType: "public_health_outbreak_report", title: evidence.title, url: evidence.url, excerpt: evidence.summary, rawRef: evidence.id, confidenceScore: evidence.confidenceScore.finalConfidence, metadataJson: context, incidentId });
      if (savedEvidence.action === "inserted") evidenceCreated += 1;
      if (savedEvidence.action === "skipped") skippedDuplicates += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "WHO DON job persistence failed");
    }
  }
  return NextResponse.json({ runId: `who-don-${Date.now()}`, status: errors.length ? "partial" : "success", fetched: result.fetched, normalized: contexts.length, incidentsCreated, incidentsUpdated, evidenceCreated, skippedDuplicates, requiresReview: contexts.filter((item: { confidence: number }) => item.confidence < 80).length, warnings: result.warnings, errors, sampleIncidents: contexts.slice(0, 5) });
}
