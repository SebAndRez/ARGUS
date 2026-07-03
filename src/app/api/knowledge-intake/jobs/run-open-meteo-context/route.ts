import { NextResponse } from "next/server";
import {
  runOpenMeteoContextEnrichment,
  type OpenMeteoContextJobInput,
} from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as OpenMeteoContextJobInput;
    const result = await runOpenMeteoContextEnrichment({
      purpose: body.purpose ?? "incident_context",
      forecastDays: body.forecastDays ?? 3,
      maxIncidents: body.maxIncidents ?? 25,
      sinceHours: body.sinceHours ?? 24,
      persist: body.persist ?? true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        runId: null,
        status: "failed",
        sourceId: "open-meteo",
        consideredIncidents: 0,
        enrichedIncidents: 0,
        skippedAlreadyFresh: 0,
        skippedMissingCoordinates: 0,
        evidenceCreated: 0,
        warnings: [],
        errors: [error instanceof Error ? error.message : "Open-Meteo context job failed"],
        sampleContexts: [],
      },
      { status: 500 }
    );
  }
}
