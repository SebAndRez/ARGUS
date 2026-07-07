import type { RouteResult, RoutingMode, RoutingRequest } from "@/lib/routing/routingService";

/**
 * Adaptador OSRM (Open Source Routing Machine). Usa el servidor demo publico
 * por defecto (`router.project-osrm.org`, sin API key) y permite apuntar a un
 * servidor propio via `NEXT_PUBLIC_OSRM_BASE_URL`. Devuelve geometria real
 * por calles — no debe usarse como fallback de linea recta.
 */

const DEFAULT_OSRM_BASE_URL = "https://router.project-osrm.org";

const modeToOsrmProfile: Record<RoutingMode, string> = {
  walking: "foot",
  bike: "bike",
  vehicle: "car",
  emergency_vehicle: "car",
};

/**
 * OSRM no tiene perfil de ambulancia: se aproxima al perfil "car" y se aplica
 * un factor de reduccion de tiempo (paso de semaforos/prioridad de via) sobre
 * la duracion devuelta, dejando la geometria intacta.
 */
const modeDurationFactor: Record<RoutingMode, number> = {
  walking: 1,
  bike: 1,
  vehicle: 1,
  emergency_vehicle: 0.8,
};

type OsrmRouteResponse = {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: { coordinates: Array<[number, number]> };
  }>;
};

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function calculateOsrmRoute({ origin, destination, mode }: RoutingRequest): Promise<RouteResult> {
  const baseUrl = process.env.NEXT_PUBLIC_OSRM_BASE_URL || DEFAULT_OSRM_BASE_URL;
  const profile = modeToOsrmProfile[mode];
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `${baseUrl}/route/v1/${profile}/${coordinates}?overview=full&geometries=geojson`;

  const response = await fetchWithTimeout(url, 8000);
  if (!response.ok) {
    throw new Error(`OSRM respondio con estado ${response.status}`);
  }

  const data: OsrmRouteResponse = await response.json();
  const bestRoute = data.routes?.[0];
  if (data.code !== "Ok" || !bestRoute) {
    throw new Error("OSRM no encontro una ruta por calles entre origen y destino.");
  }

  return {
    geometry: bestRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm: bestRoute.distance / 1000,
    durationMin: Math.max(1, Math.round((bestRoute.duration / 60) * modeDurationFactor[mode])),
    provider: "osrm",
    isDemo: false,
    mode,
  };
}
