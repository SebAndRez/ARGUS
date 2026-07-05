import { NextResponse } from "next/server";
import { buildEcdcEvidencePayload, buildEcdcIncidentPayload, fetchEcdcFeeds, type EcdcParams } from "@/lib/knowledge-intake/adapters/ecdcAdapter";
import { saveContextEvidenceIfNew } from "@/lib/knowledge-intake/persistence/contextEvidence";
import { upsertKnowledgeIncidentByExternalId } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as EcdcParams & { sinceDays?: number };
  const since = body.since ?? (body.sinceDays ? new Date(Date.now() - body.sinceDays * 86_400_000).toISOString() : undefined);
  const result = await fetchEcdcFeeds({ ...body, top: body.top ?? 50, since });
  let incidentsCreated = 0;
  let incidentsUpdated = 0;
  let evidenceCreated = 0;
  let skippedDuplicates = 0;
  const errors = [...result.errors];
  for (const context of result.items) {
    try {
      let incidentId: string | undefined;
      if ((body.createIncidents ?? true) && !context.requiresReview && context.feedType !== "cdtr") {
        const saved = await upsertKnowledgeIncidentByExternalId(buildEcdcIncidentPayload(context));
        incidentId = saved.incident.id;
        if (saved.action === "inserted") incidentsCreated += 1;
        if (saved.action === "updated") incidentsUpdated += 1;
        if (saved.action === "skipped") skippedDuplicates += 1;
      }
      const evidence = buildEcdcEvidencePayload(context);
      const savedEvidence = await saveContextEvidenceIfNew({ sourceId: "ecdc", sourceName: "ECDC", evidenceType: context.evidenceType, title: evidence.title, url: evidence.url, excerpt: evidence.summary, rawRef: evidence.id, confidenceScore: evidence.confidenceScore.finalConfidence, metadataJson: context, incidentId });
      if (savedEvidence.action === "inserted") evidenceCreated += 1;
      if (savedEvidence.action === "skipped") skippedDuplicates += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "ECDC job persistence failed");
    }
  }
  return NextResponse.json({ runId: `ecdc-${Date.now()}`, status: errors.length ? "partial" : "success", feedsFetched: result.feedsFetched, itemsFetched: result.itemsFetched, normalized: result.items.length, incidentsCreated, incidentsUpdated, evidenceCreated, matchedWhoDonIncidents: 0, skippedDuplicates, cdtrReportsAsEvidence: result.items.filter((item) => item.feedType === "cdtr").length, requiresReview: result.items.filter((item) => item.requiresReview).length, warnings: result.warnings, errors, sampleIncidents: result.items.slice(0, 5) });
}
