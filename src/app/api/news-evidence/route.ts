import { NextRequest, NextResponse } from "next/server";
import { curatedNewsEvidence } from "@/data/conflictZones";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const zoneId = request.nextUrl.searchParams.get("zoneId")?.trim();
  const evidence = zoneId
    ? curatedNewsEvidence.filter((item) => item.linkedZoneId === zoneId)
    : curatedNewsEvidence;

  return NextResponse.json({
    source: "curated_static",
    count: evidence.length,
    evidence,
  });
}
