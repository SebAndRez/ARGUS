import { NextRequest, NextResponse } from "next/server";
import { demoFenixShelters } from "@/data/fenixDemo";
import { getRealFenixShelters } from "@/lib/fenix/fenixShelterSource";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";

export const dynamic = "force-dynamic";

const DEFAULT_RADIUS_KM = 10;
const MAX_RADIUS_KM = 100;

function parseCoord(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Con `lat`/`lng`, sirve refugios reales (`CriticalPoi` + estado operacional)
 * cerca del punto — el modo que usan incidentes reales. Sin coordenadas,
 * preserva el comportamiento original: escenarios demo por `scenarioId`, sin
 * tocar la base de datos. Nunca se mezclan ambas fuentes en una respuesta.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = parseCoord(searchParams.get("lat"));
  const lng = parseCoord(searchParams.get("lng"));

  if (lat !== null && lng !== null) {
    const radiusKm = Math.min(parseCoord(searchParams.get("radiusKm")) ?? DEFAULT_RADIUS_KM, MAX_RADIUS_KM);
    try {
      const shelters = await getRealFenixShelters({ lat, lng }, radiusKm);
      return NextResponse.json({ source: "critical_poi", count: shelters.length, shelters });
    } catch (error) {
      return NextResponse.json(
        {
          source: "critical_poi",
          count: 0,
          shelters: [],
          error: error instanceof Error ? error.message : "No se pudo consultar refugios reales.",
        },
        { status: 200 }
      );
    }
  }

  // ARGUS Prompt 9/10 (DATA-1): el modo con lat/lng arriba ya usa datos
  // reales sin condicion; este fallback (sin coordenadas) es el que servia
  // fixture sin ningun guard de produccion.
  if (!isDemoDataAllowed()) {
    return NextResponse.json({ source: "unavailable", count: 0, shelters: [] });
  }

  const scenarioId = searchParams.get("scenarioId");
  const shelters = scenarioId
    ? demoFenixShelters.filter((shelter) => shelter.scenarioId === scenarioId)
    : demoFenixShelters;

  return NextResponse.json({
    source: "demo",
    count: shelters.length,
    shelters,
  });
}
