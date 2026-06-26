import { NextRequest, NextResponse } from "next/server";
import { demoMedicalPoints } from "@/data/medicalPoints";
import { sortMedicalPointsByDistance } from "@/lib/medical/medicalDistance";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  const points =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? sortMedicalPointsByDistance(demoMedicalPoints, {
          latitude: lat,
          longitude: lng,
        })
      : demoMedicalPoints;

  return NextResponse.json({
    source: "demo",
    count: points.length,
    points,
  });
}
