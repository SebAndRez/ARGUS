import type { CriticalPoi, CriticalPoiBoundingBox } from "@/lib/criticalPoi/criticalPoiTypes";

/**
 * Cliente del layer de infraestructura critica: lee `/api/critical-pois`
 * (tabla persistida), nunca Overpass en vivo desde el navegador. Mismo
 * patron de cache+de-dupe que `urbanPoiClient.ts` (P4), archivo separado
 * porque la forma de la respuesta es distinta (incluye `cityAggregates`).
 */

export interface CriticalCityAggregate {
  id: string;
  lat: number;
  lng: number;
  count: number;
  countsByCategory: Record<string, number>;
}

interface CriticalPoiResponse {
  pois: CriticalPoi[];
  cityAggregates: CriticalCityAggregate[];
  error?: string;
}

interface CacheEntry {
  data: CriticalPoiResponse;
  expiresAt: number;
}

const CLIENT_CACHE_TTL_MS = 3 * 60_000;
const GRID_SIZE_DEG = 0.02;

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<CriticalPoiResponse>>();

function roundedBboxKey(bbox: CriticalPoiBoundingBox, zoomTier: string) {
  const south = Math.floor(bbox.south / GRID_SIZE_DEG) * GRID_SIZE_DEG;
  const west = Math.floor(bbox.west / GRID_SIZE_DEG) * GRID_SIZE_DEG;
  const north = Math.ceil(bbox.north / GRID_SIZE_DEG) * GRID_SIZE_DEG;
  const east = Math.ceil(bbox.east / GRID_SIZE_DEG) * GRID_SIZE_DEG;
  return `${zoomTier}:${south.toFixed(2)},${west.toFixed(2)},${north.toFixed(2)},${east.toFixed(2)}`;
}

export async function fetchCriticalPois(bbox: CriticalPoiBoundingBox, zoom: number): Promise<CriticalPoiResponse> {
  const zoomTier = zoom < 10 ? "city" : zoom < 14 ? "p1" : zoom < 16 ? "p2" : "p3";
  const key = roundedBboxKey(bbox, zoomTier);
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
  });

  const request = fetch(`/api/critical-pois?${params.toString()}`, { signal: AbortSignal.timeout(15_000) })
    .then(async (response) => {
      const data = (await response.json()) as CriticalPoiResponse;
      const result: CriticalPoiResponse = { pois: data.pois ?? [], cityAggregates: data.cityAggregates ?? [], error: data.error };
      cache.set(key, { data: result, expiresAt: Date.now() + CLIENT_CACHE_TTL_MS });
      return result;
    })
    .catch(() => ({ pois: [], cityAggregates: [] }) as CriticalPoiResponse)
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}
