import { NextResponse } from "next/server";
import { buildGdeltCrisisNarrativeContext, buildGdeltCrossSourceCorroborationContext, buildGdeltEvidence, buildGdeltNewsCoverageSnapshot, fetchGdeltDoc, type GdeltParams } from "@/lib/knowledge-intake/adapters/gdeltAdapter";
import { saveContextEvidenceIfNew } from "@/lib/knowledge-intake/persistence/contextEvidence";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as GdeltParams & { templates?: string[]; maxIncidents?: number; sinceHours?: number };
  const templates = body.templates ?? (body.templateId ? [body.templateId] : ["gdelt-earthquake-tsunami-media", "gdelt-wildfire-smoke-media", "gdelt-public-health-outbreak-media"]);
  let evidenceCreated = 0;
  let coverageSpikesFound = 0;
  const errors: string[] = [];
  const warnings: string[] = [];
  const sampleContexts = [];
  for (const templateId of templates.slice(0, 10)) {
    const result = await fetchGdeltDoc({ ...body, templateId, timespan: body.timespan ?? "24h", maxRecords: body.maxRecords ?? 75 });
    if (result.context) {
      const snapshot = buildGdeltNewsCoverageSnapshot(body, result.context);
      const narrative = buildGdeltCrisisNarrativeContext(body, result.context);
      const corroboration = buildGdeltCrossSourceCorroborationContext(body, result.context);
      if (result.context.coverageSpike) coverageSpikesFound += 1;
      sampleContexts.push(result.context);
      if (body.persist ?? true) {
        try {
          const evidence = buildGdeltEvidence(result.context, { ...body, templateId });
          const saved = await saveContextEvidenceIfNew({ sourceId: "gdelt", sourceName: "GDELT", evidenceType: "media_signal_context", title: evidence.title, url: evidence.url, excerpt: evidence.summary, rawRef: evidence.id, confidenceScore: evidence.confidenceScore.finalConfidence, metadataJson: { context: result.context, snapshot, narrative, corroboration }, incidentId: body.incidentId });
          if (saved.action === "inserted") evidenceCreated += 1;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "GDELT context persistence failed");
        }
      }
    }
    warnings.push(...result.warnings);
    errors.push(...result.errors);
  }
  return NextResponse.json({ runId: `gdelt-context-${Date.now()}`, status: errors.length ? "partial" : "success", consideredIncidents: body.incidentId ? 1 : 0, enrichedIncidents: sampleContexts.length, skippedAlreadyFresh: 0, skippedMissingContext: 0, templatesRun: templates, evidenceCreated, candidatesCreated: 0, coverageSpikesFound, officialMatchesFound: 0, warnings, errors, sampleContexts: sampleContexts.slice(0, 5) });
}
