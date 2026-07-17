import { NextResponse } from "next/server";
import {
  runNoaaCoopsContextEnrichment,
  type NoaaCoopsContextJobInput,
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
    const body = (await request.json().catch(() => ({}))) as NoaaCoopsContextJobInput;
    const result = await runNoaaCoopsContextEnrichment({
      purpose: body.purpose ?? "tsunami_context",
      maxIncidents: body.maxIncidents ?? 25,
      sinceHours: body.sinceHours ?? 24,
      radiusKm: body.radiusKm ?? 25,
      products: body.products ?? ["water_level", "predictions", "wind", "air_pressure"],
      datum: body.datum ?? "MLLW",
      units: body.units ?? "metric",
      timeZone: body.timeZone ?? "gmt",
      includeAirGap: body.includeAirGap ?? false,
      persist: body.persist ?? true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        runId: null,
        status: "failed",
        sourceId: "noaa-coops",
        consideredIncidents: 0,
        enrichedIncidents: 0,
        skippedAlreadyFresh: 0,
        skippedMissingCoordinates: 0,
        skippedNoNearbyStation: 0,
        evidenceCreated: 0,
        warnings: [],
        errors: [error instanceof Error ? error.message : "NOAA CO-OPS context job failed"],
        sampleContexts: [],
      },
      { status: 500 }
    );
  }
}
