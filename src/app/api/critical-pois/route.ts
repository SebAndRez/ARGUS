import { NextRequest, NextResponse } from "next/server";
import { getCriticalPoisInBbox } from "@/lib/criticalPoi/criticalPoiPersistenceService";
import { prioritiesVisibleAtZoom, shouldShowCityAggregate } from "@/lib/criticalPoi/criticalPoiPriority";
import { getOperationalStatusesByPoiIds } from "@/lib/criticalPoi/shelterOperationalStatusService";
import type { CriticalPoi, CriticalPoiBoundingBox } from "@/lib/criticalPoi/criticalPoiTypes";
import type { CriticalPoiWithOperationalStatus } from "@/lib/criticalPoi/shelterOperationalStatusTypes";

/**
 * Lee infraestructura critica YA PERSISTIDA (tabla `CriticalPoi`), no
 * Overpass en vivo — a diferencia de `/api/pois/urban` (P4 generico, siempre
 * en vivo). Para poblar la tabla usar `/api/critical-pois/sync`. Devuelve
 * 200 con `pois: []` y una advertencia si la tabla todavia no existe (antes
 * de correr la migracion), en vez de reventar el mapa.
 */

const CITY_AGGREGATE_CELL_DEG = 0.35;

function parseCoord(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Adjunta el estado operacional (si existe) a los POIs de categoria "shelter". El resto queda intacto - ningun otro modulo/categoria cambia de forma. */
async function withShelterOperationalStatus(pois: CriticalPoi[]): Promise<CriticalPoiWithOperationalStatus[]> {
  const shelterIds = pois.filter((poi) => poi.category === "shelter").map((poi) => poi.id);
  if (shelterIds.length === 0) return pois;

  const statusByPoiId = await getOperationalStatusesByPoiIds(shelterIds);
  return pois.map((poi) => {
    const operationalStatus = statusByPoiId.get(poi.id);
    return operationalStatus ? { ...poi, operationalStatus } : poi;
  });
}

function buildCityAggregates(pois: CriticalPoi[]) {
  const cells = new Map<string, CriticalPoi[]>();
  pois.forEach((poi) => {
    const key = `${Math.floor(poi.lat / CITY_AGGREGATE_CELL_DEG)}:${Math.floor(poi.lng / CITY_AGGREGATE_CELL_DEG)}`;
    const cell = cells.get(key) ?? [];
    cell.push(poi);
    cells.set(key, cell);
  });

  return Array.from(cells.entries()).map(([key, cellPois]) => {
    const lat = cellPois.reduce((sum, poi) => sum + poi.lat, 0) / cellPois.length;
    const lng = cellPois.reduce((sum, poi) => sum + poi.lng, 0) / cellPois.length;
    const countsByCategory = cellPois.reduce<Record<string, number>>((acc, poi) => {
      acc[poi.category] = (acc[poi.category] ?? 0) + 1;
      return acc;
    }, {});
    return { id: `critical-city-aggregate-${key}`, lat, lng, count: cellPois.length, countsByCategory };
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const south = parseCoord(searchParams.get("south"));
  const west = parseCoord(searchParams.get("west"));
  const north = parseCoord(searchParams.get("north"));
  const east = parseCoord(searchParams.get("east"));
  const zoom = parseCoord(searchParams.get("zoom"));

  if (south === null || west === null || north === null || east === null || zoom === null) {
    return NextResponse.json({ pois: [], cityAggregates: [], error: "bbox/zoom invalido." }, { status: 400 });
  }

  const bbox: CriticalPoiBoundingBox = { south, west, north, east };

  try {
    if (shouldShowCityAggregate(zoom)) {
      const pois = await getCriticalPoisInBbox(bbox, { priorities: ["P0", "P1"], limit: 1000 });
      return NextResponse.json({ pois: [], cityAggregates: buildCityAggregates(pois) });
    }

    const priorities = prioritiesVisibleAtZoom(zoom);
    const pois = await getCriticalPoisInBbox(bbox, { priorities, limit: 800 });
    const poisWithStatus = await withShelterOperationalStatus(pois);
    return NextResponse.json({ pois: poisWithStatus, cityAggregates: [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo consultar infraestructura crítica.";
    return NextResponse.json(
      {
        pois: [],
        cityAggregates: [],
        error: message,
        hint: "Si la tabla CriticalPoi no existe todavia, correr la migracion: npm run db:migrate:deploy",
      },
      { status: 200 }
    );
  }
}
