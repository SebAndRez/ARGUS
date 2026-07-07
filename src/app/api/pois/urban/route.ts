import { NextRequest, NextResponse } from "next/server";
import { fetchOsmPois } from "@/lib/pois/osmPoiProvider";
import { categoriesForZoom, type PoiCategory } from "@/lib/pois/poiTypes";

/**
 * Proxy server-side de la capa de POIs urbanos (ver `src/lib/pois/osmPoiProvider.ts`
 * para por que Overpass no se llama desde el navegador). El cliente
 * (`PoiLayer`) manda bbox visible + zoom; esta ruta decide que categorias
 * corresponden a ese zoom (misma logica de `categoriesForZoom` que gatea el
 * fetch en el cliente, repetida aca como defensa en profundidad) y devuelve
 * `PoiEntity[]`.
 */

function parseCoord(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const south = parseCoord(searchParams.get("south"));
  const west = parseCoord(searchParams.get("west"));
  const north = parseCoord(searchParams.get("north"));
  const east = parseCoord(searchParams.get("east"));
  const zoom = parseCoord(searchParams.get("zoom"));

  if (south === null || west === null || north === null || east === null || zoom === null) {
    return NextResponse.json({ pois: [], error: "bbox/zoom invalido." }, { status: 400 });
  }

  const categories = categoriesForZoom(zoom);
  if (categories.length === 0) {
    return NextResponse.json({ pois: [] });
  }

  const requestedCategories = searchParams.get("categories");
  const filteredCategories = requestedCategories
    ? categories.filter((category) => requestedCategories.split(",").includes(category))
    : categories;

  try {
    const pois = await fetchOsmPois(
      { south, west, north, east },
      filteredCategories as PoiCategory[]
    );
    return NextResponse.json({ pois });
  } catch (error) {
    return NextResponse.json(
      { pois: [], error: error instanceof Error ? error.message : "No se pudo consultar POIs urbanos." },
      { status: 502 }
    );
  }
}
