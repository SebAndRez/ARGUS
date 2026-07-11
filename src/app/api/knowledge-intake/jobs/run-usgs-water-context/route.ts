import { NextResponse } from "next/server";
import {
  runUsgsWaterContextEnrichment,
  type UsgsWaterContextJobInput,
} from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as UsgsWaterContextJobInput;
    const result = await runUsgsWaterContextEnrichment({
      purpose: body.purpose ?? "flood",
      maxIncidents: body.maxIncidents ?? 25,
      sinceHours: body.sinceHours ?? 24,
      radiusKm: body.radiusKm ?? 25,
      parameters: body.parameters ?? ["00060", "00065"],
      persist: body.persist ?? true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        runId: null,
        status: "failed",
        sourceId: "usgs-water",
        consideredIncidents: 0,
        enrichedIncidents: 0,
        skippedAlreadyFresh: 0,
        skippedMissingCoordinates: 0,
        skippedNoNearbyStation: 0,
        evidenceCreated: 0,
        apiFamily: "legacy",
        legacyFallbackUsed: false,
        warnings: [],
        errors: [error instanceof Error ? error.message : "USGS Water context job failed"],
        sampleContexts: [],
      },
      { status: 500 }
    );
  }
}
