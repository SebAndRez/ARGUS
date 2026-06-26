import { NextRequest, NextResponse } from "next/server";
import { demoFenixShelters } from "@/data/fenixDemo";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scenarioId = request.nextUrl.searchParams.get("scenarioId");
  const shelters = scenarioId
    ? demoFenixShelters.filter((shelter) => shelter.scenarioId === scenarioId)
    : demoFenixShelters;

  return NextResponse.json({
    source: "demo",
    count: shelters.length,
    shelters,
  });
}
