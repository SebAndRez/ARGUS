import { NextRequest, NextResponse } from "next/server";
import { demoArgusEvents } from "@/data/demoArgusEvents";
import type {
  ArgusConfidence,
  ArgusEvent,
  ArgusEventStatus,
  ArgusEventType,
  ArgusSeverity,
  ArgusSourceType,
} from "@/types/argusEvent";

export const dynamic = "force-dynamic";

function eventLat(event: ArgusEvent): number | null {
  if (event.geometry.type === "point") return event.geometry.coordinates[0];
  if (event.geometry.type === "region_reference" || event.geometry.type === "administrative_area") {
    return event.geometry.anchor[0];
  }
  if (event.geometry.type === "polygon" || event.geometry.type === "route") {
    const coords = event.geometry.coordinates;
    return coords.length ? coords[0][0] : null;
  }
  return null;
}

function eventLng(event: ArgusEvent): number | null {
  if (event.geometry.type === "point") return event.geometry.coordinates[1];
  if (event.geometry.type === "region_reference" || event.geometry.type === "administrative_area") {
    return event.geometry.anchor[1];
  }
  if (event.geometry.type === "polygon" || event.geometry.type === "route") {
    const coords = event.geometry.coordinates;
    return coords.length ? coords[0][1] : null;
  }
  return null;
}

/**
 * Curated demo events today (`demoArgusEvents`), but the filter contract
 * (country/eventType/severity/status/sourceType/confidence/bbox) is the same
 * one a future real ingestion-backed source would serve — swap the data
 * source here, keep the query params.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country");
  const eventType = searchParams.get("eventType") as ArgusEventType | null;
  const severity = searchParams.get("severity") as ArgusSeverity | null;
  const status = searchParams.get("status") as ArgusEventStatus | null;
  const sourceType = searchParams.get("sourceType") as ArgusSourceType | null;
  const confidence = searchParams.get("confidence") as ArgusConfidence | null;
  const south = searchParams.get("south");
  const west = searchParams.get("west");
  const north = searchParams.get("north");
  const east = searchParams.get("east");
  const bbox =
    south && west && north && east
      ? {
          south: Number(south),
          west: Number(west),
          north: Number(north),
          east: Number(east),
        }
      : null;

  const events = demoArgusEvents.filter((event) => {
    if (country && event.country.toUpperCase() !== country.toUpperCase()) return false;
    if (eventType && event.eventType !== eventType) return false;
    if (severity && event.severity !== severity) return false;
    if (status && event.status !== status) return false;
    if (sourceType && event.sourceType !== sourceType) return false;
    if (confidence && event.confidence !== confidence) return false;
    if (bbox) {
      const lat = eventLat(event);
      const lng = eventLng(event);
      if (lat === null || lng === null) return false;
      if (lat < bbox.south || lat > bbox.north || lng < bbox.west || lng > bbox.east) return false;
    }
    return true;
  });

  return NextResponse.json({
    source: "curated_demo",
    count: events.length,
    events,
  });
}
