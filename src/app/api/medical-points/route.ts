import { NextRequest, NextResponse } from "next/server";
import { auraMedicalPoints, getNearbyMedicalPoints, toMedicalPoint } from "@/data/auraMedicalPoints";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  const points =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? getNearbyMedicalPoints({ lat, lng })
      : auraMedicalPoints.map((point) => toMedicalPoint(point));

  return NextResponse.json({
    source: "demo",
    count: points.length,
    points,
  });
}
