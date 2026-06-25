import { NextRequest, NextResponse } from "next/server";
import { curatedConflictEvents } from "@/data/conflictZones";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const zoneId = request.nextUrl.searchParams.get("zoneId")?.trim();
  const events = zoneId
    ? curatedConflictEvents.filter((event) => event.relatedZoneId === zoneId)
    : curatedConflictEvents;

  return NextResponse.json({
    source: "curated_static",
    count: events.length,
    events,
  });
}
