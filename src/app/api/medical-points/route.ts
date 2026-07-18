import { NextRequest, NextResponse } from "next/server";
import { auraMedicalPoints, getNearbyMedicalPoints, toMedicalPoint } from "@/data/auraMedicalPoints";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";

export const dynamic = "force-dynamic";

/**
 * ARGUS Prompt 9/10 (DATA-1): sin fuente real de puntos medicos (AURA sigue
 * usando fixture segun la auditoria de modulos), esta ruta servia sin
 * ningun guard. En produccion sin `ARGUS_ALLOW_DEMO_DATA` se devuelve una
 * lista vacia en vez de puntos medicos sinteticos.
 */
export async function GET(request: NextRequest) {
  if (!isDemoDataAllowed()) {
    return NextResponse.json({ source: "unavailable", count: 0, points: [] });
  }
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
