import { NextResponse } from "next/server";
import { runUsgsEarthquakeImpactEnrichment } from "@/lib/knowledge-intake/persistence/usgsEarthquakeImpactIngestionJobs";
import type { UsgsEarthquakeImpactParams } from "@/lib/knowledge-intake/adapters/usgsEarthquakeImpactAdapter";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as UsgsEarthquakeImpactParams & {
      sinceHours?: number;
      minMagnitude?: number;
      maxEvents?: number;
    };
    const result = await runUsgsEarthquakeImpactEnrichment({
      eventId: body.eventId,
      incidentId: body.incidentId,
      includeShakeMap: body.includeShakeMap ?? true,
      includePager: body.includePager ?? true,
      includeContours: body.includeContours ?? true,
      includeGrid: body.includeGrid ?? false,
      includeShape: body.includeShape ?? false,
      includeStations: body.includeStations ?? false,
      includeFault: body.includeFault ?? true,
      persist: body.persist ?? true,
      updateIncident: body.updateIncident ?? true,
      createIncidentIfMissing: body.createIncidentIfMissing ?? false,
      includeRaw: body.includeRaw ?? false,
    });
    return NextResponse.json({
      ...result,
      sinceHours: body.sinceHours ?? 72,
      minMagnitude: body.minMagnitude ?? 5.5,
      maxEvents: body.maxEvents ?? 50,
      note: "This phase enriches an explicit eventId. Recent-event scanning is bounded for a later scheduler pass.",
    });
  } catch (error) {
    return NextResponse.json(
      { status: "failed", sourceId: "usgs-earthquake-impact", error: error instanceof Error ? error.message : "USGS earthquake impact job failed" },
      { status: 500 }
    );
  }
}
