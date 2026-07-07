import type { RouteInstruction, RouteResult, RoutingMode, RoutingRequest } from "@/lib/routing/routingService";

/**
 * Adaptador GraphHopper. Requiere `NEXT_PUBLIC_GRAPHHOPPER_API_KEY`. Soporta
 * rutas alternativas via `algorithm=alternative_route`.
 */

const modeToGraphhopperProfile: Record<RoutingMode, string> = {
  walking: "foot",
  bike: "bike",
  vehicle: "car",
  emergency_vehicle: "car",
};

type GraphhopperInstruction = { text: string; distance: number; interval: [number, number] };

type GraphhopperResponse = {
  paths?: Array<{
    distance: number;
    time: number;
    points: { coordinates: Array<[number, number]> };
    instructions?: GraphhopperInstruction[];
  }>;
  message?: string;
};

function toInstructions(
  instructions: GraphhopperInstruction[] | undefined,
  coordinates: Array<[number, number]>
): RouteInstruction[] {
  if (!instructions) return [];
  return instructions.map((instruction) => {
    const pointIndex = Math.min(instruction.interval[0], coordinates.length - 1);
    const [lng, lat] = coordinates[pointIndex] ?? [0, 0];
    return { text: instruction.text, distanceMeters: Math.round(instruction.distance), location: { lat, lng } };
  });
}

export async function calculateGraphhopperRoutes(
  request: RoutingRequest & { alternatives?: boolean }
): Promise<RouteResult[]> {
  const { origin, destination, mode, alternatives = true } = request;
  const apiKey = process.env.NEXT_PUBLIC_GRAPHHOPPER_API_KEY;
  if (!apiKey) {
    throw new Error("GraphHopper no configurado (falta NEXT_PUBLIC_GRAPHHOPPER_API_KEY).");
  }

  const profile = modeToGraphhopperProfile[mode];
  const params = new URLSearchParams({
    vehicle: profile,
    instructions: "true",
    points_encoded: "false",
    key: apiKey,
  });
  if (alternatives) {
    params.set("algorithm", "alternative_route");
    params.set("alternative_route.max_paths", "3");
  }
  params.append("point", `${origin.lat},${origin.lng}`);
  params.append("point", `${destination.lat},${destination.lng}`);

  const url = `https://graphhopper.com/api/1/route?${params.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(`GraphHopper respondio con estado ${response.status}`);
  const data: GraphhopperResponse = await response.json();
  if (!data.paths || data.paths.length === 0) {
    throw new Error(data.message || "GraphHopper no encontro una ruta entre origen y destino.");
  }

  return data.paths.map((path) => ({
    geometry: path.points.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    distanceKm: path.distance / 1000,
    durationMin: Math.max(1, Math.round(path.time / 60000)),
    provider: "graphhopper",
    isDemo: false,
    mode,
    instructions: toInstructions(path.instructions, path.points.coordinates),
  }));
}
