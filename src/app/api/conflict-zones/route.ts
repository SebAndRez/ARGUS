import { NextRequest, NextResponse } from "next/server";
import { curatedConflictZones } from "@/data/conflictZones";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const activeOnly = request.nextUrl.searchParams.get("active") !== "false";
  const zones = activeOnly
    ? curatedConflictZones.filter((zone) => zone.isActive)
    : curatedConflictZones;

  return NextResponse.json({
    source: "curated_static",
    count: zones.length,
    zones,
  });
}
