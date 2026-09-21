import { NextRequest, NextResponse } from "next/server";
import { auraMedicalPoints, getNearbyMedicalPoints, toMedicalPoint } from "@/data/auraMedicalPoints";
import { DEFAULT_MEDICAL_RADIUS_KM, getRealMedicalPointsNear } from "@/lib/medical/realMedicalPoints";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";

export const dynamic = "force-dynamic";

const MAX_RADIUS_KM = 50;

/**
 * Real medical points (`CriticalPoi` health categories) near `lat`/`lng`.
 * The AURA demo fixture is only served when there is no real data AND
 * `isDemoDataAllowed()` — never in production.
 */
export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  const hasPoint = request.nextUrl.searchParams.has("lat") && Number.isFinite(lat) && Number.isFinite(lng);
  const radiusParam = Number(request.nextUrl.searchParams.get("radiusKm"));
  const radiusKm = Number.isFinite(radiusParam) && radiusParam > 0 ? Math.min(radiusParam, MAX_RADIUS_KM) : DEFAULT_MEDICAL_RADIUS_KM;

  if (hasPoint) {
    try {
      const points = await getRealMedicalPointsNear({ lat, lng }, radiusKm);
      if (points.length > 0) {
        return NextResponse.json({ source: "critical_poi", count: points.length, points });
      }
    } catch {
      // fall through: an unavailable table is treated like "no real data"
    }
  }

  if (!isDemoDataAllowed()) {
    return NextResponse.json({ source: "unavailable", count: 0, points: [] });
  }

  const points = hasPoint ? getNearbyMedicalPoints({ lat, lng }) : auraMedicalPoints.map((point) => toMedicalPoint(point));
  return NextResponse.json({ source: "demo", count: points.length, points });
}
