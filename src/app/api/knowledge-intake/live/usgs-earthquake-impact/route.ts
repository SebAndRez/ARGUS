import { NextRequest, NextResponse } from "next/server";
import { fetchAndBuildUsgsEarthquakeImpact, type UsgsEarthquakeImpactParams } from "@/lib/knowledge-intake/adapters/usgsEarthquakeImpactAdapter";
import { runUsgsEarthquakeImpactEnrichment } from "@/lib/knowledge-intake/persistence/usgsEarthquakeImpactIngestionJobs";

export const dynamic = "force-dynamic";

function boolParam(value: string | null, fallback: boolean) {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const persist = params.get("persist") === "true";
  const input: UsgsEarthquakeImpactParams = {
    eventId: params.get("eventId") ?? undefined,
    incidentId: params.get("incidentId") ?? undefined,
    includeShakeMap: boolParam(params.get("includeShakeMap"), true),
    includePager: boolParam(params.get("includePager"), true),
    includeContours: boolParam(params.get("includeContours"), true),
    includeGrid: boolParam(params.get("includeGrid"), false),
    includeShape: boolParam(params.get("includeShape"), false),
    includeStations: boolParam(params.get("includeStations"), false),
    includeFault: boolParam(params.get("includeFault"), true),
    persist,
    updateIncident: boolParam(params.get("updateIncident"), false),
    createIncidentIfMissing: boolParam(params.get("createIncidentIfMissing"), false),
    includeRaw: boolParam(params.get("includeRaw"), false),
  };
  if (!input.eventId && !input.incidentId) {
    return NextResponse.json({ status: "failed", errors: ["eventId or incidentId is required"] }, { status: 400 });
  }
  try {
    if (persist) {
      const result = await runUsgsEarthquakeImpactEnrichment(input);
      return NextResponse.json({ ...result, persisted: true, eventId: input.eventId });
    }
    const result = await fetchAndBuildUsgsEarthquakeImpact(input);
    return NextResponse.json({
      ...result,
      source: "USGS Earthquake Impact",
      persisted: false,
      evidenceCreated: 0,
      incidentCreated: false,
      incidentUpdated: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        source: "USGS Earthquake Impact",
        eventId: input.eventId,
        hasShakeMap: false,
        hasPager: false,
        evidenceCreated: 0,
        incidentCreated: false,
        incidentUpdated: false,
        warnings: [],
        errors: [error instanceof Error ? error.message : "USGS earthquake impact request failed"],
      },
      { status: persist ? 500 : 502 }
    );
  }
}
