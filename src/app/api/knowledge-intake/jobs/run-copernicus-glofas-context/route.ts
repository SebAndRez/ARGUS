import { NextResponse } from "next/server";
import { buildFloodForecastContext, buildGlofasEvidence, fetchGlofasForecastSubset, getGlofasConfigStatus, type CopernicusGlofasParams } from "@/lib/knowledge-intake/adapters/copernicusGlofasAdapter";
import { saveContextEvidenceIfNew } from "@/lib/knowledge-intake/persistence/contextEvidence";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as CopernicusGlofasParams & { maxIncidents?: number; sinceHours?: number };
  const config = getGlofasConfigStatus();
  if (config.requiresConfiguration) return NextResponse.json({ runId: null, status: "requiresConfiguration", sourceId: "copernicus-glofas", consideredIncidents: 0, enrichedIncidents: 0, evidenceCreated: 0, warnings: [config.message], errors: [] }, { status: 503 });
  const result = await fetchGlofasForecastSubset(body);
  const context = buildFloodForecastContext(body, result);
  let evidenceCreated = 0;
  const errors: string[] = [...result.errors];
  if (body.persist ?? true) {
    try {
      const evidence = buildGlofasEvidence(context, body);
      const saved = await saveContextEvidenceIfNew({ sourceId: "copernicus-glofas", sourceName: "Copernicus GloFAS", evidenceType: "flood_forecast_context", title: evidence.title, url: evidence.url, excerpt: evidence.summary, rawRef: evidence.id, confidenceScore: evidence.confidenceScore.finalConfidence, metadataJson: context, incidentId: body.incidentId });
      if (saved.action === "inserted") evidenceCreated += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "GloFAS job persistence failed");
    }
  }
  return NextResponse.json({ runId: `copernicus-glofas-${Date.now()}`, status: result.status, consideredIncidents: body.incidentId ? 1 : 0, enrichedIncidents: 1, evidenceCreated, warnings: result.warnings, errors, sampleContexts: [context] });
}
