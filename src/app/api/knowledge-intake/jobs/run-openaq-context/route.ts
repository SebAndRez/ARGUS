import { NextResponse } from "next/server";
import {
  runOpenAqContextEnrichment,
  type OpenAqContextJobInput,
} from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";
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
  try {
    const body = (await request.json().catch(() => ({}))) as OpenAqContextJobInput;
    const result = await runOpenAqContextEnrichment({
      purpose: body.purpose ?? "wildfire_smoke_context",
      maxIncidents: body.maxIncidents ?? 25,
      sinceHours: body.sinceHours ?? 24,
      radiusKm: body.radiusKm ?? 25,
      parameters: body.parameters ?? ["pm25", "pm10", "o3", "no2", "so2", "co"],
      persist: body.persist ?? true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        runId: null,
        status: "failed",
        sourceId: "openaq",
        consideredIncidents: 0,
        enrichedIncidents: 0,
        skippedAlreadyFresh: 0,
        skippedMissingCoordinates: 0,
        skippedNoNearbyLocation: 0,
        skippedRequiresConfiguration: 0,
        evidenceCreated: 0,
        rateLimited: 0,
        warnings: [],
        errors: [error instanceof Error ? error.message : "OpenAQ context job failed"],
        sampleContexts: [],
      },
      { status: 500 }
    );
  }
}
