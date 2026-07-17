import { NextResponse } from "next/server";
import { runUsgsEarthquakeImpactEnrichment } from "@/lib/knowledge-intake/persistence/usgsEarthquakeImpactIngestionJobs";
import type { UsgsEarthquakeImpactParams } from "@/lib/knowledge-intake/adapters/usgsEarthquakeImpactAdapter";
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
