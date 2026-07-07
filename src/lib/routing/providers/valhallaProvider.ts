import { decodePolyline } from "@/lib/routing/polyline";
import type { RouteResult, RoutingMode, RoutingRequest } from "@/lib/routing/routingService";

/**
 * Adaptador Valhalla. Apunta a `NEXT_PUBLIC_VALHALLA_BASE_URL` (servidor
 * propio o publico); no hay servidor demo estable sin configuracion, asi que
 * si la variable no esta definida se lanza un error claro y el servicio cae
 * al proveedor por defecto.
 */

const modeToValhallaCosting: Record<RoutingMode, string> = {
  walking: "pedestrian",
  bike: "bicycle",
  vehicle: "auto",
  emergency_vehicle: "auto",
};

type ValhallaResponse = {
  trip?: {
    legs: Array<{ shape: string }>;
    summary: { length: number; time: number };
  };
  alternates?: Array<{
    trip: { legs: Array<{ shape: string }>; summary: { length: number; time: number } };
  }>;
};

function tripToRoute(
  trip: { legs: Array<{ shape: string }>; summary: { length: number; time: number } },
  mode: RoutingMode
): RouteResult {
  const geometry = trip.legs.flatMap((leg) => decodePolyline(leg.shape, 6));
  return {
    geometry,
    distanceKm: trip.summary.length,
    durationMin: Math.max(1, Math.round(trip.summary.time / 60)),
    provider: "valhalla",
    isDemo: false,
    mode,
  };
}

export async function calculateValhallaRoutes(
  request: RoutingRequest & { alternatives?: boolean }
): Promise<RouteResult[]> {
  const { origin, destination, mode, alternatives = true } = request;
  const baseUrl = process.env.NEXT_PUBLIC_VALHALLA_BASE_URL;
  if (!baseUrl) {
    throw new Error("Valhalla no configurado (falta NEXT_PUBLIC_VALHALLA_BASE_URL).");
  }

  const body = {
    locations: [
      { lat: origin.lat, lon: origin.lng },
      { lat: destination.lat, lon: destination.lng },
    ],
    costing: modeToValhallaCosting[mode],
    alternates: alternatives ? 2 : 0,
    units: "kilometers",
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(`Valhalla respondio con estado ${response.status}`);
  const data: ValhallaResponse = await response.json();
  if (!data.trip) throw new Error("Valhalla no encontro una ruta entre origen y destino.");

  const routes = [tripToRoute(data.trip, mode)];
  for (const alternate of data.alternates ?? []) {
    routes.push(tripToRoute(alternate.trip, mode));
  }
  return routes;
}
