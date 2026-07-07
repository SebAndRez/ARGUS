import type { RouteInstruction, RouteResult, RoutingMode, RoutingRequest } from "@/lib/routing/routingService";

/**
 * Adaptador Mapbox Directions. Requiere `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`.
 * Si no esta configurado, lanza un error claro y el servicio de routing cae
 * al proveedor por defecto o al fallback de linea recta.
 */

const modeToMapboxProfile: Record<RoutingMode, string> = {
  walking: "walking",
  bike: "cycling",
  vehicle: "driving",
  emergency_vehicle: "driving-traffic",
};

type MapboxStep = {
  distance: number;
  maneuver: { instruction: string; location: [number, number] };
};

type MapboxLeg = { steps?: MapboxStep[] };

type MapboxRouteResponse = {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: { coordinates: Array<[number, number]> };
    legs?: MapboxLeg[];
  }>;
};

function toInstructions(legs: MapboxLeg[] | undefined): RouteInstruction[] {
  if (!legs) return [];
  return legs
    .flatMap((leg) => leg.steps ?? [])
    .map((step) => ({
      text: step.maneuver.instruction,
      distanceMeters: Math.round(step.distance),
      location: { lat: step.maneuver.location[1], lng: step.maneuver.location[0] },
    }));
}

export async function calculateMapboxRoutes(
  request: RoutingRequest & { alternatives?: boolean }
): Promise<RouteResult[]> {
  const { origin, destination, mode, alternatives = true } = request;
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Mapbox no configurado (falta NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN).");
  }

  const profile = modeToMapboxProfile[mode];
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?geometries=geojson&overview=full&steps=true&alternatives=${alternatives}&access_token=${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(`Mapbox respondio con estado ${response.status}`);
  const data: MapboxRouteResponse = await response.json();
  if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
    throw new Error("Mapbox no encontro una ruta entre origen y destino.");
  }

  return data.routes.map((route) => ({
    geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    distanceKm: route.distance / 1000,
    durationMin: Math.max(1, Math.round(route.duration / 60)),
    provider: "mapbox",
    isDemo: false,
    mode,
    instructions: toInstructions(route.legs),
  }));
}
