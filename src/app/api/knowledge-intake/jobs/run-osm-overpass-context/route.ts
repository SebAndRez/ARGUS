import { NextResponse } from "next/server";
import {
  runOsmOverpassContextEnrichment,
  type OsmOverpassContextJobInput,
} from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as OsmOverpassContextJobInput;
    const result = await runOsmOverpassContextEnrichment({
      purpose: body.purpose ?? "command_center_nearby",
      maxIncidents: body.maxIncidents ?? 25,
      sinceHours: body.sinceHours ?? 24,
      radiusKm: body.radiusKm ?? 5,
      categories: body.categories ?? ["medical_hospital", "emergency_fire_station", "emergency_police", "shelter", "fuel"],
      limit: body.limit ?? 100,
      timeoutSeconds: body.timeoutSeconds ?? 15,
      persist: body.persist ?? true,
      cacheTtlMinutes: body.cacheTtlMinutes ?? 360,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        runId: null,
        status: "failed",
        sourceId: "osm-overpass",
        consideredIncidents: 0,
        enrichedIncidents: 0,
        skippedAlreadyFresh: 0,
        skippedMissingCoordinates: 0,
        skippedInvalidArea: 0,
        skippedOverpassTimeout: 0,
        evidenceCreated: 0,
        warnings: [],
        errors: [error instanceof Error ? error.message : "OSM Overpass context job failed"],
        sampleContexts: [],
      },
      { status: 500 }
    );
  }
}
