import type { RouteResult, RoutingRequest } from "@/lib/routing/routingService";

/**
 * Adaptador Google Directions: llama al proxy server-side
 * `/api/routing/google-directions` (la API key nunca se expone al cliente).
 */

type ProxyRoute = {
  geometry: Array<[number, number]>;
  distanceMeters: number;
  durationSeconds: number;
  instructions: Array<{ text: string; distanceMeters: number; location: { lat: number; lng: number } }>;
};

type ProxyResponse = { routes?: ProxyRoute[]; error?: string };

export async function calculateGoogleRoutes(
  request: RoutingRequest & { alternatives?: boolean }
): Promise<RouteResult[]> {
  const { origin, destination, mode, alternatives = true } = request;
  const params = new URLSearchParams({
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    mode,
    alternatives: String(alternatives),
  });

  const response = await fetch(`/api/routing/google-directions?${params.toString()}`, {
    signal: AbortSignal.timeout(9000),
  });
  const data: ProxyResponse = await response.json();
  if (!response.ok || !data.routes) {
    throw new Error(data.error || "Google Directions no disponible.");
  }

  return data.routes.map((route) => ({
    geometry: route.geometry,
    distanceKm: route.distanceMeters / 1000,
    durationMin: Math.max(1, Math.round(route.durationSeconds / 60)),
    provider: "google_directions",
    isDemo: false,
    mode,
    instructions: route.instructions,
  }));
}
