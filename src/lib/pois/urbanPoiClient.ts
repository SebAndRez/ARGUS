import type { PoiBoundingBox, PoiCategory, PoiEntity } from "@/lib/pois/poiTypes";

/**
 * Cliente de la capa de POIs urbanos: llama a `/api/pois/urban` (nunca
 * Overpass directo, ver `osmPoiProvider.ts`). No se llama `poiService.ts`
 * para no chocar con `src/lib/pois/poiService.ts`, que ya existe y sirve los
 * `MapEntity` curados (hospitales/refugios AURA/ARCA) — esta capa es
 * comercio/servicios urbanos genericos vía OSM, un dataset distinto.
 *
 * Cachea en memoria por zona/zoom/categorias (bbox redondeado a una grilla,
 * TTL corto) para que paneos pequeños dentro de la misma celda no disparen
 * un fetch nuevo, y de-duplica requests en vuelo para la misma celda.
 */

interface CacheEntry {
  data: PoiEntity[];
  expiresAt: number;
}

const CLIENT_CACHE_TTL_MS = 5 * 60_000;
const GRID_SIZE_DEG = 0.01;

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<PoiEntity[]>>();

function roundedBboxKey(bbox: PoiBoundingBox, categories: PoiCategory[]) {
  const south = Math.floor(bbox.south / GRID_SIZE_DEG) * GRID_SIZE_DEG;
  const west = Math.floor(bbox.west / GRID_SIZE_DEG) * GRID_SIZE_DEG;
  const north = Math.ceil(bbox.north / GRID_SIZE_DEG) * GRID_SIZE_DEG;
  const east = Math.ceil(bbox.east / GRID_SIZE_DEG) * GRID_SIZE_DEG;
  return `${categories.slice().sort().join(",")}:${south.toFixed(2)},${west.toFixed(2)},${north.toFixed(2)},${east.toFixed(2)}`;
}

export async function fetchUrbanPois(
  bbox: PoiBoundingBox,
  zoom: number,
  categories: PoiCategory[]
): Promise<PoiEntity[]> {
  if (categories.length === 0) return [];

  const key = roundedBboxKey(bbox, categories);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const params = new URLSearchParams({
    south: String(bbox.south),
    west: String(bbox.west),
    north: String(bbox.north),
    east: String(bbox.east),
    zoom: String(zoom),
    categories: categories.join(","),
  });

  const request = fetch(`/api/pois/urban?${params.toString()}`, { signal: AbortSignal.timeout(15_000) })
    .then(async (response) => {
      const data: { pois?: PoiEntity[] } = await response.json();
      const pois = data.pois ?? [];
      cache.set(key, { data: pois, expiresAt: Date.now() + CLIENT_CACHE_TTL_MS });
      return pois;
    })
    .catch(() => [])
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}
