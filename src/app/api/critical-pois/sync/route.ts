import { NextResponse } from "next/server";
import { syncCriticalPoisForBbox } from "@/lib/criticalPoi/criticalPoiOsmSync";
import { criticalPoiCategoryRegistry, isCriticalPoiCategoryId } from "@/lib/criticalPoi/criticalPoiCategoryRegistry";
import type { CriticalPoiBoundingBox, CriticalPoiCategory } from "@/lib/criticalPoi/criticalPoiTypes";

/**
 * Ingesta OSM -> tabla `CriticalPoi` para un bbox (ciudad/region). Pensado
 * para correrse manualmente o desde un cron/job externo, no desde el
 * navegador — mismo espiritu que
 * `/api/knowledge-intake/jobs/run-osm-overpass-context`. Body:
 * `{ south, west, north, east, categories? }` (categories vacio = todas las
 * 24 categorias criticas).
 */

export const dynamic = "force-dynamic";

interface SyncRequestBody {
  south?: number;
  west?: number;
  north?: number;
  east?: number;
  categories?: string[];
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SyncRequestBody;
  const { south, west, north, east } = body;

  if (![south, west, north, east].every((value) => typeof value === "number" && Number.isFinite(value))) {
    return NextResponse.json({ status: "invalidRequest", error: "south/west/north/east (numeros) son requeridos." }, { status: 400 });
  }

  const bbox: CriticalPoiBoundingBox = { south: south as number, west: west as number, north: north as number, east: east as number };
  const requestedCategories = body.categories?.filter(isCriticalPoiCategoryId) as CriticalPoiCategory[] | undefined;
  const categories = requestedCategories?.length ? requestedCategories : criticalPoiCategoryRegistry.map((item) => item.id);

  try {
    const result = await syncCriticalPoisForBbox(bbox, categories);
    return NextResponse.json({ status: "ok", bbox, categories, ...result });
  } catch (error) {
    return NextResponse.json(
      { status: "error", bbox, categories, error: error instanceof Error ? error.message : "Sync de infraestructura critica fallo." },
      { status: 502 }
    );
  }
}
