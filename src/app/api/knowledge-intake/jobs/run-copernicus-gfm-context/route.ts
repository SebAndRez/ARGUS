import { NextResponse } from "next/server";
import { buildGfmEvidence, buildGfmIncidentPayload, buildObservedFloodExtentContext, fetchGfmProducts, getGfmConfigStatus, normalizeGfmProduct, shouldCreateObservedFloodIncident, type CopernicusGfmParams } from "@/lib/knowledge-intake/adapters/copernicusGfmAdapter";
import { saveContextEvidenceIfNew } from "@/lib/knowledge-intake/persistence/contextEvidence";
import { upsertKnowledgeIncidentByExternalId } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as CopernicusGfmParams & { maxIncidents?: number; sinceHours?: number };
  const config = getGfmConfigStatus();
  if (config.requiresConfiguration) return NextResponse.json({ runId: null, status: "requiresConfiguration", sourceId: "copernicus-gfm", consideredIncidents: 0, enrichedIncidents: 0, evidenceCreated: 0, warnings: [config.message], errors: [] }, { status: 503 });
  const result = await fetchGfmProducts(body);
  const context = buildObservedFloodExtentContext(body, result.products.map((product: unknown) => normalizeGfmProduct(product, body)));
  let evidenceCreated = 0;
  let incidentCreated = 0;
  let incidentUpdated = 0;
  const errors = [...result.errors];
  if (body.persist ?? true) {
    try {
      const evidence = buildGfmEvidence(context, body);
      const saved = await saveContextEvidenceIfNew({ sourceId: "copernicus-gfm", sourceName: "Copernicus GFM", evidenceType: "observed_flood_extent_context", title: evidence.title, url: evidence.url, excerpt: evidence.summary, rawRef: evidence.id, confidenceScore: evidence.confidenceScore.finalConfidence, metadataJson: context, incidentId: body.incidentId });
      if (saved.action === "inserted") evidenceCreated += 1;
      if (body.createIncident && shouldCreateObservedFloodIncident(context)) {
        const savedIncident = await upsertKnowledgeIncidentByExternalId(buildGfmIncidentPayload(context));
        if (savedIncident.action === "inserted") incidentCreated += 1;
        if (savedIncident.action === "updated") incidentUpdated += 1;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "GFM job persistence failed");
    }
  }
  return NextResponse.json({ runId: `copernicus-gfm-${Date.now()}`, status: result.status, consideredIncidents: body.incidentId ? 1 : 0, enrichedIncidents: context.productId ? 1 : 0, productsFetched: result.products.length, evidenceCreated, incidentCreated, incidentUpdated, warnings: result.warnings, errors, sampleContexts: [context] });
}
