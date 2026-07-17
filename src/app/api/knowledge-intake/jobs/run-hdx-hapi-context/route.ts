import { NextResponse } from "next/server";
import { buildHapiEvidence, buildHapiHumanitarianContextSnapshot, getHapiIdentifierStatus, type HapiRequestParams } from "@/lib/knowledge-intake/adapters/hdxHapiAdapter";
import { saveContextEvidenceIfNew } from "@/lib/knowledge-intake/persistence/contextEvidence";
import { requireOperator } from "@/lib/security/apiGuards";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
  const rateLimitOutcome = await enforceRateLimit({
    policy: "knowledge_intake_job_manual_run",
    request,
    identity: { userId: user.id },
  });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;
  const body = await request.json().catch(() => ({})) as HapiRequestParams & { maxIncidents?: number; sinceHours?: number };
  const config = getHapiIdentifierStatus();
  if (config.requiresConfiguration) return NextResponse.json({ runId: null, status: "requiresConfiguration", sourceId: "hdx-hapi", consideredIncidents: 0, enrichedIncidents: 0, evidenceCreated: 0, warnings: [config.message], errors: [] }, { status: 503 });
  const result = await buildHapiHumanitarianContextSnapshot({ ...body, persist: false, limit: body.limit ?? 1000 });
  let evidenceCreated = 0;
  const errors = [...result.errors];
  if (body.persist && result.humanitarianContextSnapshot) {
    try {
      const evidence = buildHapiEvidence(result.humanitarianContextSnapshot, body);
      const saved = await saveContextEvidenceIfNew({ sourceId: "hdx-hapi", sourceName: "HDX / OCHA HAPI", evidenceType: "humanitarian_context", title: evidence.title, url: evidence.url, excerpt: evidence.summary, rawRef: evidence.id, confidenceScore: evidence.confidenceScore.finalConfidence, metadataJson: result.humanitarianContextSnapshot, incidentId: body.incidentId });
      if (saved.action === "inserted") evidenceCreated += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "HAPI context job persistence failed");
    }
  }
  return NextResponse.json({ runId: `hdx-hapi-${Date.now()}`, status: result.status, consideredIncidents: body.incidentId ? 1 : 0, enrichedIncidents: result.humanitarianContextSnapshot ? 1 : 0, skippedAlreadyFresh: 0, skippedMissingAdminContext: body.locationCode || body.pCode || body.admin1Code || body.admin2Code ? 0 : 1, indicatorsFetched: result.indicatorsFetched, evidenceCreated, warnings: result.warnings, errors, sampleContexts: result.humanitarianContextSnapshot ? [result.humanitarianContextSnapshot] : [] });
}
